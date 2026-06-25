# Shashki Royale · Admin Panel — Security Audit

> Scope: authentication, session management, secret handling, headers,
> CORS, CSP, source-map exposure, edge configuration, frontend XSS
> hardening.

---

## 1. Authentication

### 1.1 PBKDF2 implementation (`functions/api/[[path]].ts:70-94`)

| Aspect                  | State                                                          |
| :---------------------- | :------------------------------------------------------------- |
| Hash function           | PBKDF2-HMAC-SHA256 (Web Crypto)                                |
| Salt                    | Decoded from stored hash; size not validated                   |
| Iterations              | Read from stored hash (`parts[1]`)                             |
| Output length match     | Yes (`got.length !== expected.length`)                         |
| Constant-time compare   | Yes (XOR loop)                                                 |

**Findings:**

- `FIND-027` (LOW): salt and iteration count are *parsed from the stored
  hash, not enforced*. If an attacker can write `ADMIN_PASSWORD_HASH`
  (Cloudflare token compromise), they can deploy a hash with
  `iter=1` and have the worker happily verify a trivial password.
  Recommend: explicit `MIN_ITER = 100_000` check in code.
- The frontend `LoginScreen.tsx:77` advertises **"120k итераций"**.
  The handoff (§ 8.3) reports **"100k"** as the safe cap due to CF
  Worker CPU. The actual value depends on whatever was used to mint
  the env hash. Statement vs reality is unverifiable from outside;
  **SUSPECTED** (`FIND-028`).

### 1.2 Identity source-of-truth — `FIND-026` (HIGH)

`admin_users` is *declared* but never referenced by
`functions/api/[[path]].ts`. The actual identity is the 4-tuple of env
vars. Consequences:

1. `is_active` flag in `admin_users` is **ignored**.
2. Adding/removing admins requires a redeploy.
3. Multi-admin role enforcement (`owner/admin/support/moderator/analyst/viewer`)
   that `admin.sql:19` declares as a CHECK constraint is decorative.

### 1.3 Brute-force protection — `FIND-008` (HIGH)

Live evidence (5 consecutive wrong logins, same IP):

```
Attempt 1: HTTP/2 401  | 847ms
Attempt 2: HTTP/2 401  | 593ms
Attempt 3: HTTP/2 401  | 945ms
Attempt 4: HTTP/2 401  | 551ms
Attempt 5: HTTP/2 401  | 1034ms
```

No 429, no progressive delay, no account lock. The
`admin_rate_violations` table referenced in `admin.sql` is **never
queried or inserted** by the current router. Recommend: Cloudflare
Rate Limiting Rules + Turnstile on `/api/auth/login`, plus per-actor
exponential backoff persisted in the DB.

### 1.4 Login timing oracle — `FIND-007` (HIGH)

Live evidence:

```
wrong_email   1: 640ms, 2: 559ms, 3: 596ms
wrong_password 1: 319ms, 2: 318ms, 3: 325ms
```

The `setTimeout(250)` lives only on the wrong-email path
(`functions/api/[[path]].ts:182-184`); wrong-password skips it. An
attacker can probe email validity without consuming login attempts.

**Fix sketch:**

```ts
// Always do PBKDF2 work, never short-circuit on email
const userOk = email === env.ADMIN_EMAIL.toLowerCase();
const pwdOk  = await verifyPassword(password, env.ADMIN_PASSWORD_HASH);
if (!(userOk && pwdOk)) return json({error:"invalid_credentials"},{status:401});
```

### 1.5 JWT mechanics — multiple findings

- `FIND-029` (HIGH): JWT uses HS256 with a single env `JWT_SECRET`.
  Secret rotation invalidates **all** sessions instantly (no kid).
- `FIND-030` (HIGH): No `iss`/`aud` claims; tokens cannot be
  distinguished across environments (a staging token could be replayed
  to production if `JWT_SECRET` is reused).
- `FIND-031` (HIGH): No revocation list — see Threat Model § TP-11.
- `FIND-032` (MEDIUM): `role` is embedded in the token by the server
  hard-coded to `"owner"` (line 194). Role escalation isn't a real
  risk here (no other roles exist), but verification code only
  destructures `sub`; if multiple roles were added later, no check
  would gate higher-privilege actions.

