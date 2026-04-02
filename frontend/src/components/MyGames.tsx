import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { claimGame, fetchMyGames, getGame } from "../api/client";
import { clearStoredIdentityEntry, loadStoredIdentityEntry } from "../hooks/usePlayerIdentity";
import type { GameHistoryItem } from "../types/game";

const COLOR_DOT: Record<string, string> = {
  red: "bg-red-500",
  blue: "bg-blue-500",
  yellow: "bg-yellow-400",
  green: "bg-green-500",
};

const STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  finished: "Completed",
  aborted: "Aborted",
  paused: "Paused",
  waiting: "Waiting",
  active: "In Progress",
};

const STATUS_BADGE: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30",
  finished: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30",
  aborted: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30",
  paused: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30",
  waiting: "bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30",
  active: "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30",
};

function formatPlayers(game: GameHistoryItem) {
  return game.participants.map((participant) => (
    <span
      key={participant.player_index}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
        participant.is_me ? "bg-indigo-500/25 text-indigo-200" : "bg-slate-700 text-slate-300"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${COLOR_DOT[participant.color] ?? "bg-slate-400"}`} />
      <span>{participant.display_name}</span>
      {participant.is_winner && <span className="text-yellow-300">*</span>}
    </span>
  ));
}

export default function MyGames() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [games, setGames] = useState<GameHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [staleGame, setStaleGame] = useState<GameHistoryItem | null>(null);
  const [openingGameId, setOpeningGameId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const storedIdentity = loadStoredIdentityEntry();
    const maybeClaim = storedIdentity
      ? claimGame(storedIdentity.gameId, storedIdentity.playerId, token).catch(() => undefined)
      : Promise.resolve();

    maybeClaim
      .then(() => fetchMyGames(token))
      .then(setGames)
      .catch(() => setGames([]))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-6 py-10">
        <p className="text-sm text-slate-400">Loading games...</p>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-6 py-10 text-center">
        <p className="text-sm text-slate-400">No games yet.</p>
      </div>
    );
  }

  const handleDismissStaleGame = () => {
    if (!staleGame) return;
    clearStoredIdentityEntry(staleGame.game_id);
    setGames((current) => current.filter((game) => game.game_id !== staleGame.game_id));
    setStaleGame(null);
  };

  const handleOpenGame = async (game: GameHistoryItem) => {
    setOpeningGameId(game.game_id);
    try {
      await getGame(game.game_id);
      navigate(`/${game.game_id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to open game";
      if (message.includes("Game not found")) {
        setStaleGame(game);
        return;
      }
      if (message.includes("Game has not started yet")) {
        navigate(`/${game.game_id}`);
        return;
      }
      throw error;
    } finally {
      setOpeningGameId(null);
    }
  };

  return (
    <>
      {staleGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">Game Unavailable</h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              This game does not exist any longer.
            </p>
            <p className="mt-2 break-all text-xs text-slate-500">{staleGame.game_id}</p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleDismissStaleGame}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-[0_24px_60px_rgba(2,6,23,0.45)]">
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed border-collapse">
          <thead className="bg-slate-900">
            <tr className="border-b border-slate-800 text-left">
              <th className="w-[12rem] px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</th>
              <th className="w-[18rem] px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Game ID</th>
              <th className="min-w-[18rem] px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Players</th>
              <th className="w-[12rem] px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Winner</th>
              <th className="w-[10rem] px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Created</th>
              <th className="w-[11rem] px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Action</th>
            </tr>
          </thead>
          <tbody>
            {games.map((game) => (
              <tr
                key={game.game_id}
                className="border-b border-slate-800/80 align-top transition-colors hover:bg-slate-800/35"
              >
                <td className="px-5 py-4">
                  <div className="space-y-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[game.status] ?? "bg-slate-700 text-slate-200"}`}>
                      {STATUS_LABEL[game.status] ?? game.status}
                    </span>
                    {game.status === "paused" && (
                      <p className="max-w-[13rem] text-xs leading-5 text-slate-400">
                        Both players need to click Resume to continue.
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4">
                  <p className="break-all font-mono text-sm text-slate-200">{game.game_id}</p>
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    {formatPlayers(game)}
                  </div>
                </td>
                <td className="px-5 py-4 text-sm text-slate-300">
                  {game.status === "completed" && game.winner_display_name ? (
                    <span className="font-semibold text-white">{game.winner_display_name}</span>
                  ) : (
                    <span className="text-slate-500">-</span>
                  )}
                </td>
                <td className="px-5 py-4 text-sm text-slate-400">
                  {new Date(game.created_at).toLocaleDateString()}
                </td>
                <td className="px-5 py-4">
                  {(game.status === "paused" || game.status === "active" || game.status === "waiting") ? (
                    <button
                      onClick={() => void handleOpenGame(game)}
                      className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
                      type="button"
                      disabled={openingGameId === game.game_id}
                    >
                      {openingGameId === game.game_id ? "Opening..." : game.status === "paused" ? "Resume Game" : "Open Game"}
                    </button>
                  ) : (
                    <span className="text-sm text-slate-500">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </>
  );
}
