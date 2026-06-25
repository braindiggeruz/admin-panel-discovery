# Shashki Royale · Admin Panel — CI/CD & Infrastructure Audit

> Scope: build, deploy, branch protection, secret scanning, dependency
> hygiene, backups, environment separation, rollback.

---

## 1. Current pipeline (observed + handoff)

| Aspect                       | State                                                                                       |
| :--------------------------- | :------------------------------------------------------------------------------------------ |
| GitHub Actions workflows      | **None present** in repository (`.github/workflows/` does not exist)                       |
| Cloudflare Pages → Git source | Disconnected per handoff § 1.5; deploys are `npx wrangler pages deploy dist`                |
| Build provenance              | `--commit-dirty=true` per handoff → production may not match any commit SHA                  |
| Branch protection             | Unknown without API access to GitHub — **SUSPECTED absent** (no `.github/CODEOWNERS`, no `branch_protection_rules`) |
| Dependabot                    | Not configured                                                                              |
| CodeQL                        | Not configured                                                                              |
| Secret scanning               | Default GitHub built-in only; the handoff DOCX has already slipped through                  |
| Preview deployments           | Possible via Wrangler `--branch=…`; not used in observed history                            |

### `FIND-024` (HIGH) — No reproducible build / no commit pinning

Deploys are manual, dirty, and not tied to a SHA enforced by CI.
"Production at this URL" cannot be answered with a single `git rev-parse`.

### `FIND-025` (HIGH) — No branch protection on `main`

(`SUSPECTED`. Inferable from: single-actor PAT, sequence of fast-forward
commits authored as `Admin Bot`, the handoff's "git push origin main"
flow, and the absence of any GitHub Actions check that *could* gate
merges. Confirm via GitHub API after PAT rotation.)

### `FIND-029` (HIGH) — `--commit-dirty=true`

Per handoff § 1.2 deploy command. This flag tells Wrangler to ignore
uncommitted changes; a deploy can include local edits that never
land in Git. The deployed bundle's `commit-hash` is taken from
`git rev-parse HEAD`, but it does **not** include the dirty diff.

## 2. Secret management

### Repository

- `.env.example` is fine (no live secrets).
- **`docs/admin/SHASHKI_ROYALE_ADMIN_HANDOFF.docx`** contains live
  secrets (`FIND-002`, CRITICAL).
- No `gitleaks` / `trufflehog` / pre-commit hooks.

### Cloudflare Pages env

- Per handoff § 1.3, secrets live in Pages env. We can verify their
  presence (not values) via the leak in `/api/health`:
  `{ has_service_role: true, has_jwt_secret: true, has_pwd_hash: true }`.
- We cannot list which vars are marked secret vs plain from outside.
  `SUSPECTED` that `VITE_*` vars are correctly `plain` (else build
  would fail to read them at bundle time).

### Github PAT in remote URL

If at any point a remote URL of the form
`https://altynkanafina1-ship-it:ghp_xxx@github.com/.../` was set
locally (the handoff § 1.5 explicitly recommends this), the PAT is in
`.git/config` and may also be in `~/.git-credentials`,
`~/.netrc`, the shell history of the deploying machine, and any CI
logs that printed it.

**Audit branch will use a `https://github.com/…` remote without
PAT-in-URL.** The branch we push uses Git's credential helper or
ephemeral env vars, never `origin URL` baking. (Verified after clone:
the `origin` was reset to a PAT-less URL in the first audit commit.)

## 3. Dependency hygiene

`package.json` (root of admin panel) lists:

| Package                      | Version    | Note                       |
| :--------------------------- | :--------- | :------------------------- |
| `@supabase/supabase-js`      | ^2.104.0   | OK                         |
| `@tanstack/react-query`      | ^5.99.1    | OK                         |
| `react` / `react-dom`        | ^18.3.1    | OK                         |
| `react-router-dom`           | ^7.14.1    | major-version jump from v6; check breaking changes if upgrading |
| `recharts`                   | 2.15.4     | pinned                     |
| `lucide-react`               | ^0.469.0   | OK                         |
| `vite`                       | ^6.0.7     | OK                         |
| `wrangler`                   | 3.99.0     | watch for major bumps      |
| `typescript`                 | ^5.7.3     | OK                         |

`yarn.lock` exists. `package-lock.json` does not. Build is yarn-only.

**`FIND-048`** (LOW): No `npm audit` / `yarn npm audit` is wired into
CI. Vulnerability triage relies on manual cadence.

**`FIND-049`** (LOW): Bundler config not audited end-to-end; no
verification of Subresource Integrity for any third-party CDN
references. (None observed in `index.html`.)

## 4. Deployment / rollback

- No documented rollback runbook.
- Wrangler keeps prior deploys in CF Pages; rollback is a UI click,
  but no smoke test / verification step exists between revert and
  "production ok".
- No DB migration rollback for Sprint 4 (Sprint 4 migration is
  effectively non-reversible).

### Recommended pipeline (Phase 2)

```yaml
# .github/workflows/admin-panel.yml
name: admin-panel
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: yarn }
      - run: yarn install --frozen-lockfile
      - run: yarn tsc --noEmit
      - run: yarn lint
      - run: yarn build
      - uses: cloudflare/pages-action@v1
        if: github.ref == 'refs/heads/main'
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: shashki-royale-admin
          directory: dist
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
      - run: ./scripts/smoke_admin.sh   # exits non-zero on broken /api/health
```

Plus:

- Required PR review (1 approver, not the author).
- Required status checks: `tsc`, `lint`, `build`, `smoke`.
- Required signed commits (optional, Phase 4).
- Required `gitleaks` action on PRs.

## 5. Backups & disaster recovery

| Asset                | Backup state                                                                  |
| :------------------- | :---------------------------------------------------------------------------- |
| Supabase Postgres    | PITR availability depends on plan tier; **not verified** from outside         |
| Admin code           | GitHub `main` is the only copy                                                |
| Audit log            | Lives in same DB; one DROP loses both                                          |
| Cloudflare config    | Pages settings + env vars; **no backup** (per handoff "secrets can't be read after set") |

**Recommendation (Phase 2)**: nightly logical dump of
`admin_audit_log`, `admin_users`, `wallet_transactions` to an
external write-once store (S3 with Object Lock or R2 with immutability).
This is essential to detect tampering and to survive an insider event.

## 6. Staging

There is **no staging environment**. Per handoff the only deploy
target is production. Recommendation: create a second CF Pages
project `shashki-royale-admin-staging` and a separate Supabase project
(or a separate schema in the same project) to host pre-prod tests.

## 7. Summary table

| Finding   | Severity | Status     |
| :-------- | :------: | :--------- |
| FIND-002  | CRITICAL | confirmed  |
| FIND-024  | HIGH     | confirmed  |
| FIND-025  | HIGH     | suspected  |
| FIND-029  | HIGH     | confirmed  |
| FIND-033  | HIGH     | proposed   |
| FIND-048  | LOW      | confirmed  |
| FIND-049  | LOW      | confirmed  |
