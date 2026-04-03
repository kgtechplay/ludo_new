import type { GameState } from "../types/game";

const COLORS = ["red", "blue", "yellow", "green"] as const;
const colorStyles: Record<string, string> = {
  red: "border-red-500 text-red-600",
  blue: "border-blue-500 text-blue-600",
  yellow: "border-yellow-600 text-yellow-700",
  green: "border-green-500 text-green-600",
};

interface PlayerPanelProps {
  game: GameState | null;
  myPlayerIndex?: number;
}

export default function PlayerPanel({ game, myPlayerIndex }: PlayerPanelProps) {
  if (!game) {
    return (
      <section className="rounded-2xl bg-slate-800 p-5 shadow-lg">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Players
        </h2>
        <p className="mt-4 text-sm text-slate-500">Start a game to see players.</p>
      </section>
    );
  }

  const activeColors = game.active_colors.length ? game.active_colors : COLORS.slice(0, game.player_count);
  const currentColor = activeColors[game.current_player_index];
  const winnerColor = game.winner_index != null ? activeColors[game.winner_index] : null;
  const myColor = myPlayerIndex !== undefined && myPlayerIndex !== null
    ? activeColors[myPlayerIndex] ?? null
    : null;
  const myPlayerName = myPlayerIndex !== undefined && myPlayerIndex !== null
    ? game.players.find((player) => player.player_index === myPlayerIndex)?.display_name ?? null
    : null;

  return (
    <section className="rounded-2xl bg-slate-800 p-5 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Players
        </h2>
        {myColor && (
          <span className="rounded-full border border-slate-600 bg-slate-700 px-3 py-1 text-xs font-semibold tracking-wide text-slate-200">
            {myPlayerName ? `${myPlayerName} · ` : ""}You are {myColor.charAt(0).toUpperCase() + myColor.slice(1)}
          </span>
        )}
      </div>
      <ul className="mt-4 space-y-3">
        {activeColors.map((color, idx) => {
          const isCurrent = color === currentColor;
          const isWinner = winnerColor === color;
          const isMe = myPlayerIndex !== undefined && idx === myPlayerIndex;
          const status = isWinner ? "Winner!" : isCurrent ? (isMe ? "Your turn" : "Their turn") : "Waiting";
          return (
            <li
              key={color}
              className={`rounded-xl border px-4 py-3 ${
                colorStyles[color] ?? "border-slate-600"
              } ${isCurrent ? "ring-2 ring-white" : ""}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold capitalize">
                  {color}
                  {isMe && <span className="ml-2 text-xs font-normal text-slate-400">(You)</span>}
                </span>
                <span className="text-xs uppercase tracking-wide text-slate-400">
                  {status}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {game.message && (
        <p className="mt-4 text-sm leading-6 text-amber-300">{game.message}</p>
      )}
    </section>
  );
}
