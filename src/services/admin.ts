import { supabase } from "@/lib/supabase";
import type {
  EngagementLogRow,
  GameRow,
  GameStakeRow,
  MoveRow,
  PublicProfile,
} from "@/lib/types";

const empty = <T,>(): T[] => [];

/* ───────────────── PLAYERS ───────────────── */

export type PlayersQuery = {
  limit?: number;
  offset?: number;
  sort?: "rating" | "last_seen_at" | "created_at" | "total_games" | "win_streak" | "best_win_streak";
  dir?: "asc" | "desc";
  search?: string;
  /** filter: played at least once */
  hasGames?: boolean;
  /** filter: active in last 24h */
  active24h?: boolean;
  /** filter: minimum total games */
  minGames?: number;
  /** filter: minimum best_win_streak */
  minStreak?: number;
};

export async function fetchPlayers(opts: PlayersQuery = {}): Promise<{
  rows: PublicProfile[];
  total: number;
}> {
  if (!supabase) return { rows: empty(), total: 0 };
  const sort = opts.sort ?? "last_seen_at";
  const dir = opts.dir ?? "desc";
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  let q = supabase
    .from("public_profiles")
    .select("*", { count: "exact" })
    .order(sort, { ascending: dir === "asc" });

  if (opts.search) q = q.ilike("nickname", `%${opts.search}%`);
  if (opts.hasGames) q = q.gt("total_games", 0);
  if (opts.minGames) q = q.gte("total_games", opts.minGames);
  if (opts.minStreak) q = q.gte("best_win_streak", opts.minStreak);
  if (opts.active24h) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    q = q.gte("last_seen_at", since);
  }

  q = q.range(offset, offset + limit - 1);
  const { data, error, count } = await q;
  if (error) {
    console.warn("[fetchPlayers]", error.message);
    return { rows: empty(), total: 0 };
  }
  return { rows: (data as PublicProfile[]) ?? [], total: count ?? 0 };
}

export async function fetchPlayer(id: string): Promise<PublicProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("public_profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.warn("[fetchPlayer]", error.message);
    return null;
  }
  return (data as PublicProfile) ?? null;
}

/** Games where a player participated */
export async function fetchPlayerGames(
  playerId: string,
  limit = 25,
): Promise<GameRow[]> {
  if (!supabase) return empty();
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .or(`white_player_id.eq.${playerId},black_player_id.eq.${playerId}`)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[fetchPlayerGames]", error.message);
    return empty();
  }
  return (data as GameRow[]) ?? [];
}

export async function fetchPlayerStakes(
  playerId: string,
  limit = 25,
): Promise<GameStakeRow[]> {
  if (!supabase) return empty();
  const { data, error } = await supabase
    .from("game_stakes")
    .select("*")
    .or(`white_profile_id.eq.${playerId},black_profile_id.eq.${playerId}`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[fetchPlayerStakes]", error.message);
    return empty();
  }
  return (data as GameStakeRow[]) ?? [];
}

export async function fetchPlayerEngagement(
  playerId: string,
  limit = 50,
): Promise<EngagementLogRow[]> {
  if (!supabase) return empty();
  const { data, error } = await supabase
    .from("engagement_log")
    .select("*")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    return empty();
  }
  return (data as EngagementLogRow[]) ?? [];
}

/* ───────────────── GAMES & MOVES ───────────────── */

export async function fetchGames(opts: {
  limit?: number;
  status?: "waiting" | "playing" | "finished" | "all";
} = {}): Promise<GameRow[]> {
  if (!supabase) return empty();
  let q = supabase
    .from("games")
    .select(
      "id, room_code, status, white_player_id, black_player_id, current_turn, move_number, winner, resign_reason, created_at, updated_at, last_move_at",
    )
    .order("updated_at", { ascending: false });
  if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
  q = q.limit(opts.limit ?? 50);
  const { data, error } = await q;
  if (error) {
    console.warn("[fetchGames]", error.message);
    return empty();
  }
  return (data as GameRow[]) ?? [];
}

