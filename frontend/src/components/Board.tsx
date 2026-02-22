import type { GameState, PlayerColor, TokenState } from "../types/game";
import Token from "./Token";

const SIZE = 15;
const CELL = "100% / 15";

const PATH_POSITIONS: [number, number][] = [
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [8, 8],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7],
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [7, 0],
  [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [6, 6], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [7, 14],
];

const START_INDEX: Record<PlayerColor, number> = {
  green: 0,
  yellow: 13,
  blue: 26,
  red: 39,
};

const HOME_LANE: Record<PlayerColor, [number, number][]> = {
  red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  green: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  blue: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
};

const YARD_POSITIONS: Record<PlayerColor, [number, number][]> = {
  blue: [[1, 1], [1, 4], [4, 1], [4, 4]],
  red: [[1, 10], [1, 13], [4, 10], [4, 13]],
  yellow: [[10, 1], [10, 4], [13, 1], [13, 4]],
  green: [[10, 10], [10, 13], [13, 10], [13, 13]],
};

const COLOR_CLASS: Record<PlayerColor, string> = {
  red: "bg-ludo-red",
  blue: "bg-ludo-blue",
  yellow: "bg-ludo-yellow",
  green: "bg-ludo-green",
};

interface BoardProps {
  game: GameState | null;
  onTokenClick?: (color: string, tokenIndex: number) => void;
  onTargetClick?: (move: {
    color: string;
    token_index: number;
    target_kind: "path" | "home";
    path_index: number | null;
    home_index: number | null;
  }) => void;
  selectedMove?: { color: string; tokenIndex: number } | null;
}

const calc = (n: number) => `calc((${CELL}) * ${n})`;

function tokenCell(token: TokenState): [number, number] | null {
  if (token.kind === "yard") return YARD_POSITIONS[token.color]?.[token.token_index] ?? null;
  if (token.kind === "path" && token.path_index != null) return PATH_POSITIONS[token.path_index] ?? null;
  if (token.kind === "home" && token.home_index != null) return HOME_LANE[token.color]?.[token.home_index] ?? null;
  return null;
}

export default function Board({ game, onTokenClick, onTargetClick, selectedMove }: BoardProps) {
  const validMoveSet = game ? new Set(game.valid_moves.map((m) => `${m.color}:${m.token_index}`)) : new Set<string>();
  const selectedKey = selectedMove ? `${selectedMove.color}:${selectedMove.tokenIndex}` : null;
  const selectedMoveData = selectedKey ? game?.valid_moves.find((m) => `${m.color}:${m.token_index}` === selectedKey) : null;

  return (
    <section className="w-full max-w-[860px]">
      <div className="rounded-lg border-2 border-black bg-white p-1 shadow-xl">
        <div
          className="relative grid aspect-square w-full"
          style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: SIZE * SIZE }, (_, idx) => {
            const row = Math.floor(idx / SIZE);
            const col = idx % SIZE;
            const key = `${row}-${col}`;
            const pathIndex = PATH_POSITIONS.findIndex(([r, c]) => r === row && c === col);
            const laneColor = (Object.keys(HOME_LANE) as PlayerColor[]).find((color) =>
              HOME_LANE[color].some(([r, c]) => r === row && c === col)
            );
            const isCenter = row >= 6 && row <= 8 && col >= 6 && col <= 8;

            let bg = "bg-white";
            if (row < 6 && col < 6) bg = "bg-ludo-blue";
            if (row < 6 && col > 8) bg = "bg-ludo-red";
            if (row > 8 && col < 6) bg = "bg-ludo-yellow";
            if (row > 8 && col > 8) bg = "bg-ludo-green";
            if (pathIndex !== -1) bg = "bg-white";
            if (laneColor) bg = COLOR_CLASS[laneColor];
            if (pathIndex !== -1 && Object.values(START_INDEX).includes(pathIndex)) {
              const color = (Object.entries(START_INDEX).find(([, i]) => i === pathIndex)?.[0] ?? "green") as PlayerColor;
              bg = COLOR_CLASS[color];
            }
            if (isCenter) bg = "bg-ludo-base";

            return <div key={key} className={`border border-black ${bg}`} />;
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
              <div className="absolute inset-[14%] border border-black bg-white">
                <div className="grid h-full grid-cols-2 gap-[18%] p-[16%]">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-center border border-black bg-black">
                      <span className={`block h-[70%] w-[70%] rounded-full ${COLOR_CLASS[yard.color]}`} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}

          <div className="absolute border border-black" style={{ top: calc(6), left: calc(6), width: calc(3), height: calc(3) }}>
            <svg viewBox="0 0 100 100" className="h-full w-full">
              <polygon points="50,50 0,0 100,0" fill="#C83A3A" />
              <polygon points="50,50 100,0 100,100" fill="#6CBF4B" />
              <polygon points="50,50 100,100 0,100" fill="#F4C430" />
              <polygon points="50,50 0,100 0,0" fill="#2F6FD6" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-black/70">HOME</div>
          </div>

          {game?.tokens.map((token) => {
            const pos = tokenCell(token);
            if (!pos) return null;
            const [row, col] = pos;
            const key = `${token.color}:${token.token_index}`;
            const canMove = validMoveSet.has(key);
            return (
              <div
                key={key}
                className="absolute flex items-center justify-center"
                style={{ top: `calc(${calc(row)} + (${CELL}) * 0.12)`, left: `calc(${calc(col)} + (${CELL}) * 0.12)`, width: `calc((${CELL}) * 0.76)`, height: `calc((${CELL}) * 0.76)` }}
              >
                <button
                  type="button"
                  onClick={() => onTokenClick?.(token.color, token.token_index)}
                  disabled={!canMove}
                  className={`h-full w-full rounded-full ${canMove ? "ring-2 ring-white" : ""} ${selectedKey === key ? "ring-4 ring-amber-300" : ""}`}
                >
                  <Token color={token.color} label={`${token.color[0].toUpperCase()}${token.token_index + 1}`} small />
                </button>
              </div>
            );
          })}

          {selectedMoveData && (
            <button
              type="button"
              aria-label="Place token"
              onClick={() => onTargetClick?.(selectedMoveData)}
              className="absolute rounded-full border-2 border-amber-300 bg-amber-200/70"
              style={{
                top: `calc(${calc((selectedMoveData.target_kind === "path" ? PATH_POSITIONS[selectedMoveData.path_index ?? -1]?.[0] : HOME_LANE[selectedMoveData.color]?.[selectedMoveData.home_index ?? -1]?.[0]) ?? 0)} + (${CELL}) * 0.2)`,
                left: `calc(${calc((selectedMoveData.target_kind === "path" ? PATH_POSITIONS[selectedMoveData.path_index ?? -1]?.[1] : HOME_LANE[selectedMoveData.color]?.[selectedMoveData.home_index ?? -1]?.[1]) ?? 0)} + (${CELL}) * 0.2)`,
                width: `calc((${CELL}) * 0.6)`,
                height: `calc((${CELL}) * 0.6)`,
              }}
            />
          )}
        </div>
      </div>
    </section>
  );
}
