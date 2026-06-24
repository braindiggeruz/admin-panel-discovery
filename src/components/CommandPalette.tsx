import { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { searchEverywhere } from "@/services/admin";
import { Search, Users, Swords, Coins, HeartPulse, LayoutDashboard, Compass } from "lucide-react";
import { clsx, fmtNum } from "@/lib/format";

type Item =
  | { kind: "page"; id: string; label: string; to: string; icon: React.ComponentType<{ className?: string }> }
  | { kind: "player"; id: string; label: string; sub: string; to: string }
  | { kind: "match"; id: string; label: string; sub: string; to: string };

const PAGES: Item[] = [
  { kind: "page", id: "p1", label: "Обзор", to: "/overview", icon: LayoutDashboard },
  { kind: "page", id: "p2", label: "Игроки", to: "/players", icon: Users },
  { kind: "page", id: "p3", label: "Матчи", to: "/matches", icon: Swords },
  { kind: "page", id: "p4", label: "Экономика", to: "/economy", icon: Coins },
  { kind: "page", id: "p5", label: "Система", to: "/health", icon: HeartPulse },
  { kind: "page", id: "p6", label: "Roadmap", to: "/roadmap", icon: Compass },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ players: Item[]; games: Item[] }>({ players: [], games: [] });
  const [active, setActive] = useState(0);
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  // Open on Cmd/Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const id = ++reqId.current;
    if (!q.trim()) {
      setResults({ players: [], games: [] });
      return;
    }
    const t = setTimeout(async () => {
      const r = await searchEverywhere(q);
      if (id !== reqId.current) return;
      setResults({
        players: r.players.map((p) => ({
          kind: "player",
          id: p.id,
          label: p.nickname,
          sub: `${fmtNum(p.rating)} рейтинга · ${fmtNum(p.total_games)} партий · ${p.id.slice(0, 8)}`,
          to: `/players/${p.id}`,
        })),
        games: r.games.map((g) => ({
          kind: "match",
          id: g.id,
          label: g.room_code,
          sub: `${g.status} · ход #${g.move_number} · ${g.id.slice(0, 8)}`,
          to: `/matches/${g.id}`,
        })),
      });
      setActive(0);
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  const flat: Item[] = useMemo(() => {
    const norm = q.trim().toLowerCase();
    const pages = !norm
      ? PAGES
      : PAGES.filter((p) => p.label.toLowerCase().includes(norm));
    return [...pages, ...results.players, ...results.games];
  }, [q, results]);

  const go = (it: Item) => {
    setOpen(false);
    nav(it.to);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all text-xs text-ink-400 group"
        aria-label="Открыть поиск (⌘K)"
      >
        <Search className="w-3.5 h-3.5" />
        <span>Найти кого угодно</span>
        <kbd className="ml-2 mono text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-ink-300">
          ⌘ K
        </kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
      <div
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm animate-in fade-in"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div className="relative w-full max-w-xl panel overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-white/[0.05]">
          <Search className="w-4 h-4 text-ink-400 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Никнейм, UUID игрока, room code (FRH-3K2)…"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((v) => Math.min(flat.length - 1, v + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((v) => Math.max(0, v - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const it = flat[active];
                if (it) go(it);
              }
            }}
            className="flex-1 py-4 bg-transparent focus:outline-none text-ink-100 placeholder:text-ink-500"
          />
          <kbd className="mono text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-ink-400">
            esc
          </kbd>
        </div>

        <div className="max-h-[55vh] overflow-y-auto py-2">
          {flat.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-ink-500">
              {q.trim() ? "Ничего не нашли" : "Начните печатать или используйте ↑↓ для навигации"}
            </div>
          ) : (
            <PaletteList flat={flat} active={active} setActive={setActive} go={go} />
          )}
        </div>

        <div className="border-t border-white/[0.05] px-4 py-2.5 flex items-center gap-3 text-[11px] text-ink-500">
          <span className="flex items-center gap-1">
            <kbd className="mono px-1 py-0.5 rounded bg-white/[0.04] text-ink-400">↑↓</kbd>
            навигация
          </span>
          <span className="flex items-center gap-1">
            <kbd className="mono px-1 py-0.5 rounded bg-white/[0.04] text-ink-400">↵</kbd>
            открыть
          </span>
          <span className="ml-auto">⌘K в любом месте</span>
        </div>
      </div>
    </div>
  );
}

function PaletteList({
  flat,
  active,
  setActive,
  go,
}: {
  flat: Item[];
  active: number;
  setActive: (n: number) => void;
  go: (it: Item) => void;
}) {
  // Group by kind
  const groups: { title: string; items: Item[]; from: number }[] = [];
  let cursor = 0;
  const pages = flat.filter((x) => x.kind === "page");
  const players = flat.filter((x) => x.kind === "player");
  const games = flat.filter((x) => x.kind === "match");
  if (pages.length) { groups.push({ title: "Страницы", items: pages, from: cursor }); cursor += pages.length; }
  if (players.length) { groups.push({ title: "Игроки", items: players, from: cursor }); cursor += players.length; }
  if (games.length) { groups.push({ title: "Матчи", items: games, from: cursor }); cursor += games.length; }

  return (
    <div>
      {groups.map((g) => (
        <div key={g.title} className="px-2">
          <div className="px-2 pt-3 pb-1 text-[10px] uppercase tracking-[0.18em] text-ink-500">
            {g.title}
          </div>
          {g.items.map((it, i) => {
            const idx = g.from + i;
            const isActive = idx === active;
            return (
              <button
                key={`${it.kind}-${it.id}`}
                onMouseEnter={() => setActive(idx)}
                onClick={() => go(it)}
                className={clsx(
                  "w-full text-left flex items-center gap-3 px-2 py-2 rounded-lg transition-colors",
                  isActive ? "bg-gold-300/10" : "hover:bg-white/[0.025]",
                )}
              >
                <PaletteIcon it={it} />
                <div className="flex-1 min-w-0">
                  <div className={clsx("text-sm truncate", isActive ? "text-gold-100" : "text-ink-100")}>
                    {it.label}
                  </div>
                  {"sub" in it && <div className="text-[11px] text-ink-500 truncate">{it.sub}</div>}
                </div>
                <kbd className={clsx("mono text-[9px] px-1 py-0.5 rounded uppercase", isActive ? "bg-gold-300/20 text-gold-200" : "bg-white/[0.04] text-ink-500")}>
                  {it.kind === "page" ? "page" : it.kind === "player" ? "player" : "match"}
                </kbd>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function PaletteIcon({ it }: { it: Item }) {
  if (it.kind === "page") return <it.icon className="w-4 h-4 text-ink-400" />;
  if (it.kind === "player")
    return (
      <span className="w-6 h-6 rounded-full bg-gradient-to-br from-gold-300 to-gold-600 flex items-center justify-center text-[10px] text-ink-950 font-semibold">
        {it.label.slice(0, 1).toUpperCase()}
      </span>
    );
  return (
    <span className="w-6 h-6 rounded bg-white/[0.04] flex items-center justify-center mono text-[10px] text-ink-300">
      #
    </span>
  );
}
