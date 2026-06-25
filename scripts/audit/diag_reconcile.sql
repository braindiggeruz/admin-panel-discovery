-- ============================================================
-- Shashki Royale · Admin Audit · Read-only diagnostic
-- File:  scripts/audit/diag_reconcile.sql
-- Goal:  Coin economy reconciliation. Run BEFORE applying the
--        Phase 0 REVOKE fix so the operator has a baseline; run
--        AGAIN after FIND-001 is closed so any further drift is
--        attributable to in-app operations only.
-- Touches: NOTHING. Read-only.
-- ============================================================

-- 1. Total supply
SELECT
  SUM(crypto_balance)::numeric AS total_balance,
  SUM(locked_balance)::numeric AS total_locked,
  SUM(total_won)::numeric      AS lifetime_won,
  SUM(total_lost)::numeric     AS lifetime_lost,
  COUNT(*)                      AS wallet_count
FROM wallets;

-- 2. Negative-state wallets (should be 0 in a healthy system)
SELECT COUNT(*) FILTER (WHERE crypto_balance < 0) AS neg_balance,
       COUNT(*) FILTER (WHERE locked_balance < 0) AS neg_locked
FROM wallets;

-- 3. Ledger sums by type (should reconcile to total supply movements)
SELECT type,
       COUNT(*)                  AS rows,
       SUM(amount)::numeric      AS sum_amount,
       MIN(amount)::numeric      AS min_amount,
       MAX(amount)::numeric      AS max_amount
FROM wallet_transactions
GROUP BY type
ORDER BY type;

-- 4. Admin grants without an audit row (FIND-001 / FIND-003 detection)
--    If FIND-001 was exploited, expect rows here.
SELECT wt.id, wt.profile_id, wt.amount, wt.type, wt.note, wt.created_at
FROM wallet_transactions wt
LEFT JOIN admin_audit_log aal
  ON aal.action IN ('grant_coin')
 AND aal.target_id = wt.profile_id::text
 AND aal.created_at BETWEEN wt.created_at - interval '1 minute'
                       AND wt.created_at + interval '1 minute'
WHERE wt.type IN ('admin_grant','admin_adjustment')
  AND aal.id IS NULL
ORDER BY wt.created_at DESC
LIMIT 200;

-- 5. Stake-refund / stake-lock pairing health
--    Each stake_refund row should pair with a prior stake_lock for the
--    same profile_id and same game_id with matching amount.
SELECT r.id AS refund_id, r.profile_id, r.game_id, r.amount,
       (SELECT COUNT(*) FROM wallet_transactions l
        WHERE l.type = 'stake_lock'
          AND l.profile_id = r.profile_id
          AND l.game_id   = r.game_id
          AND l.amount    = r.amount) AS matching_locks
FROM wallet_transactions r
WHERE r.type = 'stake_refund'
ORDER BY r.created_at DESC
LIMIT 200;

-- 6. Per-profile drift (balance vs sum of ledger).
--    A non-zero drift on a non-trivial sample suggests bugs or abuse.
SELECT w.profile_id,
       w.crypto_balance,
       COALESCE(SUM(wt.amount), 0)::numeric AS ledger_sum,
       (w.crypto_balance - COALESCE(SUM(wt.amount), 0))::numeric AS drift
FROM wallets w
LEFT JOIN wallet_transactions wt USING (profile_id)
GROUP BY w.profile_id, w.crypto_balance
HAVING ABS(w.crypto_balance - COALESCE(SUM(wt.amount), 0)) > 0
ORDER BY drift DESC
LIMIT 50;

-- 7. Orphan wallet_transactions whose profile no longer exists
SELECT COUNT(*) FROM wallet_transactions wt
LEFT JOIN profiles p ON p.id = wt.profile_id
WHERE p.id IS NULL;
