import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { DepositStatus, SettlementStatus } from "@/types/domain";

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

