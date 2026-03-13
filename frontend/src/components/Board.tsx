import type { GameState, PlayerColor, TokenState } from "../types/game";
import Token from "./Token";
import { START_PATH_INDEX, START_PATH_INDEX_SET } from "../constants/board";

const SIZE = 15;
const CELL = "100% / 15";
const YARD_CELL = "100% / 6";

// Canonical 52-step outer track mapping on the 15x15 board grid.
const PATH_POSITIONS: [number, number][] = [
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [9, 8],
  [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 5],
  [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0], [6, 0],
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6],
  [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10],
  [6, 11], [6, 12], [6, 13], [6, 14], [7, 14], [8, 14],
];

const HOME_LANE: Record<PlayerColor, [number, number][]> = {
  red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  green: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  blue: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
};

const YARD_POSITIONS: Record<PlayerColor, [number, number][]> = {
  blue: [[2, 2], [2, 3], [3, 2], [3, 3]],
  red: [[2, 11], [2, 12], [3, 11], [3, 12]],
  yellow: [[11, 2], [11, 3], [12, 2], [12, 3]],
  green: [[11, 11], [11, 12], [12, 11], [12, 12]],
};

const COLOR_CLASS: Record<PlayerColor, string> = {
  red: "bg-ludo-red",
  blue: "bg-ludo-blue",
  yellow: "bg-ludo-yellow",
  green: "bg-ludo-green",
};

const ALL_COLORS: PlayerColor[] = ["red", "blue", "yellow", "green"];
const TOKENS_PER_PLAYER = 4;
const keyOf = (row: number, col: number) => `${row}:${col}`;
const calc = (n: number) => `calc((${CELL}) * ${n})`;
const yardCalc = (n: number) => `calc((${YARD_CELL}) * ${n})`;
const isCenterTile = (row: number, col: number) => row >= 6 && row <= 8 && col >= 6 && col <= 8;
const HOME_COUNT_POSITIONS: Record<PlayerColor, { top: string; left: string }> = {
  red: { top: `calc(${calc(6)} + (${CELL}) * 0.5)`, left: `calc(${calc(7)} + (${CELL}) * 0.5)` },
  green: { top: `calc(${calc(7)} + (${CELL}) * 0.5)`, left: `calc(${calc(8)} + (${CELL}) * 0.5)` },
  yellow: { top: `calc(${calc(8)} + (${CELL}) * 0.5)`, left: `calc(${calc(7)} + (${CELL}) * 0.5)` },
  blue: { top: `calc(${calc(7)} + (${CELL}) * 0.5)`, left: `calc(${calc(6)} + (${CELL}) * 0.5)` },
};

const PATH_INDEX_BY_CELL = new Map<string, number>(
  PATH_POSITIONS.map(([row, col], idx) => [keyOf(row, col), idx])
);

const HOME_CELL_TARGET = new Map<string, { home_color: PlayerColor; home_index: number }>(
  (Object.entries(HOME_LANE) as [PlayerColor, [number, number][]][])
    .flatMap(([color, cells]) => cells.map(([row, col], idx) => [keyOf(row, col), { home_color: color, home_index: idx }] as const))
);

interface BoardProps {
  game: GameState | null;
  onTokenClick?: (color: string, tokenIndex: number) => void;
  onTileClick?: (tile: {
    target_kind: "path" | "home";
    path_index: number | null;
    home_index: number | null;
    home_color?: PlayerColor;
  }) => void;
  selectedMove?: { color: string; tokenIndex: number } | null;
  rollingDie?: { value: number; settling: boolean; step: number } | null;
}

function pipPositions(value: number): string[] {
  switch (value) {
    case 1:
      return ["center"];
    case 2:
      return ["top-left", "bottom-right"];
    case 3:
      return ["top-left", "center", "bottom-right"];
    case 4:
      return ["top-left", "top-right", "bottom-left", "bottom-right"];
    case 5:
      return ["top-left", "top-right", "center", "bottom-left", "bottom-right"];
    default:
      return ["top-left", "top-right", "mid-left", "mid-right", "bottom-left", "bottom-right"];
  }
}

function pipClass(position: string): string {
  const classes: Record<string, string> = {
    center: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
    "top-left": "left-[22%] top-[22%]",
    "top-right": "right-[22%] top-[22%]",
    "mid-left": "left-[22%] top-1/2 -translate-y-1/2",
    "mid-right": "right-[22%] top-1/2 -translate-y-1/2",
    "bottom-left": "left-[22%] bottom-[22%]",
    "bottom-right": "right-[22%] bottom-[22%]",
  };
  return classes[position] ?? classes.center;
}

