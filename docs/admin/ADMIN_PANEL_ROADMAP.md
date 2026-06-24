# ADMIN_PANEL_ROADMAP — Шашки Рояль

Каждый спринт — самодостаточен и приносит пользу. Спринт не начинается, пока
предыдущий не задеплоен и не одобрен владельцем.

---

## Sprint 0 — Discovery (✅ сделано в этом PR)

- Глубокий аудит игры, Supabase schema, RPC, RLS
- 5 документов в `docs/admin/`
- Решение по архитектуре (отдельный repo и CF Pages)

## Sprint 1 — Visual prototype + read-only Overview (✅ сделано в этом PR)

**Цель**: дать владельцу первый полезный взгляд на проект сегодня.

**Что готово**:
- Подключение к production Supabase в read-only
- 7 экранов: Overview, Players, PlayerDetail, Matches, MatchDetail, Economy, System Health, Roadmap
- Реальные KPI: игроки, матчи, ставки, ходы
- Тренды регистраций и завершённых матчей (recharts)
- Donut-чарты по escrow/payout статусу
- Гистограмма распределения ставок
- Passphrase gate
- Cloudflare Pages preview deploy

**Acceptance**:
- KPI отображают реальные числа из production
- Все ссылки рабочие
- Mobile breakpoint выживает (sidebar свернётся в Sprint 2)

**Security**: только `anon` ключ. Write — невозможно.

---

## Sprint 2 — Защищённая авторизация админов

**Цель**: убрать passphrase-soft-gate, поставить нормальную RBAC-авторизацию.

