const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

const NETWORK_ERROR_MSG =
  "Could not reach the server. Start the backend: cd backend, then .venv\\Scripts\\activate, then uvicorn app.main:app --reload";

async function handleFetchError(e: unknown, fallback: string): Promise<never> {
  if (e instanceof TypeError && e.message === "Failed to fetch") {
    throw new Error(NETWORK_ERROR_MSG);
  }
  throw e instanceof Error ? e : new Error(fallback);
}

export async function fetchHealth(): Promise<{ status: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) {
      throw new Error("Failed to fetch health status");
    }
    return response.json() as Promise<{ status: string }>;
  } catch (e) {
    return handleFetchError(e, "Failed to fetch health status");
  }
}

export async function createGame(playerCount: number = 4): Promise<import("../types/game").GameState> {
  try {
    const response = await fetch(`${API_BASE_URL}/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_count: playerCount }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail ?? "Failed to create game");
    }
    return response.json();
  } catch (e) {
    return handleFetchError(e, "Failed to create game");
  }
}

export async function getGame(gameId: string): Promise<import("../types/game").GameState> {
  const response = await fetch(`${API_BASE_URL}/games/${gameId}`);
  if (!response.ok) {
    if (response.status === 404) throw new Error("Game not found");
    throw new Error("Failed to fetch game");
  }
  return response.json();
}

export async function rollDice(gameId: string): Promise<import("../types/game").RollResponse> {
  const response = await fetch(`${API_BASE_URL}/games/${gameId}/roll`, {
    method: "POST",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to roll");
  }
  return response.json();
}

export async function moveToken(
  gameId: string,
  color: string,
  tokenIndex: number
): Promise<import("../types/game").GameState> {
  const response = await fetch(`${API_BASE_URL}/games/${gameId}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ color, token_index: tokenIndex }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(Array.isArray(err.detail) ? err.detail[0]?.msg : err.detail ?? "Invalid move");
  }
  return response.json();
}

export async function passTurn(gameId: string): Promise<import("../types/game").GameState> {
  const response = await fetch(`${API_BASE_URL}/games/${gameId}/pass`, {
    method: "POST",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to pass");
  }
  return response.json();
}
