interface PlayerInfo {
  id: string;
  name: string;
  color: "red" | "blue" | "yellow" | "green";
  status: "active" | "waiting";
}

interface PlayerPanelProps {
  players: PlayerInfo[];
}

const colorStyles: Record<PlayerInfo["color"], string> = {
  red: "border-ludo-red text-ludo-red",
  blue: "border-ludo-blue text-ludo-blue",
  yellow: "border-ludo-yellow text-ludo-yellow",
  green: "border-ludo-green text-ludo-green"
};

export default function PlayerPanel({ players }: PlayerPanelProps) {
  return (
    <section className="rounded-2xl bg-slate-800 p-5 shadow-lg">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Players
      </h2>
      <ul className="mt-4 space-y-3">
        {players.map((player) => (
          <li
            key={player.id}
            className={`rounded-xl border border-slate-700 px-4 py-3 ${colorStyles[player.color]}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{player.name}</span>
              <span className="text-xs uppercase tracking-wide text-slate-400">
                {player.status}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