**Deliverables**:
1. Cloudflare Worker `admin-api` (новый repo / в этом же)
   - Routes: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
   - Secrets в `wrangler secret`: `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `ARGON2_PEPPER`
2. SQL миграция в Supabase:
   - `admin_users` (email, password_hash argon2id, totp_secret, role, is_active)
   - `admin_audit_log` (actor, action, target, reason, before, after, idempotency)
   - RLS: только service_role
3. SPA:
   - Логин-страница с email+пароль+TOTP
   - Кладёт JWT в HTTP-only cookie через Worker
   - Каждый запрос идёт через Worker proxy, не напрямую в Supabase
4. UI индикатор роли в sidebar
5. Emergency revoke endpoint

**Acceptance**:
- service_role нигде не упоминается в client bundle (grep build)
- Логин требует TOTP для owner
- Все запросы пишут в `admin_audit_log` хотя бы фактом обращения

**Risk**: высокий — это первый раз когда вводится server-side компонент. Сделать аккуратно.

**Требует одобрения владельца**: да.

---

## Sprint 3 — Player 360 и инструменты саппорта

**Цель**: закрыть кейсы саппорта без прямого SQL в БД.

**Deliverables**:
1. Player 360 страница
   - Профиль (полные поля, включая email)
   - Кошелёк (`wallets.balance`, `locked_balance`)
   - История транзакций (`wallet_transactions`)
   - Последние партии и ставки
2. Действия с одобрением:
   - `[Refund last stake]` (требует reason)
   - `[Grant compensation Coin]` (требует reason + amount, лимит по роли)
   - `[Force timeout game]` (только если в playing > 24h)
3. Поиск игроков:
   - по email
   - по nickname
   - по player_id
4. Полный audit trail каждого действия в UI

**Acceptance**:
- Каждое действие создаёт запись в `admin_audit_log` ДО исполнения
- Действие идемпотентно (повторный клик не дублирует)
- Возврат отображает before/after баланс

**Требует одобрения владельца**: да, перед первым refund.

---

## Sprint 4 — Anti-fraud и модерация

**Цель**: отлавливать мульти-аккаунты и аномалии.

**Deliverables**:
1. Suspicious Activity дашборд:
   - Кластеры профилей по `device_fp_hash`
   - Аномальные win-rate (> 90% при >20 партиях)
   - Аномальные стрики (>30 при >50% от общего)
   - Скорость регистраций с одного IP (через CF Worker headers)
2. Очередь модерации:
   - Список подозрительных кейсов
   - Действия: warn / suspend / ban / clear
   - История действий по игроку
3. Feature flags:
   - Глобальный пакет (welcome bonus on/off, stake commission %)
   - Per-player overrides

**Acceptance**:
- Каждый suspect_case закрывается явным решением модератора
- Бан/разбан идёт через тот же audit log + reason

**Требует одобрения владельца**: да.

---

## Sprint 5 — LTC депозиты ↔ Coin

**Цель**: подключить криптодепозиты Litecoin. Coin **не выводится обратно** в LTC.

**Deliverables**:
1. Интеграция через **NOWPayments** (быстрее) или **BlockCypher** (контроль)
   - Решение принимает владелец (см. вопросы в конце)
2. Webhook handler в Cloudflare Worker:
   - Получает LTC transaction
   - Проверяет confirmations ≥ 3
   - Idempotency по tx_id
   - Конвертирует LTC → Coin по курсу
   - Пишет в `wallet_transactions` (`type='deposit_ltc'`)
3. Курс LTC→Coin:
   - Фиксированный (например, 1 LTC = 100,000 Coin)
   - Или динамический (CoinGecko каждую минуту)
4. Admin UI:
   - Список депозитов (pending / confirmed / failed)
   - Reconciliation: входящие tx vs. зачисленные Coin
   - Ручное разблокирование при сбоях
   - Изменение курса (для owner, audit'ится)
5. Compliance:
   - Лимиты на сумму депозита
   - AML-флаги (адреса из санкционных списков)
   - Опционально KYC при превышении порога

**Acceptance**:
- Deposit идёт от LTC tx до +Coin без человека
- Reconciliation report чистый (нет «потерянных» депозитов)
- Audit log содержит запись каждого изменения курса

**Security**:
- Webhook secret в `wrangler secret`
- Worker валидирует HMAC подпись
- Double-spend protection через UNIQUE(tx_id)
- Замороженная сумма: Coin **не списываются**, пока депозит не confirmed

**Требует одобрения владельца**: да, до запуска. И решение по NOWPayments vs BlockCypher.

---

## Sprint 6 — Alerts и автоматизация

**Цель**: владелец не приходит в админку, админка приходит к владельцу.

**Deliverables**:
1. Telegram-бот / Email алерты
2. Триггеры:
   - всплеск регистраций (> N в час)
   - аномальный pot (одна ставка > 50% от среднего)
   - ошибки RPC > порога
   - последний LTC deposit > 24h назад при ожидаемой нагрузке
3. Daily digest в Telegram: DAU, новые матчи, выплаченные Coin, депозиты LTC
4. On-call расписание (если будут саппорты)

## Sprint 7 — Analytics и retention

**Цель**: понять, что работает в игре.

- D1/D7/D30 retention
- Cohort анализ welcome bonus
- DAU/WAU/MAU
- Conversion: anon → ставочный игрок
- Влияние LTC депозита на retention

## Sprint 8 — LiveOps & Configuration

**Цель**: владелец настраивает игру без релиза.

- Изменение welcome bonus
- Изменение commission %
- Запуск временных промо (double Coin weekend)
- A/B флаги
- Все изменения с audit + откатом

---

## Что требует решений владельца сейчас

1. **Достаточно ли passphrase-gate для демо клиенту**, или сразу делать RBAC (Sprint 2)?
2. **Где будет серверный admin endpoint** — Cloudflare Worker или Supabase Edge Function?
3. **LTC интеграция**: NOWPayments (быстрее, custodial) vs BlockCypher (non-custodial, контроль)?
4. **Кому даём admin-доступ** кроме владельца?
5. **Курс LTC→Coin**: фиксированный или плавающий?
6. **Лимиты депозита**: какой минимум/максимум?
