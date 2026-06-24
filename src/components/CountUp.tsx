import { useEffect, useRef, useState } from "react";
import { fmtNum } from "@/lib/format";

/**
 * Smoothly animates from previous value → new value over `duration` ms.
 * Falls back to instant change on first render or when value drops to 0.
 */
export default function CountUp({
  value,
  duration = 700,
  format = fmtNum,
  className,
}: {
  value: number | null | undefined;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState<number>(value ?? 0);
  const prev = useRef<number>(value ?? 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (value === null || value === undefined) {
      setDisplay(0);
      return;
    }
    if (prev.current === value) return;
    const from = prev.current;
    const to = value;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (to - from) * eased;
      setDisplay(v);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else prev.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  if (value === null || value === undefined) {
    return <span className={className}>—</span>;
  }
  return <span className={className}>{format(Math.round(display))}</span>;
}
