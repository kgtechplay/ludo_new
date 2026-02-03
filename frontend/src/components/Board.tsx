/** Ludo board: 15x15 grid, path 0-51, home columns, yards. */

import type { GameState as GameStateType, TokenState } from "../types/game";
import Token from "./Token";

type PlayerColor = "red" | "blue" | "yellow" | "green";

// Main path 0-51: [row, col] on 15x15 grid. Clockwise from red start (11,1).
const PATH_POSITIONS: [number, number][] = [
  [11, 1], [10, 1], [9, 1], [8, 1], [7, 1], [6, 1], [5, 1], [4, 1], [3, 1], [2, 1], [1, 1],
  [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8], [1, 9], [1, 10], [1, 11], [1, 12], [1, 13],
  [2, 13], [3, 13], [4, 13], [5, 13], [6, 13], [7, 13], [8, 13], [9, 13], [10, 13], [11, 13], [12, 13], [13, 13],
  [13, 12], [13, 11], [13, 10], [13, 9], [13, 8], [13, 7], [13, 6], [13, 5], [13, 4], [13, 3], [13, 2], [13, 1],
  [12, 1], [11, 1],
];

// Safe path indexes (star squares)
const SAFE_PATH_INDEXES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Home column positions per color: 5 cells [row, col]. Red: col 1, Yellow: row 1, Green: col 13, Blue: row 13.
const HOME_POSITIONS: Record<PlayerColor, [number, number][]> = {
  red: [[8, 1], [7, 1], [6, 1], [5, 1], [4, 1]],
  yellow: [[1, 8], [1, 7], [1, 6], [1, 5], [1, 4]],
  green: [[6, 13], [7, 13], [8, 13], [9, 13], [10, 13]],
  blue: [[13, 6], [13, 7], [13, 8], [13, 9], [13, 10]],
};

const HOME_POSITION_MAP = new Map<string, PlayerColor>();
Object.entries(HOME_POSITIONS).forEach(([color, positions]) => {
  positions.forEach(([row, col]) => {
    HOME_POSITION_MAP.set(`${row}-${col}`, color as PlayerColor);
  });
});

const SAFE_STAR_COLORS: Record<number, PlayerColor | "neutral"> = {
  0: "red",
  13: "yellow",
  26: "green",
  39: "blue",
};

const HOME_ENTRY_ARROWS: Record<PlayerColor, { row: number; col: number; rotation: number }> = {
  red: { row: 8, col: 1, rotation: 0 },
  yellow: { row: 1, col: 8, rotation: -90 },
  green: { row: 6, col: 13, rotation: 180 },
  blue: { row: 13, col: 6, rotation: 90 },
};

const HOME_ENTRY_MAP = new Map<string, { color: PlayerColor; rotation: number }>();
Object.entries(HOME_ENTRY_ARROWS).forEach(([color, entry]) => {
  HOME_ENTRY_MAP.set(`${entry.row}-${entry.col}`, {
    color: color as PlayerColor,
    rotation: entry.rotation,
  });
});

const ARROW_COLOR_CLASSES: Record<PlayerColor, string> = {
  red: "text-ludo-red",
  yellow: "text-ludo-yellow",
  green: "text-ludo-green",
  blue: "text-ludo-blue",
};

// Yard positions per color: 4 tokens in 6x6. [row, col] for each token.
const YARD_POSITIONS: Record<PlayerColor, [number, number][]> = {
  red: [[10, 1], [10, 4], [13, 1], [13, 4]],
  yellow: [[1, 10], [1, 13], [4, 10], [4, 13]],
  green: [[1, 1], [1, 4], [4, 1], [4, 4]],
  blue: [[10, 10], [10, 13], [13, 10], [13, 13]],
};
const CELL_COUNT = 15;
const CELL_FRACTION = "100% / 15";
const calcCell = (value: number) => `calc((${CELL_FRACTION}) * ${value})`;

function getTokenPosition(token: TokenState): { row: number; col: number } | null {
  if (token.kind === "yard") {
    const pos = YARD_POSITIONS[token.color as PlayerColor]?.[token.token_index];
    return pos ? { row: pos[0], col: pos[1] } : null;
  }
  if (token.kind === "path" && token.path_index != null) {
    const pos = PATH_POSITIONS[token.path_index];
    return pos ? { row: pos[0], col: pos[1] } : null;
  }
  if (token.kind === "home" && token.home_index != null) {
    const pos = HOME_POSITIONS[token.color as PlayerColor]?.[token.home_index];
    return pos ? { row: pos[0], col: pos[1] } : null;
  }
  return null;
}

