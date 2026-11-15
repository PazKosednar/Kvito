import { describe, expect, it } from "vitest";
import type { Charge, ChargeStatus } from "@/types/domain";
import { buildMonthStrip, stripSettled } from "./useMonthStrip";

const charge = (dueDate: string, status: ChargeStatus) => ({ dueDate, status }) as unknown as Charge;
const own = (c: Charge) => c.status;

describe("month strip", () => {
  it("shows the months from the start of the tenancy to today, each with its worst state", () => {
    const months = buildMonthStrip(
      [charge("2026-02-15", "CONFIRMED"), charge("2026-03-15", "CONFIRMED"), charge("2026-03-20", "OVERDUE"), charge("2026-05-15", "REPORTED_PAID")],
      own,
      "2026-02-15",
      "2026-05-10",
    );
    expect(months.map((m) => [m.period, m.state, m.count])).toEqual([
      ["2026-02", "CONFIRMED", 1],
      ["2026-03", "OVERDUE", 2],
      ["2026-04", "NONE", 0],
      ["2026-05", "REPORTED_PAID", 1],
    ]);
    expect(months.at(-1)!.current).toBe(true);
    expect(stripSettled(months)).toBe(false);
  });

  it("keeps the last twelve months of a long tenancy and ignores charges outside them", () => {
    const months = buildMonthStrip([charge("2024-01-05", "OVERDUE"), charge("2026-11-05", "CONFIRMED")], own, "2020-01-01", "2026-11-15");
    expect(months).toHaveLength(12);
    expect(months[0]!.period).toBe("2025-12");
    expect(stripSettled(months)).toBe(true);
  });

  it("is not »Kvito ✓« without anything due, and skips charges the reader has no part in", () => {
    expect(stripSettled(buildMonthStrip([], own, "2026-11-01", "2026-11-15"))).toBe(false);
    const months = buildMonthStrip([charge("2026-11-05", "OVERDUE")], () => null, "2026-11-01", "2026-11-15");
    expect(months[0]!.state).toBe("NONE");
  });
});
