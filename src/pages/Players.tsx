import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Search, ArrowUpDown, Users } from "lucide-react";
import { fetchPlayers } from "@/services/admin";
import { fmtNum, fmtRelative, clsx } from "@/lib/format";
import { Empty, PageHeader, Section, Skeleton } from "@/components/ui";
import { Avatar } from "@/pages/Overview";

const SORT_OPTIONS = [
  { key: "last_seen_at", label: "Последний визит" },
  { key: "created_at", label: "Регистрация" },
  { key: "rating", label: "Рейтинг" },
  { key: "total_games", label: "Игр" },
  { key: "win_streak", label: "Стрик" },
] as const;

export default function Players() {
  const [params, setParams] = useSearchParams();
  const sort = (params.get("sort") as (typeof SORT_OPTIONS)[number]["key"]) || "last_seen_at";
  const [search, setSearch] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["players", sort, search],
    queryFn: () => fetchPlayers({ sort, dir: "desc", limit: 100, search: search || undefined }),
  });

  const winrate = useMemo(
    () => (p: (typeof data)[number]) =>
      p.total_games > 0 ? Math.round((p.wins / p.total_games) * 100) : 0,
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Real data · public_profiles"
        title="Игроки"
        description="Все профили с их рейтингом, игровой статистикой и стриками побед. Поиск по никнейму, сортировка по нескольким осям."
      />

      <Section
        title="Реестр игроков"
        description="Только публичные поля. Email и device_fp скрыты на уровне БД."
        right={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="никнейм…"
                className="w-56 pl-9 pr-3 py-2 rounded-lg bg-ink-800/70 border border-white/[0.05] focus:border-gold-300/40 focus:outline-none text-sm text-ink-100 placeholder:text-ink-500"
              />
            </div>
            <div className="flex items-center gap-1 panel-soft p-1">
              {SORT_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set("sort", o.key);
                    setParams(next);
                  }}
                  className={clsx(
                    "px-2.5 py-1.5 rounded-md text-[11px] tracking-tight transition-colors",
                    sort === o.key
                      ? "bg-gold-300/15 text-gold-200"
                      : "text-ink-400 hover:text-ink-200",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {isLoading ? (
          <Skeleton rows={10} />
        ) : data.length === 0 ? (
          <Empty message="Ничего не найдено" icon={<Users className="w-8 h-8" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.16em] text-ink-500 border-b border-white/[0.05]">
                  <th className="text-left font-medium py-3 pl-3">Игрок</th>
                  <th className="text-right font-medium py-3">Рейтинг</th>
                  <th className="text-right font-medium py-3">Игры</th>
                  <th className="text-right font-medium py-3">W/L/D</th>
                  <th className="text-right font-medium py-3">Win rate</th>
                  <th className="text-right font-medium py-3">Стрик</th>
                  <th className="text-right font-medium py-3 pr-3">Видели</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => {
                  const wr = winrate(p);
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-white/[0.025] row-hover"
                    >
                      <td className="py-3 pl-3">
                        <Link to={`/players/${p.id}`} className="flex items-center gap-3 group">
                          <Avatar idx={p.avatar_index} name={p.nickname} />
                          <div className="min-w-0">
                            <div className="text-ink-100 group-hover:text-gold-200 transition-colors truncate max-w-[220px]">
                              {p.nickname}
                            </div>
                            <div className="text-[11px] text-ink-500 mono">{p.id.slice(0, 8)}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="text-right mono text-gold-200">{fmtNum(p.rating)}</td>
                      <td className="text-right text-ink-300 mono">{fmtNum(p.total_games)}</td>
                      <td className="text-right text-[12px] mono">
                        <span className="text-accent-mint">{p.wins}</span>
                        <span className="text-ink-500">/</span>
                        <span className="text-accent-rose">{p.losses}</span>
                        <span className="text-ink-500">/</span>
                        <span className="text-ink-300">{p.draws}</span>
                      </td>
                      <td className="text-right">
                        <span
                          className={clsx(
                            "mono text-sm",
                            wr >= 60
                              ? "text-accent-mint"
                              : wr >= 40
                                ? "text-ink-200"
                                : "text-accent-rose/80",
                          )}
                        >
                          {p.total_games > 0 ? `${wr}%` : "—"}
                        </span>
                      </td>
                      <td className="text-right">
                        {p.best_win_streak > 0 ? (
                          <span className="chip-gold">🔥 {p.best_win_streak}</span>
                        ) : (
                          <span className="text-ink-500 text-xs">—</span>
                        )}
                      </td>
                      <td className="text-right pr-3 text-ink-400 text-xs">
                        {fmtRelative(p.last_seen_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex items-center gap-2 text-[11px] text-ink-500">
          <ArrowUpDown className="w-3 h-3" />
          Показаны до 100 строк. Полноценная пагинация — в следующем спринте.
        </div>
      </Section>
    </div>
  );
}
