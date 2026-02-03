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

// Yard positions per color: 4 tokens in 3x3. [row, col] for each token.
const YARD_POSITIONS: Record<PlayerColor, [number, number][]> = {
  red: [[12, 0], [12, 1], [13, 0], [13, 1]],
  yellow: [[0, 12], [0, 13], [1, 12], [1, 13]],
  green: [[0, 0], [0, 1], [1, 0], [1, 1]],
  blue: [[12, 12], [12, 13], [13, 12], [13, 13]],
};

const CELL_SIZE = 28;

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
}

export default function Board({ game, onTokenClick }: BoardProps) {
  const validMoveSet = game
    ? new Set(
        game.valid_moves.map((m) => `${m.color}:${m.token_index}`)
      )
    : new Set<string>();

  return (
    <section className="rounded-3xl bg-amber-900/90 p-4 shadow-xl">
      <div
        className="relative grid gap-0.5"
        style={{
          gridTemplateColumns: `repeat(15, ${CELL_SIZE}px)`,
          gridTemplateRows: `repeat(15, ${CELL_SIZE}px)`,
          width: 15 * CELL_SIZE + 14 * 2,
          height: 15 * CELL_SIZE + 14 * 2,
        }}
      >
        {/* Grid cells */}
        {Array.from({ length: 15 }, (_, row) =>
          Array.from({ length: 15 }, (_, col) => {
            const isPath = PATH_POSITIONS.some(([r, c]) => r === row && c === col);
            const pathIdx = PATH_POSITIONS.findIndex(([r, c]) => r === row && c === col);
            const isSafe = pathIdx >= 0 && SAFE_PATH_INDEXES.has(pathIdx);
            const isRedYard = row >= 11 && row <= 13 && col >= 0 && col <= 2;
            const isYellowYard = row >= 0 && row <= 2 && col >= 11 && col <= 13;
            const isGreenYard = row >= 0 && row <= 2 && col >= 0 && col <= 2;
            const isBlueYard = row >= 11 && row <= 13 && col >= 11 && col <= 13;
            const isCenter = row >= 5 && row <= 9 && col >= 5 && col <= 9;
            let bg = "bg-amber-100";
            if (isCenter) bg = "bg-amber-600";
            else if (isRedYard) bg = "bg-red-200";
            else if (isYellowYard) bg = "bg-yellow-200";
            else if (isGreenYard) bg = "bg-green-200";
            else if (isBlueYard) bg = "bg-blue-200";
            else if (isPath) bg = isSafe ? "bg-amber-50 ring-1 ring-amber-400" : "bg-amber-50";

            return (
              <div
                key={`${row}-${col}`}
                className={`${bg} rounded-sm`}
                style={{ width: CELL_SIZE, height: CELL_SIZE }}
              />
            );
          })
        )}

        {/* Tokens */}
        {game?.tokens.map((token, i) => {
          const pos = getTokenPosition(token);
          if (!pos) return null;
          const key = `${token.color}:${token.token_index}`;
          const canMove = validMoveSet.has(key);
          return (
            <div
              key={key}
              className="absolute flex items-center justify-center"
              style={{
                left: pos.col * (CELL_SIZE + 2) + 2,
                top: pos.row * (CELL_SIZE + 2) + 2,
                width: CELL_SIZE - 2,
                height: CELL_SIZE - 2,
              }}
            >
              <button
                type="button"
                onClick={() => onTokenClick?.(token.color, token.token_index)}
                className={canMove ? "cursor-pointer ring-2 ring-white ring-offset-1 rounded-full" : "cursor-default"}
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
      </div>
    </section>
  );
}
