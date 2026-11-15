import { Lock } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CostMonth, CostType, DepositStatus, SettlementStatus } from "@/types/domain";

type Tone = "done" | "wait" | "warn" | "danger" | "muted";

const TONE: Record<Tone, string> = {
  done: "bg-accent-soft text-primary",
  wait: "border border-line-strong bg-surface-raised text-ink",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  muted: "bg-surface-sunken text-ink-muted",
};

/** Status as word + dot, like the tenancy status (CGP: never color alone). */
function StateLabel({ tone, children }: { tone: Tone; children: string }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-xs px-2 font-mono text-[11px] leading-4 font-medium tracking-[0.06em] whitespace-nowrap uppercase", TONE[tone])}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

const DEPOSIT_TONE: Record<DepositStatus, Tone> = {
  AWAITING_PAYMENT: "muted",
  HELD: "wait",
  RETURN_PROPOSED: "warn",
  RETURN_DISPUTED: "danger",
  RETURN_AGREED: "warn",
  RETURNED: "done",
};

export function DepositStatusLabel({ status }: { status: DepositStatus }) {
  const { t } = useTranslation();
  return <StateLabel tone={DEPOSIT_TONE[status]}>{t(`depositStatus.${status}`)}</StateLabel>;
}

const SETTLEMENT_TONE: Record<SettlementStatus, Tone> = {
  DRAFT: "muted",
  SENT: "warn",
  DISPUTED: "danger",
  ACCEPTED: "wait",
  CLOSED: "done",
};

export function SettlementStatusLabel({ status }: { status: SettlementStatus }) {
  const { t } = useTranslation();
  return <StateLabel tone={SETTLEMENT_TONE[status]}>{t(`settlementStatus.${status}`)}</StateLabel>;
}

/** "Feb 2026" / "februar 2026" for "2026-02". */
export function useMonthLabel(style: "long" | "short" = "long") {
  const { i18n } = useTranslation();
  return useCallback(
    (period: string) =>
      new Intl.DateTimeFormat(i18n.language === "en" ? "en-GB" : "sl-SI", { month: style, year: "numeric", timeZone: "UTC" }).format(new Date(`${period}-01T00:00:00Z`)),
    [i18n.language, style],
  );
}

/** Month locked by a settlement already sent to the tenant. */
export function LockedLabel() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] tracking-[0.06em] text-ink-muted uppercase">
      <Lock className="size-3" aria-hidden="true" />
      {t("contract.monthly.locked")}
    </span>
  );
}

/**
 * The landlord's spreadsheet as a table: one row per month, one column per cost type, the advance and the
 * difference. Scrolls sideways inside its frame on narrow screens.
 */
export function CostMonthsTable({ months, costTypes, className }: { months: CostMonth[]; costTypes: CostType[]; className?: string }) {
  const { t } = useTranslation();
  const monthLabel = useMonthLabel("short");
  const sum = (pick: (m: CostMonth) => number) => months.reduce((s, m) => s + pick(m), 0);
  const cell = "px-3 py-2 text-right mono whitespace-nowrap";
  return (
    <div className={cn("overflow-x-auto rounded-md border border-line bg-surface-raised", className)}>
      <table className="w-full text-sm">
        <caption className="sr-only">{t("contract.monthly.title")}</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="label-mono px-3 py-2 text-left">{t("contract.monthly.month")}</th>
            {costTypes.map((c) => (
              <th key={c} scope="col" className="label-mono px-3 py-2 text-right">{t(`costs.${c}`)}</th>
            ))}
            <th scope="col" className="label-mono px-3 py-2 text-right">{t("contract.monthly.costsTotal")}</th>
            <th scope="col" className="label-mono px-3 py-2 text-right">{t("contract.costs.advances")}</th>
            <th scope="col" className="label-mono px-3 py-2 text-right">{t("contract.costs.difference")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {months.map((m) => (
            <tr key={m.period}>
              <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap">{monthLabel(m.period)}</th>
              {costTypes.map((c) => (
                <td key={c} className={cell}>{m.costs[c] !== undefined ? formatCents(m.costs[c]!) : "–"}</td>
              ))}
              <td className={cn(cell, "font-semibold")}>{formatCents(m.costCents)}</td>
              <td className={cell}>{formatCents(m.advanceCents)}</td>
              <td className={cn(cell, m.balanceCents < 0 && "text-primary")}>{formatSigned(m.balanceCents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line-strong">
            <th scope="row" className="px-3 py-2 text-left font-semibold">{t("contract.monthly.total")}</th>
            {costTypes.map((c) => (
              <td key={c} className={cn(cell, "font-semibold")}>{formatCents(sum((m) => m.costs[c] ?? 0))}</td>
            ))}
            <td className={cn(cell, "font-semibold")}>{formatCents(sum((m) => m.costCents))}</td>
            <td className={cn(cell, "font-semibold")}>{formatCents(sum((m) => m.advanceCents))}</td>
            <td className={cn(cell, "font-semibold", sum((m) => m.balanceCents) < 0 && "text-primary")}>{formatSigned(sum((m) => m.balanceCents))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** "+12,40 €" / "−8,24 €": costs above (+) or below (−) the advances. */
export const formatSigned = (cents: number) => (cents > 0 ? `+${formatCents(cents)}` : cents < 0 ? `−${formatCents(-cents)}` : formatCents(0));

