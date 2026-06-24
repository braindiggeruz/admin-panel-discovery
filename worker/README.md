# Admin API Worker — Sprint 2 infrastructure

Cloudflare Worker, который заменит passphrase-soft-gate на настоящую
авторизацию с JWT/TOTP + audit log. **Пока НЕ деплоится**; этот код подготовлен,
чтобы когда вы добавите `SUPABASE_SERVICE_ROLE_KEY` в secrets, всё стартовало в один шаг.

## Зачем нужен

- `service_role` ключ нельзя класть во frontend bundle (=> бесконечная привилегия).
- Этот Worker — единственная точка, где `service_role` живёт, защищённая HMAC/JWT.
- Frontend будет общаться с Worker’ом по `/admin/*` через JWT cookie.

## Что внутри

```
worker/
├── wrangler.toml         — config
├── src/
│   ├── index.ts          — router + middleware
│   ├── auth.ts           — login, JWT signing, TOTP verify
│   ├── audit.ts          — write to admin_audit_log
│   ├── handlers/
│   │   ├── players.ts    — GET /admin/players/:id (with email/wallet/transactions)
│   │   ├── wallets.ts    — GET /admin/wallets/:player_id
│   │   ├── refund.ts     — POST /admin/refund (Sprint 3)
│   │   └── grant.ts      — POST /admin/grant   (Sprint 3)
│   └── db.ts             — supabase service-role client
```

## Запуск (когда будете готовы)

1. Применить миграцию: см. `supabase/admin.sql` (создаёт `admin_users`, `admin_audit_log`).
2. Получить service_role в Supabase Dashboard → Settings → API → service_role.
3. Положить секреты:
   ```
   cd worker
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put JWT_SECRET
   npx wrangler secret put ARGON2_PEPPER
   ```
4. Создать первого Owner:
   ```sql
   -- В Supabase SQL editor
   insert into admin_users(email, password_hash, role)
   values ('you@example.com', '<argon2id-hash>', 'owner');
   ```
5. Задеплоить:
   ```
   npx wrangler deploy
   ```
6. В Cloudflare Pages `shashki-royale-admin` добавить env:
   `VITE_ADMIN_API_URL=https://admin-api.<account>.workers.dev`

После этого можно будет в админке нажать «Sign in» и зайти как Owner.