export async function fetchGame(id: string): Promise<GameRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("games").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.warn("[fetchGame]", error.message);
    return null;
  }
  return (data as GameRow) ?? null;
}

export async function fetchGameMoves(gameId: string): Promise<MoveRow[]> {
  if (!supabase) return empty();
  const { data, error } = await supabase
    .from("moves")
    .select("*")
    .eq("game_id", gameId)
    .order("move_number", { ascending: true });
  if (error) {
    console.warn("[fetchGameMoves]", error.message);
    return empty();
  }
  return (data as MoveRow[]) ?? [];
}

/* ───────────────── STAKES ───────────────── */

export async function fetchStakes(opts: { limit?: number } = {}): Promise<GameStakeRow[]> {
  if (!supabase) return empty();
  const { data, error } = await supabase
    .from("game_stakes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 500);
  if (error) {
    console.warn("[fetchStakes]", error.message);
    return empty();
  }
  return (data as GameStakeRow[]) ?? [];
}

/* ───────────────── AGGREGATES ───────────────── */

export async function fetchTotals(): Promise<{
  players: number;
  games: number;
  active: number;
  finished: number;
  stakes: number;
  movesSeen: number;
  playedAtLeastOnce: number;
}> {
  if (!supabase) {
    return { players: 0, games: 0, active: 0, finished: 0, stakes: 0, movesSeen: 0, playedAtLeastOnce: 0 };
  }
  const [p, g, ga, gf, s, m, played] = await Promise.all([
    supabase.from("public_profiles").select("*", { count: "exact", head: true }),
    supabase.from("games").select("*", { count: "exact", head: true }),
    supabase.from("games").select("*", { count: "exact", head: true }).in("status", ["waiting", "playing"]),
    supabase.from("games").select("*", { count: "exact", head: true }).eq("status", "finished"),
    supabase.from("game_stakes").select("*", { count: "exact", head: true }),
    supabase.from("moves").select("*", { count: "exact", head: true }),
    supabase.from("public_profiles").select("*", { count: "exact", head: true }).gt("total_games", 0),
  ]);
  return {
    players: p.count ?? 0,
    games: g.count ?? 0,
    active: ga.count ?? 0,
    finished: gf.count ?? 0,
    stakes: s.count ?? 0,
    movesSeen: m.count ?? 0,
    playedAtLeastOnce: played.count ?? 0,
  };
}

/* DAU / WAU / MAU based on last_seen_at */
export async function fetchActiveUsers(): Promise<{
  d1: number;
  d7: number;
  d30: number;
  online5m: number;
}> {
  if (!supabase) return { d1: 0, d7: 0, d30: 0, online5m: 0 };
  const now = Date.now();
  const cuts = [
    new Date(now - 5 * 60 * 1000).toISOString(),
    new Date(now - 86400000).toISOString(),
    new Date(now - 7 * 86400000).toISOString(),
    new Date(now - 30 * 86400000).toISOString(),
  ];
  const [o, d1, d7, d30] = await Promise.all(
    cuts.map((c) =>
      supabase!
        .from("public_profiles")
        .select("*", { count: "exact", head: true })
        .gte("last_seen_at", c),
    ),
  );
  return {
    online5m: o.count ?? 0,
    d1: d1.count ?? 0,
    d7: d7.count ?? 0,
    d30: d30.count ?? 0,
  };
}

/** Activity heatmap by day-of-week × hour-of-day for last N days */
export async function fetchActivityHeatmap(days = 14): Promise<number[][]> {
  // 7 rows (dow Mon..Sun) × 24 cols (hour)
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  if (!supabase) return grid;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase
    .from("moves")
    .select("created_at")
    .gte("created_at", since)
    .limit(50_000);
  for (const r of data ?? []) {
    const d = new Date(r.created_at as string);
    const dow = (d.getUTCDay() + 6) % 7; // Mon=0
    grid[dow][d.getUTCHours()] += 1;
  }
  return grid;
}

export async function fetchSignupTrend(days = 14): Promise<{ day: string; count: number }[]> {
  if (!supabase) return [];
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await supabase
    .from("public_profiles")
    .select("created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(5000);
  const bucket = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    bucket.set(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10), 0);
  }
  for (const r of data ?? []) {
    const k = (r.created_at as string).slice(0, 10);
    bucket.set(k, (bucket.get(k) ?? 0) + 1);
  }
  return Array.from(bucket.entries()).map(([day, count]) => ({ day, count }));
}

