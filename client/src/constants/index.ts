/** API base URL. Empty in web development (Vite proxies /api); set VITE_API_URL for Capacitor/native builds. */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "";

export const SUPPORTED_LOCALES = ["sl", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "sl";

export const DISPLAY_TIME_ZONE = "Europe/Ljubljana";

export const STORAGE_KEYS = {
  theme: "kvita-theme",
  townScene: "kvita-town-scene",
  townDayTime: "kvita-town-daytime",
  townSeason: "kvita-town-season",
  locale: "kvita-locale",
  iosHintDismissed: "kvita-ios-hint-dismissed",
  /** Holds the promo code whose popup was closed; a new code shows the popup again. */
  promoDismissed: "kvita-promo-dismissed",
} as const;

/**
 * Promo code for new landlords. It lives in Polar as a discount "NEW30" (−30 %, duration "once");
 * the landlord types it on Polar's payment page (docs/POLAR_SETUP.md). Keep both in sync.
 */
export const PROMO = { code: "NEW30", percent: 30 } as const;

export const ROUTES = {
  home: "/",
  login: "/prijava",
  onboarding: "/dobrodoslica",
  notifications: "/obvestila",
  bankImport: "/izpisek",
  payments: "/placila",
  annual: "/letni-povzetek",
  taxes: "/davki",
  billing: "/narocnina",
  calendar: "/koledar",
  profitability: "/donosnost",
  history: "/moj-zivljenjepis",
  terms: "/pogoji",
  privacyPolicy: "/politika-zasebnosti",
} as const;

/** Version of the terms / privacy policy shown at sign-up. Must match TERMS_VERSION in server/src/modules/auth/service.ts. */
export const TERMS_VERSION = "2026-11-osnutek";

