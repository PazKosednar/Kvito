import { describe, expect, it } from "vitest";
import { dueDateInMonth, formatUpnDate, parseDateOnly, periodOf, todayInLjubljana } from "./dates.js";

describe("dates", () => {
  it("parses and validates date-only strings", () => {
    expect(parseDateOnly("2026-11-05").toISOString()).toBe("2026-11-05T00:00:00.000Z");
    expect(() => parseDateOnly("2026-02-30")).toThrow();
    expect(() => parseDateOnly("5.11.2026")).toThrow();
  });

  it("clamps the due day to the month length", () => {
    expect(dueDateInMonth(2026, 2, 31).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(dueDateInMonth(2028, 2, 30).toISOString().slice(0, 10)).toBe("2028-02-29");
    expect(dueDateInMonth(2026, 11, 5).toISOString().slice(0, 10)).toBe("2026-11-05");
  });

  it("formats UPN dates", () => {
    expect(formatUpnDate(parseDateOnly("2016-07-11"))).toBe("11.07.2016");
  });

  it("uses Ljubljana's calendar day", () => {
    // 23:30 UTC on 31 Oct is already 1 Nov in Ljubljana (UTC+1 in winter).
    expect(todayInLjubljana(new Date("2026-10-31T23:30:00Z")).toISOString().slice(0, 10)).toBe("2026-11-01");
    expect(periodOf(parseDateOnly("2026-11-05"))).toBe("2026-11");
  });
});
