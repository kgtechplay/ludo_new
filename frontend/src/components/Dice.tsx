interface DiceProps {
  value: number;
  onRoll: () => void;
}

export default function Dice({ value, onRoll }: DiceProps) {
  return (
    <section className="rounded-2xl bg-slate-800 p-5 shadow-lg">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Dice
      </h2>
      <div className="mt-4 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-700 text-2xl font-bold">
          {value}
        </div>
        <button
          className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
          onClick={onRoll}
          type="button"
        >
          Roll
        </button>
      </div>
    </section>
  );
}
