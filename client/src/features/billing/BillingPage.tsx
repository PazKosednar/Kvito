import { Check, Info, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ErrorState, LoadingState, PageHeader, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useBilling, type Billing, type PlanInfo } from "@/hooks/useBilling";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

/** "1,2 GB", "350 MB" – storage as people read it. */
export function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toLocaleString("sl-SI", { maximumFractionDigits: 1 })} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toLocaleString("sl-SI", { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`;
}

/** Landlord: current package, how much of it is used, and the packages to choose from. */
export function BillingPage() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const q = useBilling();

  if (q.loading && !q.billing) return <LoadingState />;
  if (q.error || !q.billing) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;
  const b = q.billing;

  return (
    <>
      <PageHeader eyebrow={t("billing.eyebrow")} title={t("billing.title")} subtitle={t("billing.subtitle")} />

      {!b.limitsEnabled && (
        <p className="mb-6 flex items-start gap-3 rounded-md border border-line bg-surface-raised p-4 text-ink-muted">
          <Info className="mt-0.5 size-5 shrink-0 text-ink" aria-hidden="true" />
          <span>{t("billing.noLimits")}</span>
        </p>
      )}

      <Usage b={b} />

      <Section title={t("billing.plansTitle")}>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {b.plans.map((p) => (
            <PlanCard key={p.id} plan={p} current={p.id === b.plan} needed={b.usage.units > p.units} />
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink-muted">{t("billing.paymentsSoon")}</p>
      </Section>
    </>
  );
}

/** The current package with two meters: units and storage. */
function Usage({ b }: { b: Billing }) {
  const { t } = useTranslation();
  return (
    <section aria-label={t("billing.usage")} className="on-panel kv-grid-panel rounded-md p-5 sm:p-6">
      <p className="label-mono text-ink-on-panel-muted">{t("billing.current")}</p>
      <p className="mt-1 text-2xl font-semibold text-ink-on-panel">
        {t(`billing.plans.${b.plan}`)}
        {b.founder && <span className="ml-3 align-middle text-sm font-normal text-ink-on-panel-muted">{t("billing.founder")}</span>}
      </p>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Meter label={t("billing.units")} used={b.usage.units} limit={b.limits.units} format={(n) => String(n)} enforced={b.limitsEnabled} />
        <Meter label={t("billing.storage")} used={b.usage.storageBytes} limit={b.limits.storageBytes} format={formatBytes} enforced={b.limitsEnabled} />
      </div>
      <Fits b={b} />
    </section>
  );
}

/** Used / limit as a bar; near or over the limit it says so in words (and colour) only when limits apply. */
function Meter({ label, used, limit, format, enforced }: { label: string; used: number; limit: number; format: (n: number) => string; enforced: boolean }) {
  const { t } = useTranslation();
  const ratio = limit > 0 ? used / limit : 0;
  const state = !enforced ? "ok" : ratio > 1 ? "over" : ratio >= 0.9 ? "near" : "ok";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink-on-panel">{label}</span>
        <span className="font-mono text-sm text-ink-on-panel tabular-nums">
          {format(used)} / {format(limit)}
        </span>
      </div>
      <div className="mt-2 h-2.5 rounded-xs bg-ink-on-panel/10" role="meter" aria-label={label} aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit}>
        <div
          className={cn("h-full rounded-xs", state === "over" ? "bg-danger" : state === "near" ? "bg-warn" : "bg-ink-on-panel")}
          style={{ width: `${Math.min(100, Math.max(used > 0 ? 2 : 0, ratio * 100))}%` }}
        />
      </div>
      {state !== "ok" && (
        <p className={cn("mt-2 flex items-center gap-1.5 text-sm", state === "over" ? "text-danger" : "text-warn")}>
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          {t(state === "over" ? "billing.over" : "billing.near")}
        </p>
      )}
    </div>
  );
}

/** Which package fits the current use, when it is not the current one (e.g. before the end of the trial). */
function Fits({ b }: { b: Billing }) {
  const { t } = useTranslation();
  const fit = b.plans.find((p) => p.units >= b.usage.units && p.storageBytes >= b.usage.storageBytes);
  if (!fit || fit.id === b.plan || b.plans.findIndex((p) => p.id === fit.id) < b.plans.findIndex((p) => p.id === b.plan)) return null;
  return <p className="mt-5 text-sm text-ink-on-panel-muted">{t("billing.fits", { count: b.usage.units, plan: t(`billing.plans.${fit.id}`) })}</p>;
}

function PlanCard({ plan, current, needed }: { plan: PlanInfo; current: boolean; needed: boolean }) {
  const { t } = useTranslation();
  const free = plan.monthlyCents === 0;
  return (
    <li className={cn("flex flex-col rounded-md border bg-surface-raised p-5", current ? "border-ink" : "border-line")}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">{t(`billing.plans.${plan.id}`)}</h3>
        {current && (
          <span className="inline-flex items-center gap-1 font-mono text-xs tracking-[0.06em] text-ink uppercase">
            <Check className="size-3.5" aria-hidden="true" />
            {t("billing.yours")}
          </span>
        )}
      </div>
      <p className="mt-3">
        <span className="amount text-2xl">{free ? formatCents(0) : formatCents(plan.monthlyCents)}</span>
        <span className="ml-1 text-sm text-ink-muted">{t("billing.perMonth")}</span>
      </p>
      <p className="mt-1 min-h-5 text-sm text-ink-muted">{free ? t("billing.forever") : t("billing.yearly", { amount: formatCents(plan.yearlyCents) })}</p>
      <ul className="mt-4 flex flex-col gap-1.5 text-sm">
        <li>{t("billing.unitsCount", { count: plan.units })}</li>
        <li>{t("billing.storageAmount", { amount: formatBytes(plan.storageBytes) })}</li>
      </ul>
      <div className="mt-auto pt-5">
        {current ? (
          <p className="text-sm text-ink-muted">{t("billing.currentPlan")}</p>
        ) : (
          <Button variant="outline" className="w-full" disabled title={t("billing.paymentsSoon")}>
            {needed ? t("billing.tooSmall") : t("billing.choose")}
          </Button>
        )}
      </div>
    </li>
  );
}
