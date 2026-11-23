import { Check, CircleCheck, Info, Loader2, TriangleAlert, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ErrorState, LoadingState, PageHeader, Section } from "@/components/layout-parts";
import { Segmented } from "@/components/form";
import { Button } from "@/components/ui/button";
import { useBilling, type Billing, type BillingInterval, type PaidPlan, type PlanInfo } from "@/hooks/useBilling";
import { PROMO } from "@/constants";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { isPromoEligible } from "@/lib/promo";
import { PromoStrip } from "./PromoDialog";
import { formatDate } from "@/lib/dates";
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

      {b.trialEndsAt && (
        <p className="mb-6 flex items-start gap-3 rounded-md border border-line bg-surface-raised p-4 text-ink-muted">
          <Info className="mt-0.5 size-5 shrink-0 text-ink" aria-hidden="true" />
          <span>{t("billing.trial", { date: formatDate(b.trialEndsAt), plan: t(`billing.plans.${b.plan}`) })}</span>
        </p>
      )}

      {q.paid && (
        <p role="status" className="mb-6 flex items-start gap-3 rounded-md border border-primary bg-accent-soft p-4">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="flex-1">{t("billing.paid")}</span>
          <button type="button" onClick={q.dismissPaid} className="text-ink-muted hover:text-ink" aria-label={t("common.close")}>
            <X className="size-5" aria-hidden="true" />
          </button>
        </p>
      )}

      {isPromoEligible(b) && <PromoStrip code={PROMO.code} percent={PROMO.percent} />}

      <Usage b={b} />

      {b.hasPaidSubscription && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => void q.openPortal()} disabled={q.portalPending}>
            {q.portalPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {t("billing.manage")}
          </Button>
          <span className="text-sm text-ink-muted">{t("billing.manageHint")}</span>
        </div>
      )}

      <Section title={t("billing.plansTitle")}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="w-full max-w-xs">
            <Segmented<BillingInterval>
              label={t("billing.interval")}
              value={q.interval}
              onChange={q.setInterval}
              options={[
                { value: "month", label: t("billing.monthly") },
                { value: "year", label: t("billing.yearlyTab") },
              ]}
            />
          </div>
          <span className="rounded-xs bg-accent-soft px-1.5 py-0.5 font-mono text-xs tracking-[0.06em] text-primary uppercase">{t("billing.twoMonthsFree")}</span>
        </div>
        {q.actionError && (
          <p role="alert" className="mb-4 flex items-center gap-2 text-sm text-danger">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            {q.actionError}
          </p>
        )}
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {b.plans.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              interval={q.interval}
              current={p.id === b.plan}
              needed={b.usage.units > p.units}
              payable={b.checkoutEnabled}
              pending={q.choosing === p.id}
              busy={q.choosing !== null}
              onChoose={(plan) => void q.choose(plan)}
            />
          ))}
        </ul>
        {!b.checkoutEnabled && <p className="mt-4 text-sm text-ink-muted">{t("billing.paymentsSoon")}</p>}
        {b.checkoutEnabled && <p className="mt-4 text-sm text-ink-muted">{t("billing.tenantsFree")}</p>}
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
        <Meter label={t("billing.units")} used={b.usage.units} limit={b.limits.units} format={(n) => String(n)} />
        <Meter label={t("billing.storage")} used={b.usage.storageBytes} limit={b.limits.storageBytes} format={formatBytes} />
      </div>
      <Fits b={b} />
    </section>
  );
}

/** Used / limit as a bar; near or over the limit it says so in words (and colour). */
function Meter({ label, used, limit, format }: { label: string; used: number; limit: number; format: (n: number) => string }) {
  const { t } = useTranslation();
  const ratio = limit > 0 ? used / limit : 0;
  const state = ratio > 1 ? "over" : ratio >= 0.9 ? "near" : "ok";
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

/** Which package fits the current use, when it is bigger than the current one. */
function Fits({ b }: { b: Billing }) {
  const { t } = useTranslation();
  const fit = b.plans.find((p) => p.units >= b.usage.units && p.storageBytes >= b.usage.storageBytes);
  if (!fit || fit.id === b.plan || b.plans.findIndex((p) => p.id === fit.id) < b.plans.findIndex((p) => p.id === b.plan)) return null;
  return <p className="mt-5 text-sm text-ink-on-panel-muted">{t("billing.fits", { count: b.usage.units, plan: t(`billing.plans.${fit.id}`) })}</p>;
}

interface PlanCardProps {
  plan: PlanInfo;
  interval: BillingInterval;
  current: boolean;
  needed: boolean;
  /** Payments are on: paid plans get a working button. */
  payable: boolean;
  pending: boolean;
  busy: boolean;
  onChoose: (plan: PaidPlan) => void;
}

function PlanCard({ plan, interval, current, needed, payable, pending, busy, onChoose }: PlanCardProps) {
  const { t } = useTranslation();
  const free = plan.id === "FREE";
  const yearly = interval === "year" && !free;
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
        <span className="amount text-2xl">{formatCents(yearly ? plan.yearlyCents : plan.monthlyCents)}</span>
        <span className="ml-1 text-sm text-ink-muted">{yearly ? t("billing.perYear") : t("billing.perMonth")}</span>
      </p>
      <p className="mt-1 min-h-5 text-sm text-ink-muted">
        {free ? t("billing.forever") : yearly ? t("billing.yearlyPerMonth", { amount: formatCents(Math.round(plan.yearlyCents / 12)) }) : t("billing.monthlyCancel")}
      </p>
      <ul className="mt-4 flex flex-col gap-1.5 text-sm">
        <li>{t("billing.unitsCount", { count: plan.units })}</li>
        <li>{t("billing.storageAmount", { amount: formatBytes(plan.storageBytes) })}</li>
        {plan.assistant && <li>{t("billing.assistantIncluded")}</li>}
      </ul>
      <div className="mt-auto pt-5">
        {current ? (
          <p className="text-sm text-ink-muted">{t("billing.currentPlan")}</p>
        ) : free ? null : payable ? (
          <Button variant={needed ? "outline" : "default"} className="w-full" disabled={busy || needed} onClick={() => onChoose(plan.id as PaidPlan)}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {needed ? t("billing.tooSmall") : t("billing.choose")}
          </Button>
        ) : (
          <Button variant="outline" className="w-full" disabled title={t("billing.paymentsSoon")}>
            {needed ? t("billing.tooSmall") : t("billing.choose")}
          </Button>
        )}
      </div>
    </li>
  );
}
