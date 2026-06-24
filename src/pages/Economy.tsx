import { useQuery } from "@tanstack/react-query";
import { fetchStakes } from "@/services/admin";
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
} from "recharts";
import { Coins, TrendingUp, Lock, RotateCcw, CheckCircle2 } from "lucide-react";
import { fmtCoin, fmtNum } from "@/lib/format";
import { Kpi, PageHeader, Section, Skeleton } from "@/components/ui";

const PALETTE = {
  paid: "#5BD3A9",
  refunded: "#E25A6A",
  locked: "#5CA8F0",
  waiting: "#E9BC56",
};

export default function Economy() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["stakes-all"],
    queryFn: () => fetchStakes({ limit: 500 }),
  });

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

  const escrowDist = aggregate(data.map((x) => x.escrow_status));
  const payoutDist = aggregate(data.map((x) => x.payout_status));

  // Histogram entry_fee
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
        eyebrow="Read-only · public.game_stakes"
        title="Экономика Coin"
        description="Объём pot'ов, escrow, выплаты и комиссия 5%. Coin — внутренняя игровая валюта без денежной стоимости."
      />

      {isLoading ? (
        <Skeleton rows={6} />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi
              icon={<Coins className="w-4 h-4" />}
              label="Общий pot"
              value={fmtCoin(totalPot)}
              hint={`по ${fmtNum(data.length)} ставочным играм`}
              tone="gold"
            />
            <Kpi
              icon={<CheckCircle2 className="w-4 h-4" />}
              label="Выплачено"
              value={fmtCoin(paidPot)}
              hint={
                <span>
                  комиссия ≈ <span className="text-gold-300 mono">{fmtCoin(commission)}</span> Coin
                </span>
              }
              tone="mint"
            />
            <Kpi
              icon={<Lock className="w-4 h-4" />}
              label="В escrow"
              value={fmtCoin(lockedPot)}
              hint="средства в активных партиях"
            />
            <Kpi
              icon={<RotateCcw className="w-4 h-4" />}
              label="Возвращено"
              value={fmtCoin(refundedPot)}
              hint="отмена / ничья / соперник не пришёл"
              tone="rose"
            />
          </div>

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

          <Section
            title="Распределение ставок"
            description="Сколько партий с какой ставкой Coin (entry_fee)"
            right={
              <div className="chip-gold">
                <TrendingUp className="w-3 h-3" /> histogram
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

          <div className="panel p-6">
            <div className="display-title text-lg text-ink-100 mb-3">
              Будущее экономики: LTC ↔ Coin
            </div>
            <p className="text-sm text-ink-400 leading-relaxed">
              Сейчас Coin — чисто внутренняя валюта (нет депозитов / выводов). По вашему плану
              следующий слой — приём LTC через {" "}
              <span className="mono text-ink-200">BlockCypher</span> /{" "}
              <span className="mono text-ink-200">NOWPayments</span> с курсом
              «крипта → Coin». Когда вы согласуете подход, в этой странице появятся
              отдельные блоки: <span className="text-gold-300">входящие депозиты</span>,
              <span className="text-gold-300"> комиссия игры</span>,
              <span className="text-gold-300"> выводы</span>,
              <span className="text-gold-300"> курс LTC</span>. Шаги детализированы в{" "}
              <a href="/roadmap" className="underline text-ink-200">Roadmap</a>.
            </p>
          </div>
        </>
      )}
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
