import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Subscribe to Postgres changes on a table.
 * Returns nothing; component must use the callback to invalidate queries.
 */
export function useRealtimeTable(
  table: string,
  onChange: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!supabase || !enabled) return;
    const channel = supabase
      .channel(`rt-${table}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table },
        () => onChange(),
      )
      .subscribe();
    return () => {
      supabase!.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, enabled]);
}
