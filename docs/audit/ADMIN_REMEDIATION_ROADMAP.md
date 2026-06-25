# Shashki Royale · Admin Panel — Remediation Roadmap

> Phased, finding-anchored. Every item links back to a `FIND-…` ID in
> [`findings.json`](./findings.json). No item is implemented in this
> branch; this is a plan, not code.

---

## Phase 0 — Emergency containment (0–24 hours)

> **Stop the bleeding.** Closes the operator-funds-killer and removes
> the leaked-secret surface.

| #    | Action                                                                                 | Finding(s) | Effort | Owner role  | Verification |
| :--- | :------------------------------------------------------------------------------------- | :--------- | :----- | :---------- | :----------- |
| 0.1  | **Rotate GitHub PAT** in GitHub → Settings → Developer settings → Personal access tokens | FIND-002   | 5 min  | Repo owner  | Old PAT returns 401 against `https://api.github.com/user` |
| 0.2  | **Rotate Cloudflare API Token** (Pages:Edit) in Cloudflare → API Tokens                 | FIND-002   | 5 min  | CF account owner | Old token returns 401 against `https://api.cloudflare.com/client/v4/user/tokens/verify` |
| 0.3  | **Rotate Supabase service-role JWT** (mint new with Legacy JWT secret, then rotate the secret) | FIND-002 | 30 min | DB owner    | Old service-role 401 on `/rest/v1/profiles?limit=1`            |
| 0.4  | **Rotate Supabase anon key** (after key rotation, redeploy bundle with new key)         | FIND-002   | 10 min | DB owner    | Old anon key returns 401 from `/rest/v1/public_profiles`        |
| 0.5  | **Rotate owner admin password** (mint new PBKDF2 hash, replace `ADMIN_PASSWORD_HASH` in CF Pages env) | FIND-002 | 10 min | CF owner | Old password login returns 401 |
| 0.6  | **Rotate `JWT_SECRET`** in CF Pages env                                                 | FIND-002   | 5 min  | CF owner    | All in-flight admin sessions return 401 on next request          |
| 0.7  | **Scrub git remote URL of PAT** if present in `.git/config`                              | FIND-002   | 5 min  | Repo owner  | `grep ghp_ ~/.gitconfig` and `.git/config` empty                |
| 0.8  | **REVOKE EXECUTE on three admin RPCs from PUBLIC, anon, authenticated** — apply `scripts/audit/repair_phase0_template.sql` after manual review | FIND-001 | 15 min | DB owner | Anon `POST /rpc/admin_set_suspension` → 401/403; transcript saved |
| 0.9  | **Disable mutation endpoints** as a belt-and-braces measure: temporarily return 503 from `/api/admin/**/grant-coin`, `/refund`, `/suspend` until 0.8 verified — *defer if 0.8 done first* | FIND-001 | 30 min | Frontend/edge engineer | `curl POST /api/admin/...` → 503; only safe reads work |
| 0.10 | **Disable / unset `VITE_ADMIN_PASSPHRASE`** in CF Pages env                              | FIND-034   | 5 min  | CF owner    | New build's bundle does not contain `royale-…` string            |
| 0.11 | **Disable source maps**: in `vite.config.ts` add `build: { sourcemap: false }`           | FIND-005   | 5 min  | Frontend    | `/assets/*.map` → 404 after redeploy                            |
| 0.12 | **Add `_headers` deny for `.map`** and a default `Strict-Transport-Security` (defence-in-depth even though 0.11 should be enough) | FIND-005, FIND-014 | 10 min | Frontend | live response shows HSTS; `.map` returns 404 |
| 0.13 | **Drop `docs/admin/SHASHKI_ROYALE_ADMIN_HANDOFF.docx`** from `main` (commit), then plan history rewrite once all clones audited | FIND-002 | 15 min | Repo owner | File missing on `main`; PR notes that history rewrite is queued |
| 0.14 | **Snapshot DB before any further migration**: Supabase Studio → Database → Backups → ondemand backup or `pg_dump` if PITR is on | FIND-004, FIND-001 | 15 min | DB owner | backup id recorded |
| 0.15 | **Run `scripts/audit/diag_constraints.sql` and diag_grants.sql** to baseline real state | FIND-004 | 5 min  | DB owner | Output captured into `docs/audit/ADMIN_AUDIT_EVIDENCE.md` |
| 0.16 | **Re-run anon-RPC probes** after 0.8 to confirm                                          | FIND-001   | 5 min  | Auditor / SRE | All three POSTs → 401/403 |

