# Shashki Royale · Admin Panel — Coin Ledger Audit

> Scope: Economy correctness, reconciliation surface, ledger integrity,
> idempotency, and the implications of `FIND-001`/`FIND-003`/`FIND-004`
> for the operator-side economy.

---

## 1. Coin model recap

| Table                  | Role                                            |
| :--------------------- | :---------------------------------------------- |
| `wallets`              | Per-profile balance: `crypto_balance`, `locked_balance` |
| `wallet_transactions`  | Append-only ledger (in intent); `type` enum, `amount`, `note` |
| `game_stakes`          | Escrow state per staked match: `entry_fee`, `pot_amount`, `escrow_status`, `payout_status` |

Invariant intent (per migrations + game logic):

1. `wallets.crypto_balance ≥ 0` (no overdraft).
2. `wallets.locked_balance ≥ 0`.
3. `sum(wallet_transactions WHERE profile_id = X) ≈ wallets.crypto_balance` modulo opening balances.
4. Stake lifecycle: `waiting → locked → (paid | refunded)`.

## 2. Headline economy risks

### 2.1 `FIND-001` — operator-funds-killer

Direct anonymous calls to `admin_grant_coin` can credit arbitrary
amounts to any *existing* `profile_id`. The RPC itself enforces:

```sql
IF p_amount IS NULL OR p_amount = 0 THEN RAISE EXCEPTION 'amount_required';
IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'reason_required';
…
IF v_after < 0 THEN RAISE EXCEPTION 'insufficient_balance';
```

But **no upper bound**, **no actor identity check**, **no audit log
entry**. The 1-million amount cap (`functions/api/[[path]].ts:253`)
lives in the CF Function wrapper only.

**Forensic ask**: after the REVOKE fix lands, the operator should
diff `wallets.crypto_balance` vs `sum(wallet_transactions.amount)`
per profile to detect prior abuse. The audit cannot run this without
read access; the diagnostic script is included as
`scripts/audit/diag_reconcile.sql` (read-only).

### 2.2 `FIND-003` — split-brain idempotency double-credit

See [`ADMIN_DATABASE_RLS_RPC_AUDIT.md` § 4](./ADMIN_DATABASE_RLS_RPC_AUDIT.md#4-find-003--non-atomic-idempotency-critical).
Wallet can be debited or credited *more than once* per logical action.

### 2.3 `FIND-004` — invariant erosion

After the Sprint 4 migration, `wallet_transactions.amount` has **no
positivity constraint** anywhere. Effects:

- `deposit` transactions can be negative (silent withdrawal).
- `prize_payout` can be negative (silent debit).
- Bug-elicited negative `stake_lock` could now insert as data without
  the DB rejecting.
- Reconciliation tooling that previously assumed non-negative amounts
  for non-admin types will produce misleading "looks-clean" outputs.

### 2.4 `FIND-036` — refund stake silently zero-floors `locked_balance`

`supabase/admin_sprint4.sql:146-148`:

```sql
locked_balance = GREATEST(locked_balance - v_each, 0)
```

If `locked_balance < v_each` the refund still appears to succeed and
returns the new `crypto_balance`. That is **wrong**: a refund where
the locked balance wasn't actually locked indicates either
(a) the upstream `stake_lock` flow misfired or
(b) the funds were already released to the other side
(`payout_status='paid'` is checked, but escrow side can drift).

Recommended behaviour: `RAISE EXCEPTION 'locked_balance_inconsistent'`
and surface that to the admin for manual reconciliation, instead of
papering over with `GREATEST`.

### 2.5 `FIND-037` — refund stake credits crypto without checking lock

```sql
UPDATE wallets
SET crypto_balance = crypto_balance + v_each,
    locked_balance = GREATEST(locked_balance - v_each, 0)
WHERE profile_id = v_stake.white_profile_id;
```

The refund adds `v_each` to `crypto_balance` regardless of whether
that amount was ever in `locked_balance`. In a healthy lifecycle the
amount moves from `locked → crypto`, but here it's "credit `v_each` to
crypto, *try* to reduce locked". If the lock never happened (because
the stake row was created without the corresponding `stake_lock`
transaction), the refund mints free Coin.

