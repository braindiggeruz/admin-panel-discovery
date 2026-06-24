import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchStakes } from "@/services/admin";
import { fetchDailyEconomy, fetchTopWagerers } from "@/services/insights";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ComposedChart,
  Area,
  Line,
} from "recharts";
import {
  Coins,
  TrendingUp,
  Lock,
  RotateCcw,
  CheckCircle2,
  Crown,
  Flame,
  Radio,
} from "lucide-react";
import { fmtCoin, fmtNum } from "@/lib/format";
import { Kpi, PageHeader, Section, Skeleton } from "@/components/ui";
import CountUp from "@/components/CountUp";
import { useRealtimeTable } from "@/lib/realtime";
import { Link } from "react-router-dom";
import { Avatar } from "@/pages/Overview";

const PALETTE = {
  paid: "#5BD3A9",
  refunded: "#E25A6A",
  locked: "#5CA8F0",
  waiting: "#E9BC56",
  pending: "#E9BC56",
  failed: "#E25A6A",
};

export default function Economy() {
  const qc = useQueryClient();
  useRealtimeTable("game_stakes", () => {
    qc.invalidateQueries({ queryKey: ["stakes-all"] });
    qc.invalidateQueries({ queryKey: ["daily-econ"] });
    qc.invalidateQueries({ queryKey: ["top-wagerers"] });
  });

  const stakes = useQuery({
    queryKey: ["stakes-all"],
    queryFn: () => fetchStakes({ limit: 1000 }),
    refetchInterval: 30_000,
  });
  const daily = useQuery({
    queryKey: ["daily-econ"],
    queryFn: () => fetchDailyEconomy(30),
    refetchInterval: 60_000,
  });
  const top = useQuery({
    queryKey: ["top-wagerers"],
    queryFn: () => fetchTopWagerers(10),
    refetchInterval: 60_000,
  });

  const data = stakes.data ?? [];

  const totalPot = data.reduce((s, x) => s + Number(x.pot_amount || 0), 0);
  const paidPot = data
    .filter((x) => x.payout_status === "paid")
    .reduce((s, x) => s + Number(x.pot_amount || 0), 0);
  const refundedPot = data
    .filter((x) => x.payout_status === "refunded")
    .reduce((s, x) => s + Number(x.pot_amount || 0), 0);
  const lockedPot = data
    .filter((x) => x.escrow_status === "locked")
    .reduce((s, x) => s + Number(x.pot_amount || 0), 0);
  const commission = Math.round(paidPot * 0.05);
  const refundRate =
    data.length > 0
      ? Math.round(
          (data.filter((x) => x.payout_status === "refunded").length / data.length) * 100,
        )
      : 0;
  const avgPot = data.length > 0 ? Math.round(totalPot / data.length) : 0;

  const escrowDist = aggregate(data.map((x) => x.escrow_status));
  const payoutDist = aggregate(data.map((x) => x.payout_status));

  const buckets = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 5000, 10000];
  const hist = buckets.map((b, i) => ({
    label: i === 0 ? `${b}` : `${buckets[i - 1] + 1}–${b}`,
    count: data.filter(
      (x) =>
        Number(x.entry_fee) > (i === 0 ? 0 : buckets[i - 1]) &&
        Number(x.entry_fee) <= b,
    ).length,
  }));

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Radio className="w-3 h-3 animate-pulse text-accent-mint" />
            Live · game_stakes · auto-refresh 30с
          </span>
        }
        title="Экономика Coin"
        description="Pot, escrow, выплаты и комиссия 5%. Coin — внутренняя игровая валюта без денежной стоимости."
      />

      {/* Big KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          icon={<Coins className="w-4 h-4" />}
          label="Общий pot"
          value={<CountUp value={totalPot} format={fmtCoin} />}
          hint={<span>средний pot <CountUp value={avgPot} format={fmtCoin} className="mono text-gold-300" /></span>}
          tone="gold"
        />
        <Kpi
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Выплачено"
          value={<CountUp value={paidPot} format={fmtCoin} />}
          hint={
            <span>
              комиссия ≈ <CountUp value={commission} format={fmtCoin} className="text-gold-300 mono" /> Coin
            </span>
          }
          tone="mint"
        />
        <Kpi
          icon={<Lock className="w-4 h-4" />}
          label="В escrow"
          value={<CountUp value={lockedPot} format={fmtCoin} />}
          hint="средства в активных партиях"
        />
        <Kpi
          icon={<RotateCcw className="w-4 h-4" />}
          label={`Refund rate · ${refundRate}%`}
          value={<CountUp value={refundedPot} format={fmtCoin} />}
          hint="отмена / соперник не пришёл"
          tone="rose"
        />
      </div>

      {/* P&L timeseries */}
      <Section
        title="P&L: pot · выплаты · комиссия"
        description="30 дней по дням · комиссия = 5% от выплаченного pot’а"
        right={
          <div className="chip-gold">
            <TrendingUp className="w-3 h-3" /> 30d
          </div>
        }
      >
        <div className="h-72">
          {daily.isLoading ? (
            <Skeleton rows={6} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={daily.data ?? []}>
                <defs>
                  <linearGradient id="gPot" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E9BC56" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#E9BC56" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gPaid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5BD3A9" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#5BD3A9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="day" tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} width={36} />
                <Tooltip
                  contentStyle={{
                    background: "#0F0F16",
                    border: "1px solid #262633",
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="pot"
                  name="Pot"
                  stroke="#E9BC56"
                  fill="url(#gPot)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="paid"
                  name="Выплачено"
                  stroke="#5BD3A9"
                  fill="url(#gPaid)"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="commission"
                  name="Комиссия"
                  stroke="#D4A23A"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        <Legend
          items={[
            { color: "#E9BC56", label: "Общий pot" },
            { color: "#5BD3A9", label: "Выплачено" },
            { color: "#D4A23A", label: "Комиссия 5%" },
          ]}
        />
      </Section>

      {/* Distributions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Статус escrow" description="Где сейчас деньги ставок">
          <Donut
            data={escrowDist.map((d) => ({
              ...d,
              color: PALETTE[d.name as keyof typeof PALETTE] ?? "#5A5A6E",
            }))}
          />
        </Section>
        <Section title="Статус выплат" description="Чем закончились партии">
          <Donut
            data={payoutDist.map((d) => ({
              ...d,
              color: PALETTE[d.name as keyof typeof PALETTE] ?? "#5A5A6E",
            }))}
          />
        </Section>
      </div>

      {/* Top wagerers + Histogram */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section
          title="Топ игроков по объёму ставок"
          description="Сумма entry_fee по всем партиям"
          right={
            <div className="chip-gold">
              <Crown className="w-3 h-3" /> top
            </div>
          }
        >
          {top.isLoading ? (
            <Skeleton rows={5} />
          ) : (top.data ?? []).length === 0 ? (
            <div className="py-6 text-center text-sm text-ink-500">Нет данных</div>
          ) : (
            <ol className="space-y-1">
              {(top.data ?? []).map((tw, i) => (
                <li key={tw.profile.id}>
                  <Link
                    to={`/players/${tw.profile.id}`}
                    className="flex items-center gap-3 px-2 py-2 rounded-lg row-hover"
                  >
                    <span className="w-5 text-center mono text-xs text-ink-500">
                      {i + 1}
                    </span>
                    <Avatar idx={tw.profile.avatar_index} name={tw.profile.nickname} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink-100 truncate">
                        {tw.profile.nickname}
                      </div>
                      <div className="text-[11px] text-ink-500">
                        {fmtNum(tw.games)} ставочных партий
                      </div>
                    </div>
                    <div className="mono text-gold-200">{fmtCoin(tw.totalWagered)}</div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section
          title="Распределение ставок"
          description="Сколько партий с какой ставкой Coin (entry_fee)"
          right={
            <div className="chip-gold">
              <Flame className="w-3 h-3" /> histogram
            </div>
          }
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hist}>
                <CartesianGrid strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  contentStyle={{
                    background: "#0F0F16",
                    border: "1px solid #262633",
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                />
                <Bar dataKey="count" fill="#D4A23A" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <div className="panel p-6">
        <div className="display-title text-lg text-ink-100 mb-3">
          Будущее экономики: LTC ↔ Coin
        </div>
        <p className="text-sm text-ink-400 leading-relaxed">
          Сейчас Coin — чисто внутренняя валюта (нет депозитов / выводов). Следующий слой —
          приём LTC через {" "}
          <span className="mono text-ink-200">NOWPayments</span> или{" "}
          <span className="mono text-ink-200">BlockCypher</span> с курсом
          «крипта → Coin». На этой странице появятся: входящие депозиты,
          курс LTC, reconciliation (входящие tx vs. зачисленные Coin), лимиты и AML-флаги.
          Детали — в <Link to="/roadmap" className="underline text-ink-200">Roadmap Sprint 7</Link>.
        </p>
      </div>
    </div>
  );
}

function aggregate(values: string[]) {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
}

function Donut({
  data,
}: {
  data: { name: string; value: number; color: string }[];
}) {
  if (data.length === 0)
    return <div className="text-sm text-ink-500 text-center py-12">Нет данных</div>;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="grid grid-cols-2 gap-4 items-center">
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={3}
              stroke="none"
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "#0F0F16",
                border: "1px solid #262633",
                borderRadius: 10,
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-2">
        {data.map((d) => (
          <li key={d.name} className="flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: d.color }}
              />
              <span className="text-ink-200 truncate">{d.name}</span>
            </div>
            <div className="text-right">
              <div className="mono text-ink-100">{d.value}</div>
              <div className="text-[10px] text-ink-500">
                {total ? Math.round((d.value / total) * 100) : 0}%
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex items-center gap-5 mt-3 pt-3 border-t border-white/[0.04]">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-2 text-[11px] text-ink-400">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: i.color }} />
          {i.label}
        </div>
      ))}
    </div>
  );
}
