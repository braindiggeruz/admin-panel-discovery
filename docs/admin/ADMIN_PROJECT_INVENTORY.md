# ADMIN_PROJECT_INVENTORY — Шашки Рояль

> Аудит сделан автономно через **GitHub** (`braindiggeruz/shashki-royale@main`, HEAD `abacbe5`),
> **production** (`shashki-royale.pages.dev`) и **production Supabase**
> (`jsykbnkbrwwsxcdurzcw.supabase.co`) в режиме read-only.
>
> ZIP-снимок `v1.4.8-final-release.zip` содержит **только Android wrapper и подписанные APK**.
> Полноценный исходный код был получен из GitHub. Существенных расхождений между ZIP и `main` не обнаружено.

---

## 1. Источники истины (по убыванию приоритета)

| Что | Источник | Заметки |
|---|---|---|
| Игровая логика | `src/game/engine.ts` + Supabase RPC `submit_move` | Сервер — авторитативный (с миграции v5) |
| Профили, рейтинг | `public.profiles` + view `public_profiles` | view используется фронтом |
| Кошелёк, баланс | `public.wallets` | RLS закрывает поля от других игроков |
| Транзакции | `public.wallet_transactions` | RLS закрывает поля от других игроков |
| Партии | `public.games` | RLS `select=true` (партия публична) |
| Ходы | `public.moves` | RLS `select=true` |
| Ставки/escrow | `public.game_stakes` | RLS `select=true` |
| Engagement | `public.engagement_log` (если включён v6) | win streak / daily / referrals |

## 2. Стек (подтверждено по `package.json` и production-бандлу)

- **Frontend**: React 19, Vite 7, TypeScript, Tailwind 4, React Router 7
- **Realtime/DB**: Supabase JS v2.74, Supabase Realtime (`postgres_changes`)
- **PWA**: `vite-plugin-pwa` 0.20, Workbox 7
- **Mobile**: Android WebView wrapper (`com.shashkiroyale.app`)
- **CI/CD**:
  - `.github/workflows/deploy-cloudflare-pages.yml` — `wrangler pages deploy dist`
  - `.github/workflows/build-android-apk.yml` — Gradle сборка APK
- **Hosting**: Cloudflare Pages `shashki-royale` (auto-deploy с `main`)

## 3. Карта таблиц (production Supabase)

> Подсчёты по состоянию **24 июня 2026**, anon-доступ.

| Таблица | Кол-во | Доступ anon | Назначение |
|---|---|---|---|
| `profiles` | — | через `public_profiles` view | основной профиль с email/device_fp |
| `public_profiles` (view) | **890** | ✅ select | безопасный публичный профиль |
| `wallets` | — | ❌ только владелец | balance / locked_balance |
| `wallet_transactions` | — | ❌ только владелец | append-only ledger |
| `games` | **77** | ✅ select | партии |
| `moves` | **46** | ✅ select | ходы |
| `game_stakes` | **35** | ✅ select | escrow по ставкам |
| `engagement_log` | — | ✅ select (по миграциям v6) | win-streak/daily/referrals |
| `action_log` | — | ❌ append-only | audit trail (старая версия) |

**Распределение `games.status`**: waiting 0, playing 0, finished 77. На момент аудита онлайн-активности нет.

## 4. Карта RPC (подтверждено в `supabase/*.sql`)

| RPC | Зачем | Авторизация |
|---|---|---|
| `get_or_create_profile(nickname, device_fp_hash?)` | онбординг | anon, idempotent |
| `claim_welcome_bonus(player_id)` | +100 Coin | anon, через `current_setting('app.current_player_id')` |
| `create_stake_game(player_id, entry_fee)` | создаёт партию + escrow | anon, проверяет баланс |
| `join_stake_game(player_id, room_code)` | подключение к ставке | anon, проверяет баланс |
| `submit_move(...)` | ход (server-side validation) | anon, RLS+context |
| `submit_resign(...)` | сдаться | anon |
| `claim_timeout_win(...)` | победа по таймауту | anon |
| `process_stake_game_result(...)` | settlement: pot → победитель − 5% | server-side функция |
| `cancel_stake_game / cancel_waiting_room` | возврат escrow | anon |
| `update_engagement_after_game` | win-streak/daily | anon (v6) |
| `register_referral / claim_referral_payout` | рефералы (v6) | anon |

**Безопасность RPC**: используют `SECURITY DEFINER` + проверку `app.current_player_id` через `set_config()`. Это правильно для anonymous onboarding, но НЕ даёт админу повысить привилегии — для админа нужен отдельный путь.

## 5. Цепочки UI → Backend (важнейшие)

- **Регистрация (anon)**:
  `pages/AuthBootstrap.tsx → services/profiles.ts → rpc('get_or_create_profile')`
