# Shashki Royale · Admin Panel — API Audit

> One-pass route inventory for `functions/api/[[path]].ts` plus
> targeted abuse cases. Each row is sourced from a specific code
> location.

---

## 1. Inventory

| Verb | Route                                       | Auth | Validation                                     | Rate-limit | Idempotency | Audit row                          | DB action                              | Findings |
| :--- | :------------------------------------------ | :--- | :--------------------------------------------- | :--------- | :---------- | :--------------------------------- | :------------------------------------- | :------- |
| GET  | `/api/health`                               | —    | —                                              | none       | n/a         | none                               | none                                   | FIND-009 |
| OPTIONS | any                                      | —    | —                                              | none       | n/a         | none                               | none                                   | FIND-015 (`*` ACAO) |
| POST | `/api/auth/login`                           | —    | email+password presence                        | **none**   | n/a         | login_success / login_failed       | none                                   | FIND-007, FIND-008 |
| GET  | `/api/auth/me`                              | JWT  | JWT only                                       | none       | n/a         | none                               | none                                   | — |
| GET  | `/api/admin/players/:id`                     | JWT  | **no UUID validation**                         | none       | n/a         | view_player                        | 4× SELECT                              | FIND-019 |
| GET  | `/api/admin/players/:id/audit`               | JWT  | no UUID validation                             | none       | n/a         | none                               | SELECT audit_log                        | FIND-019, FIND-039 (no actor scoping) |
| POST | `/api/admin/players/:id/grant-coin`          | JWT  | amount finite, ≠0, abs≤1e6; reason≥3            | none       | header SELECT then race | grant_coin (success/failed) | RPC + audit INSERT                    | FIND-003, FIND-019, FIND-001 (DB side) |
| POST | `/api/admin/stakes/:id/refund`               | JWT  | reason≥3                                       | none       | header SELECT then race | refund_stake               | RPC + audit INSERT                    | FIND-003, FIND-001 |
| POST | `/api/admin/players/:id/suspend`             | JWT  | reason≥3 *only* when hours>0; hours≤8760       | none       | header SELECT then race | suspend_player / unsuspend_player | RPC + audit INSERT             | FIND-003, FIND-001, FIND-020 (no game enforcement) |
| GET  | `/api/admin/wallets/summary`                 | JWT  | —                                              | none       | n/a         | view_wallets_summary              | 2× SELECT (one unbounded)              | FIND-021 |
| GET  | `/api/admin/transactions/recent?limit=N`     | JWT  | **no upper bound on `limit`**                  | none       | n/a         | view_transactions_recent           | SELECT wallet_transactions             | FIND-022 |
| GET  | `/api/admin/transactions/by-type`            | JWT  | hardcoded LIMIT 10000                         | none       | n/a         | none (missing)                     | SELECT + in-memory aggregation         | FIND-023 |

## 2. Selected findings (deep dives)

### FIND-019 (HIGH) — Path parameters propagate into PostgREST filter strings unsanitised

Line 217:

```ts
sb(env, `/rest/v1/game_stakes?or=(white_profile_id.eq.${pid},black_profile_id.eq.${pid})&order=created_at.desc&limit=25`)
```

`pid` comes from `route.match(/^\/admin\/players\/([^/]+)$/)[1]`. The
regex permits anything that isn't `/`, including `,`, `)`, `:` and
percent-encoded sequences. While Cloudflare Functions provide a
*decoded* URL pathname, an attacker can encode `%2C`/`%29` to inject
PostgREST filter syntax (e.g., to expand the `or=` clause to other
columns). The risk is bounded because the connection runs under
`service_role` and the only thing leaked is currently-readable data
to the same authenticated admin — but it is still a missed defence.

**Fix:** validate `pid` with a UUID regex *before* using it in any
PostgREST URL:

```ts
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID.test(pid)) return json({error:"bad_id"},{status:400});
```

Apply at every `playerMatch[1]`, `auditMatch[1]`, `grantMatch[1]`,
`refundMatch[1]`, `suspendMatch[1]`.

### FIND-021 (MEDIUM) — `/admin/wallets/summary` does a full `wallets` scan

Line 458:

```ts
sb(env, "/rest/v1/wallets?select=crypto_balance,locked_balance,total_won,total_lost"),
```

No `limit`. With 100k wallets this becomes a multi-MB response, an
edge-CPU cost, and a memory blowout in the reduce. Replace with a
SQL aggregate exposed as a `SECURITY DEFINER` function:

