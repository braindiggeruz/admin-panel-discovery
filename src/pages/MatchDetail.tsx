import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchGame, fetchGameMoves } from "@/services/admin";
import { ArrowLeft, Crown, Hash } from "lucide-react";
import { fmtDate, fmtRelative, shortId, clsx } from "@/lib/format";
import { ErrorBox, Section, Skeleton } from "@/components/ui";

export default function MatchDetail() {
  const { id = "" } = useParams();
  const { data: g, isLoading } = useQuery({
    queryKey: ["match", id],
    queryFn: () => fetchGame(id),
  });
  const { data: moves = [], isLoading: lm } = useQuery({
    queryKey: ["match-moves", id],
    queryFn: () => fetchGameMoves(id),
  });

  if (isLoading) return <Skeleton rows={6} />;
  if (!g)
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorBox message="Партия не найдена." />
      </div>
    );

  return (
    <div className="space-y-7">
      <BackLink />

      <div className="panel p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-gold-300/80 mb-2">
              Партия
            </div>
            <h1 className="display-title text-3xl text-ink-50 flex items-center gap-3">
              <Hash className="w-6 h-6 text-ink-500" />
              <span className="mono">{g.room_code}</span>
            </h1>
            <div className="mt-2 text-sm text-ink-400">id: <span className="mono">{g.id}</span></div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Status status={g.status} />
            {g.winner && (
              <div className="chip-gold">
                <Crown className="w-3 h-3" /> победа · {g.winner === "white" ? "белые" : "чёрные"}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
          <Stat label="Ход сейчас" value={g.current_turn === "white" ? "белые" : "чёрные"} />
          <Stat label="Всего ходов" value={String(g.move_number)} />
          <Stat label="Создан" value={fmtDate(g.created_at)} />
          <Stat label="Обновлён" value={fmtRelative(g.updated_at)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Белые" description="Player ID (анонимный)">
          <div className="mono text-sm text-ink-100 break-all">{g.white_player_id}</div>
          <div className="mt-1 text-xs text-ink-500">
            {shortId(g.white_player_id, 8)}
          </div>
        </Section>
        <Section title="Чёрные" description="Player ID (анонимный)">
          {g.black_player_id ? (
            <>
              <div className="mono text-sm text-ink-100 break-all">{g.black_player_id}</div>
              <div className="mt-1 text-xs text-ink-500">{shortId(g.black_player_id, 8)}</div>
            </>
          ) : (
            <div className="text-ink-500 text-sm">Никто не присоединился</div>
          )}
        </Section>
      </div>

      <Section
        title="История ходов"
        description={`${moves.length} ход(ов) · из таблицы public.moves`}
      >
        {lm ? (
          <Skeleton rows={8} />
        ) : moves.length === 0 ? (
          <div className="py-6 text-center text-ink-500 text-sm">
            Ходы не записаны (старые партии до v5 могут не иметь записей).
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {moves.map((m) => {
              const d = m.move_data as {
                fromRow?: number;
                fromCol?: number;
                finalRow?: number;
                finalCol?: number;
                isCapture?: boolean;
                promoted?: boolean;
              } | null;
              return (
                <div
                  key={m.id}
                  className="panel-soft p-3 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-ink-500">
                    <span className="mono">#{m.move_number}</span>
                    <span
                      className={clsx(
                        "w-2 h-2 rounded-full",
                        m.player_color === "white" ? "bg-gold-200" : "bg-ink-300",
                      )}
                    />
                  </div>
                  <div className="mt-1.5 mono text-sm text-ink-100">
                    {d
                      ? `${coord(d.fromRow, d.fromCol)} → ${coord(d.finalRow, d.finalCol)}`
                      : "—"}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                    {d?.isCapture && <span className="chip-rose">взятие</span>}
                    {d?.promoted && <span className="chip-gold">дамка</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

function coord(r?: number, c?: number) {
  if (r === undefined || c === undefined) return "—";
  const col = String.fromCharCode(97 + c);
  const row = 8 - r;
  return `${col}${row}`;
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
