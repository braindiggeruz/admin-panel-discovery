import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GAME_URL, supabase, supabaseConfigured } from "@/lib/supabase";
import { Activity, Database, Globe2, Smartphone, Workflow } from "lucide-react";
import { PageHeader, Section, Skeleton } from "@/components/ui";
import { fmtDate, fmtRelative, clsx } from "@/lib/format";

type HealthCheck = {
  name: string;
  ok: boolean;
  latencyMs?: number;
  detail?: string;
  icon: React.ComponentType<{ className?: string }>;
};

export default function SystemHealth() {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const out: HealthCheck[] = [];

      // 1. Supabase REST
      if (!supabase) {
        out.push({
          name: "Supabase API",
          ok: false,
          icon: Database,
          detail: "клиент не сконфигурирован",
        });
      } else {
        const t0 = performance.now();
        const { error } = await supabase
          .from("public_profiles")
          .select("id", { count: "exact", head: true });
        const latency = Math.round(performance.now() - t0);
        out.push({
          name: "Supabase REST",
          ok: !error,
          latencyMs: latency,
          icon: Database,
          detail: error?.message ?? `${latency}ms · public_profiles доступна`,
        });
      }

      // 2. Game production URL
      try {
        const t0 = performance.now();
        const r = await fetch(GAME_URL, { method: "HEAD", mode: "no-cors" });
        const latency = Math.round(performance.now() - t0);
        out.push({
          name: "Production (Cloudflare Pages)",
          ok: true,
          latencyMs: latency,
          icon: Globe2,
          detail: `${GAME_URL} · ${r.type === "opaque" ? "достижим" : "ok"} · ${latency}ms`,
        });
      } catch {
        out.push({
          name: "Production (Cloudflare Pages)",
          ok: false,
          icon: Globe2,
          detail: `${GAME_URL} недоступен из браузера (CORS не критично)`,
        });
      }

      // 3. Service worker manifest
      try {
        const r = await fetch(`${GAME_URL}/manifest.webmanifest`, { mode: "cors" });
        out.push({
          name: "PWA manifest",
          ok: r.ok,
          icon: Smartphone,
          detail: r.ok ? "manifest.webmanifest доступен" : `${r.status}`,
        });
      } catch {
        out.push({
          name: "PWA manifest",
          ok: false,
          icon: Smartphone,
          detail: "не удалось получить manifest (CORS)",
        });
      }

      if (!cancelled) {
        setChecks(out);
        setRunning(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Latest move timestamp → realtime health
  const last = useQuery({
    queryKey: ["last-move"],
    queryFn: async () => {
      if (!supabase) return null;
      const { data } = await supabase
        .from("moves")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.created_at as string) ?? null;
    },
  });
  const lastGame = useQuery({
    queryKey: ["last-game"],
    queryFn: async () => {
      if (!supabase) return null;
      const { data } = await supabase
        .from("games")
        .select("created_at, updated_at, status, room_code")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Real-time · ad hoc probes"
        title="Здоровье системы"
        description="Проверки доступности Supabase, production-домена и состояния realtime-активности. Никакой нагрузки на API игроков."
      />

      <Section title="Подключения" description="Что мы проверили из браузера админ-панели">
        {running ? (
          <Skeleton rows={4} />
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {checks.map((c) => (
              <li key={c.name} className="py-4 flex items-start gap-4">
                <div
                  className={clsx(
                    "mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center border",
                    c.ok
                      ? "border-accent-mint/30 bg-accent-mint/10 text-accent-mint"
                      : "border-accent-rose/30 bg-accent-rose/10 text-accent-rose",
                  )}
                >
                  <c.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-ink-100">{c.name}</div>
                    <span
                      className={clsx(
                        "chip",
                        c.ok
                          ? "bg-accent-mint/10 border-accent-mint/30 text-accent-mint"
                          : "bg-accent-rose/10 border-accent-rose/30 text-accent-rose",
                      )}
                    >
                      {c.ok ? "ok" : "fail"}
                    </span>
                  </div>
                  <div className="text-xs text-ink-400 mt-1">{c.detail}</div>
                </div>
                {c.latencyMs !== undefined && (
                  <div className="mono text-xs text-ink-300">{c.latencyMs}ms</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section
          title="Realtime активность"
          description="Когда был последний ход в игре"
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-gold-300/10 border border-gold-300/30 flex items-center justify-center">
              <Activity className="w-4 h-4 text-gold-300" />
            </div>
            <div>
              <div className="display-title text-xl text-ink-100">
                {last.isLoading
                  ? "…"
                  : last.data
                    ? fmtRelative(last.data)
                    : "никогда"}
              </div>
              <div className="text-xs text-ink-400 mt-1 mono">
                {last.data ? fmtDate(last.data) : "—"}
              </div>
            </div>
          </div>
        </Section>
        <Section title="Последняя партия" description="updated_at в таблице games">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-accent-mint/10 border border-accent-mint/30 flex items-center justify-center">
              <Workflow className="w-4 h-4 text-accent-mint" />
            </div>
            <div>
              <div className="display-title text-xl text-ink-100">
                {lastGame.isLoading
                  ? "…"
                  : lastGame.data
                    ? lastGame.data.room_code
                    : "—"}
              </div>
              <div className="text-xs text-ink-400 mt-1">
                {lastGame.data ? (
                  <>
                    {lastGame.data.status} · {fmtRelative(lastGame.data.updated_at)}
                  </>
                ) : (
                  "—"
                )}
              </div>
            </div>
          </div>
        </Section>
      </div>

      <Section
        title="Что мы НЕ проверяем (намеренно)"
        description="Списано в backlog Sprint 2"
      >
        <ul className="space-y-2 text-sm text-ink-300">
          <li>· GitHub Actions runs / последние релизы (нужен GitHub PAT на бекенде)</li>
          <li>· Cloudflare Pages deployment status (нужен Cloudflare API token на бекенде)</li>
          <li>· Anti-cheat сигналы (мульти-аккаунты по device_fp, скорость ставок)</li>
          <li>· Latency RPC submit_move (нужен серверный probe)</li>
          <li>· Health endpoints Edge Functions (пока не созданы)</li>
        </ul>
        <div className="mt-4 text-xs text-ink-500">
          В режиме Phase 1 мы намеренно не подключаем токены админа во frontend bundle.
          Это правильно. См. <a className="underline" href="/roadmap">Roadmap → Sprint 2</a>.
        </div>
      </Section>

      <div className="panel p-5 flex items-center gap-3 text-xs text-ink-400">
        <span className="chip-mute">env</span>
        Supabase URL: <span className="mono text-ink-200">{import.meta.env.VITE_SUPABASE_URL ?? "—"}</span>
        <span className="text-ink-600">·</span>
        anon key configured: <span className="mono text-ink-200">{supabaseConfigured ? "yes" : "no"}</span>
      </div>
    </div>
  );
}
