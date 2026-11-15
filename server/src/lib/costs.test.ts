import { describe, expect, it } from "vitest";
import type { CostType } from "../generated/prisma/enums.js";
import { buildCostMatrix, monthsBetween, nextPeriod } from "./costs.js";

describe("months", () => {
  it("lists the months of a range, across a year end", () => {
    expect(monthsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthsBetween("2026-05", "2026-05")).toEqual(["2026-05"]);
    expect(monthsBetween("2026-05", "2026-04")).toEqual([]);
    expect(() => monthsBetween("2026-13", "2026-12")).toThrow();
  });

  it("knows the next month", () => {
    expect(nextPeriod("2026-12")).toBe("2027-01");
    expect(nextPeriod("2026-02")).toBe("2026-03");
  });
});

describe("cost matrix", () => {
  // A real landlord's spreadsheet: 110,00 € a month for costs (one lump sum), Feb–Oct 2026.
  const periods = monthsBetween("2026-02", "2026-10");
  const rows: [string, number, number, number][] = [
    ["2026-02", 4_441, 4_333, 1_402],
    ["2026-03", 4_056, 3_632, 1_402],
    ["2026-04", 4_353, 2_450, 1_402],
    ["2026-05", 5_741, 2_960, 1_402],
    ["2026-06", 4_808, 1_720, 1_402],
    ["2026-07", 4_395, 1_845, 1_402],
    ["2026-08", 4_600, 1_551, 1_402],
    ["2026-09", 4_755, 870, 1_402],
    ["2026-10", 4_800, 2_701, 1_402],
  ];
  const entries = rows.flatMap(([period, mgmt, elec, tv]) => [
    { period, costType: "BUILDING_MANAGEMENT" as CostType, amountCents: mgmt },
    { period, costType: "ELECTRICITY" as CostType, amountCents: elec },
    { period, costType: "TV" as CostType, amountCents: tv },
  ]);
  const advances = periods.map((period) => ({ period, amountCents: 11_000 }));

  it("adds up to the landlord's 223,71 € in the tenant's favour", () => {
    const m = buildCostMatrix(periods, entries, advances);
    expect(m.totals).toMatchObject({ advanceCents: 99_000, costCents: 76_629, balanceCents: -22_371 });
    expect(m.totals.byType).toEqual({ BUILDING_MANAGEMENT: 41_949, ELECTRICITY: 22_062, TV: 12_618 });
    expect(m.costTypes).toEqual(["TV", "BUILDING_MANAGEMENT", "ELECTRICITY"].sort((a, b) => order(a) - order(b)));
    expect(m.months[0]).toEqual({ period: "2026-02", advanceCents: 11_000, costs: { BUILDING_MANAGEMENT: 4_441, ELECTRICITY: 4_333, TV: 1_402 }, costCents: 10_176, balanceCents: -824 });
  });

  it("ignores entries and advances outside the range and shows empty months", () => {
    const m = buildCostMatrix(["2026-11"], [...entries, { period: "2026-11", costType: "WATER", amountCents: 500 }], advances);
    expect(m.months).toEqual([{ period: "2026-11", advanceCents: 0, costs: { WATER: 500 }, costCents: 500, balanceCents: 500 }]);
    expect(m.costTypes).toEqual(["WATER"]);
  });
});

const ORDER = ["RENT", "ELECTRICITY", "WATER", "GAS", "HEATING", "WASTE", "INTERNET", "TV", "MAINTENANCE_FUND", "BUILDING_MANAGEMENT", "CLEANING", "OTHER"];
const order = (t: string) => ORDER.indexOf(t);
