interface DiceProps {
  value: number | null;
  onRoll: () => void;
  disabled?: boolean;
  /** Show "Move a token" when roll done and valid moves exist */
  mustMove?: boolean;
}

export default function Dice({ value, onRoll, disabled, mustMove }: DiceProps) {
  return (
    <section className="rounded-2xl bg-slate-800 p-5 shadow-lg">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Dice
      </h2>
      <div className="mt-4 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-700 text-2xl font-bold">
          {value ?? "—"}
        </div>
        <div className="flex flex-col gap-2">
          <button
            className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onRoll}
            type="button"
            disabled={disabled}
          >
            Roll
          </button>
          {mustMove && (
            <span className="text-xs text-slate-400">Click a token to move</span>
          )}
        </div>
      </div>
    </section>
  );
}
