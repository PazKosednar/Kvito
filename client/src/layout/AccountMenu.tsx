// lucide's `User` icon is aliased to avoid clashing with our `User`-like types.
import { ArrowLeftRight, Languages, LogOut, Monitor, Moon, Sun, User as UserIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SUPPORTED_LOCALES, type Locale } from "@/constants";
import type { ThemePreference } from "@/contexts/ThemeContext";
import { useAccountActions } from "@/hooks/useAccountActions";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useTheme } from "@/hooks/useTheme";

const THEMES: { value: ThemePreference; icon: typeof Sun }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];

export function AccountMenu() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { otherRole } = useRole();
  const { theme, setTheme } = useTheme();
  const { changeRole, changeLanguage, signOut } = useAccountActions();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 rounded-full" aria-label={user?.email ?? ""}>
          <UserIcon className="size-6" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user?.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {otherRole && (
          <>
            <DropdownMenuItem className="py-3" onSelect={() => void changeRole(otherRole)}>
              <ArrowLeftRight />
              {t("roles.switchTo", { role: t(`roles.${otherRole}`) })}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuLabel>{t("theme.label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
          {THEMES.map(({ value, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="py-2.5">
              <Icon />
              {t(`theme.${value}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />

        <DropdownMenuLabel className="flex items-center gap-2">
          <Languages className="size-4" />
          {t("language.label")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={i18n.language} onValueChange={(v) => void changeLanguage(v as Locale)}>
          {SUPPORTED_LOCALES.map((locale) => (
            <DropdownMenuRadioItem key={locale} value={locale} className="py-2.5">
              {t(`language.${locale}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />

        <DropdownMenuItem className="py-3" onSelect={() => void signOut()}>
          <LogOut />
          {t("auth.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
