const RAW_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

const NETWORK_ERROR_MSG =
  "Could not reach the server. Start the backend: cd backend, then .venv\\Scripts\\activate, then uvicorn app.main:app --reload";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function getApiBaseCandidates(): string[] {
  const candidates = [normalizeBaseUrl(RAW_API_BASE_URL)];
  if (typeof window !== "undefined") {
    const origin = normalizeBaseUrl(window.location.origin);
    candidates.push(origin);
    candidates.push(`${origin}/api`);
  }
  return [...new Set(candidates)];
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

  if (sawOnlyNotFound) {
    throw new Error(`API not found. Checked: ${candidates.map((baseUrl) => `${baseUrl}${path}`).join(", ")}`);
  }

  return handleFetchError(lastError, fallback);
}

export async function fetchHealth(): Promise<{ status: string }> {
  return requestJson<{ status: string }>("/health", {}, "Failed to fetch health status");
}

export async function createGame(playerCount: number = 4): Promise<import("../types/game").GameState> {
  return requestJson<import("../types/game").GameState>(
    "/games",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_count: playerCount }),
    },
    "Failed to create game"
  );
}

export async function getGame(gameId: string): Promise<import("../types/game").GameState> {
  return requestJson<import("../types/game").GameState>(
    `/games/${gameId}`,
    { cache: "no-store" },
    "Game not found"
  );
}

export async function rollDice(gameId: string): Promise<import("../types/game").RollResponse> {
  return requestJson<import("../types/game").RollResponse>(
    `/games/${gameId}/roll`,
    { method: "POST" },
    "Failed to roll"
  );
}

export async function moveToken(
  gameId: string,
  color: string,
  tokenIndex: number,
  target: { target_kind: "path" | "home"; path_index: number | null; home_index: number | null }
): Promise<import("../types/game").GameState> {
  return requestJson<import("../types/game").GameState>(
    `/games/${gameId}/move`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

export async function passTurn(gameId: string): Promise<import("../types/game").GameState> {
  return requestJson<import("../types/game").GameState>(
    `/games/${gameId}/pass`,
    { method: "POST" },
    "Failed to pass"
  );
}

export async function chanceTurn(gameId: string): Promise<import("../types/game").GameState> {
  return requestJson<import("../types/game").GameState>(
    `/games/${gameId}/chance`,
    { method: "POST" },
    "Failed to play chance"
  );
}
