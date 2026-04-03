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

export interface LobbyPlayer {
  player_index: number;
  color: PlayerColor;
  display_name: string;
  ready: boolean;
  connected: boolean;
}

export interface LobbyState {
  game_id: string;
  player_count: number;
  players: LobbyPlayer[];
  status: "waiting" | "active" | "paused" | "finished";
}

export interface GameState {
  id: string;
  status: "waiting" | "active" | "paused" | "finished";
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
  players: LobbyPlayer[];
  resume_ready_player_indices: number[];
  resume_ready_count: number;
  resume_needed: number;
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

export interface JoinResponse {
  player_id: string;
  color: PlayerColor;
  player_index: number;
  lobby: LobbyState;
}

export interface GameParticipantItem {
  player_index: number;
  display_name: string;
  color: PlayerColor;
  is_winner: boolean;
  is_me: boolean;
}

export interface GameHistoryItem {
  game_id: string;
  player_count: number;
  status: string;
  winner_color: PlayerColor | null;
  winner_display_name: string | null;
  created_at: string;
  ended_at: string | null;
  participants: GameParticipantItem[];
}

export type WsMessageType =
  | "sync"
  | "player_joined"
  | "player_ready"
  | "game_started"
  | "game_state_updated"
  | "game_finished"
  | "game_paused"
  | "game_resumed"
  | "resume_ready"
  | "game_reset"
  | "player_disconnected"
  | "opponent_rolling"
  | "opponent_rolling_stop"
  | "error";

export interface WsMessage {
  type: WsMessageType;
  lobby?: LobbyState;
  game?: GameState;
  event?: string;
  player_index?: number;
  winner_index?: number;
  winner_color?: string;
  resume_count?: number;
  resume_needed?: number;
  code?: string;
  message?: string;
}
