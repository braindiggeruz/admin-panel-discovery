import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd MMM yyyy · HH:mm", { locale: ru });
  } catch {
    return "—";
  }
}

export function fmtRelative(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return formatDistanceToNowStrict(parseISO(iso), { locale: ru, addSuffix: true });
  } catch {
    return "—";
  }
}

export function fmtNum(n: number | null | undefined, opts?: Intl.NumberFormatOptions) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("ru-RU", opts).format(n);
}

export function fmtCoin(n: number | null | undefined) {
  return fmtNum(n, { maximumFractionDigits: 0 });
}

export function shortId(id: string | null | undefined, len = 8) {
  if (!id) return "—";
  return id.length > len ? `${id.slice(0, len)}…` : id;
}

export function pct(n: number, total: number) {
  if (!total) return 0;
  return Math.round((n / total) * 1000) / 10;
}

export function clsx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
