import { useState } from "react";
import { tryUnlock } from "@/lib/gate";
import { LockKeyhole, ShieldCheck } from "lucide-react";

export default function Gate({ onUnlocked }: { onUnlocked: () => void }) {
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tryUnlock(value)) {
      onUnlocked();
    } else {
      setErr("Неверная фраза. Доступ запрещён.");
      setTimeout(() => setErr(null), 2500);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative">
      <div className="absolute inset-0 -z-10 bg-grain opacity-[0.06] pointer-events-none" />
      <div className="w-full max-w-md panel p-8 relative">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-lg bg-gold-300/15 border border-gold-300/30 flex items-center justify-center">
            <LockKeyhole className="w-4 h-4 text-gold-300" />
          </div>
          <span className="text-xs uppercase tracking-[0.18em] text-ink-400">Restricted</span>
        </div>
        <h1 className="display-title text-3xl text-ink-100 mt-3">
          Командный центр<br />
          <span className="text-gold-300">Шашки Рояль</span>
        </h1>
        <p className="text-sm text-ink-400 mt-3 leading-relaxed">
          Это закрытая зона наблюдения за игрой. Введите служебную фразу, чтобы продолжить.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="password"
            autoFocus
            placeholder="passphrase"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-ink-800/70 border border-white/[0.06] focus:border-gold-300/50 focus:outline-none text-ink-100 placeholder:text-ink-500 mono text-sm"
          />
          <button type="submit" className="btn-gold w-full justify-center py-3">
            Войти
          </button>
          {err && (
            <div className="text-xs text-accent-rose/90 px-1 pt-1 mono">{err}</div>
          )}
        </form>
        <div className="mt-7 pt-5 border-t border-white/[0.05] flex items-start gap-3 text-[12px] text-ink-400 leading-relaxed">
          <ShieldCheck className="w-4 h-4 text-accent-mint mt-0.5 shrink-0" />
          <span>
            Read-only превью. Изменения базы данных, ставок, балансов и игр недоступны.
            Все действия ограничены публичным <span className="mono text-ink-300">anon</span> ключом Supabase.
          </span>
        </div>
      </div>
    </div>
  );
}
