import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { HandoverStatus, ItemCondition } from "@/types/domain";

const STATUS: Record<HandoverStatus, string> = {
  DRAFT: "bg-surface-sunken text-ink-muted",
  AWAITING_CONFIRMATION: "border-line-strong bg-surface-raised text-ink",
  CONFIRMED: "bg-accent-soft text-primary",
};

export function HandoverStatusBadge({ status }: { status: HandoverStatus }) {
  const { t } = useTranslation();
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-xs border border-transparent px-2 font-mono text-[11px] font-medium tracking-[0.06em] uppercase", STATUS[status])}>
      <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        {status === "CONFIRMED" ? <path d="M3 8.5l3.2 3.2L13 4.5" /> : status === "AWAITING_CONFIRMATION" ? <><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.5l2 1.5" /></> : <rect x="4.5" y="4.5" width="7" height="7" />}
      </svg>
      {t(`handoverStatus.${status}`)}
    </span>
  );
}

const CONDITION: Record<ItemCondition, string> = {
  GOOD: "text-primary",
  WORN: "text-ink-muted",
  DAMAGED: "text-warn",
  MISSING: "text-danger",
};

export function ConditionLabel({ condition }: { condition: ItemCondition }) {
  const { t } = useTranslation();
  return <span className={cn("font-mono text-[11px] font-medium tracking-[0.06em] uppercase", CONDITION[condition])}>{t(`condition.${condition}`)}</span>;
}

/** Room name suggestions in the current language. */
export function useRoomSuggestions(): string[] {
  const { t } = useTranslation();
  const list = t("handover.roomSuggestions", { returnObjects: true });
  return Array.isArray(list) ? (list as string[]) : [];
}
