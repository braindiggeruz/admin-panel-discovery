# Shashki Royale · Admin Panel — Threat Model

> Method: STRIDE-ish per-actor enumeration, with each row anchored to a
> concrete asset and an attack path that is reproducible against the
> current production (`https://shashki-royale-admin.pages.dev`).

---

## 1. Asset register

| ID    | Asset                                | Sensitivity |
| :---- | :----------------------------------- | :---------- |
| A1    | Coin balance / `wallets`             | HIGH (economy) |
| A2    | `wallet_transactions` (ledger)       | HIGH        |
| A3    | `game_stakes` (escrow)               | HIGH        |
| A4    | `profiles` (PII, device fp, suspension) | HIGH     |
| A5    | `admin_audit_log` (integrity record) | HIGH        |
| A6    | `admin_users` (admin identity, hash) | CRITICAL    |
| A7    | Supabase `service_role` key          | CRITICAL    |
| A8    | `JWT_SECRET`                         | CRITICAL    |
| A9    | `ADMIN_PASSWORD_HASH`                | CRITICAL    |
| A10   | GitHub PAT                           | CRITICAL    |
| A11   | Cloudflare API Token                 | CRITICAL    |
| A12   | Admin JWT (issued sessions)          | HIGH        |
| A13   | Source code (TypeScript)             | MEDIUM (now exposed via map) |
| A14   | Player identity / device fingerprint | HIGH (privacy) |

## 2. Actor model

| Actor                                | Capability                                                                              |
| :----------------------------------- | :-------------------------------------------------------------------------------------- |
| **AT-1** External anonymous attacker | Unauthenticated HTTPS to `*.pages.dev` and `*.supabase.co`; possesses public anon key   |
| **AT-2** Ordinary player             | Authenticated game session, plays normal games                                          |
| **AT-3** Suspended player            | Has expired/active `suspended_until`                                                    |
| **AT-4** Phished / XSS'd admin       | Admin's browser tab compromised by `<script>` / extension                               |
| **AT-5** Stolen admin JWT            | Attacker has the localStorage token (e.g., via XSS, malware, shared device)             |
| **AT-6** Former admin                | Knows credentials/JWT prior to rotation                                                 |
| **AT-7** GitHub PAT holder           | Read/write access to the repo, including code injection                                 |
| **AT-8** Cloudflare token holder     | Can deploy arbitrary Pages, rotate env, exfiltrate secret values via deploys            |
| **AT-9** Insider with Supabase access| `service_role` or DB password; can directly mutate ledger                                |
| **AT-10** Brute-force bot            | Tries dictionary against `/api/auth/login`                                              |
| **AT-11** Browser extension          | Reads JWT from `localStorage`; reads bundle source map                                  |
| **AT-12** Replay attacker            | Replays previously captured request                                                     |
| **AT-13** Race attacker              | Issues concurrent requests to exploit non-atomic checks                                 |
| **AT-14** Direct RPC abuser          | Calls Supabase RPC bypassing CF Functions                                               |

## 3. Attack paths (selected high-impact)

### TP-1 · Anonymous Coin minting via direct RPC (AT-1, AT-14) — **CRITICAL** / proven

| Step | Detail                                                                                            |
| :--- | :------------------------------------------------------------------------------------------------ |
| 1    | Attacker downloads `https://shashki-royale-admin.pages.dev/assets/index-*.js`                     |
| 2    | Extracts `VITE_SUPABASE_ANON_KEY` (publishable JWT) from the bundle                               |
| 3    | Optionally pulls a real `profile_id` from the public game frontend or `public_profiles` view      |
| 4    | `POST https://jsykbnkbrwwsxcdurzcw.supabase.co/rest/v1/rpc/admin_grant_coin` with that profile id |
| 5    | RPC `SECURITY DEFINER`, owned by superuser-ish role, runs INSERT into `wallets` and `wallet_transactions` |
| 6    | No `JWT_SECRET` check, no `idempotency_key`, no `admin_audit_log` entry, no rate-limit            |

**Existing controls**: CF Functions wall (bypassed), JWT (bypassed),
audit (bypassed), idempotency (bypassed), amount cap (no cap inside RPC).
**Gap**: `GRANT EXECUTE ... TO service_role` is **additive**; PostgreSQL
default GRANTs EXECUTE to PUBLIC unless explicitly revoked.
**Mitigation (Phase 0)**:

```sql
REVOKE EXECUTE ON FUNCTION public.admin_grant_coin(uuid, numeric, text, text)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_refund_stake(uuid, text, text)           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_suspension(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
```