export async function fetchGamesTrend(days = 14): Promise<{ day: string; count: number }[]> {
  if (!supabase) return [];
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await supabase
    .from("games")
    .select("updated_at, status")
    .gte("updated_at", since)
    .order("updated_at", { ascending: true })
    .limit(20_000);
  const bucket = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    bucket.set(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10), 0);
  }
  for (const r of data ?? []) {
    if ((r as { status: string }).status !== "finished") continue;
    const k = ((r as { updated_at: string }).updated_at).slice(0, 10);
    bucket.set(k, (bucket.get(k) ?? 0) + 1);
  }
  return Array.from(bucket.entries()).map(([day, count]) => ({ day, count }));
}

/**
 * Funnel: total registered → played at least 1 game → played at least 5 games →
 * played ≥1 stake game
 * (stake games inferred from game_stakes participants)
 */
export async function fetchFunnel(): Promise<{
  registered: number;
  played1: number;
  played5: number;
  stake1: number;
}> {
  if (!supabase) return { registered: 0, played1: 0, played5: 0, stake1: 0 };
  const [reg, p1, p5, stakes] = await Promise.all([
    supabase.from("public_profiles").select("*", { count: "exact", head: true }),
    supabase.from("public_profiles").select("*", { count: "exact", head: true }).gte("total_games", 1),
    supabase.from("public_profiles").select("*", { count: "exact", head: true }).gte("total_games", 5),
    supabase.from("game_stakes").select("white_profile_id, black_profile_id"),
  ]);
  const ids = new Set<string>();
  for (const s of stakes.data ?? []) {
    if (s.white_profile_id) ids.add(s.white_profile_id as string);
    if (s.black_profile_id) ids.add(s.black_profile_id as string);
  }
  return {
    registered: reg.count ?? 0,
    played1: p1.count ?? 0,
    played5: p5.count ?? 0,
    stake1: ids.size,
  };
}

/** Bulk lookup: ids → public_profiles map */
export async function fetchProfilesByIds(ids: string[]): Promise<Record<string, PublicProfile>> {
  if (!supabase || ids.length === 0) return {};
  const { data } = await supabase
    .from("public_profiles")
    .select("*")
    .in("id", Array.from(new Set(ids)));
  const out: Record<string, PublicProfile> = {};
  for (const r of (data as PublicProfile[]) ?? []) out[r.id] = r;
  return out;
}

/**
 * Unified search across players + matches.
 * Players: ilike nickname OR id eq
 * Matches: room_code ilike OR id eq
 */
export async function searchEverywhere(q: string): Promise<{
  players: PublicProfile[];
  games: GameRow[];
}> {
  const norm = q.trim();
  if (!supabase || !norm) return { players: [], games: [] };
  const isUUID = /^[0-9a-f-]{8,}$/i.test(norm);

  const [p, g] = await Promise.all([
    isUUID
      ? supabase.from("public_profiles").select("*").eq("id", norm).limit(5)
      : supabase
          .from("public_profiles")
          .select("*")
          .ilike("nickname", `%${norm}%`)
          .order("last_seen_at", { ascending: false })
          .limit(8),
    isUUID
      ? supabase.from("games").select("*").eq("id", norm).limit(5)
      : supabase
          .from("games")
          .select("*")
          .ilike("room_code", `%${norm.toUpperCase()}%`)
          .order("updated_at", { ascending: false })
          .limit(8),
  ]);

  return {
    players: (p.data as PublicProfile[]) ?? [],
    games: (g.data as GameRow[]) ?? [],
  };
}
