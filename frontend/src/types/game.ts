/** Ludo game types matching backend API */

export type TokenKind = "yard" | "path" | "home";

export type PlayerColor = "red" | "blue" | "yellow" | "green";

export interface TokenState {
  color: PlayerColor;
  token_index: number;
  kind: TokenKind;
  path_index: number | null;
  home_index: number | null;
}

export interface GameState {
  id: string;
  status: "waiting" | "active" | "finished";
  player_count: number;
  active_colors: PlayerColor[];
  current_player_index: number;
  last_roll: number | null;
  has_rolled: boolean;
  tokens: TokenState[];
  winner_index: number | null;
  valid_moves: {
    color: PlayerColor;
    token_index: number;
    target_kind: "path" | "home";
    path_index: number | null;
    home_index: number | null;
  }[];
  message: string;
}

export interface RollResponse {
  roll: number;
  valid_moves: {
    color: PlayerColor;
    token_index: number;
    target_kind: "path" | "home";
    path_index: number | null;
    home_index: number | null;
  }[];
  message: string;
}
