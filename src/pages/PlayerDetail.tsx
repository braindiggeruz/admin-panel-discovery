import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchPlayer,
  fetchPlayerEngagement,
  fetchPlayerGames,
  fetchPlayerStakes,
  fetchProfilesByIds,
} from "@/services/admin";
import { ArrowLeft, Calendar, Clock, Flame, Trophy, Lock } from "lucide-react";
import { fmtCoin, fmtDate, fmtNum, fmtRelative, clsx } from "@/lib/format";
import { Avatar } from "@/pages/Overview";
import { Kpi, Section, ErrorBox, Skeleton, Empty } from "@/components/ui";

export default function PlayerDetail() {
  const { id = "" } = useParams();
  const player = useQuery({ queryKey: ["player", id], queryFn: () => fetchPlayer(id) });
  const games = useQuery({
    queryKey: ["player-games", id],
    queryFn: () => fetchPlayerGames(id, 25),
    enabled: !!id,
  });
  const stakes = useQuery({
    queryKey: ["player-stakes", id],
    queryFn: () => fetchPlayerStakes(id, 25),
    enabled: !!id,
  });
  const engagement = useQuery({
    queryKey: ["player-engagement", id],
    queryFn: () => fetchPlayerEngagement(id, 30),
    enabled: !!id,
  });

  // Bulk lookup of opponent profiles for the games list
  const oppIds = (games.data ?? [])
    .map((g) => (g.white_player_id === id ? g.black_player_id : g.white_player_id))
    .filter(Boolean) as string[];
  const opps = useQuery({
    queryKey: ["player-opp-profiles", oppIds.sort().join(",")],
    queryFn: () => fetchProfilesByIds(oppIds),
    enabled: oppIds.length > 0,
  });

  if (player.isLoading) {
    return <Skeleton rows={6} />;
  }
  const p = player.data;
  if (!p) {
    return (
      <div className="space-y-5">
        <BackLink />
        <ErrorBox message="Игрок не найден или скрыт RLS." />
      </div>
    );
  }
  const wr = p.total_games > 0 ? Math.round((p.wins / p.total_games) * 100) : 0;

  // Aggregate stakes economics for this player
  const stakeData = stakes.data ?? [];
  const stakesAsWhite = stakeData.filter((s) => s.white_profile_id === id);
  const stakesAsBlack = stakeData.filter((s) => s.black_profile_id === id);
  const stakesPlayed = stakesAsWhite.length + stakesAsBlack.length;
  const coinWagered = stakeData.reduce((acc, s) => acc + Number(s.entry_fee || 0), 0);

  return (
    <div className="space-y-7">
      <BackLink />

      {/* Hero */}
      <div className="panel p-7">
        <div className="flex items-start gap-6">
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
            <div className="mt-1 text-sm text-ink-400 mono break-all">{p.id}</div>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="chip-mute">
                <Calendar className="w-3 h-3" /> {fmtDate(p.created_at)}
              </span>
              <span className="chip-mute">
                <Clock className="w-3 h-3" /> {fmtRelative(p.last_seen_at)}
              </span>
              {p.best_win_streak > 0 && (
                <span className="chip-gold">
                  <Flame className="w-3 h-3" /> лучший стрик {p.best_win_streak}
                </span>
              )}
              {stakesPlayed > 0 && (
                <span className="chip-sky">сыграно ставочных: {stakesPlayed}</span>
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
        <Kpi label="Coin поставлено" value={fmtCoin(coinWagered)} tone="gold" />
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

      {/* Recent games */}
      <Section
        title="Недавние партии"
        description="Последние 25 партий"
      >
        {games.isLoading ? (
          <Skeleton rows={5} />
        ) : (games.data ?? []).length === 0 ? (
          <Empty message="Этот игрок ещё не сыграл онлайн-партий" />
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {(games.data ?? []).map((g) => {
              const myColor: "white" | "black" =
                g.white_player_id === id ? "white" : "black";
              const oppId = myColor === "white" ? g.black_player_id : g.white_player_id;
              const opp = oppId ? opps.data?.[oppId] : undefined;
              const result =
                g.winner === null
                  ? "draw"
                  : g.winner === myColor
                    ? "win"
                    : "loss";
              return (
                <li key={g.id}>
                  <Link
                    to={`/matches/${g.id}`}
                    className="flex items-center gap-4 px-3 py-3 row-hover rounded-lg"
                  >
                    <div className={clsx("w-2 h-2 rounded-full", myColor === "white" ? "bg-gold-200" : "bg-ink-300")} />
                    <div className="mono text-xs text-ink-300 w-20">{g.room_code}</div>
                    <div className="flex-1 min-w-0 flex items-center gap-3">
                      {opp ? (
                        <>
                          <Avatar idx={opp.avatar_index} name={opp.nickname} />
                          <div className="min-w-0">
                            <div className="text-sm text-ink-100 truncate">vs {opp.nickname}</div>
                            <div className="text-[11px] text-ink-500">
                              {fmtNum(g.move_number)} ходов · {fmtRelative(g.updated_at)}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="text-sm text-ink-500">vs (нет соперника)</div>
                      )}
                    </div>
                    <span
                      className={clsx(
                        "chip",
                        result === "win"
                          ? "bg-accent-mint/10 border-accent-mint/30 text-accent-mint"
                          : result === "loss"
                            ? "bg-accent-rose/10 border-accent-rose/30 text-accent-rose"
                            : "bg-white/[0.03] border-white/10 text-ink-300",
                      )}
                    >
                      {result === "win" ? "победа" : result === "loss" ? "проигрыш" : "ничья"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Stake history */}
      <Section title="Ставочные партии" description="Последние 25 со связкой pot/escrow">
        {stakes.isLoading ? (
          <Skeleton rows={5} />
        ) : stakeData.length === 0 ? (
          <Empty message="Этот игрок ещё не делал ставок" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.16em] text-ink-500 border-b border-white/[0.05]">
                  <th className="text-left py-3 pl-3 font-medium">Создано</th>
                  <th className="text-left font-medium">Цвет</th>
                  <th className="text-right font-medium">Entry</th>
                  <th className="text-right font-medium">Pot</th>
                  <th className="text-left font-medium pl-4">Escrow</th>
                  <th className="text-left font-medium">Payout</th>
                </tr>
              </thead>
              <tbody>
                {stakeData.map((s) => {
                  const isWhite = s.white_profile_id === id;
                  return (
                    <tr key={s.id} className="border-b border-white/[0.025] row-hover">
                      <td className="py-2.5 pl-3 text-ink-400 text-xs">
                        {fmtRelative(s.created_at)}
                      </td>
                      <td>
                        <span className={clsx("inline-flex items-center gap-1.5", isWhite ? "text-gold-200" : "text-ink-200")}>
                          <span className={clsx("w-2 h-2 rounded-full", isWhite ? "bg-gold-200" : "bg-ink-300")} />
                          {isWhite ? "белые" : "чёрные"}
                        </span>
                      </td>
                      <td className="text-right mono text-ink-100">{fmtCoin(s.entry_fee)}</td>
                      <td className="text-right mono text-gold-200">{fmtCoin(s.pot_amount)}</td>
                      <td className="pl-4">
                        <EscrowChip status={s.escrow_status} />
                      </td>
                      <td>
                        <PayoutChip status={s.payout_status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Engagement log if any */}
      {(engagement.data ?? []).length > 0 && (
        <Section title="Engagement активность" description="streak / daily / referrals">
          <ul className="space-y-1.5">
            {(engagement.data ?? []).slice(0, 20).map((e, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="chip-mute">{e.event_type}</span>
                <span className="text-ink-500 text-xs mono">{fmtRelative(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Locked section */}
      <div className="panel p-6 relative overflow-hidden">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
            <Lock className="w-4 h-4 text-ink-400" />
          </div>
          <div className="flex-1">
            <div className="display-title text-lg text-ink-100">
              Что появится здесь после Sprint 2
            </div>
            <p className="text-sm text-ink-400 mt-2 leading-relaxed">
              <span className="mono text-ink-300">wallet.balance</span> ·{" "}
              <span className="mono text-ink-300">wallet.locked_balance</span> ·{" "}
              <span className="mono text-ink-300">wallet_transactions</span> ·{" "}
              <span className="mono text-ink-300">email</span> ·{" "}
              <span className="mono text-ink-300">device_fp_hash</span>. Эти поля закрыты RLS
              и доступны только через защищённый Cloudflare Worker с service_role. Инфраструктура
              для этого уже подготовлена в этом репозитории — нужен только сам ключ.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function EscrowChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    waiting: "chip-sky",
    locked: "chip-gold",
    paid: "chip-mint",
    refunded: "chip-rose",
  };
  return <span className={map[status] ?? "chip-mute"}>{status}</span>;
}
function PayoutChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "chip-sky",
    paid: "chip-mint",
    failed: "chip-rose",
    refunded: "chip-mute",
  };
  return <span className={map[status] ?? "chip-mute"}>{status}</span>;
}

function BackLink() {
  return (
    <Link
      to="/players"
      className="text-sm text-ink-400 hover:text-ink-100 inline-flex items-center gap-2"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      ко всем игрокам
    </Link>
  );
}
