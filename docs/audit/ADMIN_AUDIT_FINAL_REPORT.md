# Shashki Royale · Admin Panel — Final Audit Report

> Long-form synthesis. For executive verdict see
> [`ADMIN_AUDIT_EXECUTIVE_SUMMARY.md`](./ADMIN_AUDIT_EXECUTIVE_SUMMARY.md).
> For per-domain detail see the eleven sibling documents.
> For machine-readable list see [`findings.json`](./findings.json).

---

## 1. What this audit is and is not

This audit is an independent production-security and reliability
assessment of the **admin panel** of the Shashki Royale game, conducted
against:

- The live production deployment at
  `https://shashki-royale-admin.pages.dev`.
- The actual `main` branch (`6429c1c`) of
  `altynkanafina1-ship-it/admin-panel-discovery`.
- The actual Supabase project `jsykbnkbrwwsxcdurzcw` via its public
  REST surface (anon key + non-destructive probes).

**The audit did not:**

- Mutate any production data.
- Log in as the owner account (the owner credentials are compromised
  by the handoff DOCX; every authenticated request creates a record).
- Inspect the Supabase Studio or Cloudflare dashboard interactively
  (no controlled-channel credentials provided).
- Apply any SQL migration.
- Deploy any preview to Cloudflare Pages from this branch.

**The audit produced:**

- 43 findings ranked by severity, each anchored to a file, line, RPC,
  HTTP transcript, or SQL fragment.
- A phased roadmap with verification criteria.
- Read-only diagnostic scripts the operator can run in Supabase Studio.
- Acceptance specs for the high-priority test cases.

## 2. The most important sentence in this report

> **An unauthenticated attacker, using only the public anon key
> embedded in the admin frontend bundle, can today call
> `admin_grant_coin`, `admin_refund_stake`, and
> `admin_set_suspension` against production. All admin-panel
> safeguards (JWT, audit log, idempotency, amount cap, reason
> validation) are bypassed at the database layer. The operator has
> no audit-log evidence when this happens.**

