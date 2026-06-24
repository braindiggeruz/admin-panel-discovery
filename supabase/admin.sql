-- ============================================================
-- Shashki Royale · Admin Panel · SQL Migration (Sprint 2 prep)
-- ============================================================
-- Apply via Supabase SQL editor.  Idempotent.
--
-- This creates the minimum tables needed by the Cloudflare Worker
-- (worker/) to authenticate admin users and audit every action.
--
-- Nothing changes for the game itself.
-- ============================================================

BEGIN;

-- ─── Admin users ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text UNIQUE NOT NULL,
  password_hash   text NOT NULL,           -- argon2id (pepper in worker env)
  totp_secret     text,                    -- base32, may be NULL for non-owner
  role            text NOT NULL CHECK (role IN ('owner','admin','support','moderator','analyst','viewer')),
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_login_at   timestamptz,
  last_login_ip   inet
);

-- Only service_role can read/write this table.
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no_anon_access" ON public.admin_users;
-- (no SELECT/INSERT/UPDATE/DELETE policy for anon ⇒ anon has no access)

-- ─── Audit log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id               bigserial PRIMARY KEY,
  actor_id         uuid REFERENCES public.admin_users(id),
  actor_email      text,
  actor_ip         inet,
  action           text NOT NULL,            -- 'login', 'view_player', 'refund_stake', 'grant_coin', ...
  target_kind      text,                     -- 'player','wallet','game','stake','admin', ...
  target_id        text,
  reason           text,                     -- required for mutations
  before           jsonb,
  after            jsonb,
  idempotency_key  text,
  status           text NOT NULL DEFAULT 'success' CHECK (status IN ('pending','success','failed')),
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_created_idx  ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_target_idx   ON public.admin_audit_log (target_kind, target_id);
CREATE INDEX IF NOT EXISTS admin_audit_action_idx   ON public.admin_audit_log (action);
CREATE UNIQUE INDEX IF NOT EXISTS admin_audit_idem_idx
  ON public.admin_audit_log (actor_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
-- no policy for anon ⇒ no access

-- ─── Rate-limit (in-memory in Worker, persisted only on suspicious patterns) ─
CREATE TABLE IF NOT EXISTS public.admin_rate_violations (
  id              bigserial PRIMARY KEY,
  actor_email     text,
  actor_ip        inet,
  endpoint        text NOT NULL,
  count           integer NOT NULL,
  window_start    timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_rate_violations ENABLE ROW LEVEL SECURITY;

-- ─── Helpful view (will read by anon — only after we explicitly grant) ──────
-- Intentionally NOT created in this migration — keep anon = read-game-only.

COMMIT;

-- ============================================================
-- Verification queries you can run after applying
-- ============================================================
-- SELECT to_regclass('public.admin_users');
-- SELECT to_regclass('public.admin_audit_log');
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'admin_users';
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'admin_audit_log';
