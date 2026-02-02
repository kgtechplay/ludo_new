export interface Player {
  id: string;
  name: string;
  color: "red" | "blue" | "yellow" | "green";
}

export interface GameState {
  id: string;
  status: "waiting" | "active" | "finished";
  players: Player[];
}
