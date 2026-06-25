# Shashki Royale · Admin Panel — Database / RLS / RPC Audit

> Anchor files:
> [`supabase/admin.sql`](../../supabase/admin.sql) ·
> [`supabase/admin_sprint4.sql`](../../supabase/admin_sprint4.sql) ·
> live PostgREST behaviour (2026-06-25).

---

## 1. Sprint 4 — real production state

### 1.1 Are the three RPCs deployed?

| RPC                       | Live probe                                          | Conclusion |
| :------------------------ | :-------------------------------------------------- | :--------- |
| `admin_grant_coin`        | HTTP 409 with PG error `23503` (FK fail in `wallets`) | **DEPLOYED**, executable from anon |
| `admin_refund_stake`      | HTTP 400 with PG error `P0001 stake_not_found`      | **DEPLOYED**, executable from anon |
| `admin_set_suspension`    | HTTP 200, body `{"suspended":false,"profile_id":…}` | **DEPLOYED**, executable from anon; UPDATE on `profiles` succeeded |

(Full transcripts in [`ADMIN_AUDIT_EVIDENCE.md`](./ADMIN_AUDIT_EVIDENCE.md).)

So contrary to the handoff (§ 5.2: "SQL не применена в Supabase"), the
migration **was applied to production**. The handoff is stale.

### 1.2 Are the new `profiles` columns present?

Yes. `admin_set_suspension(hours=0)` succeeded with HTTP 200, executing
the unsuspend branch that does

```sql
UPDATE profiles SET suspended_until = NULL, suspension_reason = NULL, suspended_by = NULL ...
```

If the columns didn't exist the statement would 42703 (`column does not
exist`). It returned 200. ⇒ columns exist.

### 1.3 Are CHECK constraints on `wallet_transactions` still present?

**SUSPECTED gone.** The migration block at lines 20-31 and 44-55 drops
every constraint whose definition matches the regex `~* 'type'` or
`~* 'amount'`. The migration was applied (§ 1.1). The migration adds
back exactly one CHECK on `type`. No CHECK on `amount` is re-added.

We can't introspect `pg_constraint` from anon. Behavioural confirmation
attempt without writes is bounded; we did not insert into
`wallet_transactions` directly because we lack `service_role` and
forbid mutations.

→ **The repair migration must verify and explicitly reinstate
`amount` invariants** for non-admin types. See `FIND-004` Phase-0
repair plan below.

## 2. `FIND-001` — anonymous RPC execution (CRITICAL)

### 2.1 Why this works

`supabase/admin_sprint4.sql` issues:

```sql
CREATE OR REPLACE FUNCTION public.admin_grant_coin(...)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ ... $$;
GRANT EXECUTE ON FUNCTION public.admin_grant_coin(uuid, numeric, text, text) TO service_role;
```

PostgreSQL's default for `CREATE FUNCTION` is to grant `EXECUTE` to
`PUBLIC`. `GRANT ... TO service_role` is **additive**; it does **not**
revoke the implicit PUBLIC grant. Therefore the function is callable
by anyone who can hit Supabase REST with any JWT it accepts —
including the publishable `anon` key.

### 2.2 Direct evidence

```http
POST https://jsykbnkbrwwsxcdurzcw.supabase.co/rest/v1/rpc/admin_set_suspension
apikey: <anon>
authorization: Bearer <anon>
Content-Type: application/json

