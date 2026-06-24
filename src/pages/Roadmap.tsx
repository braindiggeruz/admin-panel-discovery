import { Compass, Lock, BarChart3, ShieldAlert, Coins, Bell } from "lucide-react";
import { PageHeader, Section } from "@/components/ui";

const sprints = [
  {
    n: 1,
    name: "Visual prototype + read-only Overview",
    status: "current",
    icon: Compass,
    goal: "Дать владельцу первый полезный взгляд на проект за минимум усилий и денег.",
    deliverables: [
      "Подключение к production Supabase в read-only режиме",
      "5 экранов: Обзор, Игроки, Матчи, Экономика, Здоровье",
      "Кликабельные карточки игроков и матчей",
      "Деплой на отдельный Cloudflare Pages preview",
    ],
    sec: "Только public.anon ключ; никакой записи в БД; passphrase-гейт.",
  },
  {
    n: 2,
    name: "Защищённая авторизация админов",
    status: "next",
    icon: Lock,
    goal: "Заменить passphrase-гейт на нормальную RBAC-авторизацию.",
    deliverables: [
      "Cloudflare Worker (или Supabase Edge Function) с service_role",
      "Таблица admin_users + JWT-роли (owner / support / analyst)",
      "audit_log таблица: actor, action, before/after, reason",
      "Rate-limit + emergency revoke сессии",
    ],
    sec: "service_role НИКОГДА не попадает в browser bundle. Только серверный proxy.",
  },
  {
    n: 3,
    name: "Player 360 и поддержка",
    status: "next",
    icon: BarChart3,
    goal: "Закрыть кейсы саппорта: видеть кошелёк, транзакции, фрод-флаги по конкретному игроку.",
    deliverables: [
      "Карточка игрока с балансом, locked, историей транзакций",
      "Поиск по email/nickname/player_id",
      "Действия с одобрением: возврат, заморозка, разблокировка",
      "Полный audit trail для каждого действия",
    ],
    sec: "Все мутации идут через защищённые RPC с проверкой роли и idempotency.",
  },
  {
    n: 4,
    name: "Anti-fraud и модерация",
    status: "later",
    icon: ShieldAlert,
    goal: "Отлавливать мульти-аккаунты, фарм бонусов, аномальные win-rate.",
    deliverables: [
      "Кластеризация по device_fp_hash",
      "Алерты на >3 профилей с одного fingerprint",
      "Подозрительные паттерны: 100% wr, странные стрики",
      "Очередь модерации с действиями (бан/разбан/предупреждение)",
    ],
    sec: "Soft action first; жёсткие действия только с подтверждением.",
  },
  {
    n: 5,
    name: "LTC депозиты ↔ Coin",
    status: "later",
    icon: Coins,
    goal: "Подключить криптодепозиты Litecoin, конвертация в Coin по курсу.",
    deliverables: [
      "Интеграция NOWPayments / BlockCypher",
      "Webhook → Cloudflare Worker → +Coin на wallet",
      "Курс LTC→Coin (фиксированный или CoinGecko)",
      "Reconciliation: входящие транзакции vs. зачисленные Coin",
      "Compliance: лимиты, KYC при необходимости, AML-флаги",
    ],
    sec: "Webhook-секрет; double-spend protection; idempotency по tx_id.",
  },
  {
    n: 6,
    name: "Alerts & автоматизация",
    status: "later",
    icon: Bell,
    goal: "Не приходить в админку — а получать уведомления, когда что-то требует внимания.",
    deliverables: [
      "Telegram / Email алерты владельцу",
      "Триггеры: всплеск регистраций, аномальный pot, ошибки в RPC",
      "Дневной digest по KPI",
      "On-call расписание (если будут саппорты)",
    ],
    sec: "—",
  },
];

const statusMap = {
  current: { label: "Текущий", cls: "chip-gold" },
  next: { label: "Следующий", cls: "chip-sky" },
  later: { label: "Позже", cls: "chip-mute" },
} as const;

export default function Roadmap() {
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Plan · Phase 1 → Phase N"
        title="Roadmap админ-панели"
        description="Этапы развития. Каждый спринт — самодостаточен и приносит ценность. Ничего из «опасных» действий не делается до Sprint 2."
      />
      <ol className="relative space-y-4">
        {sprints.map((s) => {
          const meta = statusMap[s.status as keyof typeof statusMap];
          return (
            <li key={s.n}>
              <Section
                title={`Sprint ${s.n} · ${s.name}`}
                description={s.goal}
                right={<span className={meta.cls}>{meta.label}</span>}
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="md:col-span-2">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-ink-500 mb-2">
                      Что входит
                    </div>
                    <ul className="space-y-1.5">
                      {s.deliverables.map((d, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-ink-200"
                        >
                          <span className="text-gold-300 mt-1.5 w-1 h-1 rounded-full bg-gold-300 shrink-0" />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-ink-500 mb-2">
                      Безопасность
                    </div>
                    <div className="text-xs text-ink-300 leading-relaxed">{s.sec}</div>
                    <div className="mt-5">
                      <div className="flex items-center gap-2 text-xs text-ink-400">
                        <s.icon className="w-4 h-4" />
                        Sprint {s.n}
                      </div>
                    </div>
                  </div>
                </div>
              </Section>
            </li>
          );
        })}
      </ol>

      <div className="panel p-6">
        <div className="display-title text-lg text-ink-100">Что важно решить владельцу сейчас</div>
        <ul className="mt-3 space-y-2 text-sm text-ink-300">
          <li>1. Достаточно ли passphrase-гейта для демо клиенту, или сразу делать RBAC?</li>
          <li>2. Где будет жить серверный admin endpoint — Cloudflare Worker или Supabase Edge Function?</li>
          <li>3. Подключение LTC через NOWPayments (быстрее) или BlockCypher (контроль)?</li>
          <li>4. Кому даём admin-доступ кроме владельца (саппорт / аналитик)?</li>
        </ul>
      </div>
    </div>
  );
}
