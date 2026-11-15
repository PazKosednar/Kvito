import { Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { STATUS_STYLE, StatusIcon } from "@/components/brand";
import type { HistoryState, LandlordInfo, TenantHistory } from "@/hooks/useReferences";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** History states drawn with the charge status styles: paid in time = confirmed, paid late = waiting. */
const AS_STATUS = { ON_TIME: "CONFIRMED", LATE: "REPORTED_PAID", OPEN: "OPEN", OVERDUE: "OVERDUE", DISPUTED: "DISPUTED" } as const;

/** The verified renting history: headline numbers and the last 24 months. Shared by the tenant's preview and the public link. */
export function HistoryView({ name, history, landlords, landlordInfo }: { name: string; history: TenantHistory; landlords: number; landlordInfo: LandlordInfo[] }) {
  const { t, i18n } = useTranslation();
  const label = (p: string, month: "short" | "long") =>
    new Intl.DateTimeFormat(i18n.language === "en" ? "en-GB" : "sl-SI", { month, ...(month === "long" ? { year: "numeric" } : {}), timeZone: "UTC" })
      .format(new Date(`${p}-01T00:00:00Z`))
      .replace(".", "");
  const p = history.payments;
  const facts = [
    { label: t("history.months"), value: String(history.monthsRented) },
    { label: t("history.onTime"), value: history.onTimePercent == null ? "–" : `${history.onTimePercent} %` },
    { label: t("history.confirmed"), value: String(p.confirmed) },
    { label: t("history.landlords"), value: String(landlords) },
  ];
  const shown = new Set<HistoryState>(history.months.map((m) => m.state));

  return (
    <div className="flex flex-col gap-6">
      <div className="on-panel kv-grid-panel rounded-md p-6">
        <p className="font-mono text-xs tracking-[0.06em] text-ink-on-panel-muted uppercase">{t("history.eyebrow")}</p>
        <p className="mt-1 text-title font-semibold">{name}</p>
        <p className="mt-1 text-sm text-ink-on-panel-muted">{t("history.verified")}</p>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
        {facts.map((f) => (
          <div key={f.label} className="bg-surface-raised p-4">
            <dt className="label-mono">{f.label}</dt>
            <dd className="amount mt-1">{f.value}</dd>
          </div>
        ))}
      </dl>

      <section className="rounded-md border border-line bg-surface-raised p-4" aria-labelledby="history-months">
        <h2 id="history-months" className="label-mono mb-3">
          {t("history.last24")}
        </h2>
        <ol className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
          {history.months.map((m) => {
            const text = `${label(m.period, "long")}: ${t(`history.state.${m.state}`)}`;
            return (
              <li key={m.period} title={text} className={cn("flex h-12 flex-col items-center justify-center gap-1 rounded-xs border border-transparent", m.state === "NONE" ? "border-dashed border-line text-ink-faint" : STATUS_STYLE[AS_STATUS[m.state]])}>
                <span className="font-mono text-[10px] leading-none uppercase">{label(m.period, "short")}</span>
                {m.state === "NONE" ? <Minus className="size-3" aria-hidden="true" /> : <StatusIcon status={AS_STATUS[m.state]} className="size-3.5" />}
                <span className="sr-only">{text}</span>
              </li>
            );
          })}
        </ol>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
          {(["ON_TIME", "LATE", "OPEN", "OVERDUE", "DISPUTED", "NONE"] as const)
            .filter((s) => shown.has(s))
            .map((s) => (
              <li key={s} className="inline-flex items-center gap-1.5">
                {s === "NONE" ? <Minus className="size-3" aria-hidden="true" /> : <StatusIcon status={AS_STATUS[s]} />}
                {t(`history.state.${s}`)}
              </li>
            ))}
        </ul>
      </section>

      <ul className="divide-y divide-line rounded-md border border-line bg-surface-raised text-sm">
        <li className="flex justify-between gap-4 px-4 py-3">
          <span className="text-ink-muted">{t("history.paymentsLine")}</span>
          <span className="mono text-right">{t("history.paymentsValue", { onTime: p.onTime, late: p.late, overdue: p.overdue })}</span>
        </li>
        <li className="flex justify-between gap-4 px-4 py-3">
          <span className="text-ink-muted">{t("history.depositsLine")}</span>
          <span className="mono text-right">{t("history.depositsValue", { full: history.deposits.returnedInFull, partly: history.deposits.returnedPartly, held: history.deposits.held })}</span>
        </li>
        <li className="flex justify-between gap-4 px-4 py-3">
          <span className="text-ink-muted">{t("history.settlementsLine")}</span>
          <span className="mono text-right">{history.settlementsAccepted}</span>
        </li>
        {/* Who confirmed it: lets the reader judge the weight of the confirmations. */}
        {landlordInfo.map((l, i) => (
          <li key={i} className="flex justify-between gap-4 px-4 py-3">
            <span className="text-ink-muted">{t("history.landlordLine", { n: i + 1 })}</span>
            <span className="mono text-right">{t("history.landlordValue", { date: formatDate(l.since), count: l.otherTenants })}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-muted">{t("history.footnote")}</p>
    </div>
  );
}
