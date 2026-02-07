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
}

export default function PlayerPanel({ game }: PlayerPanelProps) {
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

  return (
    <section className="rounded-2xl bg-slate-800 p-5 shadow-lg">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Players
      </h2>
      <ul className="mt-4 space-y-3">
        {activeColors.map((color, idx) => {
          const isCurrent = color === currentColor;
          const isWinner = winnerColor === color;
          const status = isWinner ? "Winner!" : isCurrent ? "Your turn" : "Waiting";
          return (
            <li
              key={color}
              className={`rounded-xl border px-4 py-3 ${
                colorStyles[color] ?? "border-slate-600"
              } ${isCurrent ? "ring-2 ring-white" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold capitalize">{color}</span>
                <span className="text-xs uppercase tracking-wide text-slate-400">
                  {status}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {game.message && (
        <p className="mt-4 text-sm text-amber-300">{game.message}</p>
      )}
    </section>
  );
}
