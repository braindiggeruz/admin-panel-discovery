import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Bell, Swords, UserPlus, AlertTriangle, X } from "lucide-react";
import { clsx } from "@/lib/format";

export type ToastKind = "new-player" | "new-game" | "game-finished" | "info" | "warn";

export type ToastItem = {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  href?: string;
};

type Ctx = {
  push: (t: Omit<ToastItem, "id">) => void;
};

const ToastCtx = createContext<Ctx>({ push: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

const ICONS: Record<ToastKind, React.ComponentType<{ className?: string }>> = {
  "new-player": UserPlus,
  "new-game": Swords,
  "game-finished": CheckCircle2,
  info: Bell,
  warn: AlertTriangle,
};

const STYLES: Record<ToastKind, string> = {
  "new-player": "border-gold-300/40 bg-gold-300/10 text-gold-100",
  "new-game": "border-accent-mint/40 bg-accent-mint/10 text-accent-mint",
  "game-finished": "border-accent-sky/40 bg-accent-sky/10 text-accent-sky",
  info: "border-white/[0.1] bg-white/[0.04] text-ink-100",
  warn: "border-accent-rose/40 bg-accent-rose/10 text-accent-rose",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const remove = useCallback((id: string) => {
    setItems((s) => s.filter((i) => i.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const push = useCallback(
    (t: Omit<ToastItem, "id">) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setItems((s) => [{ id, ...t }, ...s].slice(0, 5));
      timers.current[id] = setTimeout(() => remove(id), 6000);
    },
    [remove],
  );

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed top-20 right-6 z-[60] flex flex-col gap-2 w-[360px] pointer-events-none">
        {items.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <a
              key={t.id}
              href={t.href ?? "#"}
              onClick={(e) => {
                if (!t.href) e.preventDefault();
              }}
              className={clsx(
                "pointer-events-auto panel p-3 pr-9 flex items-start gap-3 border relative",
                "animate-[slideIn_0.25s_ease-out] hover:translate-x-[-2px] transition-transform",
                STYLES[t.kind],
              )}
              style={{
                animation: "slideIn 220ms ease-out",
              }}
            >
              <Icon className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] tracking-tight">{t.title}</div>
                {t.description && (
                  <div className="text-[11px] text-ink-400 mt-0.5 truncate">{t.description}</div>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  remove(t.id);
                }}
                className="absolute top-2 right-2 text-ink-400 hover:text-ink-100"
                aria-label="Закрыть"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </a>
          );
        })}
      </div>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastCtx.Provider>
  );
}
