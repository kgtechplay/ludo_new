import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { claimGame, deleteMyGame, fetchMyGames, getGame } from "../api/client";
import {
  buildRestoredPlayerId,
  clearStoredIdentityEntry,
  isResumeWaiting,
  loadStoredIdentityEntry,
  saveIdentity,
} from "../hooks/usePlayerIdentity";
import type { GameHistoryItem } from "../types/game";
import type { PlayerColor } from "../types/game";

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
  const [copiedGameId, setCopiedGameId] = useState<string | null>(null);
  const [deletingGameId, setDeletingGameId] = useState<string | null>(null);

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
      const storedIdentity = loadStoredIdentityEntry();
      const me = game.participants.find((participant) => participant.is_me);
      const identity =
        storedIdentity && storedIdentity.gameId === game.game_id
          ? {
              playerId: storedIdentity.playerId,
              playerIndex: storedIdentity.playerIndex,
              color: storedIdentity.color,
            }
          : me
            ? {
                playerId: buildRestoredPlayerId(game.game_id, me.player_index),
                playerIndex: me.player_index,
                color: me.color as PlayerColor,
              }
            : null;

      if (identity) {
        saveIdentity(game.game_id, identity);
      }

      await getGame(game.game_id, identity?.playerId, token);
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

  const handleCopyLink = async (gameId: string) => {
    const gameUrl = `${window.location.origin}/${gameId}`;
    try {
      await navigator.clipboard.writeText(gameUrl);
      setCopiedGameId(gameId);
      window.setTimeout(() => {
        setCopiedGameId((current) => (current === gameId ? null : current));
      }, 1800);
    } catch {
      setCopiedGameId(null);
    }
  };

  const handleDeleteGame = async (game: GameHistoryItem) => {
    if (!token) return;
    setDeletingGameId(game.game_id);
    try {
      await deleteMyGame(game.game_id, token);
      clearStoredIdentityEntry(game.game_id);
      setGames((current) => current.filter((item) => item.game_id !== game.game_id));
    } finally {
      setDeletingGameId(null);
    }
  };

  const isCreator = (game: GameHistoryItem) =>
    game.participants.some((participant) => participant.is_me && participant.player_index === 0);

  const canCopyLink = (game: GameHistoryItem) => game.status === "paused" || game.status === "active";
  const isWaitingOnOthers = (game: GameHistoryItem) => game.status === "paused" && isResumeWaiting(game.game_id);
  const activeCount = games.filter((game) => game.status === "active").length;
  const pausedCount = games.filter((game) => game.status === "paused").length;
  const completedCount = games.filter((game) => game.status === "completed" || game.status === "finished").length;

  const renderActionIcons = (game: GameHistoryItem) => (
    <div className="flex items-center gap-2">
      {canCopyLink(game) && (
        <button
          type="button"
          onClick={() => void handleCopyLink(game.game_id)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-700 text-slate-100 hover:bg-slate-600"
          aria-label={copiedGameId === game.game_id ? "Copied" : "Copy game link"}
          title={copiedGameId === game.game_id ? "Copied" : "Copy game link"}
        >
          {copiedGameId === game.game_id ? (
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M16.704 5.29a1 1 0 0 1 0 1.414l-7.2 7.2a1 1 0 0 1-1.415 0l-3-3a1 1 0 1 1 1.415-1.414l2.292 2.292 6.493-6.493a1 1 0 0 1 1.415 0Z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M12.5 2A3.5 3.5 0 0 0 9 5.5v1a1 1 0 1 0 2 0v-1a1.5 1.5 0 0 1 3 0v7a1.5 1.5 0 0 1-3 0v-1a1 1 0 1 0-2 0v1A3.5 3.5 0 0 0 16 12.5v-7A3.5 3.5 0 0 0 12.5 2Z" />
              <path d="M8.5 6A3.5 3.5 0 0 0 5 9.5v7A3.5 3.5 0 0 0 12 16.5v-1a1 1 0 1 0-2 0v1a1.5 1.5 0 0 1-3 0v-7a1.5 1.5 0 0 1 3 0v1a1 1 0 1 0 2 0v-1A3.5 3.5 0 0 0 8.5 6Z" />
            </svg>
          )}
        </button>
      )}
      {isCreator(game) && (
        <button
          type="button"
          onClick={() => void handleDeleteGame(game)}
          disabled={deletingGameId === game.game_id}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 disabled:opacity-50"
          aria-label="Delete game"
          title="Delete game"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M8.5 2a1 1 0 0 0-.8.4L7.2 3H5a1 1 0 1 0 0 2h.293l.853 10.236A2 2 0 0 0 8.14 17h3.72a2 2 0 0 0 1.994-1.764L14.707 5H15a1 1 0 1 0 0-2h-2.2l-.5-.6a1 1 0 0 0-.8-.4h-3Zm.507 5a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm3 0a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Z" clipRule="evenodd" />
          </svg>
        </button>
      )}
      {!canCopyLink(game) && !isCreator(game) && (
        <span className="text-sm text-slate-500">-</span>
      )}
    </div>
  );

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
      <div className="space-y-4 sm:space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-indigo-500/15 bg-gradient-to-br from-slate-900 to-slate-800 px-4 py-4 shadow-[0_18px_40px_rgba(2,6,23,0.28)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Live Games</p>
            <p className="mt-2 text-2xl font-semibold text-white">{activeCount}</p>
            <p className="mt-1 text-xs text-slate-400">Matches currently in progress.</p>
          </div>
          <div className="rounded-2xl border border-amber-500/15 bg-gradient-to-br from-slate-900 to-slate-800 px-4 py-4 shadow-[0_18px_40px_rgba(2,6,23,0.28)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Paused</p>
            <p className="mt-2 text-2xl font-semibold text-white">{pausedCount}</p>
            <p className="mt-1 text-xs text-slate-400">Ready to resume when players return.</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-slate-900 to-slate-800 px-4 py-4 shadow-[0_18px_40px_rgba(2,6,23,0.28)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Completed</p>
            <p className="mt-2 text-2xl font-semibold text-white">{completedCount}</p>
            <p className="mt-1 text-xs text-slate-400">Finished games saved to history.</p>
          </div>
        </div>

        <div className="grid gap-3 md:hidden">
          {games.map((game) => (
            <article
              key={`mobile-${game.game_id}`}
              className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 p-4 shadow-[0_18px_40px_rgba(2,6,23,0.28)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                    isWaitingOnOthers(game)
                      ? "bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30"
                      : STATUS_BADGE[game.status] ?? "bg-slate-700 text-slate-200"
                  }`}>
                    {isWaitingOnOthers(game) ? "Waiting" : STATUS_LABEL[game.status] ?? game.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleOpenGame(game)}
                    disabled={openingGameId === game.game_id || !(game.status === "paused" || game.status === "active" || game.status === "waiting")}
                    className="break-all text-left font-mono text-sm text-indigo-300 hover:text-indigo-200 hover:underline disabled:text-slate-200 disabled:no-underline disabled:opacity-100"
                  >
                    {openingGameId === game.game_id ? "Opening..." : game.game_id}
                  </button>
                </div>
                {renderActionIcons(game)}
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Players</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {formatPlayers(game)}
                  </div>
                </div>
                <div className="flex items-start justify-between gap-4 text-sm">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Winner</p>
                    <p className="mt-1 text-slate-300">
                      {game.status === "completed" && game.winner_display_name ? game.winner_display_name : "-"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Created</p>
                    <p className="mt-1 text-slate-300">{new Date(game.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                {game.status === "paused" && (
                  <p className="rounded-xl bg-slate-800/80 px-3 py-2 text-xs leading-5 text-slate-400">
                    {isWaitingOnOthers(game)
                      ? "You already resumed. Waiting for the other player."
                      : "Both players need to click Resume to continue."}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="hidden overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-[0_24px_60px_rgba(2,6,23,0.45)] md:block">
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed border-collapse">
          <thead className="bg-slate-900">
            <tr className="border-b border-slate-800 text-left">
              <th className="w-[12rem] px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</th>
              <th className="w-[18rem] px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Game ID</th>
              <th className="min-w-[18rem] px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Players</th>
              <th className="w-[12rem] px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Winner</th>
              <th className="w-[10rem] px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Created</th>
              <th className="w-[8rem] px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Action</th>
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
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      isWaitingOnOthers(game)
                        ? "bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30"
                        : STATUS_BADGE[game.status] ?? "bg-slate-700 text-slate-200"
                    }`}>
                      {isWaitingOnOthers(game) ? "Waiting" : STATUS_LABEL[game.status] ?? game.status}
                    </span>
                    {game.status === "paused" && (
                      <p className="max-w-[13rem] text-xs leading-5 text-slate-400">
                        {isWaitingOnOthers(game)
                          ? "You already resumed. Waiting for the other player."
                          : "Both players need to click Resume to continue."}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4">
                  {(game.status === "paused" || game.status === "active" || game.status === "waiting") ? (
                    <button
                      type="button"
                      onClick={() => void handleOpenGame(game)}
                      className="break-all text-left font-mono text-sm text-indigo-300 hover:text-indigo-200 hover:underline disabled:opacity-50"
                      disabled={openingGameId === game.game_id}
                    >
                      {openingGameId === game.game_id ? "Opening..." : game.game_id}
                    </button>
                  ) : (
                    <p className="break-all font-mono text-sm text-slate-200">{game.game_id}</p>
                  )}
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
                  <div className="flex items-center gap-2">
                    {renderActionIcons(game)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
      </div>
    </>
  );
}
