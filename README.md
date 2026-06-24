# Shashki Royale · Command Center

Read-only admin panel for the **Шашки Рояль** game.

> Phase 1 deliverable — built autonomously on 2026-06-24.
> See [`docs/admin/ADMIN_PANEL_PHASE_1_REPORT.md`](docs/admin/ADMIN_PANEL_PHASE_1_REPORT.md) for the full report.

## What is it

A premium, dark-themed command center for the game owner to observe what's
happening in production:

- 890+ live players, 77 matches, 35 stake rooms
- Real KPIs from production Supabase (`jsykbnkbrwwsxcdurzcw.supabase.co`)
- Player leaderboard with filters and search
- Match inspector with move-by-move history
- Coin economy: pot, escrow status, payouts, 5% commission
- System health probes

## What it is NOT (yet)

- Not a write-capable admin. No DB mutations possible.
- Not a real RBAC system. Single shared passphrase gate.
- Not connected to LTC deposits yet (planned Sprint 5).

## Architecture (short)

- **Vite + React 18 + TypeScript + Tailwind 3 + Recharts**
- **Supabase JS client with anon key** (same as the game's public key)
- **Cloudflare Pages** deployment under a separate Cloudflare account
- **Separate GitHub repo** from the game — zero risk to production

Full architecture: [`docs/admin/ADMIN_PANEL_TECHNICAL_ARCHITECTURE.md`](docs/admin/ADMIN_PANEL_TECHNICAL_ARCHITECTURE.md)

## Local development

```bash
yarn install
cp .env.example .env
# fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_ADMIN_PASSPHRASE
yarn dev
# open http://localhost:5173
```

## Build

```bash
yarn build
# output in dist/
```

## Documents

| File | Purpose |
|---|---|
| `ADMIN_PROJECT_INVENTORY.md` | Deep audit of the game project |
| `ADMIN_PANEL_PRODUCT_AUDIT.md` | What the admin needs to see / do |
| `ADMIN_PANEL_SECURITY_ARCHITECTURE.md` | How privileged actions will be protected |
| `ADMIN_PANEL_TECHNICAL_ARCHITECTURE.md` | Stack decisions |
| `ADMIN_PANEL_ROADMAP.md` | Sprint-by-sprint plan |
| `ADMIN_PANEL_PHASE_1_REPORT.md` | Phase 1 final report |

## Roadmap (high level)

1. ✅ **Sprint 1**: visual prototype + read-only Overview (this PR)
2. **Sprint 2**: secure admin authorization (Cloudflare Worker + JWT + RBAC)
3. **Sprint 3**: Player 360 + support tools
4. **Sprint 4**: anti-fraud and moderation
5. **Sprint 5**: LTC deposits → Coin
6. **Sprint 6**: alerts & automation
7. **Sprint 7**: retention analytics
8. **Sprint 8**: LiveOps configuration
