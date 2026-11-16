/**
 * Time of day and season for the property town, from the real time in Ljubljana.
 * Pure functions (tested); the hook useTownAmbient adds the per-device manual override.
 */

export type DayTime = "day" | "night";
export type Season = "spring" | "summer" | "autumn" | "winter";

/** Ljubljana (the app's display time zone and the country's centre is close enough for sunrise/sunset). */
const LAT = 46.05;
const LON = 14.51;
const TZ = "Europe/Ljubljana";

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Calendar date (year, month 1–12, day) in Ljubljana. */
export function ljubljanaDate(now: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/**
 * Sunrise and sunset (UTC) for a calendar day, NOAA general solar position approximation
 * (accurate to a few minutes; the town only needs day vs night).
 */
export function sunTimes(y: number, m: number, d: number, lat = LAT, lon = LON): { sunrise: Date; sunset: Date } {
  const start = Date.UTC(y, m - 1, d);
  const dayOfYear = Math.floor((start - Date.UTC(y, 0, 0)) / 86_400_000);
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosHa = Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(decl)) - Math.tan(rad(lat)) * Math.tan(decl);
  const ha = deg(Math.acos(Math.min(1, Math.max(-1, cosHa))));
  const sunriseMin = 720 - 4 * (lon + ha) - eqTime;
  const sunsetMin = 720 - 4 * (lon - ha) - eqTime;
  return { sunrise: new Date(start + sunriseMin * 60_000), sunset: new Date(start + sunsetMin * 60_000) };
}

/** Night between sunset and sunrise in Ljubljana. */
export function dayTimeAt(now: Date): DayTime {
  const { y, m, d } = ljubljanaDate(now);
  const { sunrise, sunset } = sunTimes(y, m, d);
  return now < sunrise || now > sunset ? "night" : "day";
}

/** Meteorological seasons: Dec–Feb winter, Mar–May spring, Jun–Aug summer, Sep–Nov autumn. */
export function seasonAt(now: Date): Season {
  const { m } = ljubljanaDate(now);
  if (m === 12 || m <= 2) return "winter";
  if (m <= 5) return "spring";
  if (m <= 8) return "summer";
  return "autumn";
}
