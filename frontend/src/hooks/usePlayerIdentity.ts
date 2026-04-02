import { useCallback } from "react";
import type { PlayerColor } from "../types/game";

export interface PlayerIdentity {
  playerId: string;
  playerIndex: number;
  color: PlayerColor;
}

// Single slot — creating a new game always overwrites the previous one.
const STORAGE_KEY = "ludo_active_game";

interface StoredEntry extends PlayerIdentity {
  gameId: string;
}

export function loadStoredIdentityEntry(): StoredEntry | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredEntry;
  } catch {
    return null;
  }
}

export function clearStoredIdentityEntry(gameId?: string): void {
  const entry = loadStoredIdentityEntry();
  if (!entry) return;
  if (gameId && entry.gameId !== gameId) return;
  localStorage.removeItem(STORAGE_KEY);
}

export function loadIdentity(gameId: string): PlayerIdentity | null {
  const entry = loadStoredIdentityEntry();
  if (!entry || entry.gameId !== gameId) return null;
  return { playerId: entry.playerId, playerIndex: entry.playerIndex, color: entry.color };
}

export function saveIdentity(gameId: string, identity: PlayerIdentity): void {
  const entry: StoredEntry = { gameId, ...identity };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
}

export function usePlayerIdentity(gameId: string) {
  const load = useCallback((): PlayerIdentity | null => loadIdentity(gameId), [gameId]);
  const save = useCallback(
    (identity: PlayerIdentity) => saveIdentity(gameId, identity),
    [gameId]
  );
  return { load, save };
}
