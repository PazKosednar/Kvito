import { Download, ExternalLink, Loader2, Paperclip, Plus } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { Segmented, Select } from "@/components/form";
import { ErrorState, List, ListRow, LoadingState, PageHeader, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useTaxOverview } from "@/hooks/useTaxes";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ExpenseCategory, TaxOverview } from "@/types/domain";

const EDAVKI_URL = "https://edavki.durs.si";

/** Tax years to choose from: this one and the five before. */
const yearChoices = () => {
  const now = new Date().getFullYear();
  return Array.from({ length: 6 }, (_, i) => now - i);
};

/** Before April the return for the previous year is due, so that year is shown first. */
const defaultYear = () => {
  const d = new Date();
  return d.getMonth() < 3 ? d.getFullYear() - 1 : d.getFullYear();
};

const daysUntil = (isoDate: string) => {
  const today = new Date(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Ljubljana" }));
  return Math.round((new Date(isoDate).getTime() - today.getTime()) / 86_400_000);
};

/**
 * Landlord: rent received, own costs and an informative income tax estimate for renting out property
 * (flat-rate 10 % vs actual costs), with the steps to file the return. Help for the return, not tax advice.
 */
export function TaxesPage() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const [year, setYear] = useState(defaultYear);
  const [rate, setRate] = useState<number | null>(null);
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
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
            setCategory(null);
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
            <div className="mb-4">
              <Segmented<string>
                label={t("taxes.rate")}
                value={String(o.estimate.ratePercent)}
                onChange={(v) => setRate(Number(v))}
                options={o.rateOptions.map((r) => ({ value: String(r.percent), label: t(`taxes.rateKind.${r.kind}`) }))}
              />
              <p className="mt-2 text-sm text-ink-muted">{t("taxes.ziursNote")}</p>
            </div>
          )}

          <Estimate o={o} />
          <Deadline o={o} />
          <Steps o={o} />
          <ByProperty o={o} />
          <Expenses o={o} category={category} onCategory={setCategory} />

          <p className="mt-10 text-sm text-ink-faint">{t("taxes.disclaimer")}</p>
        </>
      )}
    </>
  );
}

/** The calculation written out line by line, and the two kinds of costs compared. */
function Estimate({ o }: { o: TaxOverview }) {
  const { t } = useTranslation();
  const e = o.estimate;
  const actual = e.method === "ACTUAL";
  const max = Math.max(e.flatCostsCents, e.actualCostsCents, 1);
  const saving = Math.abs(e.otherMethodTaxCents - e.taxCents);

  if (e.incomeCents === 0 && e.actualCostsCents === 0) {
    return <p className="on-panel kv-grid-panel rounded-md p-5 text-ink-on-panel-muted sm:p-6">{t("taxes.noIncome", { year: o.year })}</p>;
  }

  return (
    <section aria-label={t("taxes.tax")} className="on-panel kv-grid-panel grid gap-8 rounded-md p-5 sm:p-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <dl className="font-mono text-sm tabular-nums">
        <Line label={t("taxes.income")} value={formatCents(e.incomeCents)} />
        <Line op="−" label={t(actual ? "taxes.actual" : "taxes.flat")} value={formatCents(e.deductionCents)} />
        <Line op="=" label={t("taxes.base")} value={formatCents(e.baseCents)} rule />
        <Line op="×" label={t("taxes.rateLine")} value={`${e.ratePercent} %`} />
        <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-ink-on-panel pt-3">
          <dt className="font-sans text-base font-semibold text-ink-on-panel">{t("taxes.tax")}</dt>
          <dd className="text-3xl font-medium tracking-tight text-ink-on-panel">{formatCents(e.taxCents)}</dd>
        </div>
      </dl>

      <div>
        <p className="font-semibold text-ink-on-panel">{t("taxes.compareTitle")}</p>
        <div className="mt-4 flex flex-col gap-4">
          <Bar label={t("taxes.flat")} cents={e.flatCostsCents} max={max} used={!actual} />
          <Bar label={t("taxes.actual")} cents={e.actualCostsCents} max={max} used={actual} />
        </div>
        <p className="mt-4 text-sm text-ink-on-panel-muted">
          {actual
            ? t("taxes.usedActual", { amount: formatCents(saving) })
            : e.actualCostsCents > 0
              ? t("taxes.usedFlat", { amount: formatCents(e.flatCostsCents) })
              : t("taxes.usedFlatEmpty", { amount: formatCents(e.flatCostsCents) })}
        </p>
      </div>
    </section>
  );
}

function Line({ op, label, value, rule }: { op?: string; label: string; value: string; rule?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5", rule && "mt-1 border-t border-ink-on-panel/20 pt-2.5")}>
      <dt className="flex min-w-0 gap-3 text-ink-on-panel-muted">
        <span aria-hidden="true" className="w-3 text-ink-on-panel">
          {op}
        </span>
        <span className="truncate font-sans">{label}</span>
      </dt>
      <dd className="text-ink-on-panel">{value}</dd>
    </div>
  );
}

