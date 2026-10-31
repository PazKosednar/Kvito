import { LogOut, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SUPPORTED_LOCALES, type Locale } from "@/constants";
import type { ThemePreference } from "@/contexts/ThemeContext";
import { useAccountActions } from "@/hooks/useAccountActions";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useTheme } from "@/hooks/useTheme";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const THEMES: ThemePreference[] = ["light", "dark", "system"];

/** Small segmented choice inside the menu (keeps the menu short instead of long radio lists). */
function Segmented<T extends string>({
  value,
  options,
  label,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  label: string;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="mx-2 mb-2 flex rounded-md bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 flex-1 rounded-[calc(var(--radius-md)-2px)] px-2 text-xs font-semibold transition-colors",
            o.value === value ? "bg-card text-foreground shadow-sm dark:bg-secondary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function AccountMenu() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { roles, otherRole } = useRole();
  const { theme, setTheme } = useTheme();
  const { changeRole, changeLanguage, signOut } = useAccountActions();
  if (!user) return null;

  const canAddRole = otherRole !== null && !roles.includes(otherRole);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-11 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground transition-colors hover:bg-accent focus-visible:outline-2"
        aria-label={user.email}
      >
        {initials(user.name, user.email)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-72 rounded-xl p-1.5">
        <div className="px-2 pt-2 pb-3">
          {user.name && <p className="font-semibold">{user.name}</p>}
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
        <DropdownMenuSeparator />

        {canAddRole && otherRole && (
          <>
            <DropdownMenuItem className="py-3" onSelect={() => void changeRole(otherRole)}>
              <Plus />
              {t(`roles.addRole.${otherRole}`)}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t("theme.label")}</DropdownMenuLabel>
        <Segmented
          label={t("theme.label")}
          value={theme}
          options={THEMES.map((v) => ({ value: v, label: t(`theme.${v}`) }))}
          onChange={setTheme}
        />
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          {t("language.label")}
        </DropdownMenuLabel>
        <Segmented
          label={t("language.label")}
          value={(SUPPORTED_LOCALES as readonly string[]).includes(i18n.language) ? (i18n.language as Locale) : "sl"}
          options={SUPPORTED_LOCALES.map((v) => ({ value: v, label: t(`language.${v}`) }))}
          onChange={(v) => void changeLanguage(v)}
        />
        <DropdownMenuSeparator />

        <DropdownMenuItem className="py-3" onSelect={() => void signOut()}>
          <LogOut />
          {t("auth.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