function tokenCell(token: TokenState): [number, number] | null {
  if (token.kind === "yard") return YARD_POSITIONS[token.color]?.[token.token_index] ?? null;
  if (token.kind === "path" && token.path_index != null) return PATH_POSITIONS[token.path_index] ?? null;
  if (token.kind === "home" && token.home_index != null) return HOME_LANE[token.color]?.[token.home_index] ?? null;
  return null;
}

export default function Board({ game, onTokenClick, onTileClick, selectedMove, rollingDie }: BoardProps) {
  const validMoveSet = game
    ? new Set(game.valid_moves.map((m) => `${m.color}:${m.token_index}`))
    : new Set<string>();
  const selectedKey = selectedMove ? `${selectedMove.color}:${selectedMove.tokenIndex}` : null;
  const homeCounts = ALL_COLORS.reduce(
    (counts, color) => {
      counts[color] = game?.tokens.filter((token) => token.color === color && token.kind === "home" && token.home_index === 5).length ?? 0;
      return counts;
    },
    {} as Record<PlayerColor, number>
  );
  const winnerLabel =
    game?.winner_index != null ? `Player ${game.winner_index + 1} is the winner` : null;
  const displayTokens: TokenState[] =
    game?.tokens ??
    ALL_COLORS.flatMap((color) =>
      Array.from({ length: TOKENS_PER_PLAYER }, (_, token_index) => ({
        color,
        token_index,
        kind: "yard",
        path_index: null,
        home_index: null,
      } as TokenState))
    );

  return (
    <section className="relative w-full max-w-[860px]">
      <div className="rounded-lg border-2 border-black bg-white p-1 shadow-xl">
        <div
          className="relative grid aspect-square w-full"
          style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: SIZE * SIZE }, (_, idx) => {
            const row = Math.floor(idx / SIZE);
            const col = idx % SIZE;
            const key = `${row}-${col}`;
            const pathIndex = PATH_INDEX_BY_CELL.get(keyOf(row, col));
            const homeCell = HOME_CELL_TARGET.get(keyOf(row, col));

            let bg = "bg-white";
            if (row < 6 && col < 6) bg = "bg-ludo-blue";
            if (row < 6 && col > 8) bg = "bg-ludo-red";
            if (row > 8 && col < 6) bg = "bg-ludo-yellow";
            if (row > 8 && col > 8) bg = "bg-ludo-green";
            if (pathIndex != null) bg = "bg-white";
            if (homeCell) bg = COLOR_CLASS[homeCell.home_color];
            if (pathIndex != null && START_PATH_INDEX_SET.has(pathIndex)) {
              const color = (Object.entries(START_PATH_INDEX).find(([, i]) => i === pathIndex)?.[0] ?? "green") as PlayerColor;
              bg = COLOR_CLASS[color];
            }
            if (isCenterTile(row, col)) bg = "bg-ludo-base";

            const tileTarget =
              pathIndex != null
                ? { target_kind: "path" as const, path_index: pathIndex, home_index: null as number | null }
                : homeCell
                  ? {
                      target_kind: "home" as const,
                      path_index: null as number | null,
                      home_index: homeCell.home_index,
                      home_color: homeCell.home_color,
                    }
                  : null;
            const tileClickable = !!selectedKey && !!tileTarget && !!onTileClick;

            return (
              <div
                key={key}
                className={`relative border border-black ${bg} ${tileClickable ? "cursor-pointer" : ""}`}
                onClick={tileClickable ? () => onTileClick(tileTarget) : undefined}
              >
                {pathIndex != null && (
                  <span className="pointer-events-none absolute left-0.5 top-0.5 rounded bg-white/90 px-0.5 text-[10px] font-bold leading-none text-black">
                    {pathIndex}
                  </span>
                )}
                {pathIndex != null && START_PATH_INDEX_SET.has(pathIndex) && (
                  <span className="pointer-events-none absolute bottom-0.5 right-0.5 rounded bg-black/70 px-0.5 text-[8px] font-bold leading-none text-white">
                    START
                  </span>
                )}
              </div>
            );
          })}

          {([
            { color: "blue" as const, row: 0, col: 0 },
            { color: "red" as const, row: 0, col: 9 },
            { color: "yellow" as const, row: 9, col: 0 },
            { color: "green" as const, row: 9, col: 9 },
          ]).map((yard) => (
            <div
              key={yard.color}
              className={`${COLOR_CLASS[yard.color]} absolute border border-black`}
              style={{ top: calc(yard.row), left: calc(yard.col), width: calc(6), height: calc(6) }}
            >
              <div
                className="absolute border border-black bg-white"
                style={{ top: yardCalc(1), left: yardCalc(1), width: yardCalc(4), height: yardCalc(4) }}
              />
              {[
                [2, 2],
                [2, 3],
                [3, 2],
                [3, 3],
              ].map(([r, c], i) => (
                <div
                  key={i}
                  className="absolute border border-black bg-white/40"
                  style={{ top: yardCalc(r), left: yardCalc(c), width: yardCalc(1), height: yardCalc(1) }}
                />
              ))}
            </div>
          ))}

          <div className="absolute border border-black" style={{ top: calc(6), left: calc(6), width: calc(3), height: calc(3) }}>
            <svg viewBox="0 0 100 100" className="h-full w-full">
              <polygon points="50,50 0,0 100,0" fill="#C83A3A" />
              <polygon points="50,50 100,0 100,100" fill="#6CBF4B" />
              <polygon points="50,50 100,100 0,100" fill="#F4C430" />
              <polygon points="50,50 0,100 0,0" fill="#2F6FD6" />
            </svg>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <svg viewBox="0 0 64 64" className="h-[58%] w-[58%] drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">
                <path d="M10 30 32 12 54 30v22a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4z" fill="#f8fafc" stroke="#111827" strokeWidth="3" />
                <path d="M22 56V38a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v18" fill="#e5e7eb" stroke="#111827" strokeWidth="3" />
                <rect x="28" y="42" width="8" height="14" rx="1.5" fill="#c2410c" stroke="#111827" strokeWidth="2" />
              </svg>
            </div>
          </div>

          {displayTokens.map((token) => {
            const pos = tokenCell(token);
            if (!pos) return null;
            const [row, col] = pos;
            const key = `${token.color}:${token.token_index}`;
            const canMove = validMoveSet.has(key);
            return (
              <div
                key={key}
                className="absolute z-20 flex items-center justify-center"
                style={{
                  top: `calc(${calc(row)} + (${CELL}) * 0.12)`,
                  left: `calc(${calc(col)} + (${CELL}) * 0.12)`,
                  width: `calc((${CELL}) * 0.76)`,
                  height: `calc((${CELL}) * 0.76)`,
                }}
              >
                <button
                  type="button"
                  onClick={() => onTokenClick?.(token.color, token.token_index)}
                  disabled={!canMove}
                  className={`h-full w-full rounded-full transition-all ${
                    selectedKey === key
                      ? "ring-4 ring-black -translate-y-0.5 scale-[1.03] shadow-[0_8px_14px_rgba(0,0,0,0.45)]"
                      : canMove
                        ? "ring-2 ring-white"
                        : ""
                  }`}
                >
                  <Token color={token.color} label={`${token.color[0].toUpperCase()}${token.token_index + 1}`} small />
                </button>
              </div>
            );
          })}

          {(Object.entries(HOME_COUNT_POSITIONS) as [PlayerColor, { top: string; left: string }][]).map(
            ([color, position]) => (
              <div
                key={`home-count-${color}`}
                className={`pointer-events-none absolute z-20 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/80 text-sm font-black text-slate-950 shadow-lg ${
                  COLOR_CLASS[color]
                }`}
                style={{ top: position.top, left: position.left }}
              >
                {homeCounts[color]}
              </div>
            )
          )}
        </div>
      </div>
      {rollingDie && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <div
            className={`relative h-24 w-24 rounded-[1.75rem] border-4 border-slate-900 bg-white shadow-[0_24px_40px_rgba(15,23,42,0.34)] transition-all ${
              rollingDie.settling ? "duration-200 ease-out" : "duration-75 ease-linear"
            }`}
            style={{
              transform: `translate3d(${Math.sin(rollingDie.step * 0.85) * 20}px, ${
                Math.cos(rollingDie.step * 0.7) * 12
              }px, 0) rotate(${rollingDie.step * 19}deg) scale(${rollingDie.settling ? 1 : 1.04})`,
            }}
          >
            {pipPositions(rollingDie.value).map((position, index) => (
              <span
                key={`${position}-${index}`}
                className={`absolute h-3.5 w-3.5 rounded-full bg-slate-900 ${pipClass(position)}`}
              />
            ))}
          </div>
        </div>
      )}
      {winnerLabel && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-40 flex -translate-y-1/2 justify-center">
          <div className="rounded-full border-2 border-amber-300 bg-slate-950/90 px-6 py-3 text-lg font-bold text-amber-200 shadow-[0_18px_30px_rgba(0,0,0,0.45)]">
            {winnerLabel}
          </div>
        </div>
      )}
    </section>
  );
}
