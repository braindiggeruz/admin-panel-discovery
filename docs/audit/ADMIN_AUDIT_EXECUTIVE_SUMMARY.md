# Shashki Royale · Admin Panel — Executive Audit Summary

> **Scope**: Independent production-security and reliability audit of the
> administrative panel for the Shashki Royale game.
> **Period**: 2026-06-25.
> **Method**: Static analysis of `main` @ `6429c1c`, non-destructive live
> probes against production (`https://shashki-royale-admin.pages.dev`) and
> the project's Supabase REST API.
> **Branch**: `audit/admin-panel-hardening` — documents and harmless tests
> only. **No production mutations performed.**

---

## 1. Verdict

| Dimension                  | Score (0–100) | Status |
| :------------------------- | :-----------: | :----: |
| **Security**               | **18**        |  🔴 RED |
| Authentication             | 32            |  🔴 RED |
| Authorization              | 12            |  🔴 RED |
| Database integrity         | 25            |  🔴 RED |
| Coin ledger integrity      | 22            |  🔴 RED |
| API resilience             | 40            |  🟡 YELLOW |
| Auditability               | 35            |  🟡 YELLOW |
| Privacy / data handling    | 38            |  🟡 YELLOW |
| CI/CD & supply chain       | 18            |  🔴 RED |
| Observability              | 22            |  🔴 RED |
| Test coverage              | 5             |  🔴 RED |
| **Production readiness**   | **20**        |  🔴 RED |

**Overall verdict: 🔴 RED.** The admin panel **must not be considered
production-trustworthy** in its current state. There is at least one
verified, reproducible vulnerability that allows an **unauthenticated
attacker to mint unlimited game currency and manipulate player suspensions**
directly against the production database, bypassing every admin control.

## 2. Headline numbers

| Severity      | Count |
| :------------ | :---- |
| Critical      | **8** |
| High          | **14** |
| Medium        | **10** |
| Low           | **6** |
| Informational | **5** |
| **Total**     | **43** |

(Full machine-readable list: [`findings.json`](./findings.json).
Long form: [`ADMIN_AUDIT_FINAL_REPORT.md`](./ADMIN_AUDIT_FINAL_REPORT.md).)

## 3. Top 5 risks (must be fixed before any further development)

1. **`FIND-001` CRITICAL — Anonymous RPC abuse (operator-funds-killer).**
   `admin_grant_coin`, `admin_refund_stake`, `admin_set_suspension` are
   callable directly against Supabase by *any anonymous client* using the
   public `anon` key embedded in the browser bundle. The migration grants
   EXECUTE to `service_role` but never `REVOKE EXECUTE FROM PUBLIC`. The
   Cloudflare Functions wall (JWT, audit log, idempotency, reason
   validation, amount cap) is **completely bypassable**.

   *Live proof:* `POST /rest/v1/rpc/admin_set_suspension` with the public
   anon key returned **HTTP 200** and executed an `UPDATE profiles`.
   `admin_grant_coin` reached the wallet INSERT (FK error only because the
   profile UUID was fake). See evidence file.

2. **`FIND-002` CRITICAL — Secrets exposure in repo and chat.**
   `docs/admin/SHASHKI_ROYALE_ADMIN_HANDOFF.docx` (committed in `6429c1c`)
   contains the **owner password in plaintext**, the GitHub PAT, the
   Cloudflare API token, the Supabase project URL, and structural hints
   about every other secret. The same credentials were re-shared via the
   audit-request channel. All four secret families must be rotated *now*.
   Repository history must be rewritten or the repo must be considered
   permanently compromised.

3. **`FIND-003` CRITICAL — Non-atomic idempotency / wallet ↔ audit split-brain.**
   In `functions/api/[[path]].ts` the RPC mutation and the audit-log insert
   run as **two separate HTTPS calls**. If the audit insert fails after a
   successful wallet mutation, the next retry (same `idempotency_key`)
   passes the duplicate check (no row yet) and **re-executes the RPC**,
   double-crediting the wallet. The "uniqueness" guarantee promised by the
   handoff does not exist at any consistent boundary.

4. **`FIND-004` CRITICAL — Sprint 4 migration drops unrelated CHECK constraints.**
   `supabase/admin_sprint4.sql` blindly drops *every* CHECK constraint on
   `wallet_transactions` whose definition matches the regex `~* 'type'` or
   `~* 'amount'`. That includes the `amount >= 0` invariant for legitimate
   transaction types (`deposit`, `prize_payout`, etc.) and any future
   constraint that merely *mentions* those words in its expression. The
   migration leaves the table with **no positivity / domain invariants at
   all**.

5. **`FIND-005` CRITICAL — Source maps exposed in production.**
   `https://shashki-royale-admin.pages.dev/assets/index-*.js.map` returns
   **HTTP 200**. The full TypeScript source of the admin panel —
   including comments mentioning the legacy passphrase env var, internal
   route shapes, type definitions, and any inlined Vite env vars — is
   publicly downloadable.

> Two further findings (`FIND-006` JWT-in-localStorage with no XSS hardening,
> `FIND-007` login timing oracle + no brute-force protection) are individually
> serious and combine with the others into compounding risk.

## 4. Can admin writes stay enabled?

**No.** Until at minimum:

1. `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon, authenticated` is
   applied to all `admin_*` functions, **and**
2. The Sprint 4 migration is rewritten as a targeted repair migration, **and**
3. Secrets are rotated and the handoff DOCX is purged from history, **and**
4. Idempotency is moved inside the RPC transaction,

the **grant / refund / suspend** endpoints must be **disabled**. A
read-only kill-switch is described in
[`ADMIN_REMEDIATION_ROADMAP.md` § Phase 0](./ADMIN_REMEDIATION_ROADMAP.md).

