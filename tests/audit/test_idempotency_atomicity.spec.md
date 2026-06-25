# Test spec — FIND-003 / FIND-013 atomic idempotency

## Goal

A single logical admin operation (grant/refund/suspend) executes at
most once, regardless of:

1. Network retries on the same idempotency key.
2. Two parallel calls with the same idempotency key.
3. RPC succeeding but audit-log write failing.

## Setup

Use staging or a dedicated test profile (see roadmap Phase 2.1).
Provision an `admin_operations` table per ADMIN_DATABASE_RLS_RPC_AUDIT.md
§ 4.3. Wire the RPCs to record their idempotency_key on first call.

## Test cases

### Case A — sequential retry

1. POST `/api/admin/players/<test_id>/grant-coin` with `idempotency_key=K`, amount=10.
2. Confirm `wallets.crypto_balance` increased by 10.
3. POST the same body again (same key).
4. Confirm response equals first response.
5. Confirm `wallets.crypto_balance` increased by 10 (NOT 20).
6. Confirm only one row in `admin_operations` (and one in audit log).

### Case B — parallel retry

1. Issue two concurrent POSTs with the same `idempotency_key=K2`.
2. Both must return the same response body.
3. `wallets.crypto_balance` increased by amount once.

### Case C — audit failure simulation (staging only)

Use a feature flag or interceptor to inject a transient failure in
the audit log insert path after the RPC has committed.

1. POST grant-coin with key K3.
2. Audit insert fails.
3. Client retries with key K3.
4. Response equals the first attempt's would-be response.
5. Wallet balance increased exactly once.

## Acceptance criteria

- Across all three cases: **one** mutation, **one** ledger row in
  `admin_operations`, **one** audit log entry, repeatable response.
- Negative test: changing any field in the body while keeping the
  same idempotency key yields a documented error
  (`idempotency_conflict` 422 / 409).
