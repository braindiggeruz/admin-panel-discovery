# Shashki Royale · Admin Panel — Test Gap Analysis

> Scope: existing tests, missing tests, recommended test pyramid,
> audit-added scripts.

---

## 1. Existing tests

```
$ find . -type d -name '__tests__' -o -name 'test' -o -name 'tests' \
       | grep -v node_modules
./tests/audit                                # NEW: added by this audit
```

```
$ rg -l "test\(|describe\(|expect\(" src functions
(nothing)
```

There are **no unit tests, no integration tests, no E2E tests,
no `vitest`/`jest` config, no Playwright** in this repository.

`package.json` `scripts` block:

```json
"dev": "vite",
"build": "tsc -b && vite build",
"preview": "vite preview",
"lint": "eslint ."
```

No `test`, no `typecheck`, no `coverage`. `eslint` is declared but no
`eslintrc` configuration file is present (default rules only).

## 2. CI test execution

There is no CI to run anything (`.github/workflows/` empty). The audit
branch ships harmless tests in `tests/audit/` that can be wired into CI
during Phase 2.

## 3. Audit-added safe checks

The audit adds the following **non-destructive** files (all in
`tests/audit/` or `scripts/audit/`):

| Path                                            | Purpose                                          | Touches prod? |
| :---------------------------------------------- | :----------------------------------------------- | :------------ |
| `scripts/audit/probe_prod.sh`                   | Re-runs the live HTTP probes recorded as evidence | Read-only     |
| `scripts/audit/probe_anon_rpc.sh`               | Confirms FIND-001 RPC-from-anon vulnerability     | Read-only (FK-error path); does **not** mutate real data |
| `scripts/audit/diag_constraints.sql`            | Reads `pg_constraint` for `wallet_transactions`    | Read-only SQL  |
| `scripts/audit/diag_grants.sql`                 | Reads grants on `admin_*` functions               | Read-only SQL  |
| `scripts/audit/diag_reconcile.sql`              | Coin reconciliation queries                       | Read-only SQL  |
| `scripts/audit/repair_phase0_template.sql`      | Template REVOKE+REGRANT migration (NOT auto-applied) | Read-only file |
| `tests/audit/test_health_no_leak.spec.md`       | Acceptance spec for `/api/health` info-leak fix    | Spec only      |
| `tests/audit/test_login_timing.spec.md`          | Acceptance spec for timing oracle fix             | Spec only      |
| `tests/audit/test_idempotency_atomicity.spec.md` | Acceptance spec for atomic idempotency           | Spec only      |
| `tests/audit/test_rpc_revoke.spec.md`             | Acceptance spec for `FIND-001` REVOKE fix        | Spec only      |

> The spec files describe the **acceptance criteria and test commands**
> for fixes. They do not silently execute anything. They are intended
> to be converted into `vitest`/`miniflare`/`playwright` tests in
> Phase 2.

## 4. Recommended test pyramid (Phase 2 deliverable)

```
       ┌───────────────────────┐
       │  E2E (Playwright)     │     5 critical flows: login, grant, refund, suspend, audit
       ├───────────────────────┤
       │  Integration (vitest) │    ~20 cases: /api/* + Supabase mock or staging DB
       │  + miniflare workers  │
       ├───────────────────────┤
       │  Unit (vitest)        │    ~50 cases: jwt sign/verify, pbkdf2, validators
       └───────────────────────┘
```

### Mandatory cases before Phase 1 sign-off

| Area                | Case                                                       |
| :------------------ | :--------------------------------------------------------- |
| Auth                | Login wrong email vs wrong password — **same latency**     |
| Auth                | 5+ wrong logins → 429                                       |
| Auth                | Expired JWT → 401                                          |
| Auth                | Tampered JWT signature → 401                                |
| Auth                | Token from `JWT_SECRET` version 1 invalid after rotation    |
| Auth                | `admin_users.is_active=false` → 401                         |
| RPC perms           | Anon call to `admin_grant_coin` → 401/403 (after FIND-001 fix) |
| RPC perms           | Anon call to `admin_refund_stake` → 401/403                |
| RPC perms           | Anon call to `admin_set_suspension` → 401/403              |
| Idempotency         | Same key, two parallel grant requests → 1 mutation, 1 audit |
| Idempotency         | Same key, second call after first success → returns cached result |
| Idempotency         | RPC succeeded + audit-insert failed → retry returns cached, no second mutation |
| Validation          | `grant-coin` amount `NaN` / `Infinity` → 400                |
| Validation          | `grant-coin` amount > 1e6 → 400                             |
| Validation          | `grant-coin` reason < 3 chars → 400                         |
| Validation          | `players/<not-a-uuid>` → 400                                |
| Health              | `/api/health` returns only `{ ok: true }`                   |
| Security headers    | Response includes CSP, HSTS, COOP                           |
| Source map          | `/assets/*.map` returns 404                                 |
| CSV                 | Nickname starting with `=` is prefixed `'` in export        |
| RLS                 | Anon SELECT on `wallets` returns 0 rows                     |
| Realtime            | Anon cannot subscribe to `wallet_transactions`              |

## 5. Coverage targets

| Phase | Target              | Notes                                  |
| :---: | :------------------ | :------------------------------------- |
|  1    | 0% → 60% on `functions/api/*` | unit + integration via miniflare |
|  2    | 60% → 80%           | E2E added                              |
|  3    | 80% → 90%           | mutation testing (stryker) optional    |