- **Ставочная игра**:
  `pages/StakeLobbyPage.tsx → services/stakes.ts → rpc('create_stake_game')` →
  `Board.tsx → services/moves.ts → rpc('submit_move')` →
  при окончании: `rpc('process_stake_game_result')` (5% комиссия зашита в SQL).
- **Welcome bonus**:
  `services/bonus.ts → rpc('claim_welcome_bonus')` — выдаётся **один раз**, защита через UNIQUE flag в profiles.
- **Engagement**:
  каждый завершённый матч → `rpc('update_engagement_after_game')` → пишет в `engagement_log`.

## 6. Где источник истины расходится с клиентом

- **Coin balance**: всегда `wallets.balance` (БД). Клиент НИКОГДА не должен показывать своё значение.
- **Stake commission 5%**: зашита в `process_stake_game_result` (SQL). Клиент её не считает.
- **Game result**: считается сервером из последовательности `moves` + правил из RPC, клиент только показывает.
- **Engagement multiplier**: зашит в `claim_daily_challenge` / `update_engagement_after_game` (SQL).

→ Для админ-панели это критично: **любая аналитика должна читать БД, а не пересчитывать на фронте**.

## 7. Что уже сейчас годится для read-only админки

- ✅ `public_profiles` — KPI «всего игроков», leaderboard, поиск
- ✅ `games` — реестр партий, фильтр по статусу
- ✅ `moves` — Match Inspector (история ходов)
- ✅ `game_stakes` — экономика Coin: общий pot, выплачено, escrow, refund
- ✅ Тренды регистраций / завершённых матчей (агрегация по `created_at` / `updated_at`)

## 8. Что НЕ годится без серверного слоя

- ❌ Балансы конкретных игроков (`wallets.balance`) — RLS закрывает
- ❌ История транзакций конкретных игроков (`wallet_transactions`)
- ❌ email / device_fp игрока (нет в `public_profiles`)
- ❌ Antifraud-кластеризация по `device_fp_hash`
- ❌ Произвольные write-операции (бан / возврат / выдача Coin)
- ❌ Реальный статус Cloudflare deployment / GitHub Releases (нужны PAT)

→ Эти сценарии — Sprint 2+, через защищённый Cloudflare Worker с `service_role`.

## 9. Карта рисков (как есть сейчас)

| Риск | Где | Снижение |
|---|---|---|
| Утечка `service_role` | гипотетический фронт-админ | НЕ кладём в bundle, держим в Worker secret |
| Скрытый URL вместо auth | гипотетический фронт-админ | На MVP — passphrase; в Sprint 2 — JWT + RBAC |
| Дубли welcome-бонуса | `claim_welcome_bonus` | Уже защищено `bonus_claimed_at IS NULL` |
| Накрутка стрика мульти-аккаунтом | engagement | Sprint 4 antifraud по device_fp_hash |
| Settlement ошибка → потеря Coin | `process_stake_game_result` | Audit trail + idempotency_key (нужно добавить) |
| Ставочный refund мошенничество | `cancel_stake_game` | Сейчас allowed только до `playing`. ОК. |

## 10. Структура репозитория (упрощённо)

```
shashki-royale/
├── src/
│   ├── game/        # клиентский engine (для замеров/UI), правда на сервере
│   ├── pages/       # экраны: Auth, Local, Lobby, Stake, Wallet, Stats
│   ├── services/    # тонкие обёртки над supabase rpc
│   ├── hooks/       # useGameSync, useStakeGameSync, useEngagement
│   ├── lib/         # supabase client, auth, format
│   └── components/  # Board, AuthHeader, DebugPanel
├── supabase/
│   ├── schema.sql
│   ├── migration_v5_secure_moves.sql   # server-authoritative engine
│   ├── migration_v6_engagement.sql     # win-streak, daily, referrals
│   ├── migration_stakes.sql            # ставочные комнаты + escrow
│   └── apply_to_supabase.sql           # объединённый apply
├── android-webview-wrapper/  # Gradle + WebView
├── .github/workflows/
│   ├── deploy-cloudflare-pages.yml
│   └── build-android-apk.yml
└── docs/ (handoff и release notes)
```

---

## Итог: где мы стоим

- Игра работает, схема и RPC задокументированы, есть **890 живых профилей** и **77 завершённых партий** в production.
- Никакой админки сейчас нет. Game-фронт использует только `anon` ключ, что хорошо.
- Существует чистая поверхность read-only данных, достаточная для **полезной первой админ-панели без рисков**.
- Все опасные действия (балансы, баны, выдача Coin) **намеренно отложены до Sprint 2** с серверным админ-эндпоинтом.
