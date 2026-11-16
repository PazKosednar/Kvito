import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { STORAGE_KEYS } from "@/constants";
import { storage } from "@/lib/storage";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

// Browser UI chrome color per theme; keep in sync with --surface in src/styles/tokens.css and public/theme-init.js.
const THEME_COLORS: Record<ResolvedTheme, string> = { dark: "#0c0c0d", light: "#eeece7" };

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function readPreference(): ThemePreference {
  // Grafit (dark) is the default; light or "system" (follow the OS) only when the user chose it.
  const saved = storage.get(STORAGE_KEYS.theme);
  return saved === "light" || saved === "system" ? saved : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readPreference);
  const [systemDark, setSystemDark] = useState(() => media().matches);

  useEffect(() => {
    const mq = media();
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: ResolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[resolvedTheme]);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: ThemePreference) => {
    storage.set(STORAGE_KEYS.theme, next);
    setThemeState(next);
  }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
