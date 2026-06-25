# `docs/audit/` — Shashki Royale Admin Panel — Audit Package

> Read these in this order:
>
> 1. [`ADMIN_AUDIT_EXECUTIVE_SUMMARY.md`](./ADMIN_AUDIT_EXECUTIVE_SUMMARY.md)
> 2. [`ADMIN_AUDIT_FINAL_REPORT.md`](./ADMIN_AUDIT_FINAL_REPORT.md)
> 3. [`ADMIN_REMEDIATION_ROADMAP.md`](./ADMIN_REMEDIATION_ROADMAP.md)
>
> For evidence: [`ADMIN_AUDIT_EVIDENCE.md`](./ADMIN_AUDIT_EVIDENCE.md).
> Per-domain depth: see other `ADMIN_*.md` files.
> Machine-readable list: [`findings.json`](./findings.json).

## Scope

- Repo: `altynkanafina1-ship-it/admin-panel-discovery` @ `6429c1c`
- Production admin: `https://shashki-royale-admin.pages.dev`
- Supabase project: `jsykbnkbrwwsxcdurzcw`
- Period: 2026-06-25
- Branch: `audit/admin-panel-hardening`
- Production mutations: **none**

## Headline

- 8 Critical, 14 High, 10 Medium, 6 Low, 5 Informational, 1 Advisory.
- The most damaging finding (`FIND-001`) is reproducible against
  production with the public anon key alone. Its fix is a ~15-minute
  SQL `REVOKE` block (`scripts/audit/repair_phase0_template.sql`).
- The handoff DOCX in this repository contains live secrets in
  plaintext (`FIND-002`). All four secret families must be rotated.

## Files in this audit

```
docs/audit/
├── README.md                            (this file)
├── ADMIN_AUDIT_EXECUTIVE_SUMMARY.md
├── ADMIN_SYSTEM_MAP.md
├── ADMIN_THREAT_MODEL.md
├── ADMIN_SECURITY_AUDIT.md
├── ADMIN_DATABASE_RLS_RPC_AUDIT.md
├── ADMIN_COIN_LEDGER_AUDIT.md
├── ADMIN_API_AUDIT.md
├── ADMIN_FRONTEND_UX_AUDIT.md
├── ADMIN_CICD_INFRA_AUDIT.md
├── ADMIN_TEST_GAP_ANALYSIS.md
├── ADMIN_REMEDIATION_ROADMAP.md
├── ADMIN_AUDIT_EVIDENCE.md
├── ADMIN_AUDIT_FINAL_REPORT.md
└── findings.json

scripts/audit/
├── diag_constraints.sql       (read-only — list wallet_transactions CHECKs)
├── diag_grants.sql            (read-only — list EXECUTE grants on admin_* RPCs)
├── diag_reconcile.sql         (read-only — Coin economy reconciliation)
├── repair_phase0_template.sql (TEMPLATE — review before applying)
├── probe_prod.sh              (non-destructive production probes)
└── probe_anon_rpc.sh          (confirms FIND-001 against production)

tests/audit/
├── test_health_no_leak.spec.md
├── test_login_timing.spec.md
├── test_idempotency_atomicity.spec.md
└── test_rpc_revoke.spec.md
```

## What this audit branch does NOT do

- It does not change production code.
- It does not apply any SQL.
- It does not deploy.
- It does not rotate secrets (only the operator can).
- It does not merge into `main`.
