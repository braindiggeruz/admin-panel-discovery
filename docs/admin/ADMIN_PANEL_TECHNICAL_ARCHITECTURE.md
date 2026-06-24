# ADMIN_PANEL_TECHNICAL_ARCHITECTURE — Шашки Рояль

## 1. Принятое решение

**Вариант C — отдельный репозиторий и отдельный Cloudflare Pages проект.**

- Repo: `altynkanafina1-ship-it/admin-panel-discovery`
- Cloudflare Pages: новый проект `shashki-royale-admin` под аккаунтом `8f41687...972962`
- Игровой репо `braindiggeruz/shashki-royale` и production `shashki-royale.pages.dev`
  **не трогаются вообще** на Phase 1.

## 2. Почему именно так

### Сравнение

| Критерий | A: внутри `/admin` | B: monorepo apps/* | **C: отдельный repo** |
|---|---|---|---|
| Риск поломать игру | средний | средний (refactor) | **нулевой** |
| Скорость до preview | средняя | низкая | **высокая** |
| Separation of secrets | плохая (общие env) | средняя | **отличная** |
| CI/CD проще? | да | сложнее | **да** |
| Будущий рост (доступы саппорта) | сложно | средне | **легко** |
| Можно показать клиенту сегодня | нет | нет | **да** |
| Связь с игрой | через imports | через packages | через Supabase API |

Главные аргументы за C:
1. **Нулевой риск для игры**. Игроки в production не должны почувствовать никаких изменений.
2. **Изоляция секретов**. Когда мы добавим service_role в Sprint 2, он будет лежать
   в отдельном Cloudflare аккаунте, никогда не попадая близко к игровому пайплайну.
3. **Отдельный домен** для админ-панели — лучше для CSP, robots, indexation.
4. **Доступы**. Можно дать саппорту доступ к admin repo, не давая к игре.

### Когда A или B имели бы смысл

- Если бы мы хотели тяжёлое переиспользование TypeScript-типов и игровой логики на админке.
  → Здесь мы намеренно дублируем минимальный shape `types.ts` — это 30 строк, дешевле refactor’а.
- Если бы команда разработки была большая и нужен общий PR review.
  → Сейчас не наш случай.

## 3. Стек админ-панели

| Слой | Технология | Версия |
|---|---|---|
| Build | Vite | 6.x |
| UI | React | 18.3 |
| Язык | TypeScript | 5.7 |
| Стили | Tailwind | 3.4 |
| Роутинг | React Router | 7 |
| Дата-слой | TanStack Query | 5 |
| Графики | Recharts | 2 |
| Иконки | lucide-react | 0.469 |
| БД-клиент | @supabase/supabase-js | 2.x |
| Хостинг | Cloudflare Pages | preview deployment |

### Почему React 18 (а не 19 как в игре)

- Recharts 2 + react-router 7 совместимы с 18 стабильно.
- React 19 в игре — это их решение; админка не обязана повторять стек.
- Если в будущем захотим shared packages, перейдём на 19 централизованно.

## 4. Дата-слой

```
/src/lib/supabase.ts          ← singleton client (anon key)
/src/lib/types.ts             ← минимальный shape таблиц (типизация без runtime)
/src/services/admin.ts        ← все запросы: fetchPlayers, fetchGames, ...
/src/lib/format.ts            ← человеко-читаемые форматы
/src/lib/gate.ts              ← passphrase MVP gate
```

Принципы:
- **Никаких прямых .from().select() в страницах** — всё через services.
- **TanStack Query** для кэша + автоматического refetch.
- **Никаких optimistic updates** в Phase 1 (нечего обновлять, всё read-only).
- **Никаких write hooks** — даже `useMutation` не импортируется. Это барьер на код-ревью.

## 5. Архитектура страниц

```
/                     → Gate (passphrase)
/overview             → KPI + trends + leaderboard + live + recent + economy callout
/players              → реестр с поиском/сортировкой
/players/:id          → карточка игрока (публичные поля)
/matches              → реестр партий с фильтрами
/matches/:id          → детали + история ходов с координатами
/economy              → KPI Coin, donut escrow/payout, гистограмма entry_fee
/health               → пинги Supabase / production / PWA + last move
/roadmap              → продуктовый roadmap (как часть продукта, не доки)
```

Все страницы используют общий `Layout` (sidebar + main).

## 6. Деплой

### GitHub
- Branch: `main` в новом репо `altynkanafina1-ship-it/admin-panel-discovery`
- Игровой репо не модифицируется

### Cloudflare Pages
- Проект `shashki-royale-admin` в аккаунте `8f4168...972962`
- Build command: `yarn build`
- Output: `dist`
- Env vars в Pages settings (Secret):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_ADMIN_PASSPHRASE`
  - `VITE_GAME_URL`
- Без integration с игровым GitHub → нулевая возможность задеть production игры

### Будущее: Cloudflare Worker (Sprint 2)
```
shashki-royale-admin.pages.dev        ← SPA (этот repo)
admin-api.example.workers.dev         ← Worker (новый repo / в этом же)
  ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET
  Routes: POST /auth/login, POST /admin/*
```

## 7. CI/CD

- На Phase 1: только Cloudflare Pages auto-deploy из `main`
- На Sprint 2: GitHub Actions
  - lint + typecheck + unit tests
  - preview deploy на PR
  - production deploy на merge в main

## 8. Что мы НЕ переносим из игры

- `vite-plugin-pwa` — админка не PWA
- Service worker — админке вреден
- Tailwind 4 — не успело устаканиться у нас
- Realtime engine — на MVP не нужен
- Игровые типы и engine — не нужны (дублируем минимум)

## 9. Файловая структура

```
admin-panel/
├── docs/admin/                    # ← вы здесь
│   ├── ADMIN_PROJECT_INVENTORY.md
│   ├── ADMIN_PANEL_PRODUCT_AUDIT.md
│   ├── ADMIN_PANEL_SECURITY_ARCHITECTURE.md
│   ├── ADMIN_PANEL_TECHNICAL_ARCHITECTURE.md
│   ├── ADMIN_PANEL_ROADMAP.md
│   └── ADMIN_PANEL_PHASE_1_REPORT.md
├── public/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── styles/index.css
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── types.ts
│   │   ├── format.ts
│   │   └── gate.ts
│   ├── services/
│   │   └── admin.ts
│   ├── components/
│   │   ├── Layout.tsx
│   │   ├── Gate.tsx
│   │   └── ui.tsx
│   └── pages/
│       ├── Overview.tsx
│       ├── Players.tsx
│       ├── PlayerDetail.tsx
│       ├── Matches.tsx
│       ├── MatchDetail.tsx
│       ├── Economy.tsx
│       ├── SystemHealth.tsx
│       └── Roadmap.tsx
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## 10. Производительность

- Bundle сейчас ~970 KB pre-gzip / 270 KB gzip
- Достаточно для админки (open в редкий момент)
- Sprint 2: split на route-level chunks (lazy load страниц)
- Recharts — 35% бандла. Альтернатива на будущее: visx или sparkline без библиотеки.
