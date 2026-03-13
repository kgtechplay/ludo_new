import { useState, useCallback, useEffect, useRef } from "react";
import Board from "./components/Board";
import Dice from "./components/Dice";
import PlayerPanel from "./components/PlayerPanel";
import type { GameState } from "./types/game";
import * as api from "./api/client";

const ROLL_FACES = [1, 2, 3, 4, 5, 6] as const;
const POST_RELEASE_ROLL_MS = 1000;
const SETTLE_DELAYS_MS = [130, 190, 260];

function formatErrorMessage(message: string): string {
  const normalized = message.trim();

  if (normalized.includes("Could not reach the server")) {
    return "The dice tower is unplugged. The backend is nowhere to be found.";
  }
  if (normalized.includes("API not found")) {
    return "I asked the server for Ludo and it handed me a blank stare.";
  }
  if (normalized.includes("Game not found")) {
    return "That game wandered off the board and never came back.";
  }
  if (normalized.includes("Selected token is not movable")) {
    return "That counter has union rules. It is not moving right now.";
  }
  if (normalized.includes("Must place on tile")) {
    return `${normalized}. The board is being extremely specific today.`;
  }
  if (normalized.includes("highlighted home tile")) {
    return "Home is thataway. Even the counter knows it.";
  }
  if (normalized.includes("Invalid move")) {
    return "Bold move. Illegal, but bold.";
  }
  if (normalized.includes("Roll the dice first")) {
    return "Nice try. The universe still requires a dice roll first.";
  }
  if (normalized.includes("Cannot use chance after rolling")) {
    return "No double-dipping. Chance has already left the building.";
  }
  if (normalized.includes("You must move a token before rolling again")) {
    return "One roll at a time, chief. Finish the move first.";
  }
  if (normalized.includes("Failed to create game")) {
    return "The board refused to assemble. Very dramatic of it.";
  }
  if (normalized.includes("Failed to roll")) {
    return "The dice bounced under the sofa. Roll failed.";
  }
  if (normalized.includes("Failed to play chance")) {
    return "Chance card jammed. Probably for the best.";
  }
  if (normalized.includes("Failed to pass")) {
    return "Even skipping a turn managed to trip over itself.";
  }
  if (normalized.includes("Move failed")) {
    return "That move had confidence, not legality.";
  }

  return `${normalized} Also, the board would like a minute.`;
}

