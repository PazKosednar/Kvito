/** Date-only helpers. Calendar dates are stored as UTC midnight (@db.Date). */

export const DISPLAY_TZ = "Europe/Ljubljana";

/** "2026-11-05" → Date at 2026-11-05T00:00:00Z */
export function parseDateOnly(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) throw new Error(`Invalid date: ${value}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1) throw new Error(`Invalid date: ${value}`);
  return d;
}

export const toDateOnly = (d: Date): string => d.toISOString().slice(0, 10);

/** Today's calendar date in Ljubljana, as UTC midnight. */
export function todayInLjubljana(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now);
  return parseDateOnly(parts);
}

export const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * 86_400_000);

/** Due date for a given month, clamping the day to the month's length (e.g. 31 → 30. 11.). */
export function dueDateInMonth(year: number, month1: number, day: number): Date {
  const last = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month1 - 1, Math.min(day, last)));
}

/** "DD.MM.YYYY" as required by UPN QR. */
export function formatUpnDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

/** "2026-11" for a date. */
export const periodOf = (d: Date): string => d.toISOString().slice(0, 7);
