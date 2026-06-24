/**
 * Lightweight access gate for Phase 1 read-only preview.
 *
 * This is NOT a real authorization system. Real RBAC arrives in Sprint 2
 * (see docs/admin/ADMIN_PANEL_SECURITY_ARCHITECTURE.md). For now, the
 * passphrase lives in build-time env var and is only sufficient to keep
 * casual visitors out of the preview deployment.
 *
 * Production write actions are STILL blocked at the database level — the
 * panel only uses the public `anon` Supabase key, so any leaked passphrase
 * cannot escalate privileges.
 */
const KEY = "sr_admin_unlock_v1";

export function isUnlocked(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function tryUnlock(input: string): boolean {
  const want = import.meta.env.VITE_ADMIN_PASSPHRASE as string | undefined;
  if (!want || !input) return false;
  if (input.trim() !== want) return false;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
  return true;
}

export function lock(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
