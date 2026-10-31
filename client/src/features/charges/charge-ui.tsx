import { useTranslation } from "react-i18next";
import { daysUntil, formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ChargeStatus } from "@/types/domain";

const STYLE: Record<ChargeStatus, string> = {
  OPEN: "bg-secondary text-secondary-foreground",
  OVERDUE: "bg-destructive/12 text-destructive",
  REPORTED_PAID: "bg-warning/25 text-warning-foreground",
  CONFIRMED: "bg-success/12 text-success",
  DISPUTED: "bg-info/12 text-info",
};

export function ChargeStatusPill({ status, className }: { status: ChargeStatus; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", STYLE[status], className)}>
      {t(`chargeStatus.${status}`)}
    </span>
  );
}

/** "čez 3 dni", "danes", "zamuja 2 dni" – or the plain date once settled. */
export function DueText({ dueDate, status }: { dueDate: string; status: ChargeStatus }) {
  const { t } = useTranslation();
  if (status === "CONFIRMED" || status === "REPORTED_PAID") return <>{t("charges.dueOn", { date: formatDate(dueDate) })}</>;
  const days = daysUntil(dueDate);
  if (days < 0) return <span className="font-medium text-destructive">{t("charges.lateBy", { count: -days })}</span>;
  if (days === 0) return <span className="font-medium text-foreground">{t("charges.dueToday")}</span>;
  if (days <= 7) return <>{t("charges.dueIn", { count: days })}</>;
  return <>{t("charges.dueOn", { date: formatDate(dueDate) })}</>;
}
