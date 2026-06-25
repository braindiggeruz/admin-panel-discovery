# Shashki Royale · Admin Panel — Audit Evidence

> Raw transcripts of every live probe performed during the audit.
> Captured 2026-06-25 (UTC) against
> `https://shashki-royale-admin.pages.dev` and
> `https://jsykbnkbrwwsxcdurzcw.supabase.co`.
>
> **No mutations performed.** All probes used either no auth, an
> invalid token, or the publishable `anon` key extracted from the
> production browser bundle.

---

## 1. `GET /api/health`

```
HTTP/2 200
date: Thu, 25 Jun 2026 09:24:39 GMT
content-type: application/json
content-length: 200
cache-control: no-store
server: cloudflare

{"ok":true,
 "ts":"2026-06-25T09:24:39.827Z",
 "supabase":"https://jsykbnkbrwwsxcdurzcw.supabase.co",
 "admin_email":"owner@damkaroyal.app",
 "has_service_role":true,
 "has_jwt_secret":true,
 "has_pwd_hash":true}
```

→ supports `FIND-009`.

## 2. `HEAD /` (admin root)

```
HTTP/2 200
content-type: text/html; charset=utf-8
access-control-allow-origin: *
cache-control: no-store, must-revalidate
permissions-policy: geolocation=(), microphone=(), camera=()
referrer-policy: same-origin
x-content-type-options: nosniff
x-frame-options: DENY
x-robots-tag: noindex, nofollow
server: cloudflare
```

→ supports `FIND-014` (no CSP/HSTS/COOP), `FIND-015` (CORS `*`).

## 3. `GET /api/auth/me` (no token)

```
HTTP/2 401
cache-control: no-store
{"error":"unauthorized"}
```

→ baseline OK. Confirms auth middleware works.

## 4. `GET /api/auth/me` (`Authorization: Bearer not.a.jwt`)

```
HTTP/2 401
{"error":"unauthorized"}
```

→ JWT verify rejects malformed token.

## 5. `GET /api/admin/wallets/summary` (no token)

```
HTTP/2 401
{"error":"unauthorized"}
```

## 6. Source map exposure

```
$ curl -o /dev/null -w "%{http_code}\n" https://shashki-royale-admin.pages.dev/assets/index-8GqLdxc4.js.map
200
```

→ confirms `FIND-005` (TS source publicly downloadable).

## 7. Anon-bundle key extracted from public JS

```
Main JS: /assets/index-8GqLdxc4.js
ANON key extracted from public bundle: length=208
```

(Value redacted from this document — anon key is meant to be public,
but we still avoid pasting it.)

## 8. **`POST /rest/v1/rpc/admin_grant_coin`** (anon, fake UUID) — `FIND-001`

```
HTTP/2 409
proxy-status: PostgREST; error=23503
sb-project-ref: jsykbnkbrwwsxcdurzcw

{"code":"23503",
 "details":"Key (profile_id)=(00000000-0000-0000-0000-000000000000) is not present in table \"profiles\".",
 "hint":null,
 "message":"insert or update on table \"wallets\" violates foreign key constraint \"wallets_profile_id_fkey\""}
```

**Interpretation**: the function ran past every authorization and
validation check and reached the SQL statement that inserts into
`wallets`. The only thing that stopped it was a foreign-key
violation because the profile_id we used was fictitious. A real
profile_id would have minted Coin.

## 9. **`POST /rest/v1/rpc/admin_refund_stake`** (anon, fake UUID) — `FIND-001`

```
HTTP/2 400
proxy-status: PostgREST; error=P0001

{"code":"P0001","details":null,"hint":null,"message":"stake_not_found"}
```

**Interpretation**: function executed; raised the
`RAISE EXCEPTION 'stake_not_found'` from inside its body. Function is
callable from anon.

## 10. **`POST /rest/v1/rpc/admin_set_suspension`** (anon, fake UUID, hours=0) — `FIND-001`