**Rollback for Phase 0**:

- 0.1–0.6 (secret rotation) — irreversible by design.
- 0.8 REVOKE — reversible by `GRANT EXECUTE … TO PUBLIC` (but **do not**).
- 0.9 503 — reversible by reverting the wrapper change.
- 0.11/0.12 — revert `vite.config.ts` / `_headers`.

**Acceptance criteria for Phase 0**:

1. None of the old secrets work anywhere.
2. Anon-bundle `POST /rest/v1/rpc/admin_*` returns 401/403, not 200/4xx-from-inside-function.
3. `/api/health` body unchanged or already replaced; mutation endpoints disabled or RPC locked.
4. `vite.config.ts` builds without source maps.
5. The handoff DOCX is removed from `main`.

---

## Phase 1 — P0/P1 hardening (1–3 days)

| #    | Action                                                                                  | Finding(s)         | Effort | Verification |
| :--- | :-------------------------------------------------------------------------------------- | :----------------- | :----- | :----------- |
| 1.1  | Replace `/api/health` payload with `{ ok: true, version: GIT_SHA }`                      | FIND-009           | 30 min | live GET shows nothing else |
| 1.2  | Constant-time login: do PBKDF2 on every attempt regardless of email match                | FIND-007           | 1 h    | timing test ≤ 30 ms variance |
| 1.3  | Rate-limit `/api/auth/login` via Cloudflare Rate Limiting Rule (10/min/IP) + DB counter | FIND-008           | 4 h    | 11th request → 429 |
| 1.4  | Repair migration: list actual CHECK constraints, reinstate `amount` invariants targeted | FIND-004           | 4 h    | `pg_constraint` shows correct constraints; tx of disallowed shape fails |
| 1.5  | Introduce `admin_operations` ledger table + atomic idempotency inside RPCs              | FIND-003, FIND-013 | 1–2 d  | concurrent same-key requests → 1 mutation |
| 1.6  | Switch authentication to read from `admin_users` (seed owner row, honor `is_active`)    | FIND-026, FIND-031 | 6 h    | toggling `is_active=false` denies login & rejects existing JWTs |
| 1.7  | Add `iss`/`aud` claims; tie `JWT_SECRET` to a `kid`                                     | FIND-029, FIND-030 | 3 h    | foreign-iss token → 401 |
| 1.8  | Set CSP, HSTS, COOP, CORP on admin Pages via `public/_headers`                          | FIND-014           | 2 h    | securityheaders.io grade A+ |
| 1.9  | Tighten CORS `access-control-allow-origin` to own origin                                | FIND-015           | 30 min | cross-origin preflight from unknown origin denied |
| 1.10 | Validate UUID at every route boundary                                                   | FIND-019           | 1 h    | `players/not-a-uuid` → 400 |
| 1.11 | Cap `transactions/recent?limit` and audit the by-type endpoint                           | FIND-022, FIND-039 | 1 h    | `limit=999999` → 400 or capped at 500 |
| 1.12 | Move `actor_ip` into every audit insert; never trust client-supplied IP                 | FIND-040           | 1 h    | audit row has `actor_ip` populated for non-login actions |
| 1.13 | Sanitise CSV export cells (`'` prefix on `=+-@\t\r`)                                     | FIND-018           | 1 h    | Exported nickname `=A1` rendered as `'=A1` |
| 1.14 | Hoist `idempotency_key` to ActionModal state, reuse across retries                       | FIND-045           | 1 h    | retry uses same key → 1 mutation |
| 1.15 | Replace 500-error message body with `{ error: "internal", request_id }`                | FIND-041           | 30 min | no SQL text in production responses |
| 1.16 | Wire `eslint` + `tsc --noEmit` checks into Phase 2 CI; produce baseline now              | (test gap)         | 1 h    | both commands run clean on `main` |
| 1.17 | Patch `supabase/admin_sprint4.sql` to add the REVOKE block so re-applies don't regress  | FIND-001, FIND-035 | 30 min | After replay, anon still 401 |

