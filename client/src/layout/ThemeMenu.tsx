import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ThemePreference } from "@/contexts/ThemeContext";
import { useTheme } from "@/hooks/useTheme";

/** Cycle order on click: light → dark → system → light … */
const ORDER: ThemePreference[] = ["light", "dark", "system"];
const ICONS: Record<ThemePreference, LucideIcon> = { light: Sun, dark: Moon, system: Monitor };

/** Theme toggle next to the notifications bell: one click switches to the next theme; the icon shows the current one. */
export function ThemeMenu() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
  const Icon = ICONS[theme];
  const label = t("theme.toggle", { current: t(`theme.${theme}`), next: t(`theme.${next}`) });

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className="inline-flex size-10 items-center justify-center rounded-sm text-ink-muted transition-colors duration-150 hover:text-foreground focus-visible:outline-2"
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}
