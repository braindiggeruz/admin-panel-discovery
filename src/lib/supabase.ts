import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = !!url && !!anon;

export const supabase = supabaseConfigured
  ? createClient(url!, anon!, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 4 } },
    })
  : null;

export const GAME_URL = (import.meta.env.VITE_GAME_URL as string) || "https://shashki-royale.pages.dev";

/**
 * Read-only count helper.
 * Uses HEAD request with count=exact to avoid pulling rows.
 */
export async function countTable(
  table: string,
  filter?: { col: string; op: string; val: string },
): Promise<number> {
  if (!supabase) return 0;
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) {
    q = (q as unknown as { filter: (c: string, o: string, v: string) => typeof q })
      .filter(filter.col, filter.op, filter.val);
  }
  const { count, error } = await q;
  if (error) {
    console.warn(`[countTable ${table}]`, error.message);
    return 0;
  }
  return count ?? 0;
}
