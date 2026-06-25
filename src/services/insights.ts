import type { PublicProfile } from "@/lib/types";

const API = (import.meta.env.VITE_API_URL as string) || "/api";

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    credentials: "same-origin",
    headers: { "x-requested-with": "fetch" },
  });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b?.error || `http_${r.status}`);
  }
  return r.json() as Promise<T>;
}

/* ─── Live activity feed ─── */
export type ActivityEvent =
  | { kind: "registration"; at: string; player: { id: string; nickname: string; avatar_index: number } }
  | { kind: "game_started"; at: string; gameId: string; roomCode: string }
  | { kind: "game_finished"; at: string; gameId: string; roomCode: string; winner: "white" | "black" | null }
  | { kind: "move"; at: string; gameId: string; roomCode: string; color: "white" | "black"; moveNumber: number };

export async function fetchActivityFeed(limit = 20): Promise<ActivityEvent[]> {
  const r = await apiGet<{ rows: ActivityEvent[] }>(`/admin/activity-feed?limit=${limit}`);
  return r.rows;
}

/* ─── Insights & anti-fraud ─── */
export type Insights = {
  highWinrate: (PublicProfile & { winrate: number })[];
  longestStreaks: PublicProfile[];
  inactiveButRated: PublicProfile[];
  sameSecondSignups: { bucket: string; count: number; players: PublicProfile[] }[];
  ratingOutliers: PublicProfile[];
  zeroGames: { total: number; pct: number };
};

export async function fetchInsights(): Promise<Insights> {
  return apiGet<Insights>("/admin/insights");
}

/* ─── Economy: P&L per day and top wagerers ─── */
export type DailyEconomy = { day: string; pot: number; paid: number; refunded: number; commission: number };
export async function fetchDailyEconomy(days = 30): Promise<DailyEconomy[]> {
  const r = await apiGet<{ rows: DailyEconomy[] }>(`/admin/economy/daily?days=${days}`);
  return r.rows;
}

export type TopWagerer = { profile: PublicProfile; totalWagered: number; games: number };
export async function fetchTopWagerers(limit = 10): Promise<TopWagerer[]> {
  const r = await apiGet<{ rows: TopWagerer[] }>(`/admin/economy/top-wagerers?limit=${limit}`);
  return r.rows;
}