### 1.6 Session storage — `FIND-006` (HIGH)

`src/services/auth.ts:58-59` stores `token` and `email` in
`localStorage`. Any XSS = full admin takeover. Combined with the lack
of CSP (next section), this is a high-likelihood compromise channel.

Recommended path (long-form in roadmap):

1. Set the JWT (or a short-lived opaque session id) as
   `HttpOnly; Secure; SameSite=Strict` cookie issued by the CF
   Function.
2. Add CSRF token *only if* using cookie-bound endpoints; otherwise
   keep `Authorization: Bearer` pattern but in-memory only.
3. Add server-side revocation (`admin_sessions` table or KV).
4. Add MFA/TOTP/WebAuthn (`FIND-040`).

## 2. Secret management

### 2.1 Handoff exposure — `FIND-002` (CRITICAL)

`docs/admin/SHASHKI_ROYALE_ADMIN_HANDOFF.docx` (commit `6429c1c`)
contains, in plaintext:

- Owner email and password
- GitHub PAT
- Cloudflare API Token (Pages:Edit)
- Cloudflare Account ID
- Supabase project URL + anon key
- Verbatim `git remote set-url` command embedding the PAT in URL
- Sample SQL referring to internal table layout

The DOCX is committed to `main`. Therefore:

1. All four secret families must be rotated immediately.
2. The repo history must be rewritten (`git filter-repo`) **after**
   any forks/clones (CI/Cloudflare connections) have been audited and
   the secret-rotation is complete.
3. A `gitleaks`/`trufflehog` scan should be added to CI (`FIND-033`).

### 2.2 Frontend bundle leakage — `FIND-005` (CRITICAL)

```
HTTP/2 200 /assets/index-8GqLdxc4.js.map
```

Source maps are publicly downloadable. Original variable names,
comments (e.g., the `gate.ts` warnings about `VITE_ADMIN_PASSPHRASE`)
and the entire TypeScript graph become available. **Combined with
`VITE_ADMIN_PASSPHRASE` being a build-time env, the legacy gate
passphrase is recoverable from the public map even if Gate.tsx is no
longer mounted.**

Fix (immediate): `vite build --sourcemap=hidden` or `false`, plus a
`public/_headers` deny on `/*.map`:

```
/*.map
  Cache-Control: no-store
  X-Robots-Tag: noindex, nofollow
  ! (better: delete .map from dist before deploy)
```

### 2.3 Legacy passphrase — `FIND-034` (HIGH)

- `src/lib/gate.ts` references `VITE_ADMIN_PASSPHRASE`.
- `App.tsx` no longer mounts `<Gate>`, so the gate is *dead code*, but
  `VITE_ADMIN_PASSPHRASE` is still listed in CF Pages env (per
  handoff § 1.3) and Vite *embeds* every `VITE_*` into the bundle.
- The passphrase is publicly extractable.

**Decision required:** since the gate is no longer reachable, the
passphrase is harmless **if** removed; while still in env it is a
public secret pretending to be a control. Remove the var + delete
`gate.ts` and `Gate.tsx`.

## 3. HTTP headers and CORS

### 3.1 Live response of admin root

```
HTTP/2 200
access-control-allow-origin: *
cache-control: no-store, must-revalidate
permissions-policy: geolocation=(), microphone=(), camera=()
referrer-policy: same-origin
x-content-type-options: nosniff
x-frame-options: DENY
x-robots-tag: noindex, nofollow
```

| Control                          | Verdict                                 | Finding |
| :------------------------------- | :-------------------------------------- | :------ |
| `Strict-Transport-Security`      | **MISSING**                             | FIND-014 |
| `Content-Security-Policy`        | **MISSING**                             | FIND-014 |
| `Cross-Origin-Opener-Policy`     | **MISSING**                             | FIND-014 |
| `Cross-Origin-Embedder-Policy`   | **MISSING**                             | FIND-014 |
| `Cross-Origin-Resource-Policy`   | **MISSING**                             | FIND-014 |
| `Access-Control-Allow-Origin: *` | **Inappropriate for admin root HTML**   | FIND-015 |
| `X-Frame-Options: DENY`          | OK                                      |   —     |
| `X-Content-Type-Options: nosniff`| OK                                      |   —     |
| `Referrer-Policy: same-origin`   | OK (could be `strict-origin-when-cross-origin`) | — |
| `Permissions-Policy`             | partial — could add `fullscreen=()`, `payment=()`, `interest-cohort=()` | LOW |
| `X-Robots-Tag: noindex, nofollow`| OK                                      |   —     |
| `Cache-Control: no-store`        | OK for HTML and `/api/*`                |   —     |

