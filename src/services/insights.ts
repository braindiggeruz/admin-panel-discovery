import { supabase } from "@/lib/supabase";
import type { GameRow, PublicProfile } from "@/lib/types";

/* ─── Live activity feed: latest events across the game ─── */
export type ActivityEvent =
  | { kind: "registration"; at: string; player: { id: string; nickname: string; avatar_index: number } }
  | { kind: "game_started"; at: string; gameId: string; roomCode: string }
  | { kind: "game_finished"; at: string; gameId: string; roomCode: string; winner: "white" | "black" | null }
  | { kind: "move"; at: string; gameId: string; roomCode: string; color: "white" | "black"; moveNumber: number };

export async function fetchActivityFeed(limit = 20): Promise<ActivityEvent[]> {
  if (!supabase) return [];
  // Pull latest from 3 sources in parallel, merge by created_at desc
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [profiles, games, moves] = await Promise.all([
    supabase
      .from("public_profiles")
      .select("id, nickname, avatar_index, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("games")
      .select("id, room_code, status, winner, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("moves")
      .select("game_id, move_number, player_color, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  const out: ActivityEvent[] = [];
  for (const p of profiles.data ?? []) {
    out.push({
      kind: "registration",
      at: p.created_at as string,
      player: { id: p.id as string, nickname: p.nickname as string, avatar_index: p.avatar_index as number },
    });
  }
  for (const g of games.data ?? []) {
    if (g.status === "finished") {
      out.push({
        kind: "game_finished",
        at: g.updated_at as string,
        gameId: g.id as string,
        roomCode: g.room_code as string,
        winner: g.winner as "white" | "black" | null,
      });
    } else {
      out.push({
        kind: "game_started",
        at: g.created_at as string,
        gameId: g.id as string,
        roomCode: g.room_code as string,
      });
    }
  }
  // Map game_id to room_code for move events
  const codeMap = new Map<string, string>();
  for (const g of games.data ?? []) codeMap.set(g.id as string, g.room_code as string);
  for (const m of moves.data ?? []) {
    out.push({
      kind: "move",
      at: m.created_at as string,
      gameId: m.game_id as string,
      roomCode: codeMap.get(m.game_id as string) ?? "—",
      color: m.player_color as "white" | "black",
      moveNumber: m.move_number as number,
    });
  }
  out.sort((a, b) => +new Date(b.at) - +new Date(a.at));
  return out.slice(0, limit);
}

/* ─── Insights & anti-fraud (public-data based) ─── */

export type Insights = {
  highWinrate: (PublicProfile & { winrate: number })[];
  longestStreaks: PublicProfile[];
  inactiveButRated: PublicProfile[];
  sameSecondSignups: { bucket: string; count: number; players: PublicProfile[] }[];
  ratingOutliers: PublicProfile[];
  zeroGames: { total: number; pct: number };
};

export async function fetchInsights(): Promise<Insights> {
  if (!supabase) {
    return {
      highWinrate: [],
      longestStreaks: [],
      inactiveButRated: [],
      sameSecondSignups: [],
      ratingOutliers: [],
      zeroGames: { total: 0, pct: 0 },
    };
  }
  // Pull a wider slice to find anomalies — we have ~890 profiles, OK to fetch them.
  const { data: profiles } = await supabase
    .from("public_profiles")
    .select("*")
    .order("rating", { ascending: false })
    .limit(2000);

  const all = (profiles as PublicProfile[]) ?? [];

  // High winrate: >=20 games AND winrate >= 90%
  const highWinrate = all
    .filter((p) => p.total_games >= 20 && p.wins / Math.max(1, p.total_games) >= 0.9)
    .map((p) => ({ ...p, winrate: Math.round((p.wins / p.total_games) * 100) }))
    .slice(0, 10);

  // Best streaks
  const longestStreaks = all
    .filter((p) => p.best_win_streak >= 5)
    .sort((a, b) => b.best_win_streak - a.best_win_streak)
    .slice(0, 10);

  // Inactive but high rating: not seen >14 days AND total_games >= 10 AND rating > 1200
  const cutoff = Date.now() - 14 * 86400000;
  const inactiveButRated = all
    .filter(
      (p) =>
        new Date(p.last_seen_at).getTime() < cutoff &&
        p.total_games >= 10 &&
        p.rating > 1200,
    )
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 10);

  // Same-second signups (potential bots/mass creation)
  // Bucket by ISO timestamp to seconds
  const groups = new Map<string, PublicProfile[]>();
  for (const p of all) {
    const sec = (p.created_at || "").slice(0, 19);
    if (!sec) continue;
    if (!groups.has(sec)) groups.set(sec, []);
    groups.get(sec)!.push(p);
  }
  const sameSecondSignups = Array.from(groups.entries())
    .filter(([, list]) => list.length >= 3)
    .map(([bucket, players]) => ({ bucket, count: players.length, players }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Rating outliers: rating sigma based; just take top/bottom outliers
  const ratings = all.map((p) => p.rating);
  const mean = ratings.reduce((s, n) => s + n, 0) / Math.max(1, ratings.length);
  const variance = ratings.reduce((s, n) => s + (n - mean) ** 2, 0) / Math.max(1, ratings.length);
  const sigma = Math.sqrt(variance);
  const ratingOutliers = all
    .filter((p) => Math.abs(p.rating - mean) > 2 * sigma)
    .sort((a, b) => Math.abs(b.rating - mean) - Math.abs(a.rating - mean))
    .slice(0, 10);

  const zero = all.filter((p) => p.total_games === 0).length;

  return {
    highWinrate,
    longestStreaks,
    inactiveButRated,
    sameSecondSignups,
    ratingOutliers,
    zeroGames: {
      total: zero,
      pct: all.length ? Math.round((zero / all.length) * 1000) / 10 : 0,
    },
  };
}

/* ─── Economy: P&L per day and top wagerers ─── */

export type DailyEconomy = {
  day: string;
  pot: number;
  paid: number;
  refunded: number;
  commission: number;
};

export async function fetchDailyEconomy(days = 30): Promise<DailyEconomy[]> {
  if (!supabase) return [];
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await supabase
    .from("game_stakes")
    .select("created_at, updated_at, entry_fee, pot_amount, payout_status")
    .gte("created_at", since)
    .limit(20000);
  const bucket = new Map<string, DailyEconomy>();
  for (let i = days - 1; i >= 0; i--) {
    const k = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    bucket.set(k, { day: k, pot: 0, paid: 0, refunded: 0, commission: 0 });
  }
  for (const s of data ?? []) {
    const k = (s.created_at as string).slice(0, 10);
    const row = bucket.get(k);
    if (!row) continue;
    row.pot += Number(s.pot_amount || 0);
    if (s.payout_status === "paid") {
      row.paid += Number(s.pot_amount || 0);
      row.commission += Number(s.pot_amount || 0) * 0.05;
    } else if (s.payout_status === "refunded") {
      row.refunded += Number(s.pot_amount || 0);
    }
  }
  return Array.from(bucket.values()).map((r) => ({
    ...r,
    commission: Math.round(r.commission),
  }));
}

export type TopWagerer = {
  profile: PublicProfile;
  totalWagered: number;
  games: number;
};

export async function fetchTopWagerers(limit = 10): Promise<TopWagerer[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("game_stakes")
    .select("entry_fee, white_profile_id, black_profile_id")
    .limit(5000);
  const acc = new Map<string, { wagered: number; count: number }>();
  for (const s of data ?? []) {
    const fee = Number(s.entry_fee || 0);
    for (const pid of [s.white_profile_id, s.black_profile_id]) {
      if (!pid) continue;
      const prev = acc.get(pid as string) ?? { wagered: 0, count: 0 };
      acc.set(pid as string, { wagered: prev.wagered + fee, count: prev.count + 1 });
    }
  }
  const top = Array.from(acc.entries())
    .sort((a, b) => b[1].wagered - a[1].wagered)
    .slice(0, limit);
  if (top.length === 0) return [];
  const ids = top.map(([id]) => id);
  const { data: profs } = await supabase.from("public_profiles").select("*").in("id", ids);
  const map: Record<string, PublicProfile> = {};
  for (const p of (profs as PublicProfile[]) ?? []) map[p.id] = p;
  return top
    .filter(([id]) => map[id])
    .map(([id, { wagered, count }]) => ({
      profile: map[id],
      totalWagered: wagered,
      games: count,
    }));
}
