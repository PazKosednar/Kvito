import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/brand";
import { daysUntil, formatDate } from "@/lib/dates";
import type { ChargeStatus } from "@/types/domain";

/** Charge status – the CGP StatusBadge (word + icon, never color alone). */
export function ChargeStatusPill({ status, className }: { status: ChargeStatus; className?: string }) {
  return <StatusBadge status={status} {...(className ? { className } : {})} />;
}

/** CGP voice: lateness is a fact, not a threat – "Rok je potekel pred 3 dnevi." */
export function DueText({ dueDate, status }: { dueDate: string; status: ChargeStatus }) {
  const { t } = useTranslation();
  if (status === "CONFIRMED" || status === "REPORTED_PAID") return <>{t("charges.dueOn", { date: formatDate(dueDate) })}</>;
  const days = daysUntil(dueDate);
  if (days < 0) return <span className="text-warn">{t("charges.lateBy", { count: -days })}</span>;
  if (days === 0) return <span className="text-ink">{t("charges.dueToday")}</span>;
  if (days <= 7) return <>{t("charges.dueIn", { count: days })}</>;
  return <>{t("charges.dueOn", { date: formatDate(dueDate) })}</>;
}
