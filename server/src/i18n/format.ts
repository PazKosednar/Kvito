import type { ChargeType, Locale } from "../generated/prisma/client.js";

/** Server-side wording for notifications and e-mails, in the recipient's language (User.locale). */
export type { Locale };

const NUMBER_LOCALE: Record<Locale, string> = { sl: "sl-SI", en: "en-GB" };

const MONTHS: Record<Locale, string[]> = {
  sl: ["januar", "februar", "marec", "april", "maj", "junij", "julij", "avgust", "september", "oktober", "november", "december"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

/** "1.250,00 €" (sl) / "€1,250.00" (en). */
export const eurIn = (l: Locale, cents: number) =>
  new Intl.NumberFormat(NUMBER_LOCALE[l], { style: "currency", currency: "EUR", useGrouping: "always" }).format(cents / 100);

/** Calendar date (stored as UTC midnight): "15. 11. 2026" (sl) / "15/11/2026" (en). */
export const dateIn = (l: Locale, d: Date) => new Intl.DateTimeFormat(NUMBER_LOCALE[l], { timeZone: "UTC" }).format(d);

/** "november 2026" for "2026-11". */
export function periodIn(l: Locale, period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[l][(m ?? 1) - 1]} ${y}`;
}

/** Slovenian dual and plural: 1 dan, 2 dneva, 3 dni. */
export function slPlural(n: number, one: string, two: string, few: string, other: string): string {
  const r = Math.abs(n) % 100;
  return r === 1 ? one : r === 2 ? two : r === 3 || r === 4 ? few : other;
}

export const daysIn = (l: Locale, n: number) =>
  l === "en" ? `${n} ${n === 1 ? "day" : "days"}` : `${n} ${slPlural(n, "dan", "dneva", "dni", "dni")}`;

export interface ChargeTitleSource {
  type: ChargeType;
  title: string;
  rentPeriod: string | null;
  autoKey: string | null;
}

/**
 * Titles of generated charges are rebuilt in the reader's language; landlords' own titles stay as written.
 * autoKey formats: "advance:2026-11", "combined:2026-11", "settlement:2026-01-01:2026-12-31".
 */
export function chargeTitle(c: ChargeTitleSource, l: Locale): string {
  if (c.type === "RENT" && c.rentPeriod && c.autoKey?.startsWith("combined:")) {
    return `${l === "en" ? "Rent and costs" : "Najemnina in stroški"} ${periodIn(l, c.rentPeriod)}`;
  }
  if (c.type === "RENT" && c.rentPeriod) return `${l === "en" ? "Rent" : "Najemnina"} ${periodIn(l, c.rentPeriod)}`;
  if (c.type === "ADVANCE" && c.autoKey?.startsWith("advance:")) {
    return `${l === "en" ? "Cost advance" : "Akontacija stroškov"} ${periodIn(l, c.autoKey.slice(8))}`;
  }
  if (c.type === "DEPOSIT") return l === "en" ? "Security deposit" : "Varščina";
  if (c.type === "SETTLEMENT" && c.autoKey?.startsWith("settlement:")) {
    const [, from, to] = c.autoKey.split(":");
    const range = `${dateIn(l, new Date(`${from}T00:00:00Z`))} – ${dateIn(l, new Date(`${to}T00:00:00Z`))}`;
    return `${l === "en" ? "Cost settlement" : "Poračun stroškov"} ${range}`;
  }
  return c.title;
}
