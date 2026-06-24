import { useEffect, useState } from "react";
import { fmtRelative, clsx } from "@/lib/format";

/**
 * Tiny indicator showing the panel is alive: dot pulses when `at` is fresh,
 * fades when older than freshSeconds.
 */
export default function LiveIndicator({
  at,
  label = "обновлено",
  freshSeconds = 60,
}: {
  at: Date | string | number | null | undefined;
  label?: string;
  freshSeconds?: number;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  if (!at) return null;
  const ts = typeof at === "string" || typeof at === "number" ? new Date(at) : at;
  const ageSec = Math.max(0, (Date.now() - ts.getTime()) / 1000);
  const fresh = ageSec < freshSeconds;

  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-500">
      <span className="relative flex h-1.5 w-1.5">
        {fresh && (
          <span className="absolute inset-0 rounded-full bg-accent-mint opacity-60 animate-ping" />
        )}
        <span
          className={clsx(
            "relative inline-flex rounded-full h-1.5 w-1.5",
            fresh ? "bg-accent-mint" : "bg-ink-500",
          )}
        />
      </span>
      <span>{label}</span>
      <span className="mono text-ink-400 normal-case tracking-normal">
        {fmtRelative(ts.toISOString())}
      </span>
    </span>
  );
}
