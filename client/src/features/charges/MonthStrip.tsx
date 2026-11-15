import { Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { STATUS_STYLE, StatusIcon } from "@/components/brand";
import type { MonthState, StripMonth } from "@/hooks/useMonthStrip";
import { cn } from "@/lib/utils";

/**
 * The year of a tenancy as a strip of months: green with a tick when everything due in the month is confirmed.
 * State is shown by icon + word (screen readers and the legend), never by color alone.
 */
export function MonthStrip({ months, settled, className }: { months: StripMonth[]; settled: boolean; className?: string }) {
  const { t, i18n } = useTranslation();
  const label = (p: string, month: "short" | "long") =>
    new Intl.DateTimeFormat(i18n.language === "en" ? "en-GB" : "sl-SI", { month, ...(month === "long" ? { year: "numeric" } : {}), timeZone: "UTC" })
      .format(new Date(`${p}-01T00:00:00Z`))
      .replace(".", "");
  const shown = new Set<MonthState>(months.map((m) => m.state));

  return (
    <section className={cn("rounded-md border border-line bg-surface-raised p-4", className)} aria-labelledby="month-strip-title">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="month-strip-title" className="label-mono">
          {t("strip.title")}
        </h2>
        {settled && <span className="font-mono text-xs font-semibold tracking-[0.06em] text-primary uppercase">Kvito ✓</span>}
      </div>
      <ol className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {months.map((m) => {
          const text = `${label(m.period, "long")}: ${t(`strip.state.${m.state}`)}`;
          return (
            <li
              key={m.period}
              title={text}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-1 rounded-xs border border-transparent transition-colors duration-150",
                m.state === "NONE" ? "border-dashed border-line text-ink-faint" : STATUS_STYLE[m.state],
                m.current && "ring-1 ring-ink ring-offset-1 ring-offset-surface-raised",
              )}
            >
              <span className="font-mono text-[11px] leading-none tracking-[0.04em] uppercase">{label(m.period, "short")}</span>
              {m.state === "NONE" ? <Minus className="size-3" aria-hidden="true" /> : <StatusIcon status={m.state} className="size-3.5" />}
              <span className="sr-only">{text}</span>
            </li>
          );
        })}
      </ol>
      {/* Legend: only the states that appear. */}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        {(["CONFIRMED", "REPORTED_PAID", "OPEN", "OVERDUE", "DISPUTED", "NONE"] as const)
          .filter((s) => shown.has(s))
          .map((s) => (
            <li key={s} className="inline-flex items-center gap-1.5">
              {s === "NONE" ? <Minus className="size-3" aria-hidden="true" /> : <StatusIcon status={s} />}
              {t(`strip.state.${s}`)}
            </li>
          ))}
      </ul>
    </section>
  );
}
