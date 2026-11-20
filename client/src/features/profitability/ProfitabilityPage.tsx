import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Select } from "@/components/form";
import { ErrorState, LoadingState, PageHeader, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useProfitability, type Profitability, type ProfitUnit } from "@/hooks/useProfitability";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Landlord: what each unit earned in a year – rent received minus own costs, and how many months it was let. */
export function ProfitabilityPage() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const q = useProfitability(year);
  const p = q.data;
  const years = p?.years ?? [year];

  return (
    <>
      <PageHeader eyebrow={t("profit.eyebrow")} title={t("profit.title")} subtitle={t("profit.subtitle")} />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Select aria-label={t("profit.year")} value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-32">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
        <Button asChild variant="outline">
          <Link to={`${ROUTES.taxes}/stroski/nov`}>
            <Plus />
            {t("profit.addCost")}
          </Link>
        </Button>
      </div>

      {q.loading && !p ? (
        <LoadingState />
      ) : q.error || !p ? (
        <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />
      ) : (
        <>
          <Totals p={p} />
          <Section title={t("profit.byUnit")}>
            {p.units.length === 0 ? (
              <p className="rounded-md border border-dashed border-line-strong p-5 text-ink-muted">{t("profit.empty")}</p>
            ) : (
              <UnitList p={p} />
            )}
          </Section>
          <p className="mt-8 max-w-[70ch] text-sm text-ink-faint">{t("profit.method")}</p>
        </>
      )}
    </>
  );
}

function Totals({ p }: { p: Profitability }) {
  const { t } = useTranslation();
  const income = p.totals.rentCents + p.totals.otherCents;
  const perMonth = p.monthsElapsed > 0 ? Math.round(p.totals.netCents / p.monthsElapsed) : 0;
  const items = [
    { label: t("profit.income"), value: formatCents(income) },
    { label: t("profit.costs"), value: formatCents(-p.totals.costsCents) },
    { label: t("profit.net"), value: formatCents(p.totals.netCents), strong: true },
    { label: t("profit.perMonth", { count: p.monthsElapsed }), value: formatCents(perMonth) },
  ];
  return (
    <dl aria-label={t("profit.totals")} className="on-panel kv-grid-panel grid grid-cols-2 gap-px overflow-hidden rounded-md md:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="min-w-0 px-4 py-4 sm:px-5">
          <dt className="label-mono text-ink-on-panel-muted">{it.label}</dt>
          <dd className={cn("mt-1 font-mono tabular-nums whitespace-nowrap text-ink-on-panel", it.strong ? "text-2xl font-medium" : "text-lg")}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One row per unit: net as a bar against the best unit, income − costs written out, months let. */
function UnitList({ p }: { p: Profitability }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...p.units.map((u) => Math.abs(u.netCents)));
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface-raised">
      {p.units.map((u) => (
        <UnitRow key={u.unitId} u={u} max={max} months={p.monthsElapsed} />
      ))}
      {p.unassignedCostsCents > 0 && (
        <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-ink-muted">
          <span>{t("profit.unassigned")}</span>
          <span className="font-mono tabular-nums">{formatCents(-p.unassignedCostsCents)}</span>
        </li>
      )}
    </ul>
  );
}

function UnitRow({ u, max, months }: { u: ProfitUnit; max: number; months: number }) {
  const { t } = useTranslation();
  const costs = u.unitCostsCents + u.sharedCostsCents;
  const loss = u.netCents < 0;
  return (
    <li className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] md:items-center md:gap-6">
      <Link to={`/enote/${u.unitId}`} className="min-w-0 hover:underline">
        <span className="block truncate font-semibold">{u.unit}</span>
        <span className="block truncate text-sm text-ink-muted">{u.property}</span>
      </Link>

      <div className="min-w-0">
        <div className="h-2.5 rounded-xs bg-ink/[0.07]">
          <div className={cn("h-full rounded-xs", loss ? "bg-danger" : "bg-ink")} style={{ width: `${Math.max(u.netCents !== 0 ? 2 : 0, (Math.abs(u.netCents) / max) * 100)}%` }} />
        </div>
        <p className="mt-1.5 font-mono text-xs text-ink-muted tabular-nums">
          {formatCents(u.rentCents + u.otherCents)} − {formatCents(costs)}
          {u.sharedCostsCents > 0 && <span className="font-sans"> {t("profit.sharedNote", { amount: formatCents(u.sharedCostsCents) })}</span>}
        </p>
      </div>

      <div className="flex items-baseline justify-between gap-6 md:block md:text-right">
        <span className={cn("block font-mono text-lg tabular-nums", loss && "text-danger")}>{formatCents(u.netCents)}</span>
        <span className="block text-sm text-ink-muted">{t("profit.occupied", { count: u.occupiedMonths, total: months })}</span>
      </div>
    </li>
  );
}