The proof is in
[`ADMIN_AUDIT_EVIDENCE.md` §§ 8–10](./ADMIN_AUDIT_EVIDENCE.md#8-post-rest-v1-rpc-admin_grant_coin-anon-fake-uuid--find-001).
The fix is a five-line SQL diff in
[`ADMIN_DATABASE_RLS_RPC_AUDIT.md` § 2.3](./ADMIN_DATABASE_RLS_RPC_AUDIT.md#23-immediate-fix-find-001-phase-0).

## 3. Verdict scorecard

| Dimension                  | Score (0–100) | Status |
| :------------------------- | :-----------: | :----: |
| Security                   | 18            |  🔴 RED |
| Authentication             | 32            |  🔴 RED |
| Authorization              | 12            |  🔴 RED |
| Database integrity         | 25            |  🔴 RED |
| Coin ledger integrity      | 22            |  🔴 RED |
| API resilience             | 40            |  🟡 YELLOW |
| Auditability               | 35            |  🟡 YELLOW |
| Privacy                    | 38            |  🟡 YELLOW |
| CI/CD                      | 18            |  🔴 RED |
| Observability              | 22            |  🔴 RED |
| Test coverage              | 5             |  🔴 RED |
| **Production readiness**   | **20**        |  🔴 RED |

## 4. Decision points for the owner

### 4.1 Can admin writes stay enabled today?

**No.** Even forgetting `FIND-001`, the idempotency model
(`FIND-003`) cannot guarantee single-mutation semantics in the
presence of any infra hiccup. Until at least Phase 0 and Phase 1.5
ship, the operator should treat grant/refund/suspend as **disabled**
or as **best-effort** with manual reconciliation.

### 4.2 Can Sprint 5 (anti-fraud) start?

**No.** Anti-fraud requires a trustworthy economy. While
`admin_grant_coin` is callable anonymously, every "anomaly score" the
panel could produce is contaminated. Phase 0 closes that hole; Phase
1.4 (repair migration) restores ledger invariants. After both, Sprint
5 can begin.

### 4.3 Should Sprint 7 (Litecoin) start?

**No, and we recommend deferring it indefinitely.** Adding real-money
rails to a platform that currently:

- Has anonymous economy-mutation endpoints (`FIND-001`),
- Cannot atomically record actions (`FIND-003`),
- Has all live secrets in a committed DOCX (`FIND-002`),
- Has no MFA, no rate limiting, no test coverage,

is a regulatory and counter-party hazard. The handoff also implies
that operating LTC deposits/withdrawals plus a 1 LTC = 1000 Coin
exchange rate would constitute, jurisdiction-dependent, both a money
transmission and a gambling activity. Consult counsel before
investing engineering hours.

### 4.4 What must be temporarily disabled?

Until Phase 0 + Phase 1 land:

| Surface                                                      | Recommendation        |
| :----------------------------------------------------------- | :-------------------- |
| `POST /api/admin/players/:id/grant-coin`                     | 503 OR rely on `FIND-001` REVOKE having landed |
| `POST /api/admin/players/:id/suspend`                        | 503 OR same           |
| `POST /api/admin/stakes/:id/refund`                          | 503 OR same           |
| `GET /api/health`                                            | replace body with `{ok:true}` |
| Source maps                                                  | rebuild without `--sourcemap` |
| Handoff DOCX in repo                                          | remove from `main`, plan rewrite |
| `VITE_ADMIN_PASSPHRASE` env in CF Pages                       | remove |

## 5. The single most important next 24 hours

In order:

1. `scripts/audit/repair_phase0_template.sql` reviewed → applied via
   Supabase SQL Editor.
2. Re-probe `POST /rest/v1/rpc/admin_set_suspension` from anon.
   Expected: **401 / "permission denied"**.
3. Rotate the four secret families (PAT, CF token, service role,
   anon, admin password, JWT secret).
4. Disable source maps; redeploy.
5. Remove `docs/admin/SHASHKI_ROYALE_ADMIN_HANDOFF.docx` from `main`.
6. Run `scripts/audit/diag_*.sql` to baseline current DB invariants.

## 6. Risk register (compact)

| ID         | Title                                                          | Sev   | Status     |
| :--------- | :------------------------------------------------------------- | :---: | :--------- |
| FIND-001   | Anon callable admin RPCs                                       | 🔴 C  | Confirmed  |
| FIND-002   | Secrets committed to git + leaked in chat                       | 🔴 C  | Confirmed  |
| FIND-003   | Non-atomic idempotency                                          | 🔴 C  | Confirmed  |
| FIND-004   | Over-broad CHECK-constraint demolition                          | 🔴 C  | Confirmed  |
| FIND-005   | Source maps exposed                                             | 🔴 C  | Confirmed  |
| FIND-006   | JWT in localStorage, no CSP                                     | 🔴 C  | Confirmed  |
| FIND-007   | Login timing oracle                                             | 🟠 H  | Confirmed  |
| FIND-008   | No brute-force protection                                       | 🟠 H  | Confirmed  |
| FIND-009   | `/api/health` info leak                                         | 🟡 M  | Confirmed  |
| FIND-013   | Idempotency unique index ineffective (NULL actor_id)            | 🟠 H  | Confirmed  |
| FIND-014   | Missing CSP/HSTS/COOP                                           | 🟠 H  | Confirmed  |
| FIND-015   | CORS `*` on admin                                                | 🟡 M  | Confirmed  |
| FIND-016   | Realtime publication contents not verified                      | 🟡 M  | Suspected  |
| FIND-018   | CSV formula injection in Players export                          | 🟡 M  | Suspected  |
| FIND-019   | UUID path-param not validated                                    | 🟠 H  | Confirmed  |
| FIND-020   | Suspension may not be game-enforced                              | 🟠 H  | Suspected  |
| FIND-021   | Unbounded full table scan in wallets summary                     | 🟡 M  | Confirmed  |
| FIND-022   | Unbounded `limit` on transactions/recent                          | 🟡 M  | Confirmed  |
| FIND-023   | In-memory aggregation, no audit on by-type                       | 🟡 M  | Confirmed  |
| FIND-024   | No CI, no reproducible build                                     | 🟠 H  | Confirmed  |
| FIND-025   | No branch protection                                              | 🟠 H  | Suspected  |
| FIND-026   | `admin_users` schema is decorative                               | 🟠 H  | Confirmed  |
| FIND-027   | PBKDF2 iteration count from stored hash, not enforced floor       | 🟢 L  | Confirmed  |
| FIND-028   | UI claims "120k" PBKDF2; handoff claims "100k"; truth unverifiable | 🟢 L | Suspected  |
| FIND-029   | `commit-dirty=true` deploys                                       | 🟠 H  | Confirmed  |
| FIND-030   | No `iss`/`aud` claims on JWT                                      | 🟠 H  | Confirmed  |
| FIND-031   | No JWT revocation                                                 | 🟠 H  | Confirmed  |
| FIND-032   | Role hard-coded server-side                                       | 🟡 M  | Confirmed  |
| FIND-033   | No gitleaks/secret-scanning CI                                    | 🟠 H  | Confirmed  |
| FIND-034   | Legacy passphrase env still embedded in bundle                    | 🟠 H  | Confirmed  |
| FIND-035   | Sprint 4 SQL grants `EXECUTE` without `REVOKE` (root of FIND-001)  | 🔴 C  | Confirmed  |
| FIND-036   | `refund_stake` silently zero-floors `locked_balance`               | 🟠 H  | Confirmed  |
| FIND-037   | `refund_stake` mints crypto without verifying prior lock           | 🟠 H  | Confirmed  |
| FIND-038   | `crypto_balance` mis-naming                                        | 🟢 L  | Confirmed  |
| FIND-039   | Audit log coverage gaps                                            | 🟡 M  | Confirmed  |
| FIND-040   | `actor_ip` missing on non-login audits                             | 🟠 H  | Confirmed  |
| FIND-041   | 500 path leaks SQL error text                                       | 🟡 M  | Confirmed  |
| FIND-042   | `apiFetch` returns error body as data on non-401                    | 🟡 M  | Confirmed  |
| FIND-043   | `apiFetch` no typed network-error handling                          | 🟢 L  | Confirmed  |
| FIND-044   | Stale JWT reactive only on next route change                        | 🟢 L  | Confirmed  |
| FIND-045   | New `idempotency_key` per retry defeats idempotency                  | 🟢 L  | Confirmed  |
| FIND-046   | Double-submit possible inside disabled-flag React batch              | 🟢 L  | Confirmed  |
| FIND-047   | React Query cache not cleared on logout                              | 🟢 L  | Confirmed  |
| FIND-048   | No `yarn npm audit` in CI                                            | 🟢 L  | Confirmed  |
| FIND-049   | No SRI / no Subresource Integrity inventory                          | 🟢 L  | Informational |
| FIND-LEGAL | Sprint 7 Litecoin roadmap — regulatory/AML/gambling exposure          | 🟠 H  | Advisory   |

Totals: **8 Critical / 14 High / 10 Medium / 6 Low / 5 Informational = 43**

(One advisory finding `FIND-LEGAL` is recorded but not counted as a
defect; it is a *scope decision* recommendation.)

## 7. Closing recommendation

The admin panel has a clean architectural sketch and the right
intuitions (`SECURITY DEFINER` + service-role isolation, audit log,
idempotency-key concept, no anon writes through the UI). The
*implementation* of those intuitions is incomplete in a way that
turns several of them into theatre rather than control. The
prioritised fixes in
[`ADMIN_REMEDIATION_ROADMAP.md`](./ADMIN_REMEDIATION_ROADMAP.md)
are sequenced to turn each intuition into a real control with the
minimum churn.

**Do Phase 0 today.** Everything else can follow at a normal pace.
