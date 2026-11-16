import { describe, expect, it } from "vitest";
import { dayTimeAt, seasonAt, sunTimes } from "./townAmbient";

/** Minutes after midnight UTC. */
const utcMin = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();

describe("town ambient", () => {
  it("sun rises and sets in a plausible window for Ljubljana", () => {
    // Summer: sunrise roughly 03:00–03:30 UTC, sunset roughly 18:45–19:15 UTC.
    const summer = sunTimes(2026, 6, 21);
    expect(utcMin(summer.sunrise)).toBeGreaterThan(3 * 60);
    expect(utcMin(summer.sunrise)).toBeLessThan(3 * 60 + 30);
    expect(utcMin(summer.sunset)).toBeGreaterThan(18 * 60 + 45);
    expect(utcMin(summer.sunset)).toBeLessThan(19 * 60 + 15);
    // Winter: sunrise roughly 06:30–07:00 UTC, sunset roughly 15:00–15:35 UTC.
    const winter = sunTimes(2026, 12, 21);
    expect(utcMin(winter.sunrise)).toBeGreaterThan(6 * 60 + 30);
    expect(utcMin(winter.sunrise)).toBeLessThan(7 * 60);
    expect(utcMin(winter.sunset)).toBeGreaterThan(15 * 60);
    expect(utcMin(winter.sunset)).toBeLessThan(15 * 60 + 35);
  });

  it("tells day from night", () => {
    expect(dayTimeAt(new Date("2026-11-16T11:00:00Z"))).toBe("day");
    expect(dayTimeAt(new Date("2026-11-16T20:00:00Z"))).toBe("night");
    expect(dayTimeAt(new Date("2026-11-16T04:00:00Z"))).toBe("night");
    // 20:30 local in midsummer is still light.
    expect(dayTimeAt(new Date("2026-06-21T18:30:00Z"))).toBe("day");
  });

  it("picks the season by the month in Ljubljana", () => {
    expect(seasonAt(new Date("2026-11-16T12:00:00Z"))).toBe("autumn");
    expect(seasonAt(new Date("2026-12-01T12:00:00Z"))).toBe("winter");
    expect(seasonAt(new Date("2026-04-10T12:00:00Z"))).toBe("spring");
    expect(seasonAt(new Date("2026-07-10T12:00:00Z"))).toBe("summer");
    // 31 Aug 23:30 UTC is already 1 Sep in Ljubljana.
    expect(seasonAt(new Date("2026-08-31T23:30:00Z"))).toBe("autumn");
  });
});
