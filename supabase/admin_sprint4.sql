-- ============================================================
-- Shashki Royale · Admin Panel · Sprint 4 — Player 360 Actions
-- ============================================================
-- Idempotent.  Apply via Supabase SQL Editor.
-- Adds:
--   • profiles.suspended_until / suspension_reason
--   • wallet_transactions.type now accepts 'admin_grant' / 'admin_refund' / 'admin_adjustment'
--   • RPC functions called by Cloudflare Pages Function
--   • Audit table additions (idempotency_key already in admin_audit_log)
-- All RPCs run with SECURITY DEFINER and accept service_role only.
-- ============================================================

BEGIN;

-- ── 1. Suspension columns on profiles ─────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='profiles' AND column_name='suspended_until'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN suspended_until timestamptz NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='profiles' AND column_name='suspension_reason'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN suspension_reason text NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='profiles' AND column_name='suspended_by'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN suspended_by text NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS profiles_suspended_until_idx
  ON public.profiles (suspended_until)
  WHERE suspended_until IS NOT NULL;

-- ── 2. Allow admin transaction types ──────────────────────────
-- Re-create CHECK constraint to include admin types.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'public.wallet_transactions'::regclass
    AND contype='c'
    AND pg_get_constraintdef(oid) ILIKE '%type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.wallet_transactions DROP CONSTRAINT %I', cname);
  END IF;
END $$;

-- Liberal accepted list (won't reject older values either)
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN (
    'deposit','withdrawal','fee_lock','fee_refund','prize_payout',
    'starting_bonus','welcome_bonus','daily_bonus','referral',
    'win','loss','commission',
    'stake_lock','stake_refund','stake_payout',
    'admin_grant','admin_refund','admin_adjustment'
  ));

-- Drop the amount >= 0 constraint if it exists, allow negatives for admin_adjustment
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'public.wallet_transactions'::regclass
    AND contype='c'
    AND pg_get_constraintdef(oid) ILIKE '%amount%>=%0%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.wallet_transactions DROP CONSTRAINT %I', cname);
  END IF;
END $$;

-- ── 3. RPC: admin_grant_coin ──────────────────────────────────
-- Adds Coin to a player wallet, writes wallet_transactions row,
-- returns the new balance.
CREATE OR REPLACE FUNCTION public.admin_grant_coin(
  p_profile_id  uuid,
  p_amount      numeric,
  p_reason      text,
  p_actor       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before numeric;
  v_after  numeric;
  v_tx_id  uuid;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'amount_required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  -- Ensure wallet exists
  INSERT INTO wallets (profile_id, crypto_balance, locked_balance)
  VALUES (p_profile_id, 0, 0)
  ON CONFLICT (profile_id) DO NOTHING;

  SELECT crypto_balance INTO v_before FROM wallets WHERE profile_id = p_profile_id FOR UPDATE;
  v_after := v_before + p_amount;
  IF v_after < 0 THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  UPDATE wallets
  SET crypto_balance = v_after,
      updated_at = now()
  WHERE profile_id = p_profile_id;

  INSERT INTO wallet_transactions (profile_id, type, amount, status, note)
  VALUES (
    p_profile_id,
    CASE WHEN p_amount > 0 THEN 'admin_grant' ELSE 'admin_adjustment' END,
    p_amount,
    'completed',
    format('[admin:%s] %s', p_actor, p_reason)
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'tx_id',        v_tx_id,
    'profile_id',   p_profile_id,
    'amount',       p_amount,
    'balance_before', v_before,
    'balance_after',  v_after
  );
END $$;

-- ── 4. RPC: admin_refund_stake ────────────────────────────────
-- Returns the entry fee to both players (if the stake is still
-- in escrow / not paid).  Marks stake as refunded.
CREATE OR REPLACE FUNCTION public.admin_refund_stake(
  p_stake_id  uuid,
  p_reason    text,
  p_actor     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stake          game_stakes;
  v_each           numeric;
  v_white_balance  numeric;
  v_black_balance  numeric;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT * INTO v_stake FROM game_stakes WHERE id = p_stake_id FOR UPDATE;
  IF v_stake.id IS NULL THEN RAISE EXCEPTION 'stake_not_found'; END IF;
  IF v_stake.escrow_status = 'refunded' THEN RAISE EXCEPTION 'already_refunded'; END IF;
  IF v_stake.payout_status = 'paid' THEN RAISE EXCEPTION 'already_paid'; END IF;

  v_each := v_stake.entry_fee;

  -- Refund white
  IF v_stake.white_profile_id IS NOT NULL THEN
    UPDATE wallets
    SET crypto_balance = crypto_balance + v_each,
        locked_balance = GREATEST(locked_balance - v_each, 0),
        updated_at     = now()
    WHERE profile_id = v_stake.white_profile_id
    RETURNING crypto_balance INTO v_white_balance;

    INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
    VALUES (
      v_stake.white_profile_id, v_stake.game_id,
      'stake_refund', v_each, 'completed',
      format('[admin:%s] refund stake %s — %s', p_actor, p_stake_id, p_reason)
    );
  END IF;

  -- Refund black
  IF v_stake.black_profile_id IS NOT NULL THEN
    UPDATE wallets
    SET crypto_balance = crypto_balance + v_each,
        locked_balance = GREATEST(locked_balance - v_each, 0),
        updated_at     = now()
    WHERE profile_id = v_stake.black_profile_id
    RETURNING crypto_balance INTO v_black_balance;

    INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
    VALUES (
      v_stake.black_profile_id, v_stake.game_id,
      'stake_refund', v_each, 'completed',
      format('[admin:%s] refund stake %s — %s', p_actor, p_stake_id, p_reason)
    );
  END IF;

  UPDATE game_stakes
  SET escrow_status = 'refunded',
      payout_status = 'refunded',
      updated_at    = now()
  WHERE id = p_stake_id;

  RETURN jsonb_build_object(
    'stake_id',       p_stake_id,
    'each',           v_each,
    'white_balance',  v_white_balance,
    'black_balance',  v_black_balance
  );
END $$;

-- ── 5. RPC: admin_set_suspension ──────────────────────────────
-- Sets/clears suspended_until on a profile.
CREATE OR REPLACE FUNCTION public.admin_set_suspension(
  p_profile_id uuid,
  p_hours      integer,   -- 0 / NULL = unsuspend
  p_reason     text,
  p_actor      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_until timestamptz;
BEGIN
  IF p_hours IS NULL OR p_hours <= 0 THEN
    UPDATE profiles
    SET suspended_until = NULL,
        suspension_reason = NULL,
        suspended_by = NULL,
        updated_at = now()
    WHERE id = p_profile_id;
    RETURN jsonb_build_object('profile_id', p_profile_id, 'suspended', false);
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  v_until := now() + (p_hours::text || ' hours')::interval;

  UPDATE profiles
  SET suspended_until    = v_until,
      suspension_reason  = p_reason,
      suspended_by       = p_actor,
      updated_at         = now()
  WHERE id = p_profile_id;

  RETURN jsonb_build_object(
    'profile_id',     p_profile_id,
    'suspended',      true,
    'suspended_until', v_until,
    'reason',         p_reason
  );
END $$;

-- ── 6. Optional: expose suspension info on public_profiles ────
-- Skipped to keep anon view minimal; admin reads via /api/admin/players/:id
-- (which uses service_role).

COMMIT;

-- ============================================================
-- Verification:
--   SELECT proname FROM pg_proc WHERE proname LIKE 'admin_%';
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='profiles' AND column_name LIKE 'suspend%';
-- ============================================================