interface BoardProps {
  game: GameStateType | null;
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

function getMoveTargetPosition(
  move: {
    color: string;
    target_kind: "path" | "home";
    path_index: number | null;
    home_index: number | null;
  }
): { row: number; col: number } | null {
  if (move.target_kind === "path" && move.path_index != null) {
    const pos = PATH_POSITIONS[move.path_index];
    return pos ? { row: pos[0], col: pos[1] } : null;
  }
  if (move.target_kind === "home" && move.home_index != null) {
    const pos = HOME_POSITIONS[move.color as PlayerColor]?.[move.home_index];
    return pos ? { row: pos[0], col: pos[1] } : null;
  }
  return null;
}

export default function Board({ game, onTokenClick, onTargetClick, selectedMove }: BoardProps) {
  const validMoveSet = game
    ? new Set(
        game.valid_moves.map((m) => `${m.color}:${m.token_index}`)
      )
    : new Set<string>();
  const selectedKey = selectedMove ? `${selectedMove.color}:${selectedMove.tokenIndex}` : null;
  const selectedMoveData = selectedKey
    ? game?.valid_moves.find((move) => `${move.color}:${move.token_index}` === selectedKey)
    : null;
  const selectedTargetPosition = selectedMoveData
    ? getMoveTargetPosition({
        color: selectedMoveData.color,
        target_kind: selectedMoveData.target_kind,
        path_index: selectedMoveData.path_index,
        home_index: selectedMoveData.home_index,
      })
    : null;

  return (
    <section className="w-full max-w-[900px]">
      <div className="rounded-[8%] bg-ludo-wood p-[4.5%] shadow-[0_18px_35px_rgba(0,0,0,0.35)]">
      <div
        className="relative grid aspect-square w-full rounded-[6%] bg-ludo-base shadow-inner"
        style={{
          gridTemplateColumns: `repeat(${CELL_COUNT}, 1fr)`,
          gridTemplateRows: `repeat(${CELL_COUNT}, 1fr)`,
        }}
      >
        {/* Grid cells */}
        {Array.from({ length: CELL_COUNT }, (_, row) =>
          Array.from({ length: CELL_COUNT }, (_, col) => {
            const isPath = PATH_POSITIONS.some(([r, c]) => r === row && c === col);
            const pathIdx = PATH_POSITIONS.findIndex(([r, c]) => r === row && c === col);
            const isSafe = pathIdx >= 0 && SAFE_PATH_INDEXES.has(pathIdx);
            const homeColor = HOME_POSITION_MAP.get(`${row}-${col}`);
            const entryArrow = HOME_ENTRY_MAP.get(`${row}-${col}`);
            const isCenter = row >= 5 && row <= 9 && col >= 5 && col <= 9;
            let bg = "bg-ludo-base";
            if (isCenter) bg = "bg-ludo-base";
            else if (homeColor) bg = `bg-ludo-${homeColor}/80`;
            else if (isPath) bg = "bg-ludo-base";

            return (
              <div
                key={`${row}-${col}`}
                className={`relative flex items-center justify-center border border-ludo-path-outline ${bg} ${
                  isPath ? "rounded-[20%]" : "rounded-[12%]"
                }`}
              >
                {isSafe && (
                  <svg
                    aria-hidden="true"
                    className="h-[60%] w-[60%]"
                    viewBox="0 0 100 100"
                    fill={
                      SAFE_STAR_COLORS[pathIdx] === "red"
                        ? "#C83A3A"
                        : SAFE_STAR_COLORS[pathIdx] === "yellow"
                          ? "#F4C430"
                          : SAFE_STAR_COLORS[pathIdx] === "green"
                            ? "#6CBF4B"
                            : SAFE_STAR_COLORS[pathIdx] === "blue"
                              ? "#2F6FD6"
                              : "#A0A0A0"
                    }
                  >
                    <polygon points="50,8 62,38 94,38 68,58 78,90 50,70 22,90 32,58 6,38 38,38" />
                  </svg>
                )}
                {entryArrow && (
                  <svg
                    aria-hidden="true"
                    className={`absolute h-[38%] w-[38%] ${ARROW_COLOR_CLASSES[entryArrow.color]}`}
                    style={{ transform: `rotate(${entryArrow.rotation}deg)` }}
                    viewBox="0 0 100 100"
                    fill="currentColor"
                  >
                    <polygon points="50,10 90,90 10,90" />
                  </svg>
                )}
              </div>
            );
          })
        )}

        {/* Home areas */}
        {[
          { color: "green" as const, row: 0, col: 0 },
          { color: "yellow" as const, row: 0, col: 9 },
          { color: "red" as const, row: 9, col: 0 },
          { color: "blue" as const, row: 9, col: 9 },
        ].map((home) => (
          <div
            key={`${home.color}-home`}
            className={`absolute rounded-[10%] bg-ludo-${home.color}/25`}
            style={{
              top: calcCell(home.row),
              left: calcCell(home.col),
              width: calcCell(6),
              height: calcCell(6),
            }}
          >
            <div
              className="absolute inset-[12%] rounded-[18%] bg-ludo-base shadow-inner"
              style={{
                boxShadow: "inset 0 4px 8px rgba(0,0,0,0.18)",
              }}
            />
            <div className="absolute inset-[18%] grid grid-cols-2 grid-rows-2 place-items-center gap-[12%]">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-full w-full rounded-full bg-black/10 shadow-inner"
                  style={{
                    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.2)",
                  }}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Center triangles */}
        <div
          className="absolute"
          style={{
            top: calcCell(5),
            left: calcCell(5),
            width: calcCell(5),
            height: calcCell(5),
          }}
        >
          <svg viewBox="0 0 100 100" className="h-full w-full">
            <polygon points="0,0 100,0 50,50" fill="#F4C430" />
            <polygon points="0,0 0,100 50,50" fill="#6CBF4B" />
            <polygon points="0,100 100,100 50,50" fill="#C83A3A" />
            <polygon points="100,0 100,100 50,50" fill="#2F6FD6" />
            <rect x="45" y="45" width="10" height="10" fill="#F7F5EF" />
          </svg>
        </div>

        {/* Tokens */}
        {game?.tokens.map((token) => {
          const pos = getTokenPosition(token);
          if (!pos) return null;
          const key = `${token.color}:${token.token_index}`;
          const canMove = validMoveSet.has(key);
          return (
            <div
              key={key}
              className="absolute flex items-center justify-center"
              style={{
                left: `calc((${CELL_FRACTION}) * ${pos.col} - (${CELL_FRACTION}) * 0.2)`,
                top: `calc((${CELL_FRACTION}) * ${pos.row} - (${CELL_FRACTION}) * 0.2)`,
                width: `calc((${CELL_FRACTION}) * 1.4)`,
                height: `calc((${CELL_FRACTION}) * 1.4)`,
              }}
            >
                <button
                  type="button"
                  onClick={() => onTokenClick?.(token.color, token.token_index)}
                  className={`h-full w-full rounded-full ${
                    canMove
                      ? "cursor-pointer ring-2 ring-white ring-offset-2 ring-offset-ludo-base"
                      : "cursor-default"
                } ${selectedKey === key ? "ring-4 ring-amber-300" : ""}`}
                  disabled={!canMove}
                >
                  <Token
                    color={token.color as PlayerColor}
                    label={`${token.color[0].toUpperCase()}${token.token_index + 1}`}
                    small
                  />
                </button>
              </div>
            );
          })}

        {selectedMoveData && selectedTargetPosition && (
          <div
            className="absolute flex items-center justify-center"
            style={{
              left: `calc((${CELL_FRACTION}) * ${selectedTargetPosition.col} - (${CELL_FRACTION}) * 0.1)`,
              top: `calc((${CELL_FRACTION}) * ${selectedTargetPosition.row} - (${CELL_FRACTION}) * 0.1)`,
              width: `calc((${CELL_FRACTION}) * 1.2)`,
              height: `calc((${CELL_FRACTION}) * 1.2)`,
            }}
          >
            <button
              type="button"
              onClick={() =>
                onTargetClick?.({
                  color: selectedMoveData.color,
                  token_index: selectedMoveData.token_index,
                  target_kind: selectedMoveData.target_kind,
                  path_index: selectedMoveData.path_index,
                  home_index: selectedMoveData.home_index,
                })
              }
              className="h-full w-full rounded-full border-2 border-amber-300 bg-amber-200/70 shadow-[0_0_12px_rgba(251,191,36,0.6)]"
              aria-label="Place token"
            />
          </div>
        )}
      </div>
      </div>
    </section>
  );
}
