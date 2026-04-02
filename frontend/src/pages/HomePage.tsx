import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import * as api from "../api/client";
import { saveIdentity } from "../hooks/usePlayerIdentity";
import { useAuth } from "../context/AuthContext";
import AuthModal from "../components/AuthModal";
import MyGames from "../components/MyGames";

function parseGameId(input: string): string {
  const trimmed = input.trim();
  // Match UUID at end of URL or bare UUID
  const match = trimmed.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return match ? match[1] : trimmed;
}

export default function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, token, logout, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showMyGames, setShowMyGames] = useState(false);
  const routeState = location.state as { joinGameId?: string } | null;
  const [joinInput, setJoinInput] = useState(routeState?.joinGameId ?? "");
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (searchParams.get("view") === "my-games") {
      setShowMyGames(true);
    }
  }, [user, searchParams]);

  const openMyGames = () => {
    setShowMyGames(true);
    setSearchParams({ view: "my-games" });
  };

  const closeMyGames = () => {
    setShowMyGames(false);
    setSearchParams({});
  };

  const handleCreate = async (playerCount: 2 | 4) => {
    setLoading(true);
    setError(null);
    try {
      const displayName = user ? user.username : "Player 1";
      const result = await api.createGame(playerCount, displayName, token);
      saveIdentity(result.lobby.game_id, {
        playerId: result.player_id,
        playerIndex: result.player_index,
        color: result.color,
      });
      navigate(`/${result.lobby.game_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create game");
      setLoading(false);
    }
  };

  const handleJoin = () => {
    setJoinError(null);
    const gameId = parseGameId(joinInput);
    if (!gameId) {
      setJoinError("Enter a game link or ID.");
      return;
    }
    navigate(`/${gameId}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-900">
      {!authLoading && user && (
        <header className="px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              onClick={openMyGames}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-600"
              type="button"
            >
              My Games
            </button>
            <button
              onClick={logout}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-600"
              type="button"
            >
              Sign Out
            </button>
          </div>
        </header>
      )}

      <div className="flex flex-1 items-center justify-center px-4 py-6 sm:p-6">
        <div className="w-full max-w-sm rounded-2xl bg-slate-800 p-6 text-center shadow-xl sm:p-8">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Ludo</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Create a game and invite friends to play online.
          </p>

          {!authLoading && user && (
            <div className="mt-4 text-sm text-slate-300">
              <span className="text-slate-500">Signed in as</span>{" "}
              <span className="font-semibold text-white">{user.username}</span>
            </div>
          )}

          {user ? (
            <div className="mt-8 flex flex-col gap-3">
              <button
                onClick={() => void handleCreate(2)}
                disabled={loading}
                className="rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
              >
                Create 2-Player Game
              </button>
              <button
                onClick={() => void handleCreate(4)}
                disabled
                className="rounded-xl bg-slate-700 py-3 text-sm font-semibold text-slate-400 disabled:cursor-not-allowed disabled:opacity-100"
              >
                Create 4-Player Game
              </button>
            </div>
          ) : (
            <div className="mt-8 rounded-xl bg-slate-700/60 px-4 py-5 text-center">
              <p className="text-sm text-slate-300">Sign in to create or host a new game.</p>
              <p className="mt-1 text-xs text-slate-500">
                Joining from an invite link? You can still jump in without signing in.
              </p>
              <button
                onClick={() => setShowAuth(true)}
                className="mt-4 rounded-xl bg-indigo-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400"
                type="button"
              >
                Sign In
              </button>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-300">{error}</p>
          )}

          {!user && (
            <div className="mt-6 border-t border-slate-700 pt-5">
              <p className="mb-2 text-sm font-medium text-slate-400">Join an active game</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  placeholder="Paste game link or ID"
                  className="flex-1 min-w-0 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={handleJoin}
                  type="button"
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
                >
                  Join
                </button>
              </div>
              {joinError && (
                <p className="mt-2 text-xs text-red-400">{joinError}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {showMyGames && user && (
        <div className="fixed inset-0 z-40 bg-slate-950">
          <div className="flex min-h-screen flex-col">
            <div className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 bg-slate-950 px-4 py-5 sm:px-6 md:px-8">
              <div>
                <h2 className="text-xl font-semibold text-white sm:text-2xl">My Games</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  Pick up a paused match or review your recent sessions.
                </p>
              </div>
              <button
                onClick={closeMyGames}
                className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-600"
                type="button"
                aria-label="Close My Games"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 md:px-8">
              <div className="min-h-full">
                <MyGames />
              </div>
            </div>
          </div>
        </div>
      )}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}
