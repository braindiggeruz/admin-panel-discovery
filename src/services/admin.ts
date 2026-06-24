import { supabase } from "@/lib/supabase";
import type { GameRow, GameStakeRow, MoveRow, PublicProfile } from "@/lib/types";

const empty = <T,>(): T[] => [];

/** Last N profiles (default 50), sorted by last_seen_at desc */
export async function fetchPlayers(opts: {
  limit?: number;
  sort?: "rating" | "last_seen_at" | "created_at" | "total_games" | "win_streak";
  dir?: "asc" | "desc";
  search?: string;
} = {}): Promise<PublicProfile[]> {
  if (!supabase) return empty();
  const sort = opts.sort ?? "last_seen_at";
  const dir = opts.dir ?? "desc";
  let q = supabase.from("public_profiles").select("*").order(sort, { ascending: dir === "asc" });
  if (opts.search) q = q.ilike("nickname", `%${opts.search}%`);
  q = q.limit(opts.limit ?? 50);
  const { data, error } = await q;
  if (error) {
    console.warn("[fetchPlayers]", error.message);
    return empty();
  }
  return (data as PublicProfile[]) ?? [];
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
    .select("id, game_id, move_number, player_color, move_data, created_at")
    .eq("game_id", gameId)
    .order("move_number", { ascending: true });
  if (error) {
    console.warn("[fetchGameMoves]", error.message);
    return empty();
  }
  return (data as MoveRow[]) ?? [];
}

export async function fetchStakes(opts: { limit?: number } = {}): Promise<GameStakeRow[]> {
  if (!supabase) return empty();
  const { data, error } = await supabase
    .from("game_stakes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (error) {
    console.warn("[fetchStakes]", error.message);
    return empty();
  }
  return (data as GameStakeRow[]) ?? [];
}

/** Aggregated counts using HEAD/count */
export async function fetchTotals(): Promise<{
  players: number;
  games: number;
  active: number;
  finished: number;
  stakes: number;
  movesSeen: number;
}> {
  if (!supabase) {
    return { players: 0, games: 0, active: 0, finished: 0, stakes: 0, movesSeen: 0 };
  }
  const head = (q: ReturnType<NonNullable<typeof supabase>["from"]>["select"] extends never ? never : ReturnType<ReturnType<NonNullable<typeof supabase>["from"]>["select"]>) => q;
  void head;
  const [p, g, ga, gf, s, m] = await Promise.all([
    supabase.from("public_profiles").select("*", { count: "exact", head: true }),
    supabase.from("games").select("*", { count: "exact", head: true }),
    supabase.from("games").select("*", { count: "exact", head: true }).in("status", ["waiting", "playing"]),
    supabase.from("games").select("*", { count: "exact", head: true }).eq("status", "finished"),
    supabase.from("game_stakes").select("*", { count: "exact", head: true }),
    supabase.from("moves").select("*", { count: "exact", head: true }),
  ]);
  return {
    players: p.count ?? 0,
    games: g.count ?? 0,
    active: ga.count ?? 0,
    finished: gf.count ?? 0,
    stakes: s.count ?? 0,
    movesSeen: m.count ?? 0,
  };
}

/** Players created in the last N days, grouped by day */
export async function fetchSignupTrend(days = 14): Promise<{ day: string; count: number }[]> {
  if (!supabase) return [];
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("public_profiles")
    .select("created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) {
    console.warn("[signupTrend]", error.message);
    return [];
  }
  const bucket = new Map<string, number>();
  // Pre-fill all days so chart is continuous
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const k = d.toISOString().slice(0, 10);
    bucket.set(k, 0);
  }
  for (const r of data ?? []) {
    const k = (r.created_at as string).slice(0, 10);
    bucket.set(k, (bucket.get(k) ?? 0) + 1);
  }
  return Array.from(bucket.entries()).map(([day, count]) => ({ day, count }));
}

/** Games finished per day (last N days) */
export async function fetchGamesTrend(days = 14): Promise<{ day: string; count: number }[]> {
  if (!supabase) return [];
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("games")
    .select("updated_at, status")
    .gte("updated_at", since)
    .order("updated_at", { ascending: true })
    .limit(5000);
  if (error) {
    console.warn("[gamesTrend]", error.message);
    return [];
  }
  const bucket = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const k = d.toISOString().slice(0, 10);
    bucket.set(k, 0);
  }
  for (const r of data ?? []) {
    if ((r as { status: string }).status !== "finished") continue;
    const k = ((r as { updated_at: string }).updated_at).slice(0, 10);
    bucket.set(k, (bucket.get(k) ?? 0) + 1);
  }
  return Array.from(bucket.entries()).map(([day, count]) => ({ day, count }));
}
