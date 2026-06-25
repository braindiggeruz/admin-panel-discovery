/**
 * Admin data fetchers — go through /api/* (service_role on the server),
 * never through anon directly. This is what makes the Command Center
 * display real numbers after RLS lockdown.
 */
import type { EngagementLogRow, GameRow, GameStakeRow, MoveRow, PublicProfile } from "@/lib/types";

const API = (import.meta.env.VITE_API_URL as string) || "/api";

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    credentials: "same-origin",
    headers: { "x-requested-with": "fetch" },
  });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body?.error || `http_${r.status}`);
  }
  return r.json() as Promise<T>;
}
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-requested-with": "fetch" },
    body: JSON.stringify(body),
  });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b?.error || `http_${r.status}`);
  }
  return r.json() as Promise<T>;
}

/* ───────────────── PLAYERS ───────────────── */

export type PlayersQuery = {
  limit?: number;
  offset?: number;
  sort?: "rating" | "last_seen_at" | "created_at" | "total_games" | "win_streak" | "best_win_streak";
  dir?: "asc" | "desc";
  search?: string;
  hasGames?: boolean;
  active24h?: boolean;
  minGames?: number;
  minStreak?: number;
};

export async function fetchPlayers(opts: PlayersQuery = {}): Promise<{ rows: PublicProfile[]; total: number }> {
  const qs = new URLSearchParams();
  if (opts.sort) qs.set("sort", opts.sort);
  if (opts.dir) qs.set("dir", opts.dir);
  if (opts.limit != null) qs.set("limit", String(opts.limit));
  if (opts.offset != null) qs.set("offset", String(opts.offset));
  if (opts.search) qs.set("search", opts.search);
  if (opts.hasGames) qs.set("hasGames", "true");
  if (opts.minGames) qs.set("minGames", String(opts.minGames));
  if (opts.minStreak) qs.set("minStreak", String(opts.minStreak));
  if (opts.active24h) qs.set("active24h", "true");
  return apiGet<{ rows: PublicProfile[]; total: number }>(`/admin/players-list?${qs}`);
}

export async function fetchPlayer(id: string): Promise<PublicProfile | null> {
  const r = await apiGet<{ row: PublicProfile | null }>(`/admin/player-public/${id}`);
  return r.row;
}

export async function fetchPlayerGames(playerId: string, limit = 25): Promise<GameRow[]> {
  const r = await apiGet<{ rows: GameRow[] }>(`/admin/player-games/${playerId}?limit=${limit}`);
  return r.rows;
}

export async function fetchPlayerStakes(playerId: string, limit = 25): Promise<GameStakeRow[]> {
  const r = await apiGet<{ rows: GameStakeRow[] }>(`/admin/player-stakes/${playerId}?limit=${limit}`);
  return r.rows;
}

export async function fetchPlayerEngagement(playerId: string, limit = 50): Promise<EngagementLogRow[]> {
  const r = await apiGet<{ rows: EngagementLogRow[] }>(`/admin/player-engagement/${playerId}?limit=${limit}`);
  return r.rows;
}

/* ───────────────── GAMES & MOVES ───────────────── */

export async function fetchGames(opts: { limit?: number; status?: "waiting" | "playing" | "finished" | "all" } = {}): Promise<GameRow[]> {
  const qs = new URLSearchParams();
  if (opts.limit != null) qs.set("limit", String(opts.limit));
  if (opts.status) qs.set("status", opts.status);
  const r = await apiGet<{ rows: GameRow[] }>(`/admin/games-list?${qs}`);
  return r.rows;
}

export async function fetchGame(id: string): Promise<GameRow | null> {
  const r = await apiGet<{ game: GameRow | null; moves: MoveRow[] }>(`/admin/game/${id}`);
  return r.game;
}

export async function fetchGameMoves(gameId: string): Promise<MoveRow[]> {
  const r = await apiGet<{ game: GameRow | null; moves: MoveRow[] }>(`/admin/game/${gameId}`);
  return r.moves;
}

/* ───────────────── STAKES ───────────────── */

export async function fetchStakes(opts: { limit?: number } = {}): Promise<GameStakeRow[]> {
  const qs = new URLSearchParams();
  if (opts.limit != null) qs.set("limit", String(opts.limit));
  const r = await apiGet<{ rows: GameStakeRow[] }>(`/admin/stakes-list?${qs}`);
  return r.rows;
}

/* ───────────────── AGGREGATES (overview bundle) ───────────────── */

export type Totals = {
  players: number; games: number; active: number; finished: number;
  stakes: number; movesSeen: number; playedAtLeastOnce: number;
};
export type ActiveUsers = { d1: number; d7: number; d30: number; online5m: number };
export type Funnel = { registered: number; played1: number; played5: number; stake1: number };

let _overviewCache: { ts: number; data: { totals: Totals; activeUsers: ActiveUsers; funnel: Funnel } } | null = null;
async function getOverview() {
  // Tiny 5 s cache so the 4 separate useQueries don't multiply requests
  if (_overviewCache && Date.now() - _overviewCache.ts < 5000) return _overviewCache.data;
  const data = await apiGet<{ totals: Totals; activeUsers: ActiveUsers; funnel: Funnel }>("/admin/overview");
  _overviewCache = { ts: Date.now(), data };
  return data;
}

export async function fetchTotals(): Promise<Totals>             { return (await getOverview()).totals; }
export async function fetchActiveUsers(): Promise<ActiveUsers>    { return (await getOverview()).activeUsers; }
export async function fetchFunnel(): Promise<Funnel>              { return (await getOverview()).funnel; }

export async function fetchActivityHeatmap(days = 14): Promise<number[][]> {
  const r = await apiGet<{ grid: number[][] }>(`/admin/activity-heatmap?days=${days}`);
  return r.grid;
}
export async function fetchSignupTrend(days = 14): Promise<{ day: string; count: number }[]> {
  const r = await apiGet<{ rows: { day: string; count: number }[] }>(`/admin/signup-trend?days=${days}`);
  return r.rows;
}
export async function fetchGamesTrend(days = 14): Promise<{ day: string; count: number }[]> {
  const r = await apiGet<{ rows: { day: string; count: number }[] }>(`/admin/games-trend?days=${days}`);
  return r.rows;
}

export async function fetchProfilesByIds(ids: string[]): Promise<Record<string, PublicProfile>> {
  if (ids.length === 0) return {};
  const r = await apiPost<{ map: Record<string, PublicProfile> }>("/admin/profiles-by-ids", { ids });
  return r.map;
}

export async function searchEverywhere(q: string): Promise<{ players: PublicProfile[]; games: GameRow[] }> {
  return apiGet<{ players: PublicProfile[]; games: GameRow[] }>(`/admin/search?q=${encodeURIComponent(q)}`);
}