export default function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayRoll, setDisplayRoll] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedMove, setSelectedMove] = useState<{ color: string; tokenIndex: number } | null>(
    null
  );
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

  const getAudioContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    const AudioCtor = window.AudioContext;
    if (!AudioCtor) return null;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioCtor();
    }
    return audioContextRef.current;
  }, []);

  const getNoiseBuffer = useCallback((audioContext: AudioContext) => {
    if (!noiseBufferRef.current) {
      const buffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * 0.06), audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) {
        data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
      }
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

  const startRollSound = useCallback(async () => {
    const audioContext = getAudioContext();
    if (!audioContext || soundIntervalRef.current != null) return;
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    soundIntervalRef.current = window.setInterval(() => {
      playRollRattle();
    }, 70);
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
    settleTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
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

  const startRollAnimation = useCallback(async () => {
    clearRollAnimation();
    rollActiveRef.current = true;
    setBoardRollVisible(true);
    setBoardRollSettling(false);
    setIsRollingDice(true);
    setBoardRollStep(0);
    setBoardRollValue((previous) => previous ?? ROLL_FACES[0]);
    await startRollSound();

    let frame = 0;
    rollIntervalRef.current = window.setInterval(() => {
      frame += 1;
      setBoardRollStep(frame);
      setBoardRollValue(ROLL_FACES[frame % ROLL_FACES.length]);
    }, 90);
  }, [clearRollAnimation, startRollSound]);

  const settleRollAnimation = useCallback(
    (finalValue: number) => {
      clearRollAnimation();
      stopRollSound();
      rollActiveRef.current = false;
      setIsRollingDice(false);
      setBoardRollSettling(true);

      const countdownFaces = [finalValue === 1 ? 6 : finalValue - 1, finalValue];
      countdownFaces.forEach((face, index) => {
        const timeoutId = window.setTimeout(() => {
          setBoardRollStep((step) => step + 1);
            setBoardRollValue(face);
            if (index === countdownFaces.length - 1) {
              setBoardRollSettling(false);
              const hideTimeoutId = window.setTimeout(() => {
                setBoardRollVisible(false);
            }, 900);
            settleTimeoutsRef.current.push(hideTimeoutId);
          }
        }, SETTLE_DELAYS_MS[index] ?? 200);
        settleTimeoutsRef.current.push(timeoutId);
      });
    },
    [clearRollAnimation, stopRollSound]
  );

  useEffect(() => () => resetRollVisuals(), [resetRollVisuals]);

  const handleNewGame = useCallback(async (playerCount: number) => {
    setLoading(true);
    setError(null);
    try {
      const state = await api.createGame(playerCount);
      setGame(state);
      setDisplayRoll(null);
      setStatusMessage(null);
      setSelectedMove(null);
      resetRollVisuals();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create game");
    } finally {
      setLoading(false);
    }
  }, [resetRollVisuals]);

  const beginRollHold = useCallback(() => {
    if (!game?.id || game.status !== "active" || loading || rollActiveRef.current) return;
    if (game.has_rolled && game.valid_moves.length > 0) return;
    void startRollAnimation();
  }, [game, loading, startRollAnimation]);

  const releaseRoll = useCallback(async () => {
    if (!game?.id || game.status === "finished") return;
    if (!rollActiveRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const rollingColor = game.active_colors[game.current_player_index] ?? "unknown";
      const [rollResult] = await Promise.all([
        api.rollDice(game.id),
        new Promise((resolve) => window.setTimeout(resolve, POST_RELEASE_ROLL_MS)),
      ]);
      settleRollAnimation(rollResult.roll);
      setDisplayRoll(rollResult.roll);
      if (rollResult.valid_moves.length === 0) {
        setStatusMessage(`Player ${rollingColor} has no moves.`);
        const passedState = await api.passTurn(game.id);
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
  }, [
    game?.active_colors,
    game?.current_player_index,
    game?.id,
    game?.status,
    resetRollVisuals,
    settleRollAnimation,
  ]);

  const handleChance = useCallback(async () => {
    if (!game?.id || game.status === "finished") return;
    setLoading(true);
    setError(null);
    try {
      const state = await api.chanceTurn(game.id);
      setGame(state);
      setStatusMessage(state.message || null);
      setSelectedMove(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chance failed");
    } finally {
      setLoading(false);
    }
  }, [game?.id, game?.status]);

  const handleTokenSelect = useCallback(
    (color: string, tokenIndex: number) => {
      if (!game?.id || game.status === "finished") return;
      const directHomeMove = game.valid_moves.find(
        (move) =>
          move.color === color &&
          move.token_index === tokenIndex &&
          move.target_kind === "home" &&
          move.home_index === 5
      );
      if (directHomeMove) {
        setLoading(true);
        setError(null);
        void api
          .moveToken(game.id, color, tokenIndex, {
            target_kind: directHomeMove.target_kind,
            path_index: directHomeMove.path_index,
            home_index: directHomeMove.home_index,
          })
          .then((state) => {
            setGame(state);
            setStatusMessage(state.message || null);
            setSelectedMove(null);
          })
          .catch((e) => {
            setError(e instanceof Error ? e.message : "Move failed");
          })
          .finally(() => {
            setLoading(false);
          });
        return;
      }
      setSelectedMove((prev) =>
        prev && prev.color === color && prev.tokenIndex === tokenIndex ? null : { color, tokenIndex }
      );
    },
    [game]
  );

  const handleTileClick = useCallback(
    async (tile: {
      target_kind: "path" | "home";
      path_index: number | null;
      home_index: number | null;
      home_color?: "red" | "blue" | "yellow" | "green";
    }) => {
      if (!game?.id || game.status === "finished" || !selectedMove) return;

      const selectedToken = game.tokens.find(
        (t) => t.color === selectedMove.color && t.token_index === selectedMove.tokenIndex
      );
      if (!selectedToken) return;

      const expectedMove = game.valid_moves.find(
        (m) => m.color === selectedMove.color && m.token_index === selectedMove.tokenIndex
      );
      if (!expectedMove) {
        setError("Selected token is not movable");
        return;
      }

      if (
        tile.target_kind !== expectedMove.target_kind ||
        tile.path_index !== expectedMove.path_index ||
        tile.home_index !== expectedMove.home_index
      ) {
        if (expectedMove.target_kind === "path" && expectedMove.path_index != null) {
          setError(`Must place on tile ${expectedMove.path_index}`);
        } else {
          setError("Must place on the highlighted home tile");
        }
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const state = await api.moveToken(game.id, selectedMove.color, selectedMove.tokenIndex, {
          target_kind: tile.target_kind,
          path_index: tile.path_index,
          home_index: tile.home_index,
        });
        setGame(state);
        setStatusMessage(null);
        setSelectedMove(null);
      } catch (e) {
        // Keep selection on invalid placement so player can try another tile.
        setError(e instanceof Error ? e.message : "Move failed");
      } finally {
        setLoading(false);
      }
    },
    [game?.id, game?.status, game?.last_roll, game?.tokens, selectedMove]
  );

  useEffect(() => {
    setSelectedMove(null);
  }, [game?.id, game?.current_player_index, game?.last_roll]);
  const currentPlayer =
    game && game.active_colors.length > 0
      ? game.active_colors[game.current_player_index] ?? null
      : null;
  const nextPlayerToRoll =
    game && game.active_colors.length > 0
      ? game.has_rolled && game.valid_moves.length > 0
        ? game.last_roll === 6
          ? currentPlayer
          : game.active_colors[(game.current_player_index + 1) % game.active_colors.length] ?? null
        : currentPlayer
      : null;
  const rollDisabled =
    loading ||
    isRollingDice ||
    !game?.id ||
    game.status !== "active" ||
    (game.has_rolled && game.valid_moves.length > 0);
  const errorMessage = error ? formatErrorMessage(error) : null;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {errorMessage && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-2xl border border-red-300/35 bg-red-950/90 px-4 py-3 text-sm text-red-100 shadow-[0_18px_32px_rgba(0,0,0,0.4)] backdrop-blur">
            <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-red-300" />
            <p>{errorMessage}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-1 shrink-0 rounded-md px-2 py-0.5 text-red-100/80 transition hover:bg-white/10 hover:text-white"
              aria-label="Dismiss error"
            >
              x
            </button>
          </div>
        </div>
      )}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ludo</h1>
          <p className="text-sm text-slate-400">
            Roll the dice, move a token. Roll 6 to leave the yard; exact roll to reach home.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => handleNewGame(2)}
            disabled={loading || isRollingDice}
            className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            New 2-Player Game
          </button>
          <button
            type="button"
            onClick={() => handleNewGame(4)}
            disabled={loading || isRollingDice}
            className="rounded-xl bg-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-500 disabled:opacity-50"
          >
            New 4-Player Game
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6 lg:flex-row lg:items-start">
        <Board
          game={game}
          onTokenClick={handleTokenSelect}
          onTileClick={handleTileClick}
          selectedMove={selectedMove}
          rollingDie={
            boardRollVisible && boardRollValue != null
              ? {
                  value: boardRollValue,
                  settling: boardRollSettling,
                  step: boardRollStep,
                }
              : null
          }
        />
        <aside className="flex shrink-0 flex-col gap-6 lg:w-80">
          <Dice
            value={displayRoll}
            onRollPressStart={beginRollHold}
            onRollPressEnd={releaseRoll}
            onChance={handleChance}
            rolling={isRollingDice}
            currentPlayer={currentPlayer}
            nextPlayer={nextPlayerToRoll}
            statusMessage={statusMessage}
            disabled={rollDisabled}
            chanceDisabled={loading || isRollingDice || !game?.id || game.status !== "active" || game.has_rolled}
            mustMove={game?.has_rolled === true && game.valid_moves.length > 0}
          />
          <PlayerPanel game={game} />
        </aside>
      </main>
    </div>
  );
}