---

## Phase 2 — Reliability (3–7 days)

| #    | Action                                                                                   | Finding(s)         |
| :--- | :--------------------------------------------------------------------------------------- | :----------------- |
| 2.1  | Stand up `shashki-royale-admin-staging` CF Pages project + Supabase staging              | FIND-024           |
| 2.2  | Add `.github/workflows/admin-panel.yml` with typecheck/lint/build/smoke + cloudflare/pages-action | FIND-024, FIND-029 |
| 2.3  | Add Dependabot, CodeQL, gitleaks workflows                                                | FIND-033, FIND-048 |
| 2.4  | Add Playwright E2E smoke (login, view, no-mutation paths)                                | (test gap)         |
| 2.5  | Add miniflare-based unit/integration tests on `functions/api/*`                          | (test gap)         |
| 2.6  | Build append-only audit log: trigger on `admin_operations`, deny UPDATE/DELETE via policy | FIND-021 audit log |
| 2.7  | Confirm and tighten Supabase Realtime publication; document allowed tables               | FIND-016           |
| 2.8  | Backup automation: nightly `admin_audit_log` + `wallet_transactions` to R2/S3 (Object Lock) | FIND-029           |
| 2.9  | Branch protection on `main` (1 approval, required checks, signed commits optional)       | FIND-025           |

---

## Phase 3 — Operational maturity (1–2 weeks)

| #    | Action                                                                                          | Finding(s)              |
| :--- | :---------------------------------------------------------------------------------------------- | :---------------------- |
| 3.1  | Cloudflare Access in front of all admin routes (Zero-Trust gate as outer perimeter)             | FIND-006, FIND-014      |
| 3.2  | MFA / TOTP / WebAuthn for owner (use the dormant `admin_users.totp_secret` column)              | (security)              |
| 3.3  | Server-side session revocation (KV or table `admin_sessions`)                                   | FIND-031                |
| 3.4  | Fraud workflow: device cluster review with human-in-the-loop (NOT automatic block)               | (Sprint 5)              |
| 3.5  | Coin reconciliation daily cron + alert on drift                                                 | FIND-038 family         |
| 3.6  | Switch admin sessions to `HttpOnly; Secure; SameSite=Strict` cookies                            | FIND-006                |
| 3.7  | Observability: Cloudflare Logpush → object store; Sentry/PostHog for frontend                   | FIND-029, FIND-041       |
| 3.8  | Postmortem template + on-call rota                                                              | (DR)                    |

---

## Phase 4 — Governance & scale

| #    | Action                                                                              | Notes                                                |
| :--- | :---------------------------------------------------------------------------------- | :--------------------------------------------------- |
| 4.1  | Rename `crypto_balance` → `coin_balance` across DB/API/UI                            | FIND-038                                             |
| 4.2  | Privacy: device_fp_hash retention policy, consent notice                            | (privacy)                                            |
| 4.3  | Compliance review: data retention, right-to-erasure path                            |                                                      |
| 4.4  | Incident response runbook                                                            |                                                      |
| 4.5  | Public security disclosure page (`/.well-known/security.txt`)                       |                                                      |
| 4.6  | **Decide on Litecoin / real-money roadmap** with counsel involvement                 | Currently **DEFERRED**. See § 6 / Sprint 7 of handoff |

---

## Critical-path summary

To bring the admin panel from **🔴 RED** to **🟡 YELLOW**:

- Phase 0 (operator-funds, secrets) — **must be done today**.
- Phase 1 (atomic idempotency, repair migration, headers, identity) —
  **before any further feature spend**.

To bring it to **🟢 GREEN**:

- Phase 2 (CI, staging, backups).
- Phase 3 (MFA, revocation, fraud workflow, observability).
