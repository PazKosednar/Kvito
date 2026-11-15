import { AlertTriangle, Check, Loader2, TrendingUp } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Field, TextInput } from "@/components/form";
import { FormError } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useAdvances, useCostForecast } from "@/hooks/useContract";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";
import { MonthlyCostsChart } from "./charts";
import type { CostsView } from "@/types/domain";
import { useMonthLabel } from "./contract-ui";

/**
 * Where the next settlement is heading with today's advance, and – for the landlord – the monthly lump sum
 * that would make it come out about even. Always labelled as an estimate.
 */
export function ForecastCard({ costs }: { costs: CostsView }) {
  const { t } = useTranslation();
  const { tenancy, isLandlord } = useTenancyContext();
  const monthLabel = useMonthLabel();
  const [until, setUntil] = useState<string | undefined>();
  const q = useCostForecast(tenancy.id, until);
  const advances = useAdvances(tenancy.id);
  const f = q.forecast;
  const lumpSum = advances.advances.length === 1 && advances.advances[0]!.costType === "OTHER";
  const apply = useAsyncAction(async (cents: number) => {
    await advances.save([{ costType: "OTHER", amountCents: cents }]);
    toast.success(t("forecast.applied", { amount: formatCents(cents) }));
    await q.reload();
  });

  if (!f || f.months.length === 0 || f.months.every((m) => m.basis === "NONE")) return null;
  const costsAhead = f.months.reduce((s, m) => s + m.costCents, 0);
  const averaged = f.months.filter((m) => m.basis === "AVERAGE");
  const end = f.endBalanceCents;
  const diff = f.suggestedAdvanceCents - f.currentAdvanceCents;
  // Within 1 € a month the current advance is right.
  const fine = Math.abs(diff) < 100;

  return (
    <section className="mb-6 rounded-md border border-line bg-surface-raised p-4" aria-labelledby="forecast-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="forecast-title" className="flex items-center gap-2 font-semibold">
          <TrendingUp className="size-4 text-ink-muted" aria-hidden="true" />
          {t("forecast.title", { until: monthLabel(f.until) })}
        </h2>
        <Field label={t("forecast.until")} className="w-40">
          {(p) => <TextInput {...p} type="month" min={f.windowFrom} value={until ?? f.until} onChange={(e) => e.target.value && setUntil(e.target.value)} className="h-10" />}
        </Field>
      </div>

      <MonthlyCostsChart months={costs.months.filter((m) => !f.lastActual || m.period <= f.lastActual).filter((m) => m.period >= f.windowFrom)} forecast={f.months} className="mt-4" />

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-ink-muted">{t("forecast.costsAhead")}</dt>
          <dd className="mono">{formatCents(costsAhead)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">{t("forecast.balanceNow")}</dt>
          <dd className="mono">{formatSignedBalance(f.balanceNowCents)}</dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-ink-muted">{t("forecast.endBalance", { until: monthLabel(f.until) })}</dt>
          <dd className={cn("flex items-center gap-1.5 font-semibold", end < 0 ? "text-primary" : end > 0 ? "text-warn" : "text-ink")}>
            {end > 0 ? <AlertTriangle className="size-4" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
            {end < 0 ? t("charts.scale.credit", { amount: formatCents(-end) }) : end > 0 ? t("charts.scale.owes", { amount: formatCents(end) }) : t("charts.scale.even")}
          </dd>
        </div>
      </dl>

      {isLandlord && f.currentAdvanceCents + f.suggestedAdvanceCents > 0 && (
        <div className="mt-4 border-t border-line pt-4">
          <p>
            {fine
              ? t("forecast.adviceFine", { amount: formatCents(f.currentAdvanceCents) })
              : t("forecast.advice", { suggested: formatCents(f.suggestedAdvanceCents), current: formatCents(f.currentAdvanceCents) })}
          </p>
          {!fine &&
            (lumpSum ? (
              <Button className="mt-3" variant="secondary" disabled={apply.pending} onClick={() => void apply.run(f.suggestedAdvanceCents)}>
                {apply.pending && <Loader2 className="animate-spin" />}
                {t("forecast.apply", { amount: formatCents(f.suggestedAdvanceCents) })}
              </Button>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">{t("forecast.perTypeHint")}</p>
            ))}
          <FormError message={apply.error} />
        </div>
      )}

      <p className="mt-4 text-xs text-ink-muted">
        {averaged.length > 0
          ? t("forecast.basisAverage", { months: averaged.map((m) => monthLabel(m.period)).join(", ") })
          : t("forecast.basisLastYear")}{" "}
        {t("forecast.estimate")}
      </p>
    </section>
  );
}

const formatSignedBalance = (c: number) => (c < 0 ? `−${formatCents(-c)}` : c > 0 ? `+${formatCents(c)}` : formatCents(0));
