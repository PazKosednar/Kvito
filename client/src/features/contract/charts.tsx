import { AlertTriangle, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CostMonth, SettlementTotals } from "@/types/domain";
import { useMonthLabel } from "./contract-ui";

/**
 * Settlement as a balance: what was paid (advances + credit carried in) against the actual costs.
 * Two thin one-color bars on a shared scale; the difference is named with a word and an icon (CGP: never color alone).
 */
export function SettlementScale({ totals, className }: { totals: SettlementTotals; className?: string }) {
  const { t } = useTranslation();
  const paid = totals.advanceCents + totals.carriedInCents;
  const max = Math.max(paid, totals.actualCents, 1);
  const pct = (c: number) => `${(c / max) * 100}%`;
  const balance = totals.balanceCents;

  return (
    <figure className={cn("rounded-md border border-line bg-surface-raised p-4", className)}>
      <figcaption className="label-mono mb-4">{t("charts.scale.title")}</figcaption>
      <dl className="flex flex-col gap-4">
        <div>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-ink-muted">{t("charts.scale.paid")}</dt>
            <dd className="mono">{formatCents(paid)}</dd>
          </div>
          {/* Advances and carried-in credit as two segments with a 2px surface gap. */}
          <div className="mt-1.5 flex h-3 gap-0.5" aria-hidden="true">
            <span className="h-full rounded-l-[4px] bg-ink-muted last:rounded-r-[4px]" style={{ width: pct(totals.advanceCents) }} />
            {totals.carriedInCents > 0 && <span className="h-full rounded-r-[4px] bg-line-strong" style={{ width: pct(totals.carriedInCents) }} />}
          </div>
          {totals.carriedInCents > 0 && (
            <p className="mt-1 text-xs text-ink-muted">{t("charts.scale.paidParts", { advances: formatCents(totals.advanceCents), carried: formatCents(totals.carriedInCents) })}</p>
          )}
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-ink-muted">{t("charts.scale.costs")}</dt>
            <dd className="mono">{formatCents(totals.actualCents)}</dd>
          </div>
          <div className="mt-1.5 h-3" aria-hidden="true">
            <span className="block h-full rounded-[4px] bg-ink" style={{ width: pct(totals.actualCents) }} />
          </div>
        </div>
      </dl>
      <p className={cn("mt-4 flex items-center gap-2 border-t border-line pt-3 font-semibold", balance < 0 ? "text-primary" : balance > 0 ? "text-warn" : "text-ink")}>
        {balance > 0 ? <AlertTriangle className="size-4" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
        {balance < 0 ? t("charts.scale.credit", { amount: formatCents(-balance) }) : balance > 0 ? t("charts.scale.owes", { amount: formatCents(balance) }) : t("charts.scale.even")}
      </p>
    </figure>
  );
}

/**
 * Costs month by month (one-color bars) against the monthly advance (dashed line).
 * Hover/focus shows the month's numbers; the table next to it is the full data view.
 */
export function MonthlyCostsChart({ months, forecast = [], className }: { months: CostMonth[]; forecast?: { period: string; costCents: number; advanceCents: number }[]; className?: string }) {
  const { t } = useTranslation();
  const monthLabel = useMonthLabel("short");
  const all = [...months.map((m) => ({ ...m, forecast: false })), ...forecast.map((f) => ({ ...f, forecast: true }))];
  if (!all.length) return null;
  const max = Math.max(...all.map((m) => Math.max(m.costCents, m.advanceCents)), 1);

  const W = 100 / all.length;
  const H = 120;
  const y = (c: number) => H - (c / max) * H;

  return (
    <figure className={cn("rounded-md border border-line bg-surface-raised p-4", className)}>
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="label-mono">{t("charts.monthly.title")}</span>
        <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px] bg-ink-muted" aria-hidden="true" />
            {t("charts.monthly.costs")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 border-t-2 border-dashed border-ink" aria-hidden="true" />
            {t("charts.monthly.advance")}
          </span>
          {forecast.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px] border border-dashed border-ink-muted" aria-hidden="true" />
              {t("charts.monthly.forecast")}
            </span>
          )}
        </span>
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-36 w-full overflow-visible" role="img" aria-label={t("charts.monthly.aria")}>
          {/* Recessive baseline. */}
          <line x1="0" x2="100" y1={H} y2={H} className="stroke-line" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {all.map((m, i) => {
            const x = i * W;
            const bw = W * 0.6;
            const bx = x + (W - bw) / 2;
            const top = y(m.costCents);
            return (
              <g key={m.period} className="group">
                <title>{`${monthLabel(m.period)}${m.forecast ? ` (${t("charts.monthly.forecast")})` : ""}: ${t("charts.monthly.costs")} ${formatCents(m.costCents)}, ${t("charts.monthly.advance")} ${formatCents(m.advanceCents)}`}</title>
                {/* Wider invisible hit target than the bar. */}
                <rect x={x} y={0} width={W} height={H} fill="transparent" />
                {m.costCents > 0 && (
                  <rect
                    x={bx}
                    y={top}
                    width={bw}
                    height={H - top}
                    rx="0.8"
                    className={m.forecast ? "fill-transparent stroke-ink-muted" : "fill-ink-muted group-hover:fill-ink"}
                    strokeDasharray={m.forecast ? "3 2" : undefined}
                    strokeWidth={m.forecast ? 1.5 : 0}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {m.advanceCents > 0 && (
                  <line x1={x + W * 0.08} x2={x + W * 0.92} y1={y(m.advanceCents)} y2={y(m.advanceCents)} className="stroke-ink" strokeWidth="2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
                )}
              </g>
            );
          })}
        </svg>
        <div className="mt-1.5 grid text-center font-mono text-[10px] tracking-[0.04em] text-ink-muted uppercase" style={{ gridTemplateColumns: `repeat(${all.length}, minmax(0, 1fr))` }}>
          {all.map((m, i) => (
            // Every label when there is room; on long ranges every second one.
            <span key={m.period} className={cn("truncate", all.length > 9 && i % 2 === 1 && "invisible sm:visible")}>
              {monthLabel(m.period).replace(/\s?\d{4}$/, "").replace(".", "")}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}
