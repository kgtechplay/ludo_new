import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "ludo_auth_token";
const RAW_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function buildApiUrl(path: string): string {
  const base = normalizeBaseUrl(RAW_API_BASE_URL);
  return base ? `${base}${path}` : path;
}

async function readJsonOrNull<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}

async function apiFetch(path: string, body: object): Promise<{ access_token: string; user: AuthUser }> {
  const res = await fetch(buildApiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJsonOrNull<{ access_token: string; user: AuthUser; detail?: unknown }>(res);
  if (!res.ok) {
    const detail = data?.detail;
    const message = Array.isArray(detail)
      ? (detail as { msg?: string }[]).map((d) => d.msg ?? String(d)).join(", ")
      : typeof detail === "string"
      ? detail
      : `Request failed (${res.status})`;
    throw new Error(message);
  }
  if (!data?.access_token || !data.user) {
    throw new Error("Authentication response was empty or invalid");
  }
  return data as { access_token: string; user: AuthUser };
}

async function fetchMe(token: string): Promise<AuthUser> {
  const res = await fetch(buildApiUrl("/auth/me"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Session expired");
  const data = await readJsonOrNull<AuthUser>(res);
  if (!data) throw new Error("Session response was empty");
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, token: null, loading: true });

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setState({ user: null, token: null, loading: false });
      return;
    }
    fetchMe(stored)
      .then((user) => setState({ user, token: stored, loading: false }))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setState({ user: null, token: null, loading: false });
      });
  }, []);

  const login = async (username: string, password: string) => {
    const { access_token, user } = await apiFetch("/auth/login", { username, password });
    localStorage.setItem(TOKEN_KEY, access_token);
    setState({ user, token: access_token, loading: false });
  };

  const register = async (username: string, email: string, password: string) => {
    const { access_token, user } = await apiFetch("/auth/register", { username, email, password });
    localStorage.setItem(TOKEN_KEY, access_token);
    setState({ user, token: access_token, loading: false });
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setState({ user: null, token: null, loading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
