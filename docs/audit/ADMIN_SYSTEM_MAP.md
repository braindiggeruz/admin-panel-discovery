# Shashki Royale · Admin Panel — System Map

> **Source of truth.** Built from the actual `main` HEAD (`6429c1c`),
> live response inspection of `https://shashki-royale-admin.pages.dev`,
> and PostgREST RPC behaviour. The historical handoff document is used
> only to disambiguate intent; *all factual claims are anchored to a
> file path, an HTTP response, or an RPC return.*

---

## 1. Topology

```
┌──────────────────────┐    HTTPS    ┌──────────────────────────────┐    REST    ┌─────────────────┐
│ Browser (SPA)        │ ─────────▶ │ Cloudflare Pages Functions   │ ─────────▶ │ Supabase Postgres│
│ shashki-royale-admin │            │ functions/api/[[path]].ts    │            │ jsykbnk…o       │
│  Vite/React bundle   │ ◀───────── │ JWT verify + service_role    │ ◀───────── │ + Realtime + RPC │
└──────────────────────┘            └──────────────────────────────┘            └─────────────────┘
        │                                                                                 ▲
        │  Direct WSS/REST to Supabase, anon key  (RLS-protected; see § 4)               │
        └─────────────────────────────────────────────────────────────────────────────────┘
```

| Component                | Surface                                                  | Authentication |
| :----------------------- | :------------------------------------------------------- | :-------------- |
| Admin SPA                | `https://shashki-royale-admin.pages.dev`                 | Owner login → JWT in `localStorage` |
| Admin API (CF Functions) | same origin, prefix `/api/*`                             | Bearer JWT (HS256) signed by `JWT_SECRET` |
| Supabase REST (direct)   | `https://jsykbnkbrwwsxcdurzcw.supabase.co/rest/v1/*`     | `anon` (publishable, in bundle) → RLS |
| Supabase RPC (direct)    | `https://jsykbnkbrwwsxcdurzcw.supabase.co/rest/v1/rpc/*` | `anon` JWT — **see `FIND-001`: admin_* RPCs callable from PUBLIC** |
| Realtime                 | `wss://jsykbnkbrwwsxcdurzcw.supabase.co/realtime/v1`     | `anon` → channel filters via Realtime publication |

## 2. Repository tree (only audit-relevant nodes)

```
admin-panel-discovery/
├── functions/api/[[path]].ts            ★ single-file router; service_role lives here
├── public/
│   ├── _headers                          ← Cloudflare Pages header rules
│   └── _redirects                        ← SPA fallback
├── supabase/
│   ├── admin.sql                         ← admin_users, admin_audit_log, admin_rate_violations
│   └── admin_sprint4.sql                 ← Sprint 4 RPCs + schema changes (see FIND-004)
├── src/
│   ├── App.tsx                           ← LoginScreen gate before <Layout>
│   ├── services/
│   │   ├── auth.ts                       ← login(), apiFetch, apiMutate, grantCoin, refundStake, suspendPlayer
│   │   ├── admin.ts
│   │   └── insights.ts
│   ├── lib/
│   │   ├── supabase.ts                   ← createClient(anon)
│   │   ├── realtime.ts
│   │   ├── gate.ts                       ← legacy passphrase gate (dead code, but VITE_ADMIN_PASSPHRASE still embedded in bundle)
│   │   ├── format.ts
│   │   └── types.ts
│   ├── components/
│   │   ├── LoginScreen.tsx               ← email+password, claims "120k PBKDF2" (worker uses iter from stored hash)
│   │   ├── Gate.tsx                      ← LEGACY, no longer mounted in App.tsx
│   │   ├── ActionModal.tsx               ← Sprint 4 confirm dialog
│   │   ├── Layout.tsx, Toast.tsx, LiveFeed.tsx, CommandPalette.tsx, CountUp.tsx, CheckersBoard.tsx, LiveIndicator.tsx, ui.tsx
│   └── pages/
│       ├── Overview.tsx, Players.tsx, PlayerDetail.tsx
│       ├── Matches.tsx, MatchDetail.tsx
│       ├── Economy.tsx, Insights.tsx
│       ├── SystemHealth.tsx, Roadmap.tsx
└── docs/
    ├── admin/SHASHKI_ROYALE_ADMIN_HANDOFF.docx  ★ contains ALL production secrets in plaintext
    └── audit/                                    ← this audit
```