(And add the same REVOKE block to `admin_sprint4.sql` so the next apply
doesn't regress.)

### TP-2 · Audit-log split-brain double-spend (AT-13)

Per `functions/api/[[path]].ts` lines 262–311 (`grant-coin`):

1. SELECT audit_log to see if idempotency key was used. (No row yet.)
2. POST RPC → wallet credited.
3. POST audit_log → fails (network blip / Supabase 5xx / unique race).
4. Client retries with same idempotency key.
5. Step 1 again sees no row → step 2 credits the wallet a *second* time.

The only guard, the UNIQUE index, is defined as
`(actor_id, idempotency_key) WHERE idempotency_key IS NOT NULL` —
but the worker inserts `actor_email`, never `actor_id` (which is
the FK to `admin_users.id`, a table the worker doesn't even touch).
The index therefore allows infinite NULL-actor rows.

**Mitigation**: see `FIND-003` recommendation in
[`ADMIN_COIN_LEDGER_AUDIT.md`](./ADMIN_COIN_LEDGER_AUDIT.md).

### TP-3 · XSS → JWT exfiltration (AT-4, AT-5, AT-11)

JWT lives in `localStorage`. Vectors:

- LiveFeed renders player nicknames sourced from `public_profiles` — if
  any value contains markup, default React escaping protects, but the
  CSV export (`Players.tsx`) is vulnerable to *spreadsheet formula
  injection*.
- Toast / error messages render error strings from API; `apiMutate`
  throws `body.error` as `Error.message` and `LoginScreen.tsx` renders
  it. No HTML injection because React text-renders, but the error
  surface is a phishing/aesthetic vector.
- No CSP (verified live, see `FIND-014`); a successful XSS gets full
  cross-origin fetch capability.
- Source map exposure (`FIND-005`) leaks original variable names and
  comments, making targeted gadget construction easier.

### TP-4 · Brute force / credential stuffing (AT-10) — proven viable

Per `FIND-008`: no lockout, no IP throttle, only PBKDF2 latency (~320 ms).
At ~3 attempts/s an attacker can try ~250 000/day from one IP. With
parallelism and the email already public (`owner@damkaroyal.app`),
weak passwords are at material risk.

### TP-5 · Login email enumeration (AT-1) — proven

`functions/api/[[path]].ts:181-185` inserts a `setTimeout(250)` only on
the `email !== ADMIN_EMAIL` branch. Result: timing oracle separates
"wrong email" (~600 ms) from "wrong password" (~320 ms).

### TP-6 · GitHub PAT exfiltration (AT-7) — proven

`docs/admin/SHASHKI_ROYALE_ADMIN_HANDOFF.docx` (in git history at
`6429c1c`) embeds a fine-grained-or-classic PAT and explicit
instructions to set `origin` to `https://...:PAT@github.com/...`. If
that `origin` config ever existed locally, the PAT is in
`.git/config`. Per § 4 of the source problem statement, any PAT
embedded in remote URL is automatically `CRITICAL`.

### TP-7 · Cloudflare deploy token exfiltration (AT-8)

Same DOCX exposes `CLOUDFLARE_API_TOKEN`. With Pages:Edit scope an
attacker can:

- Push a new deploy that exfiltrates env secrets via the Function (e.g.,
  POST them to attacker-controlled webhook).
- Drain audit-log evidence by deploying a Function that wipes/back-dates.

### TP-8 · Suspension-no-op (AT-3)

`admin_set_suspension` updates `profiles.suspended_until` only. There
is no documented or verifiable game-side check on that column. Result:
suspending a player via admin appears successful while the player
continues playing/staking. **SUSPECTED**. Mitigation requires the
*game backend* to:

```sql
SELECT 1 FROM profiles WHERE id = :pid AND (suspended_until IS NULL OR suspended_until <= now())
```

…on matchmaking entry, and ideally a DB trigger refusing INSERTs into
`game_stakes` / `games` for suspended players.

### TP-9 · CSV formula injection (AT-2/AT-4)

`Players.tsx` CSV export embeds nickname directly. A player who sets
their nickname to `=cmd|'/c calc.exe'!A1` lands an injected formula
when the admin opens the CSV in Excel/LibreOffice. Vector requires the
admin to *open* the CSV. No sanitisation observed. **SUSPECTED** until
the code path is rerun (file viewed; vector confirmed).

### TP-10 · Realtime channel snooping (AT-1)

Anon clients can subscribe to Supabase Realtime channels for tables in
the Realtime publication. The audit cannot verify which tables are in
the publication without DB access; if `wallet_transactions` or
`profiles` is included with no row filter, *anyone* can stream new
transactions in real time. **SUSPECTED** (`FIND-016`).

### TP-11 · Stolen JWT survives password change (AT-5, AT-6)

The CF Function's `jwtVerify` only validates signature + `exp`. There
is no token revocation list, no version-bump field, no `iat>min_iat`
gate, no `admin_users.is_active` re-check. Rotating the password
*after* a leak does **not** invalidate already-issued tokens. They
remain valid until `exp` (default 8 hours).

### TP-12 · `service_role` over-privilege blast radius (AT-7, AT-8)

Service role is currently used to perform every call, including
narrow reads like `/api/admin/transactions/by-type` and
`/api/admin/wallets/summary`. A bug or compromise of the CF Function
gives full DB superpowers. There is **no least-privileged DB role**
between `service_role` and `anon`.

## 4. Per-actor summary table

| Actor   | Top control gap                          | Recommended primary mitigation                               |
| :------ | :--------------------------------------- | :----------------------------------------------------------- |
| AT-1    | TP-1 anonymous RPC                       | REVOKE EXECUTE FROM PUBLIC + Cloudflare Access in front       |
| AT-2/3  | TP-8 suspension not enforced             | Game-backend trigger + matchmaking check                      |
| AT-4    | No CSP, no HttpOnly                      | CSP-strict + cookie-based session + service worker hardening  |
| AT-5    | No revocation                            | Token version field on admin_users; server-side denylist      |
| AT-6    | No revocation, env-only identity         | Switch identity to admin_users table with `is_active` check   |
| AT-7    | PAT in DOCX, possibly in `.git/config`   | Rotate PAT, scrub remote URL, scan via `gitleaks`              |
| AT-8    | CF token in DOCX                         | Rotate, scope down to single project, alert on deploys        |
| AT-9    | Service role = god mode                  | Use `service_role` only inside RPC; expose narrow `pgrst` role |
| AT-10   | No lockout                               | CF Rate Limiting Rules + Turnstile + per-IP/user backoff      |
| AT-11   | Source-map exposure                      | `vite build --sourcemap=hidden` + `_headers` deny on `.map`   |
| AT-12   | Audit insert outside RPC                 | Move audit + idempotency inside SQL transaction               |
| AT-13   | TP-2 split-brain                         | (same as AT-12)                                                |
| AT-14   | TP-1                                     | (same as AT-1)                                                 |