This is the **same class of bug** as `FIND-001` but reachable only
once `admin_refund_stake` is properly access-controlled.

### 2.6 `FIND-038` — naming: `crypto_balance` for non-crypto Coin

The internal Coin has no monetary value (handoff § 5.1 confirms
test-data cleanup; § 6 Sprint 7 describes the *aspirational* LTC
on-ramp). Using `crypto_balance` for a non-crypto asset:

- Misleads operators and any external integrators.
- Creates accidental regulatory exposure if a regulator interprets
  "crypto" claims as a fact.
- Pre-emptively conflates with the (deferred) LTC on-ramp.

Recommend a planned rename to `coin_balance` via:

```sql
ALTER TABLE wallets RENAME COLUMN crypto_balance TO coin_balance;
-- update all referring code/RPCs in one PR
```

(Tag: Phase 4; not urgent compared to security work.)

## 3. Reconciliation surface

The audit cannot execute these without DB access. They are committed
as part of this branch under `scripts/audit/diag_reconcile.sql` for
the operator to run.

| Query                                                                                         | Purpose                                       |
| :-------------------------------------------------------------------------------------------- | :-------------------------------------------- |
| `SELECT SUM(crypto_balance), SUM(locked_balance) FROM wallets;`                                | Total supply                                  |
| `SELECT COUNT(*) FROM wallets WHERE crypto_balance < 0;`                                       | Negative balances (should be 0)               |
| `SELECT COUNT(*) FROM wallets WHERE locked_balance < 0;`                                       | Negative lock                                 |
| `SELECT type, COUNT(*), SUM(amount) FROM wallet_transactions GROUP BY type ORDER BY 1;`        | Ledger by type                                |
| Per-profile drift (see script)                                                                 | `crypto_balance` vs sum of ledger             |
| Stake/ledger mismatch (refunded stakes with no `stake_refund` rows, etc.)                      | Detect orphaned `FIND-001` abuse               |
| `SELECT COUNT(*) FROM wallet_transactions WHERE type = 'admin_grant' AND profile_id NOT IN (SELECT id FROM profiles);` | Orphaned grants                  |

## 4. Idempotency redesign (target architecture)

> Discussed in detail in
> [`ADMIN_DATABASE_RLS_RPC_AUDIT.md` § 4.3](./ADMIN_DATABASE_RLS_RPC_AUDIT.md#43-required-architecture).
> Restated here in economy-impact terms.

The Holy properties for the economy:

| Property                                                                                  | Today | After fix |
| :---------------------------------------------------------------------------------------- | :---: | :-------: |
| Same idempotency key → same observable wallet state                                       |  No   |   Yes     |
| Same idempotency key → never more than one mutation                                        |  No   |   Yes     |
| Failed mutation → no audit "success" row                                                  | Mostly | Yes      |
| Mutation succeeded → audit row exists                                                     |  No (audit may fail) | Yes |
| Mutation can be replayed safely                                                            |  No   |   Yes     |
| Mutation success or failure visible in a single ledger table                              |  No   |   Yes     |

## 5. Roadmap (economy slice)

| Phase | Action                                                                       |
| :---: | :--------------------------------------------------------------------------- |
| 0     | REVOKE EXECUTE (closes `FIND-001` for the economy)                            |
| 0     | Add `scripts/audit/diag_reconcile.sql` and run it; produce baseline           |
| 1     | Replace `wallet_transactions.amount` constraint with type-aware one          |
| 1     | Migrate RPC pattern to `admin_operations` ledger + DB-level idempotency       |
| 2     | Build reconciliation cron + alerting on drift                                |
| 2     | Refactor `admin_refund_stake` to *require* matching `stake_lock` row         |
| 3     | Rename `crypto_balance` → `coin_balance`; remove legal-color naming           |
| 3     | Add per-actor daily cap on `admin_grant_coin` (e.g., enforce in DB)          |
