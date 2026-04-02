const RAW_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const NETWORK_ERROR_MSG =
  "Could not reach the server. Make sure the backend is running on port 8080.";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  return normalizeBaseUrl(RAW_API_BASE_URL);
}

function getApiBaseCandidates(): string[] {
  return [getApiBaseUrl()];
}

async function handleFetchError(e: unknown, fallback: string): Promise<never> {
  if (e instanceof TypeError && e.message === "Failed to fetch") {
    throw new Error(NETWORK_ERROR_MSG);
  }
  throw e instanceof Error ? e : new Error(fallback);
}

async function readErrorDetail(response: Response, fallback: string): Promise<string> {
  const text = await response.text();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as { detail?: string | { msg?: string }[] };
    if (Array.isArray(parsed.detail)) {
      return parsed.detail[0]?.msg ?? fallback;
    }
    return parsed.detail ?? fallback;
  } catch {
    return text;
  }
}

async function requestJson<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  const candidates = getApiBaseCandidates();
  let lastError: Error | null = null;
  let sawOnlyNotFound = true;

  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}${path}`, init);
      if (!response.ok) {
        const detail = await readErrorDetail(response, fallback);
        if (response.status === 404 && baseUrl !== candidates[candidates.length - 1]) {
          lastError = new Error(detail);
          continue;
        }
        if (response.status !== 404) {
          sawOnlyNotFound = false;
        }
        throw new Error(detail);
      }
      return (await response.json()) as T;
    } catch (e) {
      if (e instanceof TypeError) {
        sawOnlyNotFound = false;
        lastError = e;
        continue;
      }
      lastError = e instanceof Error ? e : new Error(fallback);
      break;
    }
  }

  if (sawOnlyNotFound && candidates.length > 1) {
    throw new Error(`API not found. Checked: ${candidates.map((baseUrl) => `${baseUrl}${path}`).join(", ")}`);
  }

  return handleFetchError(lastError, fallback);
}

function playerHeaders(playerId: string): Record<string, string> {
  return { "Content-Type": "application/json", "X-Player-ID": playerId };
}

function withAuth(
  headers: Record<string, string>,
  token?: string | null
): Record<string, string> {
  if (!token) return headers;
  return { ...headers, Authorization: `Bearer ${token}` };
}

export function getWsUrl(gameId: string, playerId: string): string {
  const baseUrl = getApiBaseUrl();
  const wsBase = baseUrl
    ? baseUrl.replace(/^http/i, "ws")
    : typeof window !== "undefined"
      ? window.location.origin.replace(/^http/i, "ws")
      : "ws://127.0.0.1:8080";
  return `${wsBase}/games/${gameId}/ws?player_id=${playerId}`;
}

export async function fetchHealth(): Promise<{ status: string }> {
  return requestJson<{ status: string }>("/health", {}, "Failed to fetch health status");
}

export async function createGame(
  playerCount: number = 4,
  displayName: string = "Player 1",
  token?: string | null
): Promise<import("../types/game").JoinResponse> {
  return requestJson<import("../types/game").JoinResponse>(
    "/games",
    {
      method: "POST",
      headers: withAuth({ "Content-Type": "application/json" }, token),
      body: JSON.stringify({ player_count: playerCount, display_name: displayName }),
    },
    "Failed to create game"
  );
}

export async function joinGame(
  gameId: string,
  displayName: string = "Player",
  token?: string | null
): Promise<import("../types/game").JoinResponse> {
  return requestJson<import("../types/game").JoinResponse>(
    `/games/${gameId}/join`,
    {
      method: "POST",
      headers: withAuth({ "Content-Type": "application/json" }, token),
      body: JSON.stringify({ display_name: displayName }),
    },
    "Failed to join game"
  );
}

export async function markReady(
  gameId: string,
  playerId: string,
  token?: string | null
): Promise<import("../types/game").LobbyState> {
  return requestJson<import("../types/game").LobbyState>(
    `/games/${gameId}/ready`,
    {
      method: "POST",
      headers: withAuth({ "X-Player-ID": playerId }, token),
    },
    "Failed to mark ready"
  );
}

export async function getGame(
  gameId: string,
  playerId?: string | null,
  token?: string | null
): Promise<import("../types/game").GameState> {
  return requestJson<import("../types/game").GameState>(
    `/games/${gameId}`,
    {
      cache: "no-store",
      headers: withAuth(
        playerId ? { "X-Player-ID": playerId } : {},
        token
      ),
    },
    "Game not found"
  );
}

export async function getLobby(
  gameId: string,
  playerId?: string | null,
  token?: string | null
): Promise<import("../types/game").LobbyState> {
  return requestJson<import("../types/game").LobbyState>(
    `/games/${gameId}/lobby`,
    {
      cache: "no-store",
      headers: withAuth(
        playerId ? { "X-Player-ID": playerId } : {},
        token
      ),
    },
    "Game not found"
  );
}

export async function rollDice(
  gameId: string,
  playerId: string,
  token?: string | null
): Promise<import("../types/game").RollResponse> {
  return requestJson<import("../types/game").RollResponse>(
    `/games/${gameId}/roll`,
    { method: "POST", headers: withAuth({ "X-Player-ID": playerId }, token) },
    "Failed to roll"
  );
}

export async function moveToken(
  gameId: string,
  playerId: string,
  color: string,
  tokenIndex: number,
  target: { target_kind: "path" | "home"; path_index: number | null; home_index: number | null },
  token?: string | null
): Promise<import("../types/game").GameState> {
  return requestJson<import("../types/game").GameState>(
    `/games/${gameId}/move`,
    {
      method: "POST",
      headers: withAuth(playerHeaders(playerId), token),
      body: JSON.stringify({
        color,
        token_index: tokenIndex,
        target_kind: target.target_kind,
        path_index: target.path_index,
        home_index: target.home_index,
      }),
    },
    "Invalid move"
  );
}

export async function passTurn(
  gameId: string,
  playerId: string,
  token?: string | null
): Promise<import("../types/game").GameState> {
  return requestJson<import("../types/game").GameState>(
    `/games/${gameId}/pass`,
    { method: "POST", headers: withAuth({ "X-Player-ID": playerId }, token) },
    "Failed to pass"
  );
}

export async function chanceTurn(
  gameId: string,
  playerId: string,
  token?: string | null
): Promise<import("../types/game").GameState> {
  return requestJson<import("../types/game").GameState>(
    `/games/${gameId}/chance`,
    { method: "POST", headers: withAuth({ "X-Player-ID": playerId }, token) },
    "Failed to play chance"
  );
}

export async function pauseGame(
  gameId: string,
  playerId: string,
  token?: string | null
): Promise<import("../types/game").GameState> {
  return requestJson<import("../types/game").GameState>(
    `/games/${gameId}/pause`,
    { method: "POST", headers: withAuth({ "X-Player-ID": playerId }, token) },
    "Failed to pause game"
  );
}

export async function resumeGame(
  gameId: string,
  playerId: string,
  token?: string | null
): Promise<import("../types/game").GameState> {
  return requestJson<import("../types/game").GameState>(
    `/games/${gameId}/resume`,
    { method: "POST", headers: withAuth({ "X-Player-ID": playerId }, token) },
    "Failed to resume game"
  );
}

export async function resetGame(
  gameId: string,
  playerId: string,
  token?: string | null
): Promise<import("../types/game").LobbyState> {
  return requestJson<import("../types/game").LobbyState>(
    `/games/${gameId}/reset`,
    { method: "POST", headers: withAuth({ "X-Player-ID": playerId }, token) },
    "Failed to reset game"
  );
}

export async function fetchMyGames(token: string): Promise<import("../types/game").GameHistoryItem[]> {
  return requestJson<import("../types/game").GameHistoryItem[]>(
    "/auth/me/games",
    { headers: { Authorization: `Bearer ${token}` } },
    "Failed to fetch game history"
  );
}

export async function deleteMyGame(gameId: string, token: string): Promise<void> {
  await requestJson<{ ok: boolean }>(
    `/auth/me/games/${gameId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
    "Failed to delete game"
  );
}

export async function claimGame(
  gameId: string,
  playerId: string,
  token: string
): Promise<void> {
  await requestJson<{ ok: boolean }>(
    `/games/${gameId}/claim`,
    {
      method: "POST",
      headers: {
        "X-Player-ID": playerId,
        Authorization: `Bearer ${token}`,
      },
    },
    "Failed to claim game"
  );
}
