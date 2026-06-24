/**
 * Admin auth client — talks to Cloudflare Pages Functions at /api/*
 */

const API = (import.meta.env.VITE_API_URL as string) || "/api";
const TOKEN_KEY = "sr_admin_token";
const EMAIL_KEY = "sr_admin_email";

export type AdminSession = {
  token: string;
  email: string;
  role: string;
};

export function getSession(): AdminSession | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const email = localStorage.getItem(EMAIL_KEY);
    if (!token || !email) return null;
    // Decode payload to check expiry
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as {
      exp?: number;
      role?: string;
    };
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      clearSession();
      return null;
    }
    return { token, email, role: payload.role ?? "owner" };
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    /* ignore */
  }
}

export async function login(email: string, password: string): Promise<AdminSession> {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(body.error || "login_failed");
  }
  const sess: AdminSession = { token: body.token, email: body.email, role: body.role };
  try {
    localStorage.setItem(TOKEN_KEY, sess.token);
    localStorage.setItem(EMAIL_KEY, sess.email);
  } catch {
    /* ignore */
  }
  return sess;
}

async function apiFetch(path: string): Promise<unknown> {
  const session = getSession();
  if (!session) throw new Error("unauthorized");
  const r = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${session.token}` },
  });
  if (r.status === 401) {
    clearSession();
    throw new Error("unauthorized");
  }
  return r.json();
}

export type FullProfile = {
  id: string;
  player_id: string | null;
  nickname: string;
  email: string | null;
  display_name: string | null;
  avatar_index: number;
  rating: number;
  total_games: number;
  wins: number;
  losses: number;
  draws: number;
  win_streak: number;
  best_win_streak: number;
  login_streak: number;
  last_login_date: string | null;
  rank_tier: number;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
};

export type Wallet = {
  profile_id: string;
  crypto_balance: number;
  locked_balance: number;
  total_deposited: number;
  total_withdrawn: number;
  total_won: number;
  total_lost: number;
  created_at: string;
  updated_at: string;
};

export type WalletTransaction = {
  id: string;
  profile_id: string;
  game_id: string | null;
  type: string;
  amount: number | string;
  status: string;
  note: string | null;
  balance_before: number | null;
  balance_after: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  nickname?: string | null;
  avatar_index?: number;
};

export async function fetchPlayer360(id: string): Promise<{
  profile: FullProfile | null;
  wallet: Wallet | null;
  transactions: WalletTransaction[];
}> {
  return apiFetch(`/admin/players/${id}`) as Promise<{
    profile: FullProfile | null;
    wallet: Wallet | null;
    transactions: WalletTransaction[];
  }>;
}

export type WalletSummary = {
  top: Array<Wallet & { nickname: string | null; avatar_index: number }>;
  totals: { balance: number; locked: number; won: number; lost: number };
  walletCount: number;
};

export async function fetchWalletsSummary(): Promise<WalletSummary> {
  return apiFetch("/admin/wallets/summary") as Promise<WalletSummary>;
}

export async function fetchRecentTransactions(limit = 50): Promise<{ rows: WalletTransaction[] }> {
  return apiFetch(`/admin/transactions/recent?limit=${limit}`) as Promise<{ rows: WalletTransaction[] }>;
}

export async function fetchTxByType(): Promise<{ rows: Array<{ type: string; count: number; sum: number }> }> {
  return apiFetch("/admin/transactions/by-type") as Promise<{
    rows: Array<{ type: string; count: number; sum: number }>;
  }>;
}
