import { DISPLAY_TIME_ZONE } from "@/constants";

/** Calendar dates come from the API as "2026-11-05" or ISO midnight UTC; show them as "5. 11. 2026". */
export function formatDate(value: string | Date, locale = "sl-SI"): string {
  const d = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : value;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
}

/** Timestamps (messages, events) in Ljubljana time. */
export function formatDateTime(value: string | Date, locale = "sl-SI"): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(new Date(value));
}

export function formatTime(value: string | Date, locale = "sl-SI"): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: DISPLAY_TIME_ZONE }).format(
    new Date(value),
  );
}

/** "2026-11-05" for <input type="date">. */
export const toDateInput = (value: string | null | undefined): string => (value ? value.slice(0, 10) : "");

/** Today in Ljubljana as "YYYY-MM-DD". */
export function todayInput(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIME_ZONE }).format(new Date());
}

/** Whole days from today (Ljubljana) to a calendar date; negative when in the past. */
export function daysUntil(date: string): number {
  const target = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${todayInput()}T00:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}