/** One kind of costs as a bar; the one used is solid, the other an outline. */
function Bar({ label, cents, max, used }: { label: string; cents: number; max: number; used: boolean }) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className={used ? "text-ink-on-panel" : "text-ink-on-panel-muted"}>
          {label}
          {used && <span className="ml-2 text-ink-on-panel-muted">({t("taxes.used")})</span>}
        </span>
        <span className={cn("font-mono tabular-nums", used ? "text-ink-on-panel" : "text-ink-on-panel-muted")}>{formatCents(cents)}</span>
      </div>
      <div className="mt-1.5 h-2.5 rounded-xs bg-ink-on-panel/10">
        <div
          className={cn("h-full rounded-xs", used ? "bg-ink-on-panel" : "border border-ink-on-panel/50")}
          style={{ width: `${Math.max(cents > 0 ? 2 : 0, (cents / max) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function Deadline({ o }: { o: TaxOverview }) {
  const { t } = useTranslation();
  const days = daysUntil(o.deadline);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-raised p-4">
      <p className="min-w-0 flex-1">
        {t("taxes.deadline", { year: o.year, date: formatDate(o.deadline) })}{" "}
        <span className="text-ink-muted">
          {days > 0 ? t("taxes.daysLeft", { count: days }) : days === 0 ? t("taxes.dueToday") : t("taxes.duePassed")}
        </span>
      </p>
      <Button asChild variant="secondary">
        <a href={EDAVKI_URL} target="_blank" rel="noreferrer">
          {t("taxes.edavki")}
          <ExternalLink />
        </a>
      </Button>
    </div>
  );
}

/** Filing the return really is a sequence, so the steps are numbered. */
function Steps({ o }: { o: TaxOverview }) {
  const { t } = useTranslation();
  const steps: { title: string; body: ReactNode }[] = [
    {
      title: t("taxes.steps.income"),
      body: (
        <>
          {t("taxes.steps.incomeBody", { amount: formatCents(o.estimate.incomeCents) })}{" "}
          <Link to={ROUTES.annual} className="font-medium text-ink underline underline-offset-4">
            {t("taxes.steps.incomeLink")}
          </Link>
        </>
      ),
    },
    { title: t("taxes.steps.costs"), body: t("taxes.steps.costsBody", { count: o.expenses.length }) },
    { title: t("taxes.steps.export"), body: t("taxes.steps.exportBody") },
    { title: t("taxes.steps.file"), body: t("taxes.steps.fileBody", { date: formatDate(o.deadline) }) },
  ];
  return (
    <Section title={t("taxes.steps.title")}>
      <ol className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3 bg-surface-raised p-4">
            <span className="font-mono text-sm text-ink-faint tabular-nums">{i + 1}</span>
            <div className="min-w-0">
              <p className="font-medium">{s.title}</p>
              <p className="mt-1 text-sm text-ink-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function ByProperty({ o }: { o: TaxOverview }) {
  const { t } = useTranslation();
  const rows = o.properties.filter((p) => p.rentCents > 0 || p.expensesCents > 0);
  if (rows.length < 2) return null;
  return (
    <Section title={t("taxes.byProperty")}>
      <div className="overflow-hidden rounded-md border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken text-left">
            <tr>
              <th className="px-4 py-2 font-medium text-ink-muted">{t("expense.property")}</th>
              <th className="px-4 py-2 text-right font-medium text-ink-muted">{t("taxes.propertyRent")}</th>
              <th className="px-4 py-2 text-right font-medium text-ink-muted">{t("taxes.propertyCosts")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((p) => (
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
  );
}

/** Own costs: totals per kind (also a filter) and the list. */
function Expenses({ o, category, onCategory }: { o: TaxOverview; category: ExpenseCategory | null; onCategory: (c: ExpenseCategory | null) => void }) {
  const { t } = useTranslation();
  const byCategory = useMemo(() => [...o.expensesByCategory].sort((a, b) => b.amountCents - a.amountCents), [o.expensesByCategory]);
  const shown = category ? o.expenses.filter((e) => e.category === category) : o.expenses;

  return (
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
        <>
          {byCategory.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t("taxes.filter")}>
              {byCategory.map((c) => {
                const on = category === c.category;
                return (
                  <button
                    key={c.category}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onCategory(on ? null : c.category)}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-sm border px-3 text-sm transition-colors duration-150",
                      on ? "border-ink bg-surface-raised text-ink" : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
                    )}
                  >
                    {t(`expense.categories.${c.category}`)}
                    <span className="font-mono text-xs tabular-nums">{formatCents(c.amountCents)}</span>
                  </button>
                );
              })}
            </div>
          )}
          <List>
            {shown.map((e) => (
              <ListRow
                key={e.id}
                to={`${ROUTES.taxes}/stroski/${e.id}`}
                title={e.title}
                subtitle={`${formatDate(e.spentOn)}, ${t(`expense.categories.${e.category}`).toLowerCase()}, ${e.unit ? `${e.property.name} (${e.unit.name})` : e.property.name}`}
                trailing={
                  <span className="flex items-center gap-2 font-mono tabular-nums">
                    {e.attachments.length > 0 && <Paperclip className="size-3.5 text-ink-faint" aria-label={t("expense.receipts")} />}
                    {formatCents(e.amountCents)}
                  </span>
                }
              />
            ))}
          </List>
        </>
      )}
    </Section>
  );
}
