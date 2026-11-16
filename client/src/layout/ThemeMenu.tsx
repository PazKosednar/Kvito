import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ThemePreference } from "@/contexts/ThemeContext";
import { useTheme } from "@/hooks/useTheme";

const OPTIONS: { value: ThemePreference; icon: LucideIcon }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];

/** Theme picker next to the notifications bell: the icon shows the current choice (sun / moon / monitor). */
export function ThemeMenu() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const Current = OPTIONS.find((o) => o.value === theme)?.icon ?? Moon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t("theme.label")}: ${t(`theme.${theme}`)}`}
        className="inline-flex size-10 items-center justify-center rounded-sm text-ink-muted transition-colors duration-150 hover:text-foreground focus-visible:outline-2"
      >
        <Current className="size-5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-44 rounded-md p-1.5">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t("theme.label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
          {OPTIONS.map(({ value, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="min-h-11">
              <Icon aria-hidden="true" />
              {t(`theme.${value}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
