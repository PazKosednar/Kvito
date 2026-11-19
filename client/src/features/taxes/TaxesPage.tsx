import { Download, ExternalLink, Loader2, Paperclip, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { Eyebrow } from "@/components/brand";
import { Segmented, Select } from "@/components/form";
import { ErrorState, List, ListRow, LoadingState, PageHeader, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useTaxOverview } from "@/hooks/useTaxes";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

const EDAVKI_URL = "https://edavki.durs.si";

/** Tax years to choose from: the current one and the five before (taxes are filed for the previous year). */
const yearChoices = () => {
  const now = new Date().getFullYear();
  return Array.from({ length: 6 }, (_, i) => now - i);
};

/** Before April the return for the previous year is due, so that year is shown first. */
const defaultYear = () => {
  const d = new Date();
  return d.getMonth() < 3 ? d.getFullYear() - 1 : d.getFullYear();
};

/**
 * Landlord: rent received, own costs and an informative income tax estimate for renting out property
 * (flat-rate 10 % vs actual costs). Help for the return, not tax advice.
 */
export function TaxesPage() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const [year, setYear] = useState(defaultYear);
  const [rate, setRate] = useState<number | null>(null);
  const q = useTaxOverview(year, rate);
  const [busy, setBusy] = useState(false);
  const o = q.overview;

  const download = async () => {
    setBusy(true);
    try {
      await q.downloadCsv();
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader back={ROUTES.home} eyebrow={t("taxes.eyebrow")} title={t("taxes.title", { year })} subtitle={t("taxes.subtitle")} />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Select
          aria-label={t("taxes.year")}
          className="w-28"
          value={year}
          onChange={(e) => {
            setYear(Number(e.target.value));
            setRate(null);
          }}
        >
          {yearChoices().map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
        <Button variant="outline" disabled={busy || !o} onClick={() => void download()}>
          {busy ? <Loader2 className="animate-spin" /> : <Download />}
          {t("taxes.csv")}
        </Button>
      </div>

      {q.loading && !o ? (
        <LoadingState />
      ) : q.error || !o ? (
        <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />
      ) : (
        <>
          {o.rateOptions.length > 1 && (
            <div className="mb-6 flex flex-col gap-3">
              <Segmented<string>
                label={t("taxes.rate")}
                value={String(o.estimate.ratePercent)}
                onChange={(v) => setRate(Number(v))}
                options={o.rateOptions.map((r) => ({ value: String(r.percent), label: t(`taxes.rateKind.${r.kind}`) }))}
              />
              <p className="rounded-md border border-dashed border-line-strong p-3 text-sm text-ink-muted">{t("taxes.ziursNote")}</p>
            </div>
          )}

          {/* The estimate, on the panel. */}
          <section className="on-panel kv-grid-panel rounded-md p-5 sm:p-6">
            <Eyebrow onPanel index="01">
              {t("taxes.tax")}
            </Eyebrow>
            <p className="mt-3 font-mono text-4xl font-medium tracking-tight text-ink-on-panel tabular-nums">{formatCents(o.estimate.taxCents)}</p>
            <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Fact label={t("taxes.income")} value={formatCents(o.estimate.incomeCents)} />
              <Fact label={t("taxes.flat")} value={formatCents(o.estimate.flatCostsCents)} active={o.estimate.method === "FLAT"} />
              <Fact label={t("taxes.actual")} value={formatCents(o.estimate.actualCostsCents)} active={o.estimate.method === "ACTUAL"} />
              <Fact label={t("taxes.base")} value={formatCents(o.estimate.baseCents)} />
            </dl>
            <p className="mt-4 text-sm text-ink-on-panel-muted">
              {t(o.estimate.method === "ACTUAL" ? "taxes.usedActual" : "taxes.usedFlat")}{" "}
              {o.estimate.otherMethodTaxCents !== o.estimate.taxCents && t("taxes.otherMethod", { amount: formatCents(o.estimate.otherMethodTaxCents) })}
            </p>
          </section>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-raised p-4">
            <p className="min-w-0 flex-1 text-sm">{t("taxes.deadline", { year: o.year, date: formatDate(o.deadline) })}</p>
            <Button asChild variant="secondary">
              <a href={EDAVKI_URL} target="_blank" rel="noreferrer">
                {t("taxes.edavki")}
                <ExternalLink />
              </a>
            </Button>
          </div>
          {(o.received.costs > 0 || o.received.deposit > 0 || o.received.other > 0) && (
            <p className="mt-3 text-sm text-ink-muted">
              {t("taxes.notIncluded", { costs: formatCents(o.received.costs), deposit: formatCents(o.received.deposit), other: formatCents(o.received.other) })}
            </p>
          )}

          {o.properties.length > 1 && (
            <Section title={t("taxes.byProperty")}>
              <div className="overflow-hidden rounded-md border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-surface-sunken text-left">
                    <tr>
                      <th className="label-mono px-4 py-2 font-medium">{t("expense.property")}</th>
                      <th className="label-mono px-4 py-2 text-right font-medium">{t("taxes.propertyRent")}</th>
                      <th className="label-mono px-4 py-2 text-right font-medium">{t("taxes.propertyCosts")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {o.properties.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-3">{p.name}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCents(p.rentCents)}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCents(p.expensesCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          <Section
            title={t("taxes.expensesTitle")}
            action={
              <Button asChild size="sm">
                <Link to={`${ROUTES.taxes}/stroski/nov`}>
                  <Plus />
                  {t("taxes.addExpense")}
                </Link>
              </Button>
            }
          >
            {o.expenses.length === 0 ? (
              <p className="rounded-md border border-dashed border-line p-4 text-ink-muted">{t("taxes.noExpenses")}</p>
            ) : (
              <List>
                {o.expenses.map((e) => (
                  <ListRow
                    key={e.id}
                    to={`${ROUTES.taxes}/stroski/${e.id}`}
                    title={e.title}
                    subtitle={[formatDate(e.spentOn), t(`expense.categories.${e.category}`), e.unit ? `${e.property.name} · ${e.unit.name}` : e.property.name].join(" · ")}
                    trailing={
                      <span className="flex items-center gap-2 font-mono tabular-nums">
                        {e.attachments.length > 0 && <Paperclip className="size-3.5 text-ink-faint" aria-label={t("expense.receipts")} />}
                        {formatCents(e.amountCents)}
                      </span>
                    }
                  />
                ))}
              </List>
            )}
          </Section>

          <p className="mt-8 text-sm text-ink-faint">{t("taxes.disclaimer")}</p>
        </>
      )}
    </>
  );
}

/** One figure of the estimate. `active` marks which costs were applied (the other one is shown dimmed). */
function Fact({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className={cn("border-t pt-3", active ? "border-ink-on-panel" : "border-ink-on-panel/15")}>
      <dt className="font-mono text-[11px] leading-4 font-medium tracking-[0.08em] text-ink-on-panel-muted uppercase">{label}</dt>
      <dd className={cn("amount mt-1", active === false ? "text-ink-on-panel-muted" : "text-ink-on-panel")}>{value}</dd>
    </div>
  );
}
