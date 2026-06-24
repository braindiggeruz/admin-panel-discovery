# ADMIN_PANEL_SECURITY_ARCHITECTURE — Шашки Рояль

> Принцип: **никаких служебных ключей во frontend bundle. Любая мутация идёт через серверный proxy с проверкой роли и аудитом.**

---

## 1. Текущее состояние (Phase 1, этот PR)

| Слой | Что | Безопасность |
|---|---|---|
| Frontend (Cloudflare Pages preview) | React SPA | анонимный, только read |
| Supabase client | `anon` key | тот же что и у игры; нельзя получить wallet/transactions |
| Доступ к панели | passphrase в `VITE_ADMIN_PASSPHRASE` (build-time env) | НЕ настоящая авторизация — soft gate против случайных глаз |
| Запись в БД | **нет** | вообще нет path’а для записи |

**Утверждение**: даже при утечке passphrase атакующий получает ровно то, что и так публично через `anon` ключ. Это приемлемо для preview, **но не для production владельцу**.

## 2. Целевая модель (Sprint 2)

```
[Browser admin SPA]
   │ JWT (короткоживущий)
   ▼
[Cloudflare Worker: /admin/*]   ← здесь живёт SUPABASE_SERVICE_ROLE
   │ проверка JWT → admin_users.role
   │ rate-limit per role
   │ запись в admin_audit_log (BEFORE)
   ▼
[Supabase RPC / SQL]
   │ результат
   ▼
[Worker]
   │ запись в admin_audit_log (AFTER + diff)
   ▼
[Browser SPA]
```

Ключевые свойства:

- **service_role** живёт ТОЛЬКО в `wrangler secret` Cloudflare Worker.
- **JWT** выдаётся Worker’ом после успешного логина (email+password+TOTP), не Supabase Auth — чтобы не путать роли игроков и админов.
- **admin_users** — отдельная таблица:
  ```sql
  create table admin_users (
    id uuid primary key default gen_random_uuid(),
    email text unique not null,
    password_hash text not null,       -- argon2id
    totp_secret text,
    role text not null check (role in ('owner','admin','support','analyst','moderator','viewer')),
    is_active boolean default true,
    created_at timestamptz default now()
  );
  ```
- **admin_audit_log** — append-only:
  ```sql
  create table admin_audit_log (
    id uuid primary key default gen_random_uuid(),
    actor_email text not null,
    actor_ip inet,
    action text not null,
    target_kind text,          -- 'player' | 'wallet' | 'game' | ...
    target_id text,
    reason text not null,      -- ОБЯЗАТЕЛЬНО
    before jsonb,
    after jsonb,
    idempotency_key text,
    created_at timestamptz default now()
  );
  create index on admin_audit_log (created_at desc);
  create index on admin_audit_log (target_kind, target_id);
  ```

## 3. RBAC (минимум для Sprint 2)

```
owner       > admin > support > moderator > analyst > viewer
              |        |          |           |        \-- только read dashboards
              |        |          |           \-- read + export
              |        |          \-- read + бан/разбан
              |        \-- read + refund до 1000 Coin
              \-- всё кроме управления админами
```

Реализация: одна строка `role` в `admin_users` + матрица allowed actions на Worker. Никаких client-side проверок «можно/нельзя» — только UX подсказки.

## 4. Защита привилегированных действий

| Защита | Где |
|---|---|
| Обязательный `reason` (текст ≥ 10 символов) | UI + Worker |
| Confirm modal с показом `before/after` | UI |
| Dual approval для action > $threshold | Worker очередь |
| Idempotency-Key из UI (UUID v4) | Worker store на 24h |
| Rate-limit per role (например, refund: 30/час для support) | Worker |
| Session expire 8h + idle timeout 30 min | Worker |
| IP allowlist (опционально) | Worker / Cloudflare Access |
| Hardware key (WebAuthn) для owner | Опция Sprint 3 |
| Emergency revoke: `is_active = false` | Worker проверяет на каждом запросе |

## 5. Что мы НЕ делаем (намеренно)

- ❌ Скрытый URL как «защита» (security through obscurity не работает)
- ❌ Проверка роли в React-компоненте (можно обойти DevTools)
- ❌ localStorage с JWT без короткого срока жизни и refresh
- ❌ Service-role rls bypass с `Authorization: Bearer service_role` напрямую с фронта
- ❌ Admin auth через тот же Supabase Auth, что и игроки (смешение моделей)

## 6. Идеальный путь для каждого опасного действия

### Пример: возврат Coin игроку

1. Support открывает Player 360, нажимает `Refund last stake (50 Coin)`.
2. UI: модалка → ввод reason → confirm.
3. UI отправляет: `POST /admin/refund` с JWT, idempotency-key, target_id, amount, reason.
4. Worker проверяет: JWT валиден, role=support, rate-limit OK, amount ≤ 1000.
5. Worker пишет `admin_audit_log` (status=pending, before=current wallet).
6. Worker вызывает Supabase RPC `admin_refund_stake(stake_id, reason)` (новая, `SECURITY DEFINER`, проверяет actor через GUC).
7. Получает результат, пишет audit_log (status=success, after=new wallet).
8. Возвращает UI confirmation + new balance.

При сбое: worker всё равно пишет audit_log (status=failed) — без потери следа.

## 7. Минимально достаточное для MVP (где мы сейчас)

- ✅ Только anon Supabase key — никакого privilege escalation возможно
- ✅ Robots: `noindex` на admin domain
- ✅ Passphrase soft gate, чтобы случайный человек не получил скриншот всех игроков
- ✅ Никаких write endpoints — даже если кто-то залогинится, ничего не сломает
- ❌ TLS (даётся Cloudflare Pages из коробки)
- ❌ Нет audit log (нечего аудитить — только read)

## 8. Чек-лист на момент введения первой write-операции (Sprint 2)

- [ ] Cloudflare Worker `admin-api` создан, service_role в `wrangler secret`
- [ ] Таблицы `admin_users`, `admin_audit_log` созданы + RLS only service_role
- [ ] Создан первый owner: argon2id + TOTP
- [ ] JWT flow: login → 8h токен, отдельный refresh
- [ ] Audit log пишет before/after для каждой mutation RPC
- [ ] UI требует reason
- [ ] Idempotency-Key обязателен в headers
- [ ] Rate-limit таблица с per-role лимитами
- [ ] Прогон end-to-end: refund → audit → state consistent
- [ ] Документация для саппорта на 1 страницу

Только после этого можно открывать первый write-эндпоинт (refund Coin).
