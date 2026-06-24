import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchPlayer } from "@/services/admin";
import { ArrowLeft, Calendar, Clock, Flame, Trophy } from "lucide-react";
import { fmtDate, fmtNum, fmtRelative } from "@/lib/format";
import { Avatar } from "@/pages/Overview";
import { Kpi, Section, ErrorBox, Skeleton } from "@/components/ui";

export default function PlayerDetail() {
  const { id = "" } = useParams();
  const { data: p, isLoading } = useQuery({
    queryKey: ["player", id],
    queryFn: () => fetchPlayer(id),
  });

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton rows={6} />
      </div>
    );
  }
  if (!p) {
    return (
      <div className="space-y-5">
        <BackLink />
        <ErrorBox message="Игрок не найден или скрыт RLS." />
      </div>
    );
  }
  const wr = p.total_games > 0 ? Math.round((p.wins / p.total_games) * 100) : 0;
  return (
    <div className="space-y-7">
      <BackLink />
      <div className="panel p-7">
        <div className="flex items-start gap-5">
          <div className="scale-[1.6] origin-top-left">
            <Avatar idx={p.avatar_index} name={p.nickname} />
          </div>
          <div className="flex-1 min-w-0 ml-6">
            <div className="text-[11px] uppercase tracking-[0.18em] text-gold-300/80 mb-2">
              Профиль игрока
            </div>
            <h1 className="display-title text-3xl text-ink-50">
              {p.display_name || p.nickname}
            </h1>
            <div className="mt-1 text-sm text-ink-400">
              <span className="mono">{p.id}</span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="chip-mute">
                <Calendar className="w-3 h-3" /> зарегистрирован {fmtDate(p.created_at)}
              </span>
              <span className="chip-mute">
                <Clock className="w-3 h-3" /> последний визит {fmtRelative(p.last_seen_at)}
              </span>
              {p.best_win_streak > 0 && (
                <span className="chip-gold">
                  <Flame className="w-3 h-3" /> лучший стрик {p.best_win_streak}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi icon={<Trophy className="w-4 h-4" />} label="Рейтинг" value={fmtNum(p.rating)} tone="gold" />
        <Kpi label="Партий" value={fmtNum(p.total_games)} />
        <Kpi
          label="Win rate"
          value={p.total_games > 0 ? `${wr}%` : "—"}
          tone={wr >= 60 ? "mint" : wr >= 40 ? "default" : "rose"}
        />
        <Kpi label="Текущий стрик" value={fmtNum(p.win_streak)} tone="gold" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Section title="Победы">
          <div className="display-title text-5xl text-accent-mint">{fmtNum(p.wins)}</div>
          <div className="text-xs text-ink-400 mt-2">завершённые партии в плюс</div>
        </Section>
        <Section title="Поражения">
          <div className="display-title text-5xl text-accent-rose/90">{fmtNum(p.losses)}</div>
          <div className="text-xs text-ink-400 mt-2">партии в минус</div>
        </Section>
        <Section title="Ничьи">
          <div className="display-title text-5xl text-ink-200">{fmtNum(p.draws)}</div>
          <div className="text-xs text-ink-400 mt-2">партии в ноль</div>
        </Section>
      </div>

      <div className="panel p-6">
        <div className="display-title text-lg text-ink-100 mb-3">Что скрыто</div>
        <p className="text-sm text-ink-400 leading-relaxed">
          Поля <span className="mono text-ink-200">email</span>,{" "}
          <span className="mono text-ink-200">device_fp_hash</span>,{" "}
          <span className="mono text-ink-200">crypto_balance</span> и история транзакций
          защищены через RLS и доступны только владельцу. Чтобы увидеть их в админ-панели,
          в Sprint 2 будет добавлен server-side admin RPC за защитой service_role
          (исключительно на Cloudflare Worker, никогда во frontend bundle).
        </p>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/players" className="text-sm text-ink-400 hover:text-ink-100 inline-flex items-center gap-2">
      <ArrowLeft className="w-3.5 h-3.5" />
      ко всем игрокам
    </Link>
  );
}
