import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchPlayer,
  fetchPlayerGames,
  fetchPlayerStakes,
  fetchProfilesByIds,
} from "@/services/admin";
import { fetchPlayer360 } from "@/services/auth";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Flame,
  Trophy,
  Wallet as WalletIcon,
  Mail,
  Lock,
  ArrowDownCircle,
  ArrowUpCircle,
  Sparkles,
} from "lucide-react";
import { fmtCoin, fmtDate, fmtNum, fmtRelative, clsx } from "@/lib/format";
import { Avatar } from "@/pages/Overview";
import { Kpi, Section, ErrorBox, Skeleton, Empty } from "@/components/ui";
import CountUp from "@/components/CountUp";

const TX_PALETTE: Record<string, string> = {
  starting_bonus: "text-accent-mint",
  welcome_bonus: "text-accent-mint",
  daily_bonus: "text-accent-mint",
  win: "text-accent-mint",
  loss: "text-accent-rose",
  stake_lock: "text-accent-sky",
  stake_refund: "text-accent-sky",
  stake_payout: "text-gold-200",
  commission: "text-gold-400",
  referral: "text-accent-mint",
};

export default function PlayerDetail() {
  const { id = "" } = useParams();

  // Public stats (still uses anon)
  const player = useQuery({ queryKey: ["player", id], queryFn: () => fetchPlayer(id) });

  // ✨ NEW: full 360 view via /api (service_role on server)
  const live360 = useQuery({
    queryKey: ["player-360", id],
    queryFn: () => fetchPlayer360(id),
    enabled: !!id,
    refetchInterval: 20_000,
  });

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

  const oppIds = (games.data ?? [])
    .map((g) => (g.white_player_id === id ? g.black_player_id : g.white_player_id))
    .filter(Boolean) as string[];
  const opps = useQuery({
    queryKey: ["player-opp-profiles", oppIds.sort().join(",")],
    queryFn: () => fetchProfilesByIds(oppIds),
    enabled: oppIds.length > 0,
  });

  if (player.isLoading) return <Skeleton rows={6} />;
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
  const stakeData = stakes.data ?? [];
  const stakesPlayed = stakeData.filter((s) => s.white_profile_id === id).length + stakeData.filter((s) => s.black_profile_id === id).length;

  const full = live360.data;
  const wallet = full?.wallet;
  const txs = full?.transactions ?? [];
  const fullProfile = full?.profile;

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
              {fullProfile?.email ? (
                <span className="chip-gold">
                  <Mail className="w-3 h-3" /> {fullProfile.email}
                </span>
              ) : (
                <span className="chip-mute">
                  <Mail className="w-3 h-3" /> без email (anonymous)
                </span>
              )}
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
              {fullProfile?.login_streak ? (
                <span className="chip-mint">
                  <Sparkles className="w-3 h-3" /> login streak {fullProfile.login_streak}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Wallet hero */}
      <div className="panel p-7 relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-72 h-72 rounded-full bg-gradient-to-br from-gold-400/20 to-transparent blur-3xl pointer-events-none" />
        <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-end">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-gold-300/80 mb-2 flex items-center gap-2">
              <WalletIcon className="w-3 h-3" />
              Кошелёк · live · service_role
            </div>
            {live360.isLoading ? (
              <div className="display-title text-6xl text-ink-200">…</div>
            ) : wallet ? (
              <>
                <div className="display-title text-6xl text-gold-200 leading-none">
                  <CountUp value={Number(wallet.crypto_balance)} format={fmtCoin} />{" "}
                  <span className="text-ink-400 text-2xl">Coin</span>
                </div>
                <div className="mt-3 text-sm text-ink-400">
                  В locked:{" "}
                  <span className="mono text-accent-sky">
                    <CountUp value={Number(wallet.locked_balance)} format={fmtCoin} />
                  </span>{" "}
                  · обновлено {fmtRelative(wallet.updated_at)}
                </div>
              </>
            ) : (
              <div className="text-ink-500 text-sm">Кошелёк не найден.</div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 min-w-[240px]">
            <Kpi label="Выиграно" value={<CountUp value={Number(wallet?.total_won ?? 0)} format={fmtCoin} />} tone="mint" />
            <Kpi label="Проиграно" value={<CountUp value={Number(wallet?.total_lost ?? 0)} format={fmtCoin} />} tone="rose" />
          </div>
        </div>
      </div>

      {/* Game KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi icon={<Trophy className="w-4 h-4" />} label="Рейтинг" value={<CountUp value={p.rating} />} tone="gold" />
        <Kpi label="Партий" value={<CountUp value={p.total_games} />} />
        <Kpi
          label="Win rate"
          value={p.total_games > 0 ? `${wr}%` : "—"}
          tone={wr >= 60 ? "mint" : wr >= 40 ? "default" : "rose"}
        />
        <Kpi label="Текущий стрик" value={<CountUp value={p.win_streak} />} tone="gold" />
      </div>

      {/* Transactions */}
      <Section
        title="История транзакций"
        description={
          live360.isLoading
            ? "загружаю…"
            : `${txs.length} последних движений Coin (полная история через service_role)`
        }
      >
        {live360.isLoading ? (
          <Skeleton rows={6} />
        ) : txs.length === 0 ? (
          <Empty message="Нет транзакций" />
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {txs.map((tx) => {
              const amt = Number(tx.amount);
              const positive = amt > 0;
              return (
                <li
                  key={tx.id}
                  className="flex items-center gap-4 px-2 py-3 row-hover rounded-lg"
                >
                  <span
                    className={clsx(
                      "w-7 h-7 rounded-full border flex items-center justify-center shrink-0",
                      positive
                        ? "bg-accent-mint/10 border-accent-mint/30 text-accent-mint"
                        : "bg-accent-rose/10 border-accent-rose/30 text-accent-rose",
                    )}
                  >
                    {positive ? <ArrowUpCircle className="w-3.5 h-3.5" /> : <ArrowDownCircle className="w-3.5 h-3.5" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className={clsx("mono", TX_PALETTE[tx.type] ?? "text-ink-200")}>
                        {tx.type}
                      </span>
                      {tx.note && (
                        <span className="text-ink-400 text-[12px] truncate">· {tx.note}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-ink-500 mono mt-0.5">
                      {fmtRelative(tx.created_at)}{" "}
                      {tx.game_id && (
                        <Link to={`/matches/${tx.game_id}`} className="text-ink-400 underline ml-1">
                          → партия
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className={clsx("mono text-sm shrink-0 text-right", positive ? "text-accent-mint" : "text-accent-rose")}>
                    {positive ? "+" : ""}
                    {fmtCoin(amt)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

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
              const myColor: "white" | "black" = g.white_player_id === id ? "white" : "black";
              const oppId = myColor === "white" ? g.black_player_id : g.white_player_id;
              const opp = oppId ? opps.data?.[oppId] : undefined;
              const result =
                g.winner === null ? "draw" : g.winner === myColor ? "win" : "loss";
              return (
                <li key={g.id}>
                  <Link to={`/matches/${g.id}`} className="flex items-center gap-4 px-3 py-3 row-hover rounded-lg">
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

      <div className="panel p-6 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-accent-mint/10 border border-accent-mint/30 flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4 text-accent-mint" />
        </div>
        <div className="text-sm text-ink-300 leading-relaxed">
          Кошелёк, транзакции и email загружены через <span className="mono text-ink-100">/api/admin/players/:id</span> —
          Cloudflare Pages Function с <span className="mono text-ink-100">service_role</span>.
          Каждое обращение пишет запись в <span className="mono text-ink-100">admin_audit_log</span>{" "}
          (если миграция применена).
        </div>
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
