# Test spec — FIND-009 health endpoint information leak fix

## Goal

`GET /api/health` should not reveal Supabase URL, admin email, or
env-existence flags.

## Test command

```bash
curl -s https://shashki-royale-admin.pages.dev/api/health
```

## Acceptance criteria

- Body is exactly `{"ok":true}` or `{"ok":true,"version":"<sha>"}`.
- No `admin_email`, no `supabase`, no `has_*` keys.
- HTTP status 200.
- `cache-control: no-store` preserved.
