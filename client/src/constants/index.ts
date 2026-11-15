/** API base URL. Empty in web development (Vite proxies /api); set VITE_API_URL for Capacitor/native builds. */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "";

export const SUPPORTED_LOCALES = ["sl", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "sl";

export const DISPLAY_TIME_ZONE = "Europe/Ljubljana";

export const STORAGE_KEYS = {
  theme: "kvita-theme",
  locale: "kvita-locale",
  iosHintDismissed: "kvita-ios-hint-dismissed",
} as const;

export const ROUTES = {
  home: "/",
  login: "/prijava",
  onboarding: "/dobrodoslica",
  notifications: "/obvestila",
  bankImport: "/izpisek",
  annual: "/letni-povzetek",
  history: "/moj-zivljenjepis",
  terms: "/pogoji",
  privacyPolicy: "/politika-zasebnosti",
} as const;

/** Version of the terms / privacy policy shown at sign-up. Must match TERMS_VERSION in server/src/modules/auth/service.ts. */
export const TERMS_VERSION = "2026-11-osnutek";

