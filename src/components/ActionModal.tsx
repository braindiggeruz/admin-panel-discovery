import { useEffect, useRef, useState } from "react";
import { X, AlertTriangle, Loader2 } from "lucide-react";
import { clsx } from "@/lib/format";

export type ActionConfirmField =
  | { kind: "number"; name: string; label: string; placeholder?: string; min?: number; max?: number; defaultValue?: number }
  | { kind: "text"; name: string; label: string; placeholder?: string; multiline?: boolean; defaultValue?: string }
  | { kind: "select"; name: string; label: string; options: { value: string | number; label: string }[]; defaultValue?: string | number };

export function ActionModal({
  open,
  title,
  description,
  fields,
  cta,
  tone = "default",
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description?: string;
  fields: ActionConfirmField[];
  cta: string;
  tone?: "default" | "danger" | "warn";
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const firstRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const init: Record<string, string> = {};
    for (const f of fields) {
      if (f.kind === "number") init[f.name] = String(f.defaultValue ?? "");
      else if (f.kind === "text") init[f.name] = f.defaultValue ?? "";
      else if (f.kind === "select") init[f.name] = String(f.defaultValue ?? f.options[0]?.value ?? "");
    }
    setValues(init);
    setErr(null);
    setBusy(false);
    const t = setTimeout(() => firstRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open, fields]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(values);
      onClose();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-4"
      style={{ background: "rgba(8, 8, 10, 0.72)", backdropFilter: "blur(8px)" }}
      onClick={() => !busy && onClose()}
      data-testid="action-modal"
    >
      <form
        onSubmit={go}
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          "panel w-full max-w-md p-6 relative border",
          tone === "danger" && "border-accent-rose/30",
          tone === "warn" && "border-gold-300/30",
          tone === "default" && "border-white/[0.06]",
        )}
      >
        <button
          type="button"
          onClick={() => !busy && onClose()}
          className="absolute top-3 right-3 text-ink-400 hover:text-ink-100"
          aria-label="Закрыть"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3 mb-4">
          <div
            className={clsx(
              "w-9 h-9 rounded-lg border flex items-center justify-center shrink-0",
              tone === "danger" && "border-accent-rose/30 bg-accent-rose/10 text-accent-rose",
              tone === "warn" && "border-gold-300/30 bg-gold-300/10 text-gold-200",
              tone === "default" && "border-white/[0.06] bg-white/[0.02] text-ink-300",
            )}
          >
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <h2 className="display-title text-lg text-ink-50">{title}</h2>
            {description && <p className="text-[12px] text-ink-400 mt-1 leading-relaxed">{description}</p>}
          </div>
        </div>

        <div className="space-y-3">
          {fields.map((f, idx) => {
            const setVal = (v: string) => setValues((s) => ({ ...s, [f.name]: v }));
            const isFirst = idx === 0;
            if (f.kind === "text") {
              return (
                <label key={f.name} className="block">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-ink-500 mb-1">
                    {f.label}
                  </div>
                  {f.multiline ? (
                    <textarea
                      ref={isFirst ? (el) => (firstRef.current = el) : undefined}
                      value={values[f.name] ?? ""}
                      onChange={(e) => setVal(e.target.value)}
                      placeholder={f.placeholder}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg bg-ink-800/70 border border-white/[0.05] focus:border-gold-300/40 focus:outline-none text-sm text-ink-100 placeholder:text-ink-500 resize-none"
                      data-testid={`action-field-${f.name}`}
                    />
                  ) : (
                    <input
                      ref={isFirst ? (el) => (firstRef.current = el) : undefined}
                      value={values[f.name] ?? ""}
                      onChange={(e) => setVal(e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 rounded-lg bg-ink-800/70 border border-white/[0.05] focus:border-gold-300/40 focus:outline-none text-sm text-ink-100 placeholder:text-ink-500"
                      data-testid={`action-field-${f.name}`}
                    />
                  )}
                </label>
              );
            }
            if (f.kind === "number") {
              return (
                <label key={f.name} className="block">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-ink-500 mb-1">
                    {f.label}
                  </div>
                  <input
                    ref={isFirst ? (el) => (firstRef.current = el) : undefined}
                    type="number"
                    inputMode="decimal"
                    value={values[f.name] ?? ""}
                    onChange={(e) => setVal(e.target.value)}
                    placeholder={f.placeholder}
                    min={f.min}
                    max={f.max}
                    className="w-full px-3 py-2 rounded-lg bg-ink-800/70 border border-white/[0.05] focus:border-gold-300/40 focus:outline-none text-sm text-ink-100 placeholder:text-ink-500 mono"
                    data-testid={`action-field-${f.name}`}
                  />
                </label>
              );
            }
            return (
              <label key={f.name} className="block">
                <div className="text-[11px] uppercase tracking-[0.16em] text-ink-500 mb-1">
                  {f.label}
                </div>
                <select
                  value={values[f.name] ?? ""}
                  onChange={(e) => setVal(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-ink-800/70 border border-white/[0.05] focus:border-gold-300/40 focus:outline-none text-sm text-ink-100"
                  data-testid={`action-field-${f.name}`}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={String(o.value)}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>

        {err && (
          <div className="mt-3 p-3 rounded-lg bg-accent-rose/10 border border-accent-rose/30 text-[12px] text-accent-rose mono">
            {err}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="px-3 py-2 rounded-lg text-[12px] text-ink-300 hover:bg-white/[0.04]"
            disabled={busy}
            data-testid="action-cancel-btn"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={busy}
            className={clsx(
              "px-4 py-2 rounded-lg text-[12px] tracking-tight inline-flex items-center gap-2 transition-all",
              tone === "danger"
                ? "bg-accent-rose/15 border border-accent-rose/40 text-accent-rose hover:bg-accent-rose/25"
                : tone === "warn"
                  ? "bg-gold-300/15 border border-gold-300/40 text-gold-200 hover:bg-gold-300/25"
                  : "bg-gold-300/15 border border-gold-300/40 text-gold-200 hover:bg-gold-300/25",
              busy && "opacity-50 cursor-not-allowed",
            )}
            data-testid="action-submit-btn"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {cta}
          </button>
        </div>
      </form>
    </div>
  );
}