## 5. Can Sprint 5 (anti-fraud) start?

**No.** The economy itself is unsound. Anti-fraud features built on top
of a ledger that can be silently minted from anywhere on the internet
provide false assurance. Phase 0 + Phase 1 of the roadmap must complete
first.

## 6. The Litecoin (Sprint 7) roadmap

🚩 **Legal / compliance red flag.** The handoff (§ 6 / Sprint 7)
proposes integrating real Litecoin deposits/withdrawals through
NOWPayments/CoinPayments. With the current state of the platform (no
KYC/AML, no proper audit trail integrity, anonymous economy mutation,
no formal incident response), wiring real money in or out would create
significant regulatory and counter-party exposure. We strongly recommend
**deferring this scope entirely** until the platform reaches at least
"YELLOW" production readiness, and consulting counsel on jurisdiction
licensing requirements (gambling, payment services, AML).

The internal "Coin" should also be **renamed** away from
`crypto_balance` (see `FIND-038`) — calling it "crypto" today creates
both a legal misrepresentation risk and a UX misunderstanding.

## 7. Live production checks executed

✅ GET `/api/health` (response analysed, info-leak confirmed)
✅ HEAD `/` and response headers fingerprint
✅ GET `/api/auth/me` without token (401 confirmed)
✅ GET `/api/auth/me` with malformed JWT (401 confirmed)
✅ GET `/api/admin/wallets/summary` without auth (401 confirmed)
✅ Source-map probe `/assets/index-*.js.map` (200 confirmed — exposed)
✅ Anon-bundle key extracted from public JS for read-only probes
✅ POST `/rest/v1/rpc/admin_grant_coin` with anon (reachable, FK 23503)
✅ POST `/rest/v1/rpc/admin_refund_stake` with anon (reachable, P0001)
✅ POST `/rest/v1/rpc/admin_set_suspension` with anon (HTTP 200 — executed)
✅ SELECT against `profiles`, `wallets`, `wallet_transactions`,
   `admin_audit_log`, `admin_users` with anon — all empty-set (RLS
   default-deny behaviour confirmed for direct table reads).
✅ Login brute-force probe (5 wrong logins, no throttle observed)
✅ Login timing oracle probe (wrong_email ≈ 600 ms,
   wrong_password ≈ 320 ms → email enumeration possible)

## 8. Checks NOT executed (and why)

- ❌ No authenticated mutation tests against production
  (grant/refund/suspend on real players) — explicitly forbidden by audit
  scope; risk of touching real economy.
- ❌ No production login under owner credentials — credentials are
  compromised by handoff exposure; each authenticated probe would record
  the auditor's IP into the audit log and tie the auditor to an
  already-leaked account.
- ❌ No SQL `EXPLAIN`/`pg_proc`/`pg_constraint` introspection on
  production DB — no Supabase Studio access or service-role provided
  through a secret channel. **All schema claims below are inferred from
  observable behavior** and are flagged `SUSPECTED` when proof is
  indirect.
- ❌ No Cloudflare Pages "Settings" inspection — no Cloudflare dashboard
  access via a controlled secret-channel; settings are inferred from
  response headers, Wrangler-style deploys in commit history, and the
  handoff. All Cloudflare-side claims about CI/CD wiring, branch
  protection, and env-var contents are flagged `SUSPECTED`.
- ❌ No game-backend repo audit (suspension enforcement) — the game lives
  in a separate Cloudflare Pages project (`shashki-royale.pages.dev`).
  We could not verify whether `profiles.suspended_until` is honored in
  matchmaking / active sessions. **Important:** the suspend endpoint is
  effectively decorative until the game enforces the column.

## 9. Where to read more

| Document                                                | Topic                                  |
| :------------------------------------------------------ | :------------------------------------- |
| [`ADMIN_SYSTEM_MAP.md`](./ADMIN_SYSTEM_MAP.md)          | Architecture, code map                 |
| [`ADMIN_THREAT_MODEL.md`](./ADMIN_THREAT_MODEL.md)      | Actor model, attack paths              |
| [`ADMIN_SECURITY_AUDIT.md`](./ADMIN_SECURITY_AUDIT.md)  | Auth, sessions, CSP, secrets           |
| [`ADMIN_DATABASE_RLS_RPC_AUDIT.md`](./ADMIN_DATABASE_RLS_RPC_AUDIT.md) | RPC, RLS, migrations |
| [`ADMIN_COIN_LEDGER_AUDIT.md`](./ADMIN_COIN_LEDGER_AUDIT.md) | Economy and idempotency           |
| [`ADMIN_API_AUDIT.md`](./ADMIN_API_AUDIT.md)            | Per-endpoint route audit               |
| [`ADMIN_FRONTEND_UX_AUDIT.md`](./ADMIN_FRONTEND_UX_AUDIT.md) | XSS, CSV, modal flow             |
| [`ADMIN_CICD_INFRA_AUDIT.md`](./ADMIN_CICD_INFRA_AUDIT.md) | Pipeline, secrets, deploy            |
| [`ADMIN_TEST_GAP_ANALYSIS.md`](./ADMIN_TEST_GAP_ANALYSIS.md) | Test coverage                       |
| [`ADMIN_REMEDIATION_ROADMAP.md`](./ADMIN_REMEDIATION_ROADMAP.md) | Phased fix plan                |
| [`ADMIN_AUDIT_EVIDENCE.md`](./ADMIN_AUDIT_EVIDENCE.md)  | Raw HTTP transcripts                   |
| [`ADMIN_AUDIT_FINAL_REPORT.md`](./ADMIN_AUDIT_FINAL_REPORT.md) | Long-form report                |
| [`findings.json`](./findings.json)                      | Machine-readable findings              |
