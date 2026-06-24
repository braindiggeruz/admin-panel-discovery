import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchInsights } from "@/services/insights";
import { fmtNum, fmtRelative, clsx } from "@/lib/format";
import {
  ShieldAlert,
  Flame,
  EyeOff,
  CalendarClock,
  Activity,
  Telescope,
  AlertTriangle,
} from "lucide-react";
import { PageHeader, Section, Skeleton } from "@/components/ui";
import { Avatar } from "@/pages/Overview";
import { useRealtimeTable } from "@/lib/realtime";

export default function Insights() {
  const qc = useQueryClient();
  useRealtimeTable("public_profiles", () =>
    qc.invalidateQueries({ queryKey: ["insights"] }),
  );

  const { data, isLoading } = useQuery({
    queryKey: ["insights"],
    queryFn: fetchInsights,
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Telescope className="w-3 h-3" />
            Превью · Antifraud · Data quality
          </span>
        }
        title="Инсайты и аномалии"
        description="Админка сама подсвечивает подозрительное и нездоровое. На Phase 1 — только то, что видно публично. После Sprint 2 добавится device fingerprint и кластеризация мульти-аккаунтов."
      />

      {/* Top-row data quality */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Section title="Аккаунтов без партий" description="зарегистрировались и ушли">
          <div className="flex items-baseline gap-3">
            <div className="display-title text-5xl text-accent-rose/80">
              {isLoading ? "…" : `${data?.zeroGames.pct ?? 0}%`}
            </div>
            <div className="text-xs text-ink-400">
              {fmtNum(data?.zeroGames.total ?? 0)} из 890
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-500 leading-relaxed">
            Чем больше эта цифра — тем больше «утечка» на старте онбординга.
          </p>
        </Section>
        <Section title="Подозрительный winrate" description="≥ 20 партий и WR ≥ 90%">
          <div className="display-title text-5xl text-accent-rose/80">
            {isLoading ? "…" : data?.highWinrate.length ?? 0}
          </div>
          <p className="mt-3 text-xs text-ink-500 leading-relaxed">
            Потенциально боты, фарм или необнаруженный супер-игрок.
          </p>
        </Section>
        <Section title="Скопления регистраций" description="≥ 3 профиля в одну секунду">
          <div className="display-title text-5xl text-accent-rose/80">
            {isLoading ? "…" : data?.sameSecondSignups.length ?? 0}
          </div>
          <p className="mt-3 text-xs text-ink-500 leading-relaxed">
            Может быть синхронный поток или скрипт массового создания.
          </p>
        </Section>
      </div>

      {/* High winrate */}
      <Section
        title="Высокий winrate"
        description="≥ 20 партий и winrate ≥ 90% — приоритет проверки модератором"
        right={
          <div className="chip-rose">
            <ShieldAlert className="w-3 h-3" /> warn
          </div>
        }
      >
        {isLoading ? (
          <Skeleton rows={4} />
        ) : (data?.highWinrate ?? []).length === 0 ? (
          <Empty msg="Никого. Это хороший знак." />
        ) : (
          <PlayerList
            rows={(data?.highWinrate ?? []).map((p) => ({
              id: p.id,
              avatar: p.avatar_index,
              nickname: p.nickname,
              hint: `${p.winrate}% побед в ${p.total_games} партиях`,
              right: `WR ${p.winrate}%`,
              tone: "rose" as const,
            }))}
          />
        )}
      </Section>

      {/* Longest streaks */}
      <Section
        title="Длинные стрики побед"
        description="Лучшие — может быть рост, может — фарм"
        right={
          <div className="chip-gold">
            <Flame className="w-3 h-3" /> streak
          </div>
        }
      >
        {isLoading ? (
          <Skeleton rows={4} />
        ) : (data?.longestStreaks ?? []).length === 0 ? (
          <Empty msg="Никого пока." />
        ) : (
          <PlayerList
            rows={(data?.longestStreaks ?? []).map((p) => ({
              id: p.id,
              avatar: p.avatar_index,
              nickname: p.nickname,
              hint: `рейтинг ${fmtNum(p.rating)} · ${fmtNum(p.total_games)} партий`,
              right: `★ ${p.best_win_streak}`,
              tone: "gold" as const,
            }))}
          />
        )}
      </Section>

      {/* Same-second signups */}
      <Section
        title="Группы регистраций"
        description="≥ 3 профиля созданы в одну и ту же секунду"
        right={
          <div className="chip-sky">
            <CalendarClock className="w-3 h-3" /> burst
          </div>
        }
      >
        {isLoading ? (
          <Skeleton rows={3} />
        ) : (data?.sameSecondSignups ?? []).length === 0 ? (
          <Empty msg="Ничего необычного." />
        ) : (
          <ul className="space-y-3">
            {data!.sameSecondSignups.map((g) => (
              <li key={g.bucket} className="panel-soft p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="mono text-sm text-ink-200">{g.bucket}</div>
                  <div className="chip-sky">
                    <Activity className="w-3 h-3" /> {g.count} профилей в эту секунду
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.players.map((p) => (
                    <Link
                      key={p.id}
                      to={`/players/${p.id}`}
                      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.05] transition-colors"
                    >
                      <Avatar idx={p.avatar_index} name={p.nickname} />
                      <span className="text-[12px] text-ink-200">{p.nickname}</span>
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Inactive but rated */}
      <Section
        title="Уснули с рейтингом"
        description="Не заходили 14+ дней, но имеют ≥ 10 партий и рейтинг > 1200"
        right={
          <div className="chip-mute">
            <EyeOff className="w-3 h-3" /> retention
          </div>
        }
      >
        {isLoading ? (
          <Skeleton rows={3} />
        ) : (data?.inactiveButRated ?? []).length === 0 ? (
          <Empty msg="Все активны — отлично." />
        ) : (
          <PlayerList
            rows={(data?.inactiveButRated ?? []).map((p) => ({
              id: p.id,
              avatar: p.avatar_index,
              nickname: p.nickname,
              hint: `видели ${fmtRelative(p.last_seen_at)} · рейтинг ${fmtNum(p.rating)}`,
              right: fmtRelative(p.last_seen_at),
              tone: "mute" as const,
            }))}
          />
        )}
      </Section>

      {/* Rating outliers */}
      <Section
        title="Аномалия рейтинга"
        description="Профили дальше 2σ от среднего — экстремумы"
        right={
          <div className="chip-gold">
            <AlertTriangle className="w-3 h-3" /> outlier
          </div>
        }
      >
        {isLoading ? (
          <Skeleton rows={3} />
        ) : (data?.ratingOutliers ?? []).length === 0 ? (
          <Empty msg="Распределение нормальное." />
        ) : (
          <PlayerList
            rows={(data?.ratingOutliers ?? []).map((p) => ({
              id: p.id,
              avatar: p.avatar_index,
              nickname: p.nickname,
              hint: `${fmtNum(p.total_games)} партий · стрик ${p.best_win_streak}`,
              right: `${fmtNum(p.rating)}`,
              tone: "gold" as const,
            }))}
          />
        )}
      </Section>

      <div className="panel p-6">
        <div className="display-title text-lg text-ink-100 mb-3">
          Что добавится после Sprint 2
        </div>
        <ul className="text-sm text-ink-300 space-y-2 leading-relaxed">
          <li>
            · <span className="text-ink-100">Device fingerprint clustering</span> — группы аккаунтов с одного устройства
          </li>
          <li>
            · <span className="text-ink-100">IP burst detection</span> — массовая регистрация с одного IP за час
          </li>
          <li>
            · <span className="text-ink-100">Coin velocity</span> — резкие движения большой суммы Coin между парами
          </li>
          <li>
            · <span className="text-ink-100">Wash trading</span> — игроки, играющие только друг с другом
          </li>
          <li>
            · <span className="text-ink-100">Очередь модерации</span> с действиями [предупредить][заморозить][закрыть OK]
          </li>
        </ul>
      </div>
    </div>
  );
}

type Row = {
  id: string;
  avatar: number;
  nickname: string;
  hint: string;
  right: string;
  tone: "gold" | "rose" | "mint" | "mute";
};

function PlayerList({ rows }: { rows: Row[] }) {
  const toneCls: Record<Row["tone"], string> = {
    gold: "text-gold-200",
    rose: "text-accent-rose/90",
    mint: "text-accent-mint",
    mute: "text-ink-300",
  };
  return (
    <ul className="divide-y divide-white/[0.04]">
      {rows.map((r) => (
        <li key={r.id}>
          <Link
            to={`/players/${r.id}`}
            className="flex items-center gap-3 px-2 py-2.5 rounded-lg row-hover"
          >
            <Avatar idx={r.avatar} name={r.nickname} />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-ink-100 truncate">{r.nickname}</div>
              <div className="text-[11px] text-ink-500 truncate">{r.hint}</div>
            </div>
            <div className={clsx("mono text-sm shrink-0", toneCls[r.tone])}>{r.right}</div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="py-6 text-center text-sm text-ink-500">{msg}</div>;
}
