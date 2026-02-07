import { useState, useCallback, useEffect } from "react";
import Board from "./components/Board";
import Dice from "./components/Dice";
import PlayerPanel from "./components/PlayerPanel";
import type { GameState } from "./types/game";
import * as api from "./api/client";

export default function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMove, setSelectedMove] = useState<{ color: string; tokenIndex: number } | null>(
    null
  );

  const refreshGame = useCallback(async (gameId: string) => {
    try {
      const state = await api.getGame(gameId);
      setGame(state);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load game");
    }
  }, []);

  const handleNewGame = useCallback(async (playerCount: number) => {
    setLoading(true);
    setError(null);
    try {
      const state = await api.createGame(playerCount);
      setGame(state);
      setSelectedMove(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create game");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRoll = useCallback(async () => {
    if (!game?.id || game.status === "finished") return;
    setLoading(true);
    setError(null);
    try {
      await api.rollDice(game.id);
      await refreshGame(game.id);
      setSelectedMove(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Roll failed");
    } finally {
      setLoading(false);
    }
  }, [game?.id, game?.status, refreshGame]);

  const handleTokenSelect = useCallback(
    (color: string, tokenIndex: number) => {
      if (!game?.id || game.status === "finished") return;
      setSelectedMove((prev) =>
        prev && prev.color === color && prev.tokenIndex === tokenIndex ? null : { color, tokenIndex }
      );
    },
    [game?.id, game?.status]
  );

  const handleTargetClick = useCallback(
    async (move: {
      color: string;
      token_index: number;
      target_kind: "path" | "home";
      path_index: number | null;
      home_index: number | null;
    }) => {
      if (!game?.id || game.status === "finished") return;
      setLoading(true);
      setError(null);
      try {
        const state = await api.moveToken(game.id, move.color, move.token_index, {
          target_kind: move.target_kind,
          path_index: move.path_index,
          home_index: move.home_index,
        });
        setGame(state);
        setSelectedMove(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Move failed");
      } finally {
        setLoading(false);
      }
    },
    [game?.id, game?.status]
  );

  const handlePass = useCallback(async () => {
    if (!game?.id || game.status === "finished") return;
    setLoading(true);
    setError(null);
    try {
      const state = await api.passTurn(game.id);
      setGame(state);
      setSelectedMove(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pass failed");
    } finally {
      setLoading(false);
    }
  }, [game?.id, game?.status]);

  useEffect(() => {
    setSelectedMove(null);
  }, [game?.id, game?.current_player_index, game?.last_roll]);


  const handleEndGame = useCallback(() => {
    setGame(null);
    setSelectedMove(null);
    setError(null);
  }, []);

  const canPass = game?.status === "active" && game.has_rolled && game.valid_moves.length === 0;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
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
            disabled={loading}
            className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            New 2-Player Game
          </button>
          <button
            type="button"
            onClick={() => handleNewGame(4)}
            disabled={loading}
            className="rounded-xl bg-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-500 disabled:opacity-50"
          >
            New 4-Player Game
          </button>
          {game && (
            <button
              type="button"
              onClick={handleEndGame}
              disabled={loading}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            >
              End Game
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="mx-6 mt-4 rounded-lg bg-red-900/50 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6 lg:flex-row lg:items-start">
        <Board
          game={game}
          onTokenClick={handleTokenSelect}
          onTargetClick={handleTargetClick}
          selectedMove={selectedMove}
        />
        <aside className="flex shrink-0 flex-col gap-6 lg:w-80">
          <Dice
            value={game?.last_roll ?? null}
            onRoll={handleRoll}
            disabled={
              loading ||
              !game?.id ||
              game.status !== "active" ||
              (game.has_rolled && game.valid_moves.length > 0)
            }
            mustMove={game?.has_rolled === true && game.valid_moves.length > 0}
          />
          {canPass && (
            <button
              type="button"
              onClick={handlePass}
              disabled={loading}
              className="rounded-xl bg-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-500 disabled:opacity-50"
            >
              Pass (no valid move)
            </button>
          )}
          <PlayerPanel game={game} />
        </aside>
      </main>
    </div>
  );
}
