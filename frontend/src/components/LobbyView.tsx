import { useState } from "react";
import type { LobbyState } from "../types/game";
import { useAuth } from "../context/AuthContext";

const COLOR_CLASSES: Record<string, string> = {
  red: "bg-ludo-red",
  blue: "bg-ludo-blue",
  yellow: "bg-ludo-yellow",
  green: "bg-ludo-green",
};

interface LobbyViewProps {
  lobby: LobbyState;
  myPlayerIndex: number | null;
  onReady: () => void;
  hasClickedReady: boolean;
  onSignIn: () => void;
  onClose: () => void;
}

export default function LobbyView({
  lobby,
  myPlayerIndex,
  onReady,
  hasClickedReady,
  onSignIn,
  onClose,
}: LobbyViewProps) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const shareUrl = window.location.href;
  const me = myPlayerIndex != null
    ? lobby.players.find((player) => player.player_index === myPlayerIndex) ?? null
    : null;
  const myReady = me?.ready ?? hasClickedReady;

  const handleCopy = () => {
    void navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const filledSlots = lobby.players.length;
  const waitingSlots = lobby.player_count - filledSlots;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-6 sm:p-6">
      <div className="relative w-full max-w-md rounded-2xl bg-slate-800 p-5 shadow-xl sm:p-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-700 hover:text-white"
          aria-label="Close lobby"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path
              fillRule="evenodd"
              d="M4.22 4.22a.75.75 0 0 1 1.06 0L10 8.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L11.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 0 1-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Ludo Lobby</h1>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              {lobby.player_count}-player game &middot; {filledSlots}/{lobby.player_count} joined
            </p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Share link</p>
          <div className="mt-1 flex items-center gap-2 rounded-xl bg-slate-700 px-3 py-3">
            <span className="min-w-0 flex-1 break-all text-sm text-slate-200 sm:truncate">{shareUrl}</span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white hover:bg-indigo-400"
              aria-label={copied ? "Copied" : "Copy share link"}
              title={copied ? "Copied" : "Copy share link"}
            >
              {copied ? (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path
                    fillRule="evenodd"
                    d="M16.704 5.29a1 1 0 0 1 0 1.414l-7.2 7.2a1 1 0 0 1-1.415 0l-3-3a1 1 0 1 1 1.415-1.414l2.292 2.292 6.493-6.493a1 1 0 0 1 1.415 0Z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M12.5 2A3.5 3.5 0 0 0 9 5.5v1a1 1 0 1 0 2 0v-1a1.5 1.5 0 0 1 3 0v7a1.5 1.5 0 0 1-3 0v-1a1 1 0 1 0-2 0v1A3.5 3.5 0 0 0 16 12.5v-7A3.5 3.5 0 0 0 12.5 2Z" />
                  <path d="M8.5 6A3.5 3.5 0 0 0 5 9.5v7A3.5 3.5 0 0 0 12 16.5v-1a1 1 0 1 0-2 0v1a1.5 1.5 0 0 1-3 0v-7a1.5 1.5 0 0 1 3 0v1a1 1 0 1 0 2 0v-1A3.5 3.5 0 0 0 8.5 6Z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Players</p>
          {lobby.players.map((p) => (
            <div
              key={p.player_index}
              className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-700 px-4 py-3"
            >
              <span
                className={`h-4 w-4 shrink-0 rounded-full ${COLOR_CLASSES[p.color] ?? "bg-slate-500"}`}
              />
              <span className="flex-1 text-sm font-medium text-slate-200">
                {p.display_name}
                {p.player_index === 0 && (
                  <span className="ml-2 text-xs text-slate-400">(Host)</span>
                )}
              </span>
              {p.ready ? (
                <span className="text-xs font-semibold text-emerald-400">Ready</span>
              ) : (
                <span className="text-xs text-slate-500">Waiting...</span>
              )}
            </div>
          ))}
          {Array.from({ length: waitingSlots }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex items-center gap-3 rounded-xl border border-dashed border-slate-600 px-4 py-3"
            >
              <span className="h-4 w-4 shrink-0 rounded-full bg-slate-600" />
              <span className="text-sm text-slate-500">Waiting for player...</span>
            </div>
          ))}
        </div>

        <div className="mt-8">
          {myReady ? (
            <div className="rounded-xl bg-slate-700 px-4 py-3 text-center text-sm text-slate-400">
              Waiting for other players to get ready...
            </div>
          ) : (
            <button
              type="button"
              onClick={onReady}
              className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Start Game
            </button>
          )}
        </div>

        {!user && (
          <div className="mt-6 border-t border-slate-700 pt-5">
            <div className="text-center">
              <p className="text-xs leading-5 text-slate-500">Sign in to save your game history &amp; stats.</p>
              <button
                onClick={onSignIn}
                className="mt-3 rounded-xl bg-indigo-500 px-6 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
                type="button"
              >
                Sign In / Sign Up
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