## 3. Authoritative API surface

(Inventory below is sourced exclusively from `functions/api/[[path]].ts`.)

| Verb | Route                                       | Auth   | DB action                                                  |
| :--- | :------------------------------------------ | :----- | :-------------------------------------------------------- |
| GET  | `/api/health`                               | none   | none — returns env-existence flags (info-leak, see `FIND-009`) |
| OPTIONS | `* /api/*`                                | none   | preflight (CORS `*`)                                       |
| POST | `/api/auth/login`                           | none   | reads env hash; INSERT into `admin_audit_log`              |
| GET  | `/api/auth/me`                              | JWT    | none                                                       |
| GET  | `/api/admin/players/:id`                    | JWT    | 4× SELECT (profiles, wallets, wallet_transactions, game_stakes) |
| GET  | `/api/admin/players/:id/audit`              | JWT    | SELECT admin_audit_log                                      |
| POST | `/api/admin/players/:id/grant-coin`         | JWT    | RPC `admin_grant_coin` + INSERT admin_audit_log             |
| POST | `/api/admin/stakes/:id/refund`              | JWT    | RPC `admin_refund_stake` + INSERT admin_audit_log           |
| POST | `/api/admin/players/:id/suspend`            | JWT    | RPC `admin_set_suspension` + INSERT admin_audit_log         |
| GET  | `/api/admin/wallets/summary`                | JWT    | 2× SELECT wallets (no LIMIT on totals query)                |
| GET  | `/api/admin/transactions/recent?limit=N`    | JWT    | SELECT wallet_transactions + enrichment from public_profiles |
| GET  | `/api/admin/transactions/by-type`           | JWT    | SELECT wallet_transactions LIMIT 10000 + in-memory aggregation |

(Detailed per-endpoint table → [`ADMIN_API_AUDIT.md`](./ADMIN_API_AUDIT.md).)

## 4. Database surface (from migrations + behaviour)

| Object                       | Source file              | Notes                                                                                                              |
| :--------------------------- | :----------------------- | :----------------------------------------------------------------------------------------------------------------- |
| `profiles`                   | game backend (n/a here)  | Sprint 4 added `suspended_until`, `suspension_reason`, `suspended_by` (verified by `admin_set_suspension` HTTP 200) |
| `wallets`                    | game backend             | `crypto_balance`, `locked_balance`, `total_won`, `total_lost`, `total_deposited`, `total_withdrawn`                  |
| `wallet_transactions`        | game backend + Sprint 4  | `type` whitelist expanded; **all CHECK constraints on `type` and `amount` columns were dropped** (FIND-004)         |
| `games`, `moves`, `game_stakes` | game backend          | read-only for admin                                                                                                |
| `public_profiles` (VIEW)     | game backend             | safe projection for `anon`                                                                                         |
| `admin_users`                | `supabase/admin.sql`     | RLS ENABLED, **no policies** — anon select returns `[]`                                                            |
| `admin_audit_log`            | `supabase/admin.sql`     | RLS ENABLED, no policies; UNIQUE INDEX on `(actor_id, idempotency_key) WHERE idempotency_key IS NOT NULL` (FIND-013)|
| `admin_rate_violations`      | `supabase/admin.sql`     | RLS ENABLED, **never written/read by current router code** (FIND-024)                                              |
| RPC `admin_grant_coin`       | `supabase/admin_sprint4.sql` | `SECURITY DEFINER`, `search_path=public`; **executable from PUBLIC** (FIND-001)                                |
| RPC `admin_refund_stake`     | `supabase/admin_sprint4.sql` | same                                                                                                           |
| RPC `admin_set_suspension`   | `supabase/admin_sprint4.sql` | same                                                                                                           |

