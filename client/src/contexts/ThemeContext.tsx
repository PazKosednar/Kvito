import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { STORAGE_KEYS } from "@/constants";
import { storage } from "@/lib/storage";

export type ThemePreference = "dark" | "light";

export interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

// Browser UI chrome color per theme; keep in sync with --surface in src/styles/tokens.css and public/theme-init.js.
const THEME_COLORS: Record<ThemePreference, string> = { dark: "#0c0c0d", light: "#eeece7" };

function readPreference(): ThemePreference {
  // Grafit (dark) is the primary theme regardless of the OS setting; Kamen (light) only when chosen.
  // A previously saved "system" preference falls back to dark.
  return storage.get(STORAGE_KEYS.theme) === "light" ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readPreference);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
  }, [theme]);

  const setTheme = useCallback((next: ThemePreference) => {
    storage.set(STORAGE_KEYS.theme, next);
    setThemeState(next);
  }, []);

  // resolvedTheme is kept for consumers; without a "system" option it always equals theme.
  const value = useMemo(() => ({ theme, resolvedTheme: theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
