import { useTranslation } from "react-i18next";
import { useAccountActions } from "@/hooks/useAccountActions";
import { useRole } from "@/hooks/useRole";
import type { Role } from "@/types/user";
import { cn } from "@/lib/utils";

const ORDER: Role[] = ["LANDLORD", "TENANT"];

/** Segmented landlord/tenant switch, shown only to people who have both roles. */
export function RoleSwitch({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { roles, activeRole } = useRole();
  const { changeRole } = useAccountActions();
  if (roles.length < 2) return null;

  return (
    <div
      role="radiogroup"
      aria-label={t("roles.switchLabel")}
      className={cn("grid grid-cols-2 rounded-lg bg-muted p-1", className)}
    >
      {ORDER.map((role) => {
        const active = role === activeRole;
        return (
          <button
            key={role}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => !active && void changeRole(role)}
            className={cn(
              "h-10 rounded-md px-3 text-sm font-semibold transition-colors",
              active ? "bg-card text-foreground shadow-sm ring-1 ring-border dark:bg-secondary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`roles.${role}`)}
          </button>
        );
      })}
    </div>
  );
}
