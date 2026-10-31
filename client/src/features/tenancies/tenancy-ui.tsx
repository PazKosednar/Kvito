import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { TenancyMember, TenancyStatus } from "@/types/domain";

export function tenantNames(members: TenancyMember[]): string {
  return members.map((m) => m.user.name ?? m.user.email).join(", ");
}

/** Tenancy status in the CGP badge style (mono, uppercase, radius 2, with a status dot). */
export function TenancyStatusLabel({ status }: { status: TenancyStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-xs px-2 font-mono text-[11px] leading-4 font-medium tracking-[0.06em] uppercase",
        status === "ACTIVE" && "bg-accent-soft text-primary",
        status === "ENDED" && "bg-surface-sunken text-ink-muted",
        status === "DRAFT" && "bg-warn-soft text-warn",
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {t(`tenancies.status.${status}`)}
    </span>
  );
}