{"p_profile_id":"00000000-0000-0000-0000-000000000000","p_hours":0,"p_reason":"probe","p_actor":"probe"}
```

→

```http
HTTP/2 200
content-profile: public
content-range: 0-0/*
sb-project-ref: jsykbnkbrwwsxcdurzcw

{"suspended": false, "profile_id": "00000000-0000-0000-0000-000000000000"}
```

The function ran, attempted the UPDATE (no rows matched → no-op), and
returned successfully. *No JWT scope check, no role check, no audit
log row written.* In a normal call path (`/api/admin/players/.../
suspend` via CF Functions) all of those checks happen — but they are
not enforced by the database, only by the wrapper.

### 2.3 Immediate fix (`FIND-001` Phase 0)

```sql
-- File: supabase/repair_2026_06_phase0.sql
REVOKE ALL ON FUNCTION public.admin_grant_coin(uuid, numeric, text, text)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_refund_stake(uuid, text, text)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_suspension(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;

GRANT  EXECUTE ON FUNCTION public.admin_grant_coin(uuid, numeric, text, text)     TO service_role;
GRANT  EXECUTE ON FUNCTION public.admin_refund_stake(uuid, text, text)            TO service_role;
GRANT  EXECUTE ON FUNCTION public.admin_set_suspension(uuid, integer, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Post-fix verification (should all be HTTP 401/403 from anon):
-- curl -X POST $SUPA/rest/v1/rpc/admin_set_suspension -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '...'
```

Also patch `supabase/admin_sprint4.sql` to add the REVOKE block so the
next apply doesn't regress (`FIND-035`).

## 3. `FIND-004` — over-broad CHECK-constraint demolition (CRITICAL)

### 3.1 The exact dangerous block

`supabase/admin_sprint4.sql:20-31`:

```sql
FOR r IN
  SELECT conname FROM pg_constraint
  WHERE conrelid = 'public.wallet_transactions'::regclass
    AND contype  = 'c'
    AND pg_get_constraintdef(oid) ~* 'type'
LOOP
  EXECUTE format('ALTER TABLE public.wallet_transactions DROP CONSTRAINT %I', r.conname);
END LOOP;
```

…and the analogous block at lines 44-55 for `'amount'`.

### 3.2 Why it's dangerous

- `pg_get_constraintdef(oid) ~* 'type'` matches *any* constraint whose
  definition mentions the word *type* (case-insensitive, anywhere in
  the string). This includes future constraints with column names
  like `payout_type`, `match_type`, or even comments embedded in the
  definition. The single-replacement `wallet_transactions_type_check`
  reinstated afterwards covers only the `type` enum.
- `pg_get_constraintdef(oid) ~* 'amount'` is even worse: there is no
  replacement at all. **Every** invariant about any column whose name
  contains `amount` (including `entry_fee` constraints if they were
  written as `amount > 0`, or `amount_credited >= 0` on a hypothetical
  future LTC table referencing `wallet_transactions`) is dropped.

The intent (per inline comment) was to allow `admin_adjustment` to be
negative. The right way is to **target the constraint by name** or to
**replace the constraint with a more precise definition**:

```sql
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_amount_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_amount_check
    CHECK (
      amount <> 0
      AND (
        (type IN ('admin_adjustment')) OR
        (amount > 0)
      )
    );
```

(Plus appropriate carve-outs for legitimate-negative types if any.)

### 3.3 Phase-0 diagnostic (no writes)

`scripts/audit/diag_constraints.sql` (added by this audit, run via
Supabase SQL Editor):

```sql
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.wallet_transactions'::regclass
  AND contype = 'c'
ORDER BY conname;
```

Inspecting the result determines exactly what is currently missing.
The repair migration is shaped around that diagnostic, not blindly
re-applied.

## 4. `FIND-003` — non-atomic idempotency (CRITICAL)

### 4.1 Code path

`functions/api/[[path]].ts:261-311` (grant), `:326-375` (refund),
`:395-450` (suspend) all follow this pattern:

```
SELECT admin_audit_log WHERE idempotency_key = X
   ↓
POST RPC (mutates wallet / stake / profile)
   ↓
INSERT admin_audit_log (status, idempotency_key, ...)
```

### 4.2 Failure scenarios

| Scenario                                                          | Effect                                  |
| :---------------------------------------------------------------- | :-------------------------------------- |
| RPC succeeds, audit INSERT fails (network/Supabase 5xx)            | Retry → SELECT still finds nothing → RPC runs **again** → double mutation. |
| Two parallel requests with same idem key                          | Both SELECT first → both miss → both run RPC → race; one INSERT may fail unique, the other wins. **Two mutations, one audit row.** |
| RPC fails, audit insert with `status=failed` succeeds              | Retry SELECTs and finds the failed row → returns 409 `duplicate_request`. **Correct user can't retry legitimately.** |
| Idempotency key collision across actors                            | UNIQUE index is on `(actor_id, idempotency_key)`. But the worker never sets `actor_id`, so column is always NULL. Index becomes `(NULL, key)` which is treated as not equal under NULL-distinct semantics → **uniqueness is unenforced**. |

### 4.3 Required architecture

1. Move the idempotency check *and* the mutation *and* the audit
   insert into a single SQL function (or a single transaction).
2. Add a dedicated `admin_operations` table:
   ```sql
   CREATE TABLE admin_operations (
     idempotency_key uuid PRIMARY KEY,
     actor_email     text NOT NULL,
     action          text NOT NULL,
     target_kind     text NOT NULL,
     target_id       text NOT NULL,
     amount          numeric,
     reason          text NOT NULL,
     status          text NOT NULL CHECK (status IN ('succeeded','failed')),
     result          jsonb,
     created_at      timestamptz NOT NULL DEFAULT now()
   );
   ```
3. Each `admin_*` RPC takes the idempotency key as first parameter
   and does:
   ```sql
   INSERT INTO admin_operations (...) VALUES (...) ON CONFLICT (idempotency_key) DO NOTHING;
   IF NOT FOUND THEN
     SELECT result INTO v_result FROM admin_operations WHERE idempotency_key = p_key;
     RETURN v_result;
   END IF;
   -- ... do the mutation ...
   UPDATE admin_operations SET status='succeeded', result=v_payload WHERE idempotency_key = p_key;
   ```
4. The audit log becomes a **trigger** on `admin_operations`, not a
   wrapper INSERT.

This makes mutation + ledger + audit a single, replayable, atomic
record.

## 5. `admin_users` table review

| Column            | Defined in `admin.sql`     | Used anywhere?                |
| :---------------- | :------------------------- | :----------------------------- |
| `id`              | PK                         | only referenced by FK on `admin_audit_log.actor_id`, never written |
| `email`           | UNIQUE NOT NULL            | never read                     |
| `password_hash`   | NOT NULL                   | never read; worker uses env    |
| `totp_secret`     | nullable                   | never read; **MFA dormant**    |
| `role`            | CHECK enum                 | never read                     |
| `is_active`       | NOT NULL DEFAULT true      | never read                     |
| `last_login_at`   | nullable                   | never updated                  |
| `last_login_ip`   | nullable                   | never updated                  |

This is finding `FIND-026` (HIGH). The schema *exists*; the code
*declines to use it*. A future fix must:

1. Seed exactly one row matching the env owner.
2. Move authentication to read from this table.
3. Honor `is_active`.
4. Update `last_login_at` / `last_login_ip`.
5. Set `admin_audit_log.actor_id` correctly on every insert so the
   UNIQUE index has a meaningful scope.

## 6. RLS verification matrix (anon)

Probed 2026-06-25 from anon JWT extracted from public bundle.

| Table / RPC                        | Anon access                       | Verdict     |
| :--------------------------------- | :-------------------------------- | :---------- |
| `public_profiles` (view)           | 200, rows visible                 | Expected    |
| `profiles`                          | 200, empty array                  | OK (RLS deny ⇒ empty) |
| `wallets`                           | 200, empty array                  | OK          |
| `wallet_transactions`               | 200, empty array                  | OK          |
| `game_stakes` (not directly probed) | n/a                               | SUSPECTED   |
| `admin_audit_log`                   | 200, empty array                  | OK          |
| `admin_users`                       | 200, empty array                  | OK          |
| RPC `admin_grant_coin`              | 409 (executed, FK error)          | **VIOLATION (FIND-001)** |
| RPC `admin_refund_stake`            | 400 (executed, P0001)             | **VIOLATION** |
| RPC `admin_set_suspension`          | 200 (executed UPDATE)             | **VIOLATION** |

> Important: an empty `200 []` from an anon client could in theory be
> caused by an empty table, not by RLS deny. For tables guaranteed
> non-empty in production (`profiles`, `wallets`) the empty response
> is strong evidence of RLS-default-deny. We chose not to add a
> `Prefer: count=exact` probe because some Supabase configurations
> return `count=*` even under deny, conflating evidence.

## 7. Realtime publication — `FIND-016` SUSPECTED

`src/components/LiveFeed.tsx` and `src/lib/realtime.ts` subscribe to
Supabase Realtime over the anon key. Without DB access we cannot list
the `supabase_realtime` publication contents. Risk:

- If `wallet_transactions` is in the publication, any client can
  stream all wallet activity in real time, including admin grants
  with the `[admin:owner@damkaroyal.app] …` `note` field.
- If `profiles` is in the publication, suspended/unsuspended changes
  leak.

**Fix path**: limit Realtime publication to safe projections only
(e.g., `public_profiles`-style views). Confirm in Supabase Studio:

```sql
SELECT pubname, schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';
```

## 8. Recommendations summary (DB-only)

| Phase | SQL action                                                             |
| :---: | :--------------------------------------------------------------------- |
|  0    | REVOKE EXECUTE on three admin RPCs from PUBLIC + anon + authenticated   |
|  0    | Patch `supabase/admin_sprint4.sql` to add the REVOKE block              |
|  0    | Run `scripts/audit/diag_constraints.sql` to list missing constraints    |
|  1    | Write `supabase/repair_2026_06_phase1.sql` to reinstate `amount` invariants |
|  1    | Introduce `admin_operations` table + rewrite RPCs to be self-idempotent |
|  1    | Seed `admin_users`; switch auth to read from it; remove env hash       |
|  2    | Move audit log to a trigger on `admin_operations`                       |
|  2    | Confirm Realtime publication contents; restrict to safe views          |
|  3    | Build a least-privileged DB role between `anon` and `service_role`     |
