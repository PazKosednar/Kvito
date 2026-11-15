import { describe, expect, it } from "vitest";
import { forecastCosts, type HistoryMonth } from "./forecast.js";

const month = (period: string, costs: Record<string, number>, advanceCents = 11_000): HistoryMonth => ({
  period,
  costs,
  costCents: Object.values(costs).reduce((s, c) => s + c, 0),
  advanceCents,
});

describe("cost forecast", () => {
  it("uses the average when there is no last year, and counts credit and the charged advance", () => {
    // Window since the last settlement: November, advance charged, no costs yet; 223,71 € credit.
    const history = [month("2026-09", { ELECTRICITY: 1_000, TV: 1_402 }), month("2026-10", { ELECTRICITY: 3_000, TV: 1_402 }), month("2026-11", {}, 11_000)];
    const f = forecastCosts({ history, windowFrom: "2026-11", until: "2027-02", currentAdvanceCents: 11_000, creditCents: 22_371 });
    expect(f.lastActual).toBe("2026-10");
    expect(f.months.map((m) => [m.period, m.costCents, m.advanceCents, m.basis])).toEqual([
      ["2026-11", 3_402, 11_000, "AVERAGE"],
      ["2026-12", 3_402, 11_000, "AVERAGE"],
      ["2027-01", 3_402, 11_000, "AVERAGE"],
      ["2027-02", 3_402, 11_000, "AVERAGE"],
    ]);
    expect(f.balanceNowCents).toBe(-22_371);
    expect(f.endBalanceCents).toBe(-22_371 + 4 * (3_402 - 11_000));
    // November's advance is already charged; Dec–Feb would need (−223,71 + 4 × 34,02 − 110) / 3 → 0.
    expect(f.suggestedAdvanceCents).toBe(0);
  });

  it("follows the seasons with last year's month when there is one", () => {
    const history = [month("2025-12", { HEATING: 15_000 }), month("2026-06", { HEATING: 2_000 }), month("2026-11", { HEATING: 9_000 }, 8_000)];
    const f = forecastCosts({ history, windowFrom: "2026-11", until: "2026-12", currentAdvanceCents: 8_000, creditCents: 0 });
    expect(f.months).toEqual([{ period: "2026-12", costCents: 15_000, advanceCents: 8_000, basis: "LAST_YEAR" }]);
    // Now: 90 − 80 = +10 €; December 150 € → the one open month needs 160 €.
    expect(f.balanceNowCents).toBe(1_000);
    expect(f.endBalanceCents).toBe(1_000 + 7_000);
    expect(f.suggestedAdvanceCents).toBe(16_000);
  });

  it("rounds the suggestion up to whole euros and has nothing to say without costs", () => {
    const f = forecastCosts({ history: [month("2026-10", { WATER: 3_333 }, 0)], windowFrom: "2026-10", until: "2026-12", currentAdvanceCents: 0, creditCents: 0 });
    // October already has costs (33,33 €, no advance); Nov and Dec 33,33 € each → (33,33 + 66,66) / 2 = 49,995 → 50,00 €.
    expect(f.suggestedAdvanceCents).toBe(5_000);
  });

  it("starts at the beginning of the window when no costs were entered", () => {
    const f = forecastCosts({ history: [], windowFrom: "2026-11", until: "2027-01", currentAdvanceCents: 5_000, creditCents: 0 });
    expect(f.lastActual).toBeNull();
    expect(f.months.map((m) => m.basis)).toEqual(["NONE", "NONE", "NONE"]);
    expect(f.endBalanceCents).toBe(-15_000);
  });
});
