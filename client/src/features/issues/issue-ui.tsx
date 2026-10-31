import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { IssueStatus, IssueUrgency } from "@/types/domain";

const STATUS_STYLE: Record<IssueStatus, string> = {
  NEW: "border-line-strong bg-surface-raised text-ink",
  IN_PROGRESS: "bg-warn-soft text-warn",
  RESOLVED: "bg-accent-soft text-primary",
};

function Icon({ status }: { status: IssueStatus }) {
  const p = { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "square" as const, className: "size-3 shrink-0", "aria-hidden": true };
  if (status === "RESOLVED") return <svg {...p}><path d="M3 8.5l3.2 3.2L13 4.5" /></svg>;
  if (status === "IN_PROGRESS") return <svg {...p}><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.5l2 1.5" /></svg>;
  return <svg {...p}><rect x="4.5" y="4.5" width="7" height="7" /></svg>;
}

/** Issue status in the CGP badge style (word + icon). */
export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  const { t } = useTranslation();
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-xs border border-transparent px-2 font-mono text-[11px] leading-4 font-medium tracking-[0.06em] uppercase", STATUS_STYLE[status])}>
      <Icon status={status} />
      {t(`issueStatus.${status}`)}
    </span>
  );
}

/** Urgency only needs attention when it is urgent – otherwise it stays quiet text. */
export function UrgencyLabel({ urgency }: { urgency: IssueUrgency }) {
  const { t } = useTranslation();
  if (urgency !== "URGENT") return <span className="text-ink-faint">{t(`urgency.${urgency}`)}</span>;
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-xs bg-danger-soft px-2 font-mono text-[11px] font-medium tracking-[0.06em] text-danger uppercase">
      <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <path d="M8 2.5l6 11H2z" />
        <path d="M8 6.5v3.5M8 11.8v.4" />
      </svg>
      {t("urgency.URGENT")}
    </span>
  );
}
