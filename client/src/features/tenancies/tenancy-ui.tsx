import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { TenancyMember, TenancyStatus } from "@/types/domain";

export function tenantNames(members: TenancyMember[]): string {
  return members.map((m) => m.user.name ?? m.user.email).join(", ");
}

export function TenancyStatusLabel({ status }: { status: TenancyStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "shrink-0 rounded-sm px-2 py-1 font-mono text-[10px] font-medium tracking-[0.06em] uppercase",
        status === "ACTIVE" && "bg-success/12 text-success",
        status === "ENDED" && "bg-muted text-muted-foreground",
        status === "DRAFT" && "bg-warning/20 text-warning-foreground",
      )}
    >
      {t(`tenancies.status.${status}`)}
    </span>
  );
}
