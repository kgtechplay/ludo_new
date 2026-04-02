import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Board from "../components/Board";
import Dice from "../components/Dice";
import PlayerPanel from "../components/PlayerPanel";
import LobbyView from "../components/LobbyView";
import AuthModal from "../components/AuthModal";
import { useGameSocket } from "../hooks/useGameSocket";
import { usePlayerIdentity } from "../hooks/usePlayerIdentity";
import { saveIdentity } from "../hooks/usePlayerIdentity";
import { isResumeWaiting } from "../hooks/usePlayerIdentity";
import { markResumeWaiting } from "../hooks/usePlayerIdentity";
import { useAuth } from "../context/AuthContext";
import type { GameState, LobbyState } from "../types/game";
import type { PlayerIdentity } from "../hooks/usePlayerIdentity";
import * as api from "../api/client";

const ROLL_FACES = [1, 2, 3, 4, 5, 6] as const;
const POST_RELEASE_ROLL_MS = 1000;
const SETTLE_DELAYS_MS = [130, 190, 260];
const RECONNECT_SIGN_IN_MESSAGE = "Sign in to reclaim your seat and continue.";

type BootPhase = "loading" | "ready" | "needs_auth" | "stale";
type ExitDestination = "home" | "my-games";

function formatErrorMessage(message: string): string {
  const normalized = message.trim();
  if (normalized.includes("Could not reach the server")) return "The dice tower is unplugged. The backend is nowhere to be found.";
  if (normalized.includes("API not found")) return "I asked the server for Ludo and it handed me a blank stare.";
  if (normalized.includes("Game not found")) return "That game wandered off the board and never came back.";
  if (normalized.includes("Not your turn")) return "Easy there. It's not your turn yet.";
  if (normalized.includes("Selected token is not movable")) return "That counter has union rules. It is not moving right now.";
  if (normalized.includes("Must place on tile")) return `${normalized}. The board is being extremely specific today.`;
  if (normalized.includes("highlighted home tile")) return "Home is thataway. Even the counter knows it.";
  if (normalized.includes("Invalid move")) return "Bold move. Illegal, but bold.";
  if (normalized.includes("Roll the dice first")) return "Nice try. The universe still requires a dice roll first.";
  if (normalized.includes("Cannot use chance after rolling")) return "No double-dipping. Chance has already left the building.";
  if (normalized.includes("You must move a token before rolling again")) return "One roll at a time, chief. Finish the move first.";
  if (normalized.includes("Game is full")) return "This game is already full. Ask the host to start a new one.";
  if (normalized.includes("Game already started")) return "This game is already in progress. Ask the host to start a new one.";
  if (normalized.includes("Failed to create game")) return "The board refused to assemble. Very dramatic of it.";
  if (normalized.includes("Failed to roll")) return "The dice bounced under the sofa. Roll failed.";
  if (normalized.includes("Failed to play chance")) return "Chance card jammed. Probably for the best.";
  if (normalized.includes("Failed to pass")) return "Even skipping a turn managed to trip over itself.";
  if (normalized.includes("Move failed")) return "That move had confidence, not legality.";
  return `${normalized} Also, the board would like a minute.`;
}

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { load: loadIdentity, save: saveId } = usePlayerIdentity(gameId ?? "");

  // Player identity
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [myPlayerIndex, setMyPlayerIndex] = useState<number | null>(null);
  const [bootPhase, setBootPhase] = useState<BootPhase>("loading");
  const [requiresAuthToReconnect, setRequiresAuthToReconnect] = useState(false);
  const joinInitiatedRef = useRef(false);

  // Lobby / game state (also updated via WebSocket)
  const [lobbyOverride, setLobbyOverride] = useState<LobbyState | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [hasClickedReady, setHasClickedReady] = useState(false);
  const [myResumeClicked, setMyResumeClicked] = useState(() => (gameId ? isResumeWaiting(gameId) : false));

  // Game UI state
  const [loading, setLoading] = useState(false);
  const [newGameLoading, setNewGameLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showPersistPrompt, setShowPersistPrompt] = useState(false);
  const [pendingExitDestination, setPendingExitDestination] = useState<ExitDestination | null>(null);
  const [pendingGuestPause, setPendingGuestPause] = useState(false);
  const [displayRoll, setDisplayRoll] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedMove, setSelectedMove] = useState<{ color: string; tokenIndex: number } | null>(null);
  const [boardRollValue, setBoardRollValue] = useState<number | null>(null);
  const [boardRollVisible, setBoardRollVisible] = useState(false);
  const [boardRollSettling, setBoardRollSettling] = useState(false);
  const [boardRollStep, setBoardRollStep] = useState(0);
  const [isRollingDice, setIsRollingDice] = useState(false);
  const rollActiveRef = useRef(false);
  const rollIntervalRef = useRef<number | null>(null);
  const settleTimeoutsRef = useRef<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const noiseBufferRef = useRef<AudioBuffer | null>(null);
  const soundIntervalRef = useRef<number | null>(null);
  const autoPauseInFlightRef = useRef(false);

  const finishExitNavigation = useCallback((destination: ExitDestination) => {
    if (destination === "my-games") {
      navigate("/?view=my-games");
      return;
    }
    const isPaused = game?.status === "paused";
    navigate("/", isPaused && gameId ? { state: { joinGameId: gameId } } : undefined);
  }, [navigate, game, gameId]);

  const applyIdentity = useCallback(
    (identity: PlayerIdentity) => {
      saveId(identity);
      setPlayerId(identity.playerId);
      setMyPlayerIndex(identity.playerIndex);
    },
    [saveId]
  );

  const enterReconnectGate = useCallback((message = RECONNECT_SIGN_IN_MESSAGE) => {
    setRequiresAuthToReconnect(true);
    setShowAuth(true);
    setError(message);
    setBootPhase("needs_auth");
  }, []);

  const isReconnectAuthError = useCallback((message: string) => (
    message.includes("Game is full") ||
    message.includes("Game already started") ||
    message.includes("Unknown player for this game")
  ), []);

  // On mount: load or join
  useEffect(() => {
    if (!gameId) { navigate("/"); return; }
    let ignored = false;
    const existing = loadIdentity();
    if (existing) {
      const bootWithExistingIdentity = async () => {
        if (ignored) return;
        try {
          if (token && user?.username) {
            const rejoined = await api.joinGame(gameId, user.username, token);
            if (ignored) return;
            const identity = {
              playerId: rejoined.player_id,
              playerIndex: rejoined.player_index,
              color: rejoined.color,
            };
            applyIdentity(identity);
            setLobbyOverride(rejoined.lobby);
            if (rejoined.lobby.status === "waiting") {
              setGame(null);
              setError(null);
              setRequiresAuthToReconnect(false);
              setBootPhase("ready");
              return;
            }
            const restoredGame = await api.getGame(gameId, identity.playerId, token);
            if (ignored) return;
            setGame(restoredGame);
          } else {
            const lobbyState = await api.getLobby(gameId, existing.playerId, token);
            if (ignored) return;
            applyIdentity(existing);
            setLobbyOverride(lobbyState);
            if (lobbyState.status !== "waiting") {
              const restoredGame = await api.getGame(gameId, existing.playerId, token);
              if (ignored) return;
              setGame(restoredGame);
            } else {
              setGame(null);
            }
          }
          if (ignored) return;
          setRequiresAuthToReconnect(false);
          setError(null);
          setBootPhase("ready");
        } catch (e) {
          if (ignored) return;
          const message = e instanceof Error ? e.message : "Failed to reconnect";
          if (message.includes("Game not found")) {
            setError(message);
            setBootPhase("stale");
            return;
          }
          if (!token && isReconnectAuthError(message)) {
            setPlayerId(null);
            setMyPlayerIndex(null);
            enterReconnectGate();
            return;
          }
          setError(message);
          setBootPhase("ready");
        }
      };
      void bootWithExistingIdentity();
      return;
    }

    // StrictMode guard: only one join API call per game session.
    // The ref persists across StrictMode's double-mount, so the second
    // invocation polls localStorage for the result of the first.
    if (joinInitiatedRef.current) {
      const iv = window.setInterval(() => {
        const identity = loadIdentity();
        if (!identity) return;
        window.clearInterval(iv);
        if (ignored) return;
        setPlayerId(identity.playerId);
        setMyPlayerIndex(identity.playerIndex);
        setBootPhase("ready");
      }, 30);
      return () => { ignored = true; window.clearInterval(iv); };
    }

    joinInitiatedRef.current = true;
    api.joinGame(gameId, user?.username ?? "Player", token).then((result) => {
      setRequiresAuthToReconnect(false);
      const identity = {
        playerId: result.player_id,
        playerIndex: result.player_index,
        color: result.color,
      };
      applyIdentity(identity);
      if (ignored) return;
      setLobbyOverride(result.lobby);
      setGame(null);
      setError(null);
      setBootPhase("ready");
    }).catch((e) => {
      if (ignored) return;
      const message = e instanceof Error ? e.message : "Failed to join game";
      if (!token && isReconnectAuthError(message)) {
        joinInitiatedRef.current = false;
        enterReconnectGate();
        return;
      }
      const retry = loadIdentity();
      if (retry) {
        setPlayerId(retry.playerId);
        setMyPlayerIndex(retry.playerIndex);
        setBootPhase("ready");
        return;
      }
      setError(message);
      setBootPhase(message.includes("Game not found") ? "stale" : "ready");
    });

    return () => { ignored = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, token, user?.username, applyIdentity, enterReconnectGate, isReconnectAuthError]);

  useEffect(() => {
    if (!token) return;
    setShowAuth(false);
    if (requiresAuthToReconnect) {
      setRequiresAuthToReconnect(false);
      setError(null);
      setBootPhase("loading");
    }
  }, [token, requiresAuthToReconnect]);

  const handleWsGameState = useCallback((gs: GameState) => {
    setGame(gs);
    if (gs.status === "active" || gs.status === "finished") {
      markResumeWaiting(gs.id, false);
    }
    if (gs.status === "active") {
      setDisplayRoll(gs.last_roll);
    }
  }, []);

  const handleWsGameReset = useCallback((lobby: LobbyState) => {
    setGame(null);
    setLobbyOverride(lobby);
    setHasClickedReady(false);
    setDisplayRoll(null);
    if (gameId) {
      markResumeWaiting(gameId, false);
      setMyResumeClicked(false);
    }
  }, [gameId]);

  const socketState = useGameSocket(
    gameId ?? "",
    bootPhase === "ready" ? playerId : null,
    handleWsGameState,
    handleWsGameReset
  );
  const wsLobby = socketState.lobbyState;
  const wsGame = socketState.gameState;
  const connectionStatus = socketState.connectionStatus;
  const opponentRolling = socketState.opponentRolling;
  const resumeReadyCount = socketState.resumeReadyCount;
  const resumeNeeded = socketState.resumeNeeded;
  const sendMessage = socketState.sendMessage;

  // WS game state takes priority over local state
  useEffect(() => {
    if (wsGame) {
      setGame(wsGame);
      if (wsGame.status !== "paused") {
        setMyResumeClicked(false);
      } else if (gameId && isResumeWaiting(gameId)) {
        setMyResumeClicked(true);
      }
    }
  }, [wsGame]);

  useEffect(() => {
    if (!gameId) return;
    setMyResumeClicked(isResumeWaiting(gameId));
  }, [gameId]);


  // Opponent rolling animation
  const prevOpponentRolling = useRef(false);
  // Set when rolling_stop arrives before the roll result (game_state_updated lags behind).
  const pendingOpponentSettleRef = useRef(false);

  useEffect(() => {
    const wasRolling = prevOpponentRolling.current;
    prevOpponentRolling.current = opponentRolling;
    if (opponentRolling && !wasRolling) {
      if (!isMyTurn) {
        startRollAnimation();
      }
    } else if (!opponentRolling && wasRolling) {
      if (wsGame?.last_roll != null) {
        const roll = wsGame.last_roll;
        settleRollAnimation(roll, () => setDisplayRoll(roll));
      } else {
        // rolling_stop arrived before game_state_updated — flag it and settle
        // once the roll value comes in via the effect below.
        pendingOpponentSettleRef.current = true;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponentRolling]);

  // Settle the opponent's board dice animation when the roll result arrives.
  useEffect(() => {
    if (!pendingOpponentSettleRef.current || wsGame?.last_roll == null) return;
    pendingOpponentSettleRef.current = false;
    const roll = wsGame.last_roll;
    settleRollAnimation(roll, () => setDisplayRoll(roll));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsGame?.last_roll]);

  const lobby = wsLobby ?? lobbyOverride;

  useEffect(() => {
    if (connectionStatus !== "disconnected") return;
    if (!playerId || lobby || game || error) return;
    if (!token) {
      setPlayerId(null);
      setMyPlayerIndex(null);
      enterReconnectGate();
    }
  }, [connectionStatus, playerId, lobby, game, error, token, enterReconnectGate]);

  useEffect(() => {
    if (!pendingExitDestination || !token || game?.status !== "active") return;
    let cancelled = false;
    const persistAndLeave = async () => {
      try {
        if (playerId) {
          await api.pauseGame(gameId ?? "", playerId, token);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to pause game");
        }
      } finally {
        if (!cancelled) {
          setShowPersistPrompt(false);
          const destination = pendingExitDestination;
          setPendingExitDestination(null);
          finishExitNavigation(destination);
        }
      }
    };
    void persistAndLeave();
    return () => { cancelled = true; };
  }, [pendingExitDestination, token, game?.status, playerId, gameId, finishExitNavigation]);

  useEffect(() => {
    if (!pendingGuestPause || !token || game?.status !== "active" || !gameId || !playerId) return;
    let cancelled = false;
    const persistPause = async () => {
      setLoading(true);
      try {
        await api.pauseGame(gameId, playerId, token);
        if (!cancelled) {
          setPendingGuestPause(false);
          setShowPersistPrompt(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to pause game");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void persistPause();
    return () => { cancelled = true; };
  }, [pendingGuestPause, token, game?.status, gameId, playerId]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (game?.status !== "active") return;
      if (!token) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    const handlePageHide = () => {
      if (!gameId || !playerId || !token || game?.status !== "active") return;
      const body = new Uint8Array();
      void fetch(`${api.getApiBaseUrl()}/games/${gameId}/pause`, {
        method: "POST",
        keepalive: true,
        headers: {
          "X-Player-ID": playerId,
          Authorization: `Bearer ${token}`,
        },
        body,
      }).catch(() => undefined);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [game?.status, gameId, playerId, token]);

  // -----------------------------------------------------------------------
  // Audio helpers (unchanged from App.tsx)
  // -----------------------------------------------------------------------
  const getAudioContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    const AudioCtor = window.AudioContext;
    if (!AudioCtor) return null;
    if (!audioContextRef.current) audioContextRef.current = new AudioCtor();
    return audioContextRef.current;
  }, []);

  const getNoiseBuffer = useCallback((audioContext: AudioContext) => {
    if (!noiseBufferRef.current) {
      const buffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * 0.06), audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      noiseBufferRef.current = buffer;
    }
    return noiseBufferRef.current;
  }, []);

  const playRollRattle = useCallback(() => {
    const audioContext = getAudioContext();
    if (!audioContext) return;
    const noise = audioContext.createBufferSource();
    noise.buffer = getNoiseBuffer(audioContext);
    const filter = audioContext.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1200 + Math.random() * 1300;
    filter.Q.value = 2.5;
    const gain = audioContext.createGain();
    const startAt = audioContext.currentTime;
    const peak = 0.03 + Math.random() * 0.03;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.055);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    noise.start(startAt);
    noise.stop(startAt + 0.06);
  }, [getAudioContext, getNoiseBuffer]);

  const startRollSound = useCallback(() => {
    const audioContext = getAudioContext();
    if (!audioContext || soundIntervalRef.current != null) return;
    // Resume synchronously so the browser keeps the user-gesture context alive.
    // Don't await — fire-and-forget so the interval starts immediately.
    if (audioContext.state === "suspended") void audioContext.resume();
    soundIntervalRef.current = window.setInterval(() => playRollRattle(), 70);
  }, [getAudioContext, playRollRattle]);

  const stopRollSound = useCallback(() => {
    if (soundIntervalRef.current != null) {
      window.clearInterval(soundIntervalRef.current);
      soundIntervalRef.current = null;
    }
  }, []);

  const clearRollAnimation = useCallback(() => {
    if (rollIntervalRef.current != null) {
      window.clearInterval(rollIntervalRef.current);
      rollIntervalRef.current = null;
    }
    settleTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    settleTimeoutsRef.current = [];
  }, []);

  const resetRollVisuals = useCallback(() => {
    clearRollAnimation();
    stopRollSound();
    rollActiveRef.current = false;
    setIsRollingDice(false);
    setBoardRollSettling(false);
    setBoardRollVisible(false);
  }, [clearRollAnimation, stopRollSound]);

  const startRollAnimation = useCallback(() => {
    clearRollAnimation();
    rollActiveRef.current = true;
    setBoardRollVisible(true);
    setBoardRollSettling(false);
    setIsRollingDice(true);
    setBoardRollStep(0);
    setBoardRollValue((prev) => prev ?? ROLL_FACES[0]);
    startRollSound();
    let frame = 0;
    rollIntervalRef.current = window.setInterval(() => {
      frame += 1;
      setBoardRollStep(frame);
      setBoardRollValue(ROLL_FACES[frame % ROLL_FACES.length]);
    }, 90);
  }, [clearRollAnimation, startRollSound]);

  const settleRollAnimation = useCallback(
    (finalValue: number, onSettled?: () => void) => {
      clearRollAnimation();
      stopRollSound();
      rollActiveRef.current = false;
      setIsRollingDice(false);
      setBoardRollSettling(true);
      const countdownFaces = [finalValue === 1 ? 6 : finalValue - 1, finalValue];
      countdownFaces.forEach((face, i) => {
        const id = window.setTimeout(() => {
          setBoardRollStep((s) => s + 1);
          setBoardRollValue(face);
          if (i === countdownFaces.length - 1) {
            setBoardRollSettling(false);
            onSettled?.(); // fire when the final face is displayed
            const hideId = window.setTimeout(() => setBoardRollVisible(false), 900);
            settleTimeoutsRef.current.push(hideId);
          }
        }, SETTLE_DELAYS_MS[i] ?? 200);
        settleTimeoutsRef.current.push(id);
      });
    },
    [clearRollAnimation, stopRollSound]
  );

  useEffect(() => () => resetRollVisuals(), [resetRollVisuals]);

  // -----------------------------------------------------------------------
  // Multiplayer: isMyTurn
  // -----------------------------------------------------------------------
  const isMyTurn =
    game !== null &&
    game.status === "active" &&
    myPlayerIndex !== null &&
    game.current_player_index === myPlayerIndex;

  useEffect(() => {
    if (!game || game.status !== "active") return;
    if (opponentRolling) return;
    if (rollActiveRef.current) return;
    if (game.has_rolled) return;
    pendingOpponentSettleRef.current = false;
    if (isRollingDice || boardRollVisible) {
      resetRollVisuals();
    }
  }, [
    game,
    opponentRolling,
    isRollingDice,
    boardRollVisible,
    resetRollVisuals,
  ]);

  // -----------------------------------------------------------------------
  // Game action handlers
  // -----------------------------------------------------------------------
  const beginRollHold = useCallback(() => {
    if (!game?.id || game.status !== "active" || loading || rollActiveRef.current || !isMyTurn) return;
    if (game.has_rolled && game.valid_moves.length > 0) return;
    sendMessage({ type: "rolling_start" });
    void startRollAnimation();
  }, [game, loading, startRollAnimation, isMyTurn, sendMessage]);

  const releaseRoll = useCallback(async () => {
    if (!game?.id || game.status === "finished" || !playerId) return;
    if (!rollActiveRef.current) return;
    sendMessage({ type: "rolling_stop" });
    setLoading(true);
    setError(null);
    try {
      const rollingColor = game.active_colors[game.current_player_index] ?? "unknown";
      const [rollResult] = await Promise.all([
        api.rollDice(game.id, playerId, token),
        new Promise((resolve) => window.setTimeout(resolve, POST_RELEASE_ROLL_MS)),
      ]);
      settleRollAnimation(rollResult.roll, () => setDisplayRoll(rollResult.roll));
      if (rollResult.valid_moves.length === 0) {
        setStatusMessage(`Player ${rollingColor} has no moves.`);
        const passedState = await api.passTurn(game.id, playerId, token);
        setGame(passedState);
      } else {
        const rolledState = await api.getGame(game.id);
        setStatusMessage(null);
        setGame(rolledState);
      }
      setSelectedMove(null);
    } catch (e) {
      resetRollVisuals();
      setError(e instanceof Error ? e.message : "Roll failed");
    } finally {
      setLoading(false);
    }
  }, [game, playerId, resetRollVisuals, settleRollAnimation, sendMessage, token]);

  const handleChance = useCallback(async () => {
    if (!game?.id || game.status === "finished" || !playerId) return;
    setLoading(true);
    setError(null);
    try {
      const state = await api.chanceTurn(game.id, playerId, token);
      setGame(state);
      setStatusMessage(state.message || null);
      setSelectedMove(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chance failed");
    } finally {
      setLoading(false);
    }
  }, [game?.id, game?.status, playerId, token]);

  const handleTokenSelect = useCallback(
    (color: string, tokenIndex: number) => {
      if (!game?.id || game.status === "finished" || !isMyTurn || !playerId) return;
      const directHomeMove = game.valid_moves.find(
        (m) => m.color === color && m.token_index === tokenIndex && m.target_kind === "home" && m.home_index === 5
      );
      if (directHomeMove) {
        setLoading(true);
        setError(null);
        void api.moveToken(game.id, playerId, color, tokenIndex, {
          target_kind: directHomeMove.target_kind,
          path_index: directHomeMove.path_index,
          home_index: directHomeMove.home_index,
        }, token).then((state) => {
          setGame(state);
          setStatusMessage(state.message || null);
          setSelectedMove(null);
        }).catch((e) => setError(e instanceof Error ? e.message : "Move failed"))
          .finally(() => setLoading(false));
        return;
      }
      setSelectedMove((prev) =>
        prev && prev.color === color && prev.tokenIndex === tokenIndex ? null : { color, tokenIndex }
      );
    },
    [game, playerId, isMyTurn, token]
  );

  const handleTileClick = useCallback(
    async (tile: {
      target_kind: "path" | "home";
      path_index: number | null;
      home_index: number | null;
    }) => {
      if (!game?.id || game.status === "finished" || !selectedMove || !isMyTurn || !playerId) return;
      const expectedMove = game.valid_moves.find(
        (m) => m.color === selectedMove.color && m.token_index === selectedMove.tokenIndex
      );
      if (!expectedMove) { setError("Selected token is not movable"); return; }
      if (
        tile.target_kind !== expectedMove.target_kind ||
        tile.path_index !== expectedMove.path_index ||
        tile.home_index !== expectedMove.home_index
      ) {
        setError(
          expectedMove.target_kind === "path" && expectedMove.path_index != null
            ? `Must place on tile ${expectedMove.path_index}`
            : "Must place on the highlighted home tile"
        );
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const state = await api.moveToken(game.id, playerId, selectedMove.color, selectedMove.tokenIndex, {
          target_kind: tile.target_kind,
          path_index: tile.path_index,
          home_index: tile.home_index,
        }, token);
        setGame(state);
        setStatusMessage(null);
        setSelectedMove(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Move failed");
      } finally {
        setLoading(false);
      }
    },
    [game, playerId, selectedMove, isMyTurn, token]
  );

  useEffect(() => { setSelectedMove(null); }, [game?.id, game?.current_player_index, game?.last_roll]);

  // -----------------------------------------------------------------------
  // Lobby ready handler
  // -----------------------------------------------------------------------
  const handleNewGame = useCallback(async (playerCount: 2 | 4) => {
    setNewGameLoading(true);
    try {
      const result = await api.createGame(playerCount, "Player 1", token);
      saveIdentity(result.lobby.game_id, {
        playerId: result.player_id,
        playerIndex: result.player_index,
        color: result.color,
      });
      navigate(`/${result.lobby.game_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create game");
      setNewGameLoading(false);
    }
  }, [navigate, token]);

  const handleReady = useCallback(async () => {
    if (!gameId || !playerId) return;
    setHasClickedReady(true);
    try {
      const updatedLobby = await api.markReady(gameId, playerId, token);
      setLobbyOverride(updatedLobby);

      if (myPlayerIndex === 0) {
        navigate("/?view=my-games");
        return;
      }

      if (updatedLobby.status === "active") {
        const startedGame = await api.getGame(gameId, playerId, token);
        setGame(startedGame);
        setLobbyOverride(null);
        return;
      }
    } catch (e) {
      setHasClickedReady(false);
      setError(e instanceof Error ? e.message : "Failed to mark ready");
    }
  }, [gameId, playerId, token, navigate, myPlayerIndex]);

  const handlePause = useCallback(async () => {
    if (!gameId || !playerId) return;
    if (!token) {
      setPendingExitDestination(null);
      setPendingGuestPause(true);
      setShowPersistPrompt(true);
      return;
    }
    setLoading(true);
    try {
      await api.pauseGame(gameId, playerId, token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to pause game");
    } finally {
      setLoading(false);
    }
  }, [gameId, playerId, token]);

  const handleResume = useCallback(async () => {
    if (!gameId || !playerId || myResumeClicked) return;
    setMyResumeClicked(true);
    setLoading(true);
    try {
      const nextState = await api.resumeGame(gameId, playerId, token);
      if (nextState.status === "paused") {
        markResumeWaiting(gameId, true);
        navigate("/?view=my-games");
        return;
      }
      markResumeWaiting(gameId, false);
    } catch (e) {
      setMyResumeClicked(false);
      setError(e instanceof Error ? e.message : "Failed to resume game");
    } finally {
      setLoading(false);
    }
  }, [gameId, playerId, token, myResumeClicked, navigate]);

  const handleReset = useCallback(async () => {
    if (!gameId || !playerId) return;
    setLoading(true);
    try {
      const lobby = await api.resetGame(gameId, playerId, token);
      setGame(null);
      setLobbyOverride(lobby);
      setHasClickedReady(false);
      setDisplayRoll(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset game");
    } finally {
      setLoading(false);
    }
  }, [gameId, playerId, token]);

  const autoPauseCurrentGame = useCallback(async () => {
    if (!gameId || !playerId || !token || game?.status !== "active" || autoPauseInFlightRef.current) return;
    autoPauseInFlightRef.current = true;
    try {
      await api.pauseGame(gameId, playerId, token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to pause game");
    } finally {
      autoPauseInFlightRef.current = false;
    }
  }, [gameId, playerId, token, game?.status]);

  const requestLeave = useCallback(async (destination: ExitDestination) => {
    if (game?.status !== "active") {
      finishExitNavigation(destination);
      return;
    }
    if (token) {
      await autoPauseCurrentGame();
      finishExitNavigation(destination);
      return;
    }
    setPendingExitDestination(destination);
    setShowPersistPrompt(true);
  }, [autoPauseCurrentGame, finishExitNavigation, game?.status, token]);

  const goHome = useCallback(() => {
    void requestLeave("home");
  }, [requestLeave]);

  const goToMyGames = useCallback(() => {
    void requestLeave("my-games");
  }, [requestLeave]);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------
  const currentPlayer = game && game.active_colors.length > 0
    ? game.active_colors[game.current_player_index] ?? null : null;
  const nextPlayerToRoll = game && game.active_colors.length > 0
    ? game.has_rolled && game.valid_moves.length > 0
      ? game.last_roll === 6 ? currentPlayer : game.active_colors[(game.current_player_index + 1) % game.active_colors.length] ?? null
      : currentPlayer
    : null;
  const rollDisabled =
    loading || isRollingDice || !game?.id || game.status !== "active" ||
    (game.has_rolled && game.valid_moves.length > 0) || !isMyTurn;
  const errorMessage = error ? formatErrorMessage(error) : null;

  // -----------------------------------------------------------------------
  // Loading / error states
  // -----------------------------------------------------------------------
  if (bootPhase === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <p className="text-slate-400">Joining game…</p>
      </div>
    );
  }

  if (!gameId) return null;

  if (bootPhase === "needs_auth") {
    return (
      <>
        <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-800/90 p-6 text-center shadow-2xl">
            <h1 className="text-2xl font-semibold text-white">Resume Saved Game</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              This game already has players assigned. Sign in to reclaim your seat and continue.
            </p>
            {errorMessage && (
              <p className="mt-4 rounded-xl bg-red-950/80 px-4 py-3 text-sm text-red-200">
                {errorMessage}
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowAuth(true)}
                className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
              >
                Back Home
              </button>
            </div>
          </div>
        </div>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </>
    );
  }

  if (bootPhase === "stale") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-800/90 p-6 text-center shadow-2xl">
          <h1 className="text-2xl font-semibold text-white">Game Unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            This game does not exist any longer.
          </p>
          {gameId && <p className="mt-2 break-all text-xs text-slate-500">{gameId}</p>}
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
            >
              Back Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Identity loaded but WebSocket hasn't synced lobby/game state yet.
  // Without this guard, Player 2 would land on the empty game view and
  // never see the lobby, causing a deadlock where Player 1 waits forever.
  if (playerId && !lobby && !game && !error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <p className="text-slate-400">Connecting…</p>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Lobby phase
  // -----------------------------------------------------------------------
  if (lobby && lobby.status === "waiting" && (!game || game.status === "waiting")) {
    return (
      <>
        {errorMessage && (
          <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
            <div className="flex max-w-xl items-start gap-3 rounded-2xl border border-red-300/35 bg-red-950/90 px-4 py-3 text-sm text-red-100 shadow backdrop-blur">
              <p>{errorMessage}</p>
              <button onClick={() => setError(null)} className="ml-1 shrink-0 rounded-md px-2 py-0.5 hover:bg-white/10">x</button>
            </div>
          </div>
        )}
        <LobbyView
          lobby={lobby}
          myPlayerIndex={myPlayerIndex}
          onReady={() => void handleReady()}
          hasClickedReady={hasClickedReady}
          onSignIn={() => setShowAuth(true)}
          onClose={() => navigate("/")}
        />
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </>
    );
  }

  // -----------------------------------------------------------------------
  // Active / finished game
  // -----------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {showPersistPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-white">
              {pendingGuestPause ? "Save This Game Before Pausing?" : "Save This Game Before Leaving?"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {pendingGuestPause
                ? "Sign in so we can save your seat against your account and pause the current game. Then you can reopen the same URL later and continue from this exact state."
                : "Sign in so we can save your seat against your account and pause the current game before you leave. Then you can reopen the same URL later and continue from this exact state."}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setPendingExitDestination(null);
                  setPendingGuestPause(false);
                  setShowPersistPrompt(false);
                }}
                className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
              >
                {pendingGuestPause ? "Keep Playing" : "Stay Here"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const destination = pendingExitDestination;
                  setPendingExitDestination(null);
                  setPendingGuestPause(false);
                  setShowPersistPrompt(false);
                  if (destination) {
                    finishExitNavigation(destination);
                  }
                }}
                disabled={pendingGuestPause}
                className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
              >
                Leave Anyway
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPersistPrompt(false);
                  setShowAuth(true);
                }}
                className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
              >
                Sign In To Save
              </button>
            </div>
          </div>
        </div>
      )}
      {errorMessage && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-2xl border border-red-300/35 bg-red-950/90 px-4 py-3 text-sm text-red-100 shadow-[0_18px_32px_rgba(0,0,0,0.4)] backdrop-blur">
            <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-red-300" />
            <p>{errorMessage}</p>
            <button type="button" onClick={() => setError(null)} className="ml-1 shrink-0 rounded-md px-2 py-0.5 text-red-100/80 hover:bg-white/10 hover:text-white">x</button>
          </div>
        </div>
      )}
      <header className="flex flex-col gap-4 border-b border-slate-800 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Ludo</h1>
          <p className="text-sm leading-6 text-slate-400">
            Roll the dice, move a token. Roll 6 to leave the yard; exact roll to reach home.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={goHome}
            className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
          >
            Home
          </button>
          {user && (
            <button
              type="button"
              onClick={goToMyGames}
              className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
            >
              My Games
            </button>
          )}
        </div>
      </header>

      {game?.status === "paused" && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-slate-800 px-6 py-7 text-center shadow-2xl sm:px-10 sm:py-8">
            <p className="text-2xl font-bold text-amber-400">Game Paused</p>
            {myResumeClicked ? (
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Waiting for other players to resume&hellip;{" "}
                <span className="font-semibold text-white">{resumeReadyCount}/{resumeNeeded}</span> ready
              </p>
            ) : (
              <p className="mt-2 text-sm leading-6 text-slate-400">
                All players must click Resume to continue.
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={goHome}
                className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
              >
                Home
              </button>
              {user && (
                <button
                  type="button"
                  onClick={goToMyGames}
                  className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
                >
                  My Games
                </button>
              )}
              {!myResumeClicked && (
                <button
                  type="button"
                  onClick={() => void handleResume()}
                  disabled={loading}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  Resume
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:flex-row lg:items-start">
        <section className="flex min-w-0 flex-1 flex-col gap-3 sm:gap-4">
          <Board
            game={game}
            onTokenClick={handleTokenSelect}
            onTileClick={handleTileClick}
            selectedMove={selectedMove}
            rollingDie={
              boardRollVisible && boardRollValue != null
                ? { value: boardRollValue, settling: boardRollSettling, step: boardRollStep }
                : null
            }
          />
        </section>
        <aside className="flex w-full shrink-0 flex-col gap-4 sm:gap-6 lg:w-[22rem]">
          <Dice
            value={displayRoll}
            onRollPressStart={beginRollHold}
            onRollPressEnd={releaseRoll}
            onChance={handleChance}
            showChance={false}
            controls={
              <>
                {game?.status === "active" && (
                  <button
                    type="button"
                    onClick={() => void handlePause()}
                    disabled={loading}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                  >
                    Pause
                  </button>
                )}
                {game?.status === "paused" && (
                  <button
                    type="button"
                    onClick={() => void handleResume()}
                    disabled={loading || myResumeClicked}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {myResumeClicked ? `Waiting... (${resumeReadyCount}/${resumeNeeded})` : "Resume"}
                  </button>
                )}
                {myPlayerIndex === 0 && game?.status !== "waiting" && (
                  <button
                    type="button"
                    onClick={() => void handleReset()}
                    disabled={loading}
                    className="rounded-lg bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-500 disabled:opacity-50"
                  >
                    Reset
                  </button>
                )}
              </>
            }
            rolling={isRollingDice}
            currentPlayer={currentPlayer}
            disabled={rollDisabled || game?.status === "paused"}
            chanceDisabled={loading || isRollingDice || !game?.id || game.status !== "active" || game.has_rolled || !isMyTurn}
            mustMove={game?.has_rolled === true && game.valid_moves.length > 0}
            isMyTurn={isMyTurn}
          />
          <PlayerPanel game={game} myPlayerIndex={myPlayerIndex ?? undefined} />
        </aside>
      </main>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}

