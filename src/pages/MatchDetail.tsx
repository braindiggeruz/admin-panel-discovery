import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchGame,
  fetchGameMoves,
  fetchProfilesByIds,
} from "@/services/admin";
import {
  ArrowLeft,
  Crown,
  Hash,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { fmtDate, fmtRelative, clsx } from "@/lib/format";
import { ErrorBox, Section, Skeleton } from "@/components/ui";
import { Avatar } from "@/pages/Overview";
import CheckersBoard from "@/components/CheckersBoard";
import { useRealtimeTable } from "@/lib/realtime";
import type { BoardState } from "@/lib/types";

const INITIAL_BOARD: BoardState = (() => {
  const b: BoardState = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) {
        if (r < 3) b[r][c] = { type: "man", color: "black" };
        else if (r > 4) b[r][c] = { type: "man", color: "white" };
      }
    }
  }
  return b;
})();

export default function MatchDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();

  // Realtime: when this game updates, refetch
  useRealtimeTable("games", () => qc.invalidateQueries({ queryKey: ["match", id] }));
  useRealtimeTable("moves", () => qc.invalidateQueries({ queryKey: ["match-moves", id] }));

  const { data: g, isLoading } = useQuery({
    queryKey: ["match", id],
    queryFn: () => fetchGame(id),
  });
  const { data: moves = [], isLoading: lm } = useQuery({
    queryKey: ["match-moves", id],
    queryFn: () => fetchGameMoves(id),
  });

  const profiles = useQuery({
    queryKey: ["match-profiles", g?.white_player_id, g?.black_player_id],
    enabled: !!g,
    queryFn: () =>
      fetchProfilesByIds(
        [g?.white_player_id, g?.black_player_id].filter(Boolean) as string[],
      ),
  });

  // Replay state: cursor at move index (-1 = initial position)
  const [cursor, setCursor] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const total = moves.length;

  // Reset cursor on game change
  useEffect(() => {
    setCursor(-1);
    setPlaying(false);
  }, [id]);

  // Auto-play
  useEffect(() => {
    if (!playing) return;
    if (cursor >= total - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setCursor((c) => Math.min(total - 1, c + 1)), 900);
    return () => clearTimeout(t);
  }, [playing, cursor, total]);

  const currentBoard: BoardState = useMemo(() => {
    if (cursor < 0) return INITIAL_BOARD;
    const m = moves[cursor];
    return (m?.board_state as BoardState) ?? INITIAL_BOARD;
  }, [cursor, moves]);

  const currentMove = cursor >= 0 ? moves[cursor] : null;
  const fromHL = currentMove?.move_data
    ? { row: currentMove.move_data.fromRow, col: currentMove.move_data.fromCol }
    : null;
  const toHL = currentMove?.move_data
    ? { row: currentMove.move_data.finalRow, col: currentMove.move_data.finalCol }
    : null;

  if (isLoading) return <Skeleton rows={6} />;
  if (!g)
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorBox message="Партия не найдена." />
      </div>
    );

  const whiteP = profiles.data?.[g.white_player_id];
  const blackP = g.black_player_id ? profiles.data?.[g.black_player_id] : undefined;

  return (
    <div className="space-y-7">
      <BackLink />

      <div className="panel p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-gold-300/80 mb-2">
              Партия
            </div>
            <h1 className="display-title text-3xl text-ink-50 flex items-center gap-3">
              <Hash className="w-6 h-6 text-ink-500" />
              <span className="mono">{g.room_code}</span>
            </h1>
            <div className="mt-2 text-sm text-ink-400 mono break-all">{g.id}</div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Status status={g.status} />
            {g.winner && (
              <div className="chip-gold">
                <Crown className="w-3 h-3" /> победа · {g.winner === "white" ? "белые" : "чёрные"}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Ход сейчас" value={g.current_turn === "white" ? "белые" : "чёрные"} />
          <Stat label="Всего ходов" value={String(g.move_number)} />
          <Stat label="Создан" value={fmtDate(g.created_at)} />
          <Stat label="Обновлён" value={fmtRelative(g.updated_at)} />
        </div>
      </div>

      {/* Replay */}
      <Section
        title="Визуальный реплей"
        description={
          total > 0
            ? `${total} ход(ов) · позиция ${cursor + 1} из ${total}`
            : "У этой партии нет записанных ходов"
        }
        right={
          total > 0 && (
            <div className="flex items-center gap-1 panel-soft p-1">
              <ReplayBtn label="первый ход" onClick={() => setCursor(-1)} icon={SkipBack} />
              <ReplayBtn label="назад" onClick={() => setCursor((c) => Math.max(-1, c - 1))} icon={ChevronLeft} />
              <button
                onClick={() => setPlaying((p) => !p)}
                className={clsx(
                  "px-3 py-1.5 rounded-md text-xs inline-flex items-center gap-1.5 transition-colors",
                  playing ? "bg-gold-300 text-ink-950" : "text-ink-200 hover:bg-white/[0.04]",
                )}
                title={playing ? "Пауза" : "Авто-проигрывание"}
              >
                {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {playing ? "пауза" : "пуск"}
              </button>
              <ReplayBtn label="вперёд" onClick={() => setCursor((c) => Math.min(total - 1, c + 1))} icon={ChevronRight} />
              <ReplayBtn label="последний" onClick={() => setCursor(total - 1)} icon={SkipForward} />
            </div>
          )
        }
      >
        {lm ? (
          <Skeleton rows={8} />
        ) : total === 0 ? (
          <div className="py-8 text-center text-ink-500 text-sm">
            Старые партии до v5 миграции не имеют записей ходов в БД.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 items-start">
            {/* Board + players */}
            <div>
              <PlayerSlot
                color="black"
                profile={blackP}
                playerId={g.black_player_id}
                onTurn={cursor < 0 ? false : moves[cursor]?.player_color === "black"}
              />
              <div className="my-3">
                <CheckersBoard board={currentBoard} from={fromHL} to={toHL} size={400} />
              </div>
              <PlayerSlot
                color="white"
                profile={whiteP}
                playerId={g.white_player_id}
                onTurn={cursor < 0 ? false : moves[cursor]?.player_color === "white"}
              />
              {/* Scrubber */}
              <div className="mt-5">
                <input
                  type="range"
                  min={-1}
                  max={total - 1}
                  value={cursor}
                  onChange={(e) => setCursor(Number(e.target.value))}
                  className="w-full accent-gold-300"
                />
                <div className="flex items-center justify-between text-[10px] mono text-ink-500 mt-1">
                  <span>start</span>
                  <span>ход {cursor + 1} / {total}</span>
                  <span>end</span>
                </div>
              </div>
            </div>

            {/* Move list */}
            <div className="panel-soft p-3 max-h-[640px] overflow-y-auto">
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink-500 px-2 pb-2 sticky top-0 bg-ink-850/80 backdrop-blur z-10">
                Лист ходов
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {moves.map((m, i) => {
                  const isActive = i === cursor;
                  const d = m.move_data;
                  const isCap = d?.isCapture;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        setPlaying(false);
                        setCursor(i);
                      }}
                      className={clsx(
                        "text-left px-3 py-2 rounded-md transition-all border",
                        isActive
                          ? "bg-gold-300/15 border-gold-300/40"
                          : "border-transparent hover:bg-white/[0.025]",
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="mono text-[10px] text-ink-500">#{m.move_number}</span>
                        <span
                          className={clsx(
                            "w-2 h-2 rounded-full",
                            m.player_color === "white" ? "bg-gold-200" : "bg-ink-300",
                          )}
                        />
                      </div>
                      <div className="mono text-[13px] text-ink-100">
                        {d ? `${coord(d.fromRow, d.fromCol)} ${isCap ? "×" : "→"} ${coord(d.finalRow, d.finalCol)}` : "—"}
                      </div>
                      {(isCap || d?.promoted) && (
                        <div className="mt-0.5 flex items-center gap-1 text-[9px]">
                          {isCap && <span className="text-accent-rose">взятие</span>}
                          {d?.promoted && <span className="text-gold-300">дамка</span>}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

function PlayerSlot({
  color,
  profile,
  playerId,
  onTurn,
}: {
  color: "white" | "black";
  profile: { id: string; nickname: string; avatar_index: number; rating: number } | undefined;
  playerId: string | null;
  onTurn: boolean;
}) {
  return (
    <div
      className={clsx(
        "panel-soft p-3 flex items-center gap-3 transition-all",
        onTurn && "ring-1 ring-gold-300/40 shadow-royal",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            "w-3 h-3 rounded-full",
            color === "white" ? "bg-gold-200" : "bg-ink-300",
          )}
        />
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-500">
          {color === "white" ? "Белые" : "Чёрные"}
        </span>
      </div>
      <div className="w-px h-6 bg-white/[0.05] mx-1" />
      {profile ? (
        <Link to={`/players/${profile.id}`} className="flex items-center gap-2.5 group min-w-0 flex-1">
          <Avatar idx={profile.avatar_index} name={profile.nickname} />
          <div className="min-w-0">
            <div className="text-sm text-ink-100 truncate group-hover:text-gold-200 transition-colors">
              {profile.nickname}
            </div>
            <div className="text-[10px] text-ink-500 mono">{profile.id.slice(0, 8)}</div>
          </div>
          <span className="ml-auto mono text-gold-200 text-sm">{profile.rating}</span>
        </Link>
      ) : (
        <div className="text-xs text-ink-500 mono flex-1 truncate">
          {playerId ? playerId.slice(0, 16) + "…" : "нет игрока"}
        </div>
      )}
      {onTurn && <span className="chip-gold ml-2">ходит</span>}
    </div>
  );
}

function ReplayBtn({
  label,
  onClick,
  icon: Icon,
}: {
  label: string;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1.5 rounded-md text-ink-300 hover:bg-white/[0.04] transition-colors"
      title={label}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

function coord(r?: number, c?: number) {
  if (r === undefined || c === undefined) return "—";
  return `${String.fromCharCode(97 + c)}${8 - r}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-soft p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-ink-500">{label}</div>
      <div className="mt-1.5 text-ink-100">{value}</div>
    </div>
  );
}

function Status({ status }: { status: "waiting" | "playing" | "finished" }) {
  if (status === "playing") return <span className="chip-mint">live · идёт</span>;
  if (status === "waiting") return <span className="chip-sky">ожидает соперника</span>;
  return <span className="chip-mute">завершена</span>;
}

function BackLink() {
  return (
    <Link to="/matches" className="text-sm text-ink-400 hover:text-ink-100 inline-flex items-center gap-2">
      <ArrowLeft className="w-3.5 h-3.5" />
      ко всем матчам
    </Link>
  );
}
