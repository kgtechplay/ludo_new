import { useRef } from "react";

interface DiceProps {
  value: number | null;
  onRollPressStart: () => void;
  onRollPressEnd: () => void;
  onChance: () => void;
  rolling?: boolean;
  disabled?: boolean;
  chanceDisabled?: boolean;
  /** Show "Move a token" when roll done and valid moves exist */
  mustMove?: boolean;
  currentPlayer?: string | null;
  nextPlayer?: string | null;
  statusMessage?: string | null;
}

export default function Dice({
  value,
  onRollPressStart,
  onRollPressEnd,
  onChance,
  rolling,
  disabled,
  chanceDisabled,
  mustMove,
  currentPlayer,
  nextPlayer,
  statusMessage,
}: DiceProps) {
  const pressedRef = useRef(false);

  return (
    <section className="rounded-2xl bg-slate-800 p-5 shadow-lg">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Dice
      </h2>
      <p className="mt-2 text-sm text-slate-300">
        Turn: <span className="font-semibold capitalize">{currentPlayer ?? "-"}</span>
      </p>
      <p className="mt-1 text-xs text-slate-400">
        Next roll: <span className="font-semibold capitalize">{nextPlayer ?? "-"}</span>
      </p>
      <div className="mt-4 flex items-center gap-4">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-700 text-2xl font-bold transition-transform ${
            rolling ? "scale-105" : ""
          }`}
        >
          {value ?? "-"}
        </div>
        <div className="flex flex-col gap-2">
          <button
            className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            onPointerDown={(event) => {
              if (disabled || pressedRef.current || event.button !== 0) return;
              pressedRef.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              onRollPressStart();
            }}
            onPointerUp={(event) => {
              if (!pressedRef.current) return;
              pressedRef.current = false;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              onRollPressEnd();
            }}
            onPointerCancel={() => {
              if (!pressedRef.current) return;
              pressedRef.current = false;
              onRollPressEnd();
            }}
            onKeyDown={(event) => {
              if (disabled || pressedRef.current) return;
              if (event.key !== " " && event.key !== "Enter") return;
              event.preventDefault();
              pressedRef.current = true;
              onRollPressStart();
            }}
            onKeyUp={(event) => {
              if (!pressedRef.current) return;
              if (event.key !== " " && event.key !== "Enter") return;
              event.preventDefault();
              pressedRef.current = false;
              onRollPressEnd();
            }}
            onBlur={() => {
              if (!pressedRef.current) return;
              pressedRef.current = false;
              onRollPressEnd();
            }}
            type="button"
            disabled={disabled}
          >
            {rolling ? "Release to roll" : "Hold to roll"}
          </button>
          <button
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onChance}
            type="button"
            disabled={chanceDisabled}
          >
            Chance
          </button>
          {mustMove && (
            <span className="text-xs text-slate-400">Click a token to move</span>
          )}
          {statusMessage && (
            <span className="text-xs text-amber-300">{statusMessage}</span>
          )}
        </div>
      </div>
    </section>
  );
}
