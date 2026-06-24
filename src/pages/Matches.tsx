import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchGames } from "@/services/admin";
import { Swords, ChevronRight } from "lucide-react";
import { fmtNum, fmtRelative, shortId, clsx } from "@/lib/format";
import { Empty, PageHeader, Section, Skeleton } from "@/components/ui";

type Status = "all" | "waiting" | "playing" | "finished";

const FILTERS: { key: Status; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "playing", label: "Идут" },
  { key: "waiting", label: "В ожидании" },
  { key: "finished", label: "Завершённые" },
];

export default function Matches() {
  const [status, setStatus] = useState<Status>("all");
  const { data = [], isLoading } = useQuery({
    queryKey: ["matches", status],
    queryFn: () => fetchGames({ status, limit: 100 }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Real data · public.games"
        title="Матчи"
        description="Все партии с фильтрами по статусу. Каждый матч кликабелен — можно посмотреть детали и список ходов."
      />

      <Section
        title="Реестр партий"
        description="Сортировка: последнее обновление"
        right={
          <div className="flex items-center gap-1 panel-soft p-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatus(f.key)}
                className={clsx(
                  "px-2.5 py-1.5 rounded-md text-[11px] tracking-tight transition-colors",
                  status === f.key
                    ? "bg-gold-300/15 text-gold-200"
                    : "text-ink-400 hover:text-ink-200",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      >
        {isLoading ? (
          <Skeleton rows={10} />
        ) : data.length === 0 ? (
          <Empty message="Нет партий по фильтру" icon={<Swords className="w-8 h-8" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.16em] text-ink-500 border-b border-white/[0.05]">
                  <th className="text-left font-medium py-3 pl-3">Room</th>
                  <th className="text-left font-medium py-3">Статус</th>
                  <th className="text-left font-medium py-3">Белые</th>
                  <th className="text-left font-medium py-3">Чёрные</th>
                  <th className="text-right font-medium py-3">Ходов</th>
                  <th className="text-left font-medium py-3">Итог</th>
                  <th className="text-right font-medium py-3 pr-3">Обновлено</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {data.map((g) => (
                  <tr
                    key={g.id}
                    className="border-b border-white/[0.025] row-hover cursor-pointer"
                    onClick={() => (location.href = `/matches/${g.id}`)}
                  >
                    <td className="py-3 pl-3 mono text-ink-100">{g.room_code}</td>
                    <td>
                      <StatusChip status={g.status} />
                    </td>
                    <td className="mono text-[12px] text-ink-300">
                      {shortId(g.white_player_id, 10)}
                    </td>
                    <td className="mono text-[12px] text-ink-300">
                      {g.black_player_id ? shortId(g.black_player_id, 10) : <span className="text-ink-500">—</span>}
                    </td>
                    <td className="text-right mono text-ink-200">{fmtNum(g.move_number)}</td>
                    <td>
                      {g.status === "finished" ? (
                        <WinnerChip winner={g.winner} reason={g.resign_reason} />
                      ) : (
                        <span className="text-ink-500 text-xs">—</span>
                      )}
                    </td>
                    <td className="text-right pr-3 text-ink-400 text-xs">
                      {fmtRelative(g.updated_at)}
                    </td>
                    <td>
                      <Link
                        to={`/matches/${g.id}`}
                        className="text-ink-500 hover:text-gold-300"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function StatusChip({ status }: { status: "waiting" | "playing" | "finished" }) {
  if (status === "playing") return <span className="chip-mint">live</span>;
  if (status === "waiting") return <span className="chip-sky">ожидает</span>;
  return <span className="chip-mute">завершён</span>;
}

function WinnerChip({ winner, reason }: { winner: "white" | "black" | null; reason: string | null }) {
  if (!winner) return <span className="chip-mute">ничья</span>;
  const isWhite = winner === "white";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px]"
      title={reason ?? ""}
    >
      <span
        className={clsx(
          "w-2 h-2 rounded-full",
          isWhite ? "bg-gold-200" : "bg-ink-300",
        )}
      />
      <span className={isWhite ? "text-gold-200" : "text-ink-200"}>
        {isWhite ? "белые" : "чёрные"}
      </span>
      {reason && <span className="text-ink-500 truncate max-w-[140px]">· {reason}</span>}
    </span>
  );
}
