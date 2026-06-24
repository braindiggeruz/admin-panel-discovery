import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Users,
  Swords,
  Coins,
  Activity,
  Crown,
  Sparkles,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react";
import {
  fetchGames,
  fetchPlayers,
  fetchSignupTrend,
  fetchStakes,
  fetchTotals,
  fetchGamesTrend,
} from "@/services/admin";
import { fmtCoin, fmtNum, fmtRelative, shortId, clsx } from "@/lib/format";
import { Kpi, PageHeader, Section, Skeleton, Empty } from "@/components/ui";
import { Link } from "react-router-dom";
import { GAME_URL } from "@/lib/supabase";

export default function Overview() {
  const totals = useQuery({ queryKey: ["totals"], queryFn: fetchTotals });
  const signup = useQuery({ queryKey: ["signup-trend"], queryFn: () => fetchSignupTrend(14) });
  const games = useQuery({ queryKey: ["games-trend"], queryFn: () => fetchGamesTrend(14) });
  const top = useQuery({
    queryKey: ["players", "top"],
    queryFn: () => fetchPlayers({ sort: "rating", dir: "desc", limit: 6 }),
  });
  const live = useQuery({
    queryKey: ["games", "active"],
    queryFn: () => fetchGames({ status: "playing", limit: 6 }),
  });
  const recent = useQuery({
    queryKey: ["games", "recent"],
    queryFn: () => fetchGames({ status: "finished", limit: 6 }),
  });
  const stakes = useQuery({
    queryKey: ["stakes", "recent"],
    queryFn: () => fetchStakes({ limit: 200 }),
  });

  const t = totals.data;
  const totalPot = (stakes.data ?? []).reduce((s, x) => s + Number(x.pot_amount || 0), 0);
  const paidPot = (stakes.data ?? [])
    .filter((x) => x.payout_status === "paid")
    .reduce((s, x) => s + Number(x.pot_amount || 0), 0);
  const commission = Math.round(paidPot * 0.05);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Live · Production"
        title="Командный центр"
        description="Наблюдение за игроками, матчами и экономикой Шашек Рояль. Все данные — из production Supabase, режим read-only."
        actions={
          <a
            href={GAME_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost"
          >
            Открыть игру <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        }
      />

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          icon={<Users className="w-4 h-4" />}
          label="Игроки"
          value={totals.isLoading ? "…" : fmtNum(t?.players ?? 0)}
          hint={`Всего профилей в базе`}
          tone="gold"
        />
        <Kpi
          icon={<Swords className="w-4 h-4" />}
          label="Матчи всего"
          value={totals.isLoading ? "…" : fmtNum(t?.games ?? 0)}
          hint={
            <span>
              <span className="text-accent-mint">{fmtNum(t?.active ?? 0)}</span> сейчас активны ·{" "}
              <span className="text-ink-300">{fmtNum(t?.finished ?? 0)}</span> завершены
            </span>
          }
        />
        <Kpi
          icon={<Coins className="w-4 h-4" />}
          label="Ставки (комнаты)"
          value={totals.isLoading ? "…" : fmtNum(t?.stakes ?? 0)}
          hint={
            <span>
              Объём pot:{" "}
              <span className="text-gold-200 mono">{fmtCoin(totalPot)}</span> Coin
            </span>
          }
        />
        <Kpi
          icon={<Activity className="w-4 h-4" />}
          label="Ходы (всего)"
          value={totals.isLoading ? "…" : fmtNum(t?.movesSeen ?? 0)}
          hint="Серверная партия: server-authoritative engine"
          tone="mint"
        />
      </div>

      {/* Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section
          title="Регистрации"
          description="Новые игроки за последние 14 дней"
          right={
            <div className="chip-gold">
              <Sparkles className="w-3 h-3" /> trend
            </div>
          }
        >
          <div className="h-56">
            {signup.isLoading ? (
              <Skeleton rows={5} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={signup.data ?? []}>
                  <defs>
                    <linearGradient id="gSignup" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E9BC56" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#E9BC56" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(v) => v.slice(5)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis axisLine={false} tickLine={false} width={28} />
                  <Tooltip
                    contentStyle={{
                      background: "#0F0F16",
                      border: "1px solid #262633",
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#E9BC56" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#E9BC56"
                    strokeWidth={2}
                    fill="url(#gSignup)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Section>

        <Section
          title="Завершённые матчи"
          description="Партии за последние 14 дней"
          right={
            <div className="chip-mint">
              <TrendingUp className="w-3 h-3" /> activity
            </div>
          }
        >
          <div className="h-56">
            {games.isLoading ? (
              <Skeleton rows={5} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={games.data ?? []}>
                  <defs>
                    <linearGradient id="gGames" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5BD3A9" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#5BD3A9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} width={28} />
                  <Tooltip
                    contentStyle={{
                      background: "#0F0F16",
                      border: "1px solid #262633",
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#5BD3A9" }}
                  />
                  <Area type="monotone" dataKey="count" stroke="#5BD3A9" strokeWidth={2} fill="url(#gGames)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Section>
      </div>

      {/* 3-col bottom */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Section
          title="Топ рейтинга"
          description="Шесть сильнейших"
          right={
            <Link to="/players?sort=rating" className="text-xs text-gold-300 hover:underline">
              Все →
            </Link>
          }
        >
          {top.isLoading ? (
            <Skeleton />
          ) : (top.data ?? []).length === 0 ? (
            <Empty message="Нет данных" icon={<Users className="w-8 h-8" />} />
          ) : (
            <ol className="space-y-1.5">
              {(top.data ?? []).map((p, i) => (
                <li key={p.id}>
                  <Link
                    to={`/players/${p.id}`}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg row-hover"
                  >
                    <span
                      className={clsx(
                        "w-6 text-center mono text-xs",
                        i === 0
                          ? "text-gold-200"
                          : i === 1
                            ? "text-ink-100"
                            : i === 2
                              ? "text-gold-400"
                              : "text-ink-500",
                      )}
                    >
                      {i + 1}
                    </span>
                    <Avatar idx={p.avatar_index} name={p.nickname} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink-100 truncate">{p.nickname}</div>
                      <div className="text-[11px] text-ink-500">
                        {fmtNum(p.total_games)} матчей · стрик {p.best_win_streak ?? 0}
                      </div>
                    </div>
                    <div className="mono text-sm text-gold-200">{fmtNum(p.rating)}</div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section
          title="Сейчас играют"
          description="Активные комнаты"
          right={<span className="chip-mint">live</span>}
        >
          {live.isLoading ? (
            <Skeleton />
          ) : (live.data ?? []).length === 0 ? (
            <Empty
              message="Никто не играет прямо сейчас"
              icon={<Swords className="w-8 h-8" />}
            />
          ) : (
            <ul className="space-y-1.5">
              {(live.data ?? []).map((g) => (
                <li key={g.id}>
                  <Link
                    to={`/matches/${g.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg row-hover"
                  >
                    <div className="min-w-0">
                      <div className="mono text-xs text-ink-300">{g.room_code}</div>
                      <div className="text-[11px] text-ink-500">
                        ход #{g.move_number} · {fmtRelative(g.last_move_at ?? g.updated_at)}
                      </div>
                    </div>
                    <span
                      className={clsx(
                        "w-2 h-2 rounded-full",
                        g.current_turn === "white" ? "bg-gold-100" : "bg-ink-300",
                      )}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Свежие итоги"
          description="Последние завершённые партии"
          right={
            <Link to="/matches" className="text-xs text-gold-300 hover:underline">
              Все →
            </Link>
          }
        >
          {recent.isLoading ? (
            <Skeleton />
          ) : (recent.data ?? []).length === 0 ? (
            <Empty message="Нет завершённых матчей" />
          ) : (
            <ul className="space-y-1.5">
              {(recent.data ?? []).map((g) => (
                <li key={g.id}>
                  <Link
                    to={`/matches/${g.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg row-hover"
                  >
                    <div className="min-w-0">
                      <div className="mono text-xs text-ink-300 flex items-center gap-2">
                        {g.room_code}
                        {g.winner === "white" && (
                          <Crown className="w-3 h-3 text-gold-300" />
                        )}
                      </div>
                      <div className="text-[11px] text-ink-500 truncate">
                        {g.resign_reason ?? "—"} · {fmtRelative(g.updated_at)}
                      </div>
                    </div>
                    <span
                      className={clsx(
                        "chip",
                        g.winner === "white"
                          ? "bg-gold-300/10 border-gold-300/30 text-gold-200"
                          : g.winner === "black"
                            ? "bg-ink-300/10 border-ink-300/20 text-ink-200"
                            : "bg-white/[0.03] border-white/10 text-ink-400",
                      )}
                    >
                      {g.winner === "white"
                        ? "белые"
                        : g.winner === "black"
                          ? "чёрные"
                          : "ничья"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* Economy callout */}
      <div className="panel p-6 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-64 h-64 rounded-full bg-gradient-to-br from-gold-400/20 to-transparent blur-3xl pointer-events-none" />
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-gold-300/80 mb-2">
              Экономика Coin
            </div>
            <h3 className="display-title text-2xl text-ink-50">
              Выплачено игрокам<br />
              <span className="text-gold-200">{fmtCoin(paidPot)}</span>{" "}
              <span className="text-ink-400 text-base">Coin</span>
            </h3>
            <p className="text-xs text-ink-400 mt-2">
              Сумма выплаченных pot’ов · 5% комиссия ≈{" "}
              <span className="mono text-gold-300">{fmtCoin(commission)} Coin</span>
            </p>
          </div>
          <div className="md:col-span-2 grid grid-cols-3 gap-3">
            <EcoStat label="В ожидании" value={(stakes.data ?? []).filter((s) => s.escrow_status === "waiting").length} tone="gold" />
            <EcoStat label="Заблокировано" value={(stakes.data ?? []).filter((s) => s.escrow_status === "locked").length} tone="sky" />
            <EcoStat label="Возвращено" value={(stakes.data ?? []).filter((s) => s.escrow_status === "refunded").length} tone="rose" />
          </div>
        </div>
        <div className="mt-5 text-[11px] text-ink-500">
          Источник: <code className="mono text-ink-300">public.game_stakes</code> · room_code короткий код:{" "}
          {(stakes.data ?? []).slice(0, 1).map((s) => (
            <code key={s.id} className="mono text-ink-300">
              {shortId(s.game_id, 8)}
            </code>
          ))}
        </div>
      </div>
    </div>
  );
}

function EcoStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "gold" | "sky" | "rose";
}) {
  return (
    <div className="panel-soft p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-500">{label}</div>
      <div
        className={clsx(
          "mt-2 display-title text-2xl",
          tone === "gold" && "text-gold-200",
          tone === "sky" && "text-accent-sky",
          tone === "rose" && "text-accent-rose",
        )}
      >
        {fmtNum(value)}
      </div>
    </div>
  );
}

export function Avatar({ idx, name }: { idx: number; name: string }) {
  // Deterministic palette based on avatar_index
  const palette = [
    "from-gold-300 to-gold-600",
    "from-accent-mint to-emerald-700",
    "from-accent-sky to-blue-800",
    "from-accent-rose to-rose-800",
    "from-purple-400 to-purple-800",
    "from-orange-400 to-orange-800",
    "from-teal-400 to-teal-800",
    "from-pink-400 to-pink-800",
  ];
  const cls = palette[((idx ?? 0) + 8) % palette.length];
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  return (
    <div
      className={`w-8 h-8 rounded-full bg-gradient-to-br ${cls} flex items-center justify-center text-[12px] font-semibold text-ink-950 shrink-0`}
    >
      {initial}
    </div>
  );
}
