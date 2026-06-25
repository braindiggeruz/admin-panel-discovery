-- ============================================================
-- Shashki Royale · Admin Audit · Read-only diagnostic
-- File:  scripts/audit/diag_constraints.sql
-- Goal:  List actual CHECK constraints on wallet_transactions
--        AFTER Sprint 4 migration so we know exactly what was
--        dropped and what was reinstated.
-- Run via:  Supabase Studio → SQL Editor (read-only)
-- Touches: NOTHING. Read-only.
-- ============================================================
SELECT
  conname                                     AS name,
  pg_get_constraintdef(oid)                   AS definition,
  contype                                     AS type
FROM pg_constraint
WHERE conrelid = 'public.wallet_transactions'::regclass
ORDER BY contype, conname;

-- ── Also list constraints on wallets and profiles for sanity ──
SELECT 'wallets' AS table, conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.wallets'::regclass AND contype = 'c'
UNION ALL
SELECT 'profiles', conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass AND contype = 'c'
ORDER BY 1, 2;

-- ── Suspended columns presence (proof Sprint 4 was applied) ──
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'profiles'
  AND column_name  IN ('suspended_until','suspension_reason','suspended_by')
ORDER BY column_name;