```sql
CREATE OR REPLACE FUNCTION admin_wallets_totals()
RETURNS TABLE (balance numeric, locked numeric, won numeric, lost numeric, wallet_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(crypto_balance),0), COALESCE(SUM(locked_balance),0),
         COALESCE(SUM(total_won),0),       COALESCE(SUM(total_lost),0),
         COUNT(*)
  FROM wallets;
$$;
REVOKE ALL ON FUNCTION admin_wallets_totals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_wallets_totals() TO service_role;
```

### FIND-022 (MEDIUM) — `/admin/transactions/recent?limit=N` accepts unbounded `N`

Line 491:

```ts
const limit = url.searchParams.get("limit") ?? "50";
```

The string is passed straight into the URL. PostgREST will accept
`limit=100000`. A logged-in admin can OOM the CF Function memory
(128 MB limit). Recommend `const lim = Math.min(Math.max(parseInt(limit||"50",10) || 50, 1), 500);`.

### FIND-023 (MEDIUM) — `/admin/transactions/by-type` in-memory grouping over 10k rows

Line 515:

```ts
sb(env, "/rest/v1/wallet_transactions?select=type,amount&limit=10000")
```

Today's pragmatic ceiling, but as ledger grows beyond 10k transactions
the totals lie quietly. Move to a SQL group-by exposed as
`admin_tx_by_type()`. Also: no audit row is written for this endpoint
even though it's structurally a "view sensitive economy data" action.
(`FIND-039` — incomplete audit coverage.)

### FIND-039 (MEDIUM) — Audit coverage gaps

The following endpoints **do not** insert into `admin_audit_log`:

- `/api/auth/me`
- `/api/admin/players/:id/audit` (the very act of reading the audit log)
- `/api/admin/transactions/by-type`

Recommend: insert audit rows for *every* sensitive-read endpoint, even
GET. Reading the audit log of a player is itself an admin action and
should be loggable.

### FIND-040 (HIGH) — `actor_ip` only captured on login

`audit()` helper (`functions/api/[[path]].ts:114-124`) doesn't accept
`actor_ip` as a default; only the `/auth/login` path passes it
explicitly. All later audit rows have `actor_ip = NULL`. Fix:

```ts
async function audit(env: Env, req: Request, data: ...) {
  const ip = req.headers.get("cf-connecting-ip") ?? null;
  await sb(env, "/rest/v1/admin_audit_log", { ..., body: JSON.stringify({ status:"success", actor_ip: ip, ...data }) });
}
```

…and pass `req` everywhere.

Also: `cf-connecting-ip` is set by Cloudflare's edge. For requests
that bypass CF (direct origin pull) the header can be spoofed. With
Pages Functions the origin is CF itself, so spoofing requires
breaking the platform — but still write a defence-in-depth note.

### FIND-041 (MEDIUM) — Error leak in 500 path

Line 533-534:

```ts
return json({ error: "internal", message: String(err) }, { status: 500 });
```

Raw error text from PostgREST / Supabase can include SQL fragments,
column names, even data. Replace with:

```ts
console.error("internal", err);
return json({ error: "internal", request_id: ctx.request.headers.get("cf-ray") ?? null }, { status: 500 });
```

…and surface `cf-ray` to the client only.

### FIND-042 (MEDIUM) — `apiFetch` swallows non-401 errors

`src/services/auth.ts:66-77`:

```ts
async function apiFetch(path: string): Promise<unknown> {
  ...
  if (r.status === 401) { clearSession(); throw new Error("unauthorized"); }
  return r.json();
}
```

For 4xx/5xx other than 401, the function returns the (possibly error)
JSON as if it were data. Calling code then renders an error blob as
"successful data". Fix:

```ts
if (!r.ok) {
  const body = await r.json().catch(() => ({}));
  throw new Error(body?.error || `http_${r.status}`);
}
```

### FIND-043 (LOW) — `apiFetch` doesn't handle network failure typed

`fetch` rejects without `r.status`. Caller sees `TypeError`. Wrap in
try/catch and rethrow `network_error`.

## 3. Router architecture observation (informational)

The entire backend lives in a single 537-line file. Coupling is high;
adding tests requires reshaping it. Splitting recommendation:

```
functions/api/[[path]].ts             ← keeps router + auth gate
functions/api/_lib/jwt.ts             ← jwt sign/verify
functions/api/_lib/pbkdf2.ts          ← verifyPassword
functions/api/_lib/supabase.ts        ← sb() helper
functions/api/_lib/audit.ts           ← audit() helper
functions/api/_lib/validate.ts        ← UUID, amount, reason validators
functions/api/_routes/auth.ts
functions/api/_routes/players.ts
functions/api/_routes/economy.ts
```

Not strictly necessary, but tests can then exercise pure functions in
isolation. (Tag: Phase 2.)
