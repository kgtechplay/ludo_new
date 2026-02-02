import Token from "./Token";

const tiles = Array.from({ length: 15 }, (_, row) =>
  Array.from({ length: 15 }, (_, col) => ({ row, col }))
);

export default function Board() {
  return (
    <section className="rounded-3xl bg-slate-800 p-6 shadow-xl">
      <div className="grid grid-cols-15 gap-1">
        {tiles.flat().map((tile) => (
          <div
            key={`${tile.row}-${tile.col}`}
            className="aspect-square rounded-sm bg-slate-700/70"
          />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 text-sm text-slate-300">
        <div className="rounded-xl bg-ludo-green/20 p-4">
          <h2 className="text-base font-semibold text-ludo-green">Green Home</h2>
          <Token color="green" label="G1" />
        </div>
        <div className="rounded-xl bg-ludo-yellow/20 p-4">
          <h2 className="text-base font-semibold text-ludo-yellow">Yellow Home</h2>
          <Token color="yellow" label="Y1" />
        </div>
        <div className="rounded-xl bg-ludo-red/20 p-4">
          <h2 className="text-base font-semibold text-ludo-red">Red Home</h2>
          <Token color="red" label="R1" />
        </div>
        <div className="rounded-xl bg-ludo-blue/20 p-4">
          <h2 className="text-base font-semibold text-ludo-blue">Blue Home</h2>
          <Token color="blue" label="B1" />
        </div>
      </div>
    </section>
  );
}
