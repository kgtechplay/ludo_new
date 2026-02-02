import Board from "./components/Board";
import Dice from "./components/Dice";
import PlayerPanel from "./components/PlayerPanel";

export default function App() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4">
        <h1 className="text-2xl font-semibold">Ludo Game</h1>
        <p className="text-sm text-slate-400">
          FastAPI + React + Tailwind scaffold for the Ludo board.
        </p>
      </header>
      <main className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-[1fr_320px]">
        <Board />
        <aside className="space-y-6">
          <Dice value={6} onRoll={() => undefined} />
          <PlayerPanel
            players={[
              { id: "p1", name: "Player 1", color: "red", status: "active" },
              { id: "p2", name: "Player 2", color: "blue", status: "waiting" }
            ]}
          />
        </aside>
      </main>
    </div>
  );
}
