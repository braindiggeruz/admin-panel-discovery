import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchGames, fetchProfilesByIds } from "@/services/admin";
import { Swords, ChevronRight } from "lucide-react";
import { fmtNum, fmtRelative, clsx } from "@/lib/format";
import { Empty, PageHeader, Section, Skeleton } from "@/components/ui";
import { Avatar } from "@/pages/Overview";
import { useRealtimeTable } from "@/lib/realtime";

type Status = "all" | "waiting" | "playing" | "finished";

const FILTERS: { key: Status; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "playing", label: "Идут" },
  { key: "waiting", label: "Ожидают" },
  { key: "finished", label: "Завершённые" },
];

export default function Matches() {
  const [status, setStatus] = useState<Status>("all");
  const qc = useQueryClient();

  useRealtimeTable("games", () => qc.invalidateQueries({ queryKey: ["matches"] }));

  const { data = [], isLoading, isFetching } = useQuery({
    queryKey: ["matches", status],
    queryFn: () => fetchGames({ status, limit: 100 }),
  });

  const ids = useMemo(
    () =>
      [
        ...data.map((g) => g.white_player_id),
        ...data.map((g) => g.black_player_id),
      ].filter(Boolean) as string[],
    [data],
  );
  const profiles = useQuery({
    queryKey: ["match-list-profiles", ids.sort().join(",")],
    enabled: ids.length > 0,
    queryFn: () => fetchProfilesByIds(ids),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <span>
            Live · <span className="mono text-ink-300">public.games</span>
          </span>
        }
        title="Матчи"
        description="Все партии с фильтрами по статусу. Realtime: новые партии и финиши появляются мгновенно."
      />

      <Section
        title="Реестр партий"
        description={isFetching ? "обновляю…" : "Сортировка: последнее обновление"}
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
                {data.map((g) => {
                  const wp = profiles.data?.[g.white_player_id];
                  const bp = g.black_player_id ? profiles.data?.[g.black_player_id] : undefined;
                  return (
                    <tr
                      key={g.id}
                      className="border-b border-white/[0.025] row-hover cursor-pointer"
                      onClick={() => (location.href = `/matches/${g.id}`)}
                    >
                      <td className="py-3 pl-3 mono text-ink-100">{g.room_code}</td>
                      <td>
                        <StatusChip status={g.status} />
                      </td>
                      <td>
                        <NickCell profile={wp} />
                      </td>
                      <td>
                        <NickCell profile={bp} />
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function NickCell({
  profile,
}: {
  profile: { id: string; nickname: string; avatar_index: number } | undefined;
}) {
  if (!profile) return <span className="text-ink-500 text-xs">—</span>;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Avatar idx={profile.avatar_index} name={profile.nickname} />
      <span className="text-ink-100 text-[13px] truncate max-w-[140px]">{profile.nickname}</span>
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
    <span className="inline-flex items-center gap-1.5 text-[11px]" title={reason ?? ""}>
      <span className={clsx("w-2 h-2 rounded-full", isWhite ? "bg-gold-200" : "bg-ink-300")} />
      <span className={isWhite ? "text-gold-200" : "text-ink-200"}>
        {isWhite ? "белые" : "чёрные"}
      </span>
      {reason && <span className="text-ink-500 truncate max-w-[140px]">· {reason}</span>}
    </span>
  );
}
