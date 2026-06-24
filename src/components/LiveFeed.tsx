import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchActivityFeed, type ActivityEvent } from "@/services/insights";
import { fmtRelative, clsx } from "@/lib/format";
import { UserPlus, Swords, Crown, Move3D } from "lucide-react";
import { Avatar } from "@/pages/Overview";
import { Skeleton } from "@/components/ui";

export default function LiveFeed() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["activity-feed"],
    queryFn: () => fetchActivityFeed(25),
    refetchInterval: 15_000,
  });

  if (isLoading) return <Skeleton rows={6} />;
  if (!data.length)
    return (
      <div className="py-6 text-center text-sm text-ink-500">
        Пока тихо. Когда что-то произойдёт — увидите тут.
      </div>
    );

  return (
    <ul className="space-y-0.5 max-h-[420px] overflow-y-auto -mx-2 pr-1">
      {data.map((e, i) => (
        <EventRow key={`${e.kind}-${e.at}-${i}`} e={e} />
      ))}
    </ul>
  );
}

function EventRow({ e }: { e: ActivityEvent }) {
  if (e.kind === "registration") {
    return (
      <Link
        to={`/players/${e.player.id}`}
        className="flex items-center gap-3 px-2 py-2 rounded-lg row-hover"
      >
        <span className="w-6 h-6 rounded-full bg-gold-300/15 border border-gold-300/30 flex items-center justify-center text-gold-200 shrink-0">
          <UserPlus className="w-3 h-3" />
        </span>
        <Avatar idx={e.player.avatar_index} name={e.player.nickname} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-ink-100 truncate">
            <span className="text-ink-400">Новый игрок:</span> {e.player.nickname}
          </div>
        </div>
        <span className="text-[11px] text-ink-500 mono shrink-0">
          {fmtRelative(e.at)}
        </span>
      </Link>
    );
  }
  if (e.kind === "game_started") {
    return (
      <Link
        to={`/matches/${e.gameId}`}
        className="flex items-center gap-3 px-2 py-2 rounded-lg row-hover"
      >
        <span className="w-6 h-6 rounded-full bg-accent-mint/15 border border-accent-mint/30 flex items-center justify-center text-accent-mint shrink-0">
          <Swords className="w-3 h-3" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-ink-200 truncate">
            <span className="text-ink-400">Создана партия</span>{" "}
            <span className="mono text-ink-100">{e.roomCode}</span>
          </div>
        </div>
        <span className="text-[11px] text-ink-500 mono shrink-0">
          {fmtRelative(e.at)}
        </span>
      </Link>
    );
  }
  if (e.kind === "game_finished") {
    return (
      <Link
        to={`/matches/${e.gameId}`}
        className="flex items-center gap-3 px-2 py-2 rounded-lg row-hover"
      >
        <span className="w-6 h-6 rounded-full bg-accent-sky/15 border border-accent-sky/30 flex items-center justify-center text-accent-sky shrink-0">
          <Crown className="w-3 h-3" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-ink-200 truncate">
            <span className="text-ink-400">Финал</span>{" "}
            <span className="mono text-ink-100">{e.roomCode}</span>{" "}
            <span className="text-ink-400">·</span>{" "}
            <span
              className={clsx(
                "text-[12px]",
                e.winner === "white"
                  ? "text-gold-200"
                  : e.winner === "black"
                    ? "text-ink-200"
                    : "text-ink-400",
              )}
            >
              {e.winner === "white" ? "белые" : e.winner === "black" ? "чёрные" : "ничья"}
            </span>
          </div>
        </div>
        <span className="text-[11px] text-ink-500 mono shrink-0">
          {fmtRelative(e.at)}
        </span>
      </Link>
    );
  }
  // move
  return (
    <Link
      to={`/matches/${e.gameId}`}
      className="flex items-center gap-3 px-2 py-2 rounded-lg row-hover"
    >
      <span className="w-6 h-6 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-ink-400 shrink-0">
        <Move3D className="w-3 h-3" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-ink-300 truncate">
          <span className="mono text-ink-200">{e.roomCode}</span>{" "}
          <span className="text-ink-500">·</span>{" "}
          <span className={e.color === "white" ? "text-gold-200" : "text-ink-200"}>
            {e.color === "white" ? "белые" : "чёрные"}
          </span>{" "}
          <span className="text-ink-500">сделали ход #{e.moveNumber}</span>
        </div>
      </div>
      <span className="text-[11px] text-ink-500 mono shrink-0">
        {fmtRelative(e.at)}
      </span>
    </Link>
  );
}