```
HTTP/2 200
content-profile: public
content-range: 0-0/*

{"suspended": false, "profile_id": "00000000-0000-0000-0000-000000000000"}
```

**Interpretation**: function executed end-to-end, including the
UPDATE on `profiles`. Because no row matched the fake UUID it was a
no-op; with a real UUID it would have updated `suspended_until` /
`suspension_reason` / `suspended_by`. Anon can mass-suspend or
mass-unsuspend players.

> This is the most damning evidence in the audit. The path
> `frontend → CF Function → service_role → RPC` exists, but in
> parallel the path `anyone → anon → RPC` also exists and yields
> 200.

## 11. RLS sanity probes

### 11.1 `public_profiles` (anon)

```
HTTP/2 200
content-length: 2
content-range: */*
[]
```

(Empty array — but probe was `select=id,nickname&limit=1`. May simply
be the smallest possible projection.)

### 11.2 `profiles` (anon, querying sensitive cols)

```
HTTP/2 200
content-length: 2
content-range: */*
[]
```

→ RLS denies (response is shaped as empty result with content-range
`*/*`, a Supabase convention when RLS hides everything).

### 11.3 `wallets`, `wallet_transactions`, `admin_audit_log`, `admin_users` (anon)

All four return:

```
HTTP/2 200
content-length: 2
content-range: */*
[]
```

→ direct table access is RLS-denied (or tables genuinely empty for
`admin_users`/`admin_rate_violations`). Either way: anon cannot
SELECT meaningful data from tables directly. **The exposure is
through SECURITY DEFINER RPCs.**

## 12. Login brute-force probe

```
$ for i in 1..5: curl POST /api/auth/login {bad email, bad password}
Attempt 1: HTTP/2 401  | 847ms
Attempt 2: HTTP/2 401  | 593ms
Attempt 3: HTTP/2 401  | 945ms
Attempt 4: HTTP/2 401  | 551ms
Attempt 5: HTTP/2 401  | 1034ms
```

→ no rate limit. Supports `FIND-008`.

## 13. Login timing oracle probe

```
wrong_email   1: 640ms
wrong_email   2: 559ms
wrong_email   3: 596ms
wrong_password 1: 319ms
wrong_password 2: 318ms
wrong_password 3: 325ms
```

→ wrong-password latency consistently ~280 ms less than wrong-email,
confirming the `setTimeout(250)` asymmetry. Supports `FIND-007`.

## 14. Git history pertinent finding

```
6429c1c docs(admin): comprehensive handoff doc for next agent (with all tokens & roadmap)
        + docs/admin/SHASHKI_ROYALE_ADMIN_HANDOFF.docx
```

→ handoff DOCX containing live secrets is committed to `main`.
Supports `FIND-002`.

## 15. Repo / branch state

```
On branch audit/admin-panel-hardening
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean

HEAD: 6429c1c
Tags: (none)
Workflows: (none)
```

→ supports `FIND-024`, `FIND-025`.

## 16. Static greps

- `dangerouslySetInnerHTML` in `src/`: **0 hits**.
- `eval(` in `src/`: 0 hits.
- `new Function(` in `src/`: 0 hits.

→ XSS surface is primarily via CSV export (`FIND-018`) and source-map
exposure (`FIND-005`), not direct sink.

## 17. What was **not** probed

- Authenticated mutation calls (no production grant/refund/suspend
  executed).
- Owner-account login on production (would write an authenticated
  audit row and tie auditor IP to the already-compromised account).
- Realtime publication contents (no DB introspection access).
- `pg_constraint` / `pg_proc` introspection (no service-role channel
  set up by the operator for this audit; see
  [`ADMIN_AUDIT_EXECUTIVE_SUMMARY.md` § 8](./ADMIN_AUDIT_EXECUTIVE_SUMMARY.md#8-checks-not-executed-and-why)).
- Cloudflare Pages settings / Functions log inspection (no controlled
  CF dashboard access in this audit).
- Game-backend repository (`shashki-royale`) — outside scope of this
  audit.