## 5. Production environment (Cloudflare Pages → Pages Functions)

Variables expected by `functions/api/[[path]].ts` (`interface Env`):

| Name                    | Type   | Used at lines                                  |
| :---------------------- | :----- | :---------------------------------------------- |
| `SUPABASE_URL`          | plain  | 103, 163                                        |
| `SUPABASE_SERVICE_ROLE` | secret | 106-107, 165                                    |
| `JWT_SECRET`            | secret | 129, 195, 166                                   |
| `ADMIN_EMAIL`           | plain  | 164, 181                                        |
| `ADMIN_PASSWORD_HASH`   | secret | 167, 186                                        |
| `SESSION_TTL_SECONDS`   | plain  | 191                                             |
| `VITE_*`                | plain  | embedded into Vite bundle at build time         |

**No `commit-hash` enforcement is verifiable**: the workflow described by
the handoff is `npx wrangler pages deploy dist --commit-dirty=true`,
which means production may not correspond to any reproducible commit.
(`FIND-029`).

## 6. Auth flow (current implementation)

```
LoginScreen ──email+password──▶ POST /api/auth/login (CF Function)
                                  │
                                  ├─ env email check (line 181)
                                  │   • mismatch → setTimeout 250ms → 401
                                  ├─ verifyPassword(env hash)  (line 70-94, PBKDF2)
                                  │   • mismatch → 401 (NO delay) ← timing oracle
                                  ├─ jwtSign({sub:email, role:'owner', iat, exp})
                                  └─ audit("login_success")

apiFetch / apiMutate ──Authorization: Bearer <JWT>──▶ /api/admin/*
                                  │
                                  ├─ jwtVerify (HMAC SHA-256)
                                  ├─ NO role check beyond { email }
                                  ├─ NO admin_users.is_active check
                                  ├─ NO admin_users table lookup at all
                                  └─ proceeds to RPC / SELECT via service_role
```

## 7. Identity source-of-truth confusion

The handoff (§ 1.1, § 3.2) claims `admin_users` is "the admin table".
**`functions/api/[[path]].ts` never reads or writes it.** Authentication
is anchored entirely to four env vars: `ADMIN_EMAIL`,
`ADMIN_PASSWORD_HASH`, `JWT_SECRET`, `SESSION_TTL_SECONDS`. Consequence:

- Multi-admin support is impossible without code changes.
- `is_active=false` in `admin_users` is **not honored** anywhere.
- "Last login at" / "last login ip" columns in `admin_users` are
  always `NULL` (no code path updates them).

This is finding **`FIND-026`**.

## 8. Observable production realities

| Fact                                                                        | Source                            |
| :-------------------------------------------------------------------------- | :-------------------------------- |
| Production HTML returns `cache-control: no-store, must-revalidate`          | live HEAD `/` (2026-06-25)        |
| Production HTML returns `access-control-allow-origin: *`                    | live HEAD `/` (2026-06-25)        |
| **No** `Strict-Transport-Security`, **no** CSP, **no** COOP/COEP on admin   | live HEAD `/` (2026-06-25)        |
| `/api/health` leaks `admin_email`, `supabase` URL, flag triplet             | live GET `/api/health`            |
| `/assets/index-*.js.map` returns HTTP 200                                    | live GET source map               |
| Admin RPCs are callable using the public `anon` bundle key                  | live POST to `/rest/v1/rpc/*`     |
| Wrong-email vs wrong-password login latency diverges by ~280 ms              | timing probe (`FIND-007`)         |
| 5 consecutive wrong logins from one IP — no lockout, no throttling          | brute-force probe (`FIND-008`)    |
| `admin_rate_violations` table exists but is never touched by current router | static + behaviour                |

(Full transcripts in [`ADMIN_AUDIT_EVIDENCE.md`](./ADMIN_AUDIT_EVIDENCE.md).)
