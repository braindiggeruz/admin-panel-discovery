# ADMIN_PANEL_PRODUCT_AUDIT — Шашки Рояль

Этот документ отвечает на главный вопрос:
**что владельцу нужно видеть и делать в админ-панели в первую очередь — и что в этой первой версии делать НЕЛЬЗЯ**.

---

## 1. Карта сущностей (что наблюдаем)

| Сущность | Поля для админа | Источник |
|---|---|---|
| Игрок | nickname, rating, total_games, win-rate, last_seen | `public_profiles` |
| Партия | room_code, статус, белые/чёрные, ходов, итог | `games` |
| Ход | ход № N, цвет, from→to, isCapture, promoted | `moves` |
| Ставка | entry_fee, pot, escrow_status, payout_status | `game_stakes` |
| Кошелёк | balance, locked_balance (Sprint 2+) | `wallets` |
| Транзакция | type, delta, reason, idempotency_key (Sprint 2+) | `wallet_transactions` |
| Engagement | win-streak, daily, referrals (Sprint 3+) | `engagement_log` |

## 2. Карта операций (что вообще можно делать)

| Операция | Кто может | Когда добавляется | Опасность |
|---|---|---|---|
| Смотреть KPI / графики | владелец | **MVP сейчас** | none |
| Смотреть профиль игрока | владелец | **MVP сейчас** | none |
| Смотреть партию + ходы | владелец | **MVP сейчас** | none |
| Смотреть pot/escrow по ставкам | владелец | **MVP сейчас** | none |
| Смотреть баланс конкретного игрока | владелец/саппорт | Sprint 3 | low |
| Возврат Coin игроку | саппорт | Sprint 3 | medium |
| Заморозка/бан игрока | владелец/модератор | Sprint 4 | high |
| Массовая выдача Coin (промо) | владелец | Sprint 4 | high |
| Принудительный settlement партии | владелец | Sprint 5 | critical |
| Изменение курса LTC→Coin | владелец | Sprint 5 | critical |

→ Видно правило: «дешёвое read-only — сразу, дорогое write — только за защитой».

## 3. Карта ролей (предложение)

| Роль | Что может |
|---|---|
| **Owner** | Всё. Включая RBAC и feature flags. |
| **Administrator** | Всё кроме управления ролями. |
| **Support** | Player 360 + возврат Coin до лимита + аудит своих действий. |
| **Analyst** | Только read-only метрики и экспорт. |
| **Moderator** | Кейсы антифрод, бан/разбан (всегда с reason). |
| **Read-only viewer** | Только дашборды. |

→ В MVP активна только роль **Owner** (через passphrase). RBAC появляется в Sprint 2.

## 4. Карта рисков

| Риск | Вероятность | Влияние | Снижение в админ-панели |
|---|---|---|---|
| Утечка ключей админа | medium | critical | service_role только на Worker; client использует JWT |
| Случайный массовый refund | low | high | Любой массовый action требует двух подтверждений + reason |
| Несогласованность wallet vs. ledger | low | high | Sprint 3: dashboard `wallets.balance` vs. `Σ wallet_transactions` |
| Накрутка KPI (бот-аккаунты) | high | medium | Sprint 4: device_fp clustering, фильтры по «человекоподобности» |
| Потеря audit-trail | low | critical | Все мутации пишутся в `admin_audit_log` ДО исполнения |

## 5. Карта поддержки игроков (Sprint 3)

Что обычно просит игрок саппорта:
- «Я не получил welcome bonus» → проверить `bonus_claimed_at`, выдать вручную
- «Мне не вернулась ставка» → проверить `game_stakes.escrow_status`, refund
- «У меня украли аккаунт» → блокировка по device_fp, выдача compensation
- «Игра зависла» → форс-таймаут партии

→ Player 360 страница: профиль + кошелёк + последние транзакции + последние партии + кнопки `[Refund stake]`, `[Grant compensation]`, `[Force timeout]` — все с reason + audit.

## 6. Карта экономики Coin

Сейчас (закрытая внутренняя):
```
welcome bonus +100  → wallets.balance
win → +pot − 5%      → wallets.balance
loss → −entry_fee    → game_stakes.escrow → opponent
refund → +entry_fee  → wallets.balance
referral payout     → wallets.balance (через engagement)
```

После LTC (Sprint 5):
```
LTC deposit → webhook → fiat rate → +Coin    (новый источник)
Coin → real value (не покупка, а наблюдение): NEVER
```

Принципиально: **Coin не выводится обратно в LTC**. Это удерживает проект вне зоны gambling product.

## 7. Карта realtime/health (Sprint 2)

- Supabase REST latency
- RPC `submit_move` latency p95
- Active realtime channels
- Cloudflare Pages last deploy + status
- GitHub Actions last run
- Android crash rate (если подключим Sentry)

## 8. Карта аналитики и retention (Sprint 6)

- D1/D7/D30 retention
- DAU/WAU/MAU
- Cohort: «выживаемость» игроков с welcome bonus vs. без
- Влияние LTC депозита на retention
- Доля игроков, делающих хотя бы 1 ставочную партию
- Среднее число партий до первой ставки
- Win-streak distribution

## 9. Карта релизов и инфраструктуры (Sprint 2)

- Production version (Cloudflare Pages last deployment SHA)
- Latest GitHub Release / Tag
- Android versionName/versionCode (из APK builder logs)
- Build status (CI Action passing/failing)
- Service Worker version mismatch (игроки на старом SW)

## 10. Какие модули реально нужны и в каком порядке

### MVP (сейчас, в этом коммите)
1. **Overview** — KPI, тренды, лидерборд, активные/завершённые комнаты, экономика
2. **Players** — реестр с поиском и сортировкой
3. **Player Detail** — карточка игрока (публичные поля)
4. **Matches** — реестр партий с фильтром
5. **Match Inspector** — детали партии + ходы
6. **Economy** — KPI Coin, donuts по escrow/payout, гистограмма ставок
7. **System Health** — пинг Supabase, домена, manifest, последняя активность
8. **Roadmap** — отдельная страница как часть продукта (показать владельцу, что дальше)

### Sprint 2
- Live Operations (только активные комнаты, real-time)
- Deployment Monitor (CF Pages + GitHub Actions)
- Admin Auth (RBAC)
- Audit Log

### Sprint 3
- Player 360 (с балансами и транзакциями)
- Support Cases (очередь обращений)
- Возврат/выдача Coin с reason

### Sprint 4
- Suspicious Activity (device_fp кластеры)
- Moderation queue
- Feature flags

### Sprint 5
- LTC депозиты, конвертация, reconciliation

### Sprint 6
- Retention, cohorts
- Alerts/Notifications

## Что НЕ делаем сейчас (и почему)

- ❌ Force-settlement партии — критическая операция; нужна проверка инвариантов
- ❌ Массовая выдача Coin — пока нет dual-confirm UI и audit_log
- ❌ Изменение результата партии — может нарушить рейтинг и стрик
- ❌ Просмотр email/IP/device_fp — нужен `service_role` через Worker
- ❌ Запись в БД любого рода — нечем audit'ить

Эти отказы — **сознательное решение**. Лучше выкатить меньше, но без рисков.