**Recommended `public/_headers` overlay** (proposed in
[`ADMIN_REMEDIATION_ROADMAP.md`](./ADMIN_REMEDIATION_ROADMAP.md), Phase 1):

```
/*
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://jsykbnkbrwwsxcdurzcw.supabase.co wss://jsykbnkbrwwsxcdurzcw.supabase.co; frame-ancestors 'none'; base-uri 'none'; form-action 'self'
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), microphone=(), payment=(), interest-cohort=()
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer

/*.map
  X-Robots-Tag: noindex, nofollow
```

(Combined with deleting `.map` files at deploy time.)

### 3.2 CORS on the API (`functions/api/[[path]].ts:146-155`)

```ts
"access-control-allow-origin": "*",
"access-control-allow-headers": "content-type, authorization",
"access-control-allow-methods": "GET, POST, OPTIONS",
```

For an admin app whose UI is same-origin, `*` is unnecessary. Tighten
to:

```ts
"access-control-allow-origin": "https://shashki-royale-admin.pages.dev",
"vary": "Origin"
```

(`FIND-015`)

### 3.3 `/api/health` info leak — `FIND-009` (MEDIUM)

```
HTTP/2 200
{"ok":true,
 "ts":"2026-06-25T09:24:39.827Z",
 "supabase":"https://jsykbnkbrwwsxcdurzcw.supabase.co",
 "admin_email":"owner@damkaroyal.app",
 "has_service_role":true,
 "has_jwt_secret":true,
 "has_pwd_hash":true}
```

This is a public endpoint. It reveals:

- The Supabase project URL (already public).
- The admin email — confirms valid login target for AT-10/AT-7.
- The configuration *existence* triplet — useful for an attacker to
  know whether the panel is broken or just secret-less.

Recommended replacement:

```ts
return json({ ok: true });
```

Anything richer should be authenticated.

## 4. Frontend XSS surface (preliminary)

Detailed audit in
[`ADMIN_FRONTEND_UX_AUDIT.md`](./ADMIN_FRONTEND_UX_AUDIT.md). Summary:

- React text rendering escapes by default; no `dangerouslySetInnerHTML`
  matches found in code (`grep -R dangerouslySetInnerHTML src/`
  returns zero hits — see EVIDENCE).
- LoginScreen / Toast / error path renders backend error strings as
  text — safe by default.
- **CSV export in Players.tsx is the highest-risk surface** —
  formula injection (`FIND-018`).
- Source-map exposure widens the impact of any XSS by trivialising
  reconnaissance.

## 5. Recommendations summary

| Phase | Action                                                                 | Effort |
| :---: | :--------------------------------------------------------------------- | :----: |
|  0    | Disable mutation endpoints OR REVOKE EXECUTE on admin_* RPCs           |  1h    |
|  0    | Rotate all four secret families; scrub remote URLs                     |  2h    |
|  0    | Disable source maps (`vite build` config) and add `_headers` rule      |  30m   |
|  0    | Drop `VITE_ADMIN_PASSPHRASE` env + delete `gate.ts` / `Gate.tsx`       |  20m   |
|  1    | Constant-time, always-do-PBKDF2 login flow                             |  1h    |
|  1    | Rate limit `/api/auth/login` (CF Rate Limiting + DB counter)           |  4h    |
|  1    | Replace `/api/health` info leak with `{ok:true}`                       |  10m   |
|  1    | Switch `Authorization: Bearer` cookies to `HttpOnly`                   |  6h    |
|  1    | Add CSP, HSTS, COOP, CORP, tighter Permissions-Policy                  |  2h    |
|  1    | Wire `admin_users` as identity source-of-truth                         |  6h    |
|  2    | Add MFA (TOTP) for owner                                               |  6h    |
|  2    | Add server-side revocation list                                        |  4h    |
|  3    | Place Cloudflare Access in front of the entire admin panel             |  3h    |
