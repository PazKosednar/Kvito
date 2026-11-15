import { describe, expect, it } from "vitest";
import { addTo, emptyMonths, splitReceived, sumMonths } from "./annual.js";

const line = (costType: string, amountCents: number, creditSettlementId: string | null = null) => ({ costType, amountCents, creditSettlementId });

describe("yearly summary", () => {
  it("splits a combined monthly payment into rent and costs", () => {
    expect(splitReceived({ amountCents: 51_000, charge: { type: "RENT", amountCents: 51_000, lines: [line("RENT", 40_000), line("OTHER", 11_000)] } })).toEqual({ rent: 40_000, costs: 11_000, deposit: 0, other: 0 });
  });

  it("never counts more than was paid when a credit paid part of the month", () => {
    // 510,00 − 223,71 credit = 286,29 paid in money; the credit was money received earlier (as costs).
    const parts = splitReceived({ amountCents: 28_629, charge: { type: "RENT", amountCents: 28_629, lines: [line("RENT", 40_000), line("OTHER", 11_000), line("OTHER", -22_371, "s1")] } });
    expect(parts).toEqual({ rent: 28_629, costs: 0, deposit: 0, other: 0 });
  });

  it("splits a share of a shared payment proportionally", () => {
    expect(splitReceived({ amountCents: 30_600, charge: { type: "RENT", amountCents: 51_000, lines: [line("RENT", 40_000), line("OTHER", 11_000)] } })).toEqual({ rent: 24_000, costs: 6_600, deposit: 0, other: 0 });
  });

  it("sorts the other kinds of charges", () => {
    const of = (type: "RENT" | "BILL" | "OTHER" | "DEPOSIT" | "ADVANCE" | "SETTLEMENT") => splitReceived({ amountCents: 100, charge: { type, amountCents: 100, lines: [] } });
    expect(of("RENT").rent).toBe(100);
    expect(of("DEPOSIT").deposit).toBe(100);
    expect(of("ADVANCE").costs).toBe(100);
    expect(of("BILL").costs).toBe(100);
    expect(of("SETTLEMENT").costs).toBe(100);
    expect(of("OTHER").other).toBe(100);
  });

  it("adds up months", () => {
    const months = emptyMonths();
    addTo(months, 2, { rent: 40_000, costs: 11_000, deposit: 80_000, other: 0 });
    addTo(months, 3, { rent: 40_000, costs: 11_000, deposit: 0, other: 0 });
    expect(sumMonths(months)).toEqual({ rent: 80_000, costs: 22_000, deposit: 80_000, other: 0 });
    expect(months[1]).toMatchObject({ month: 2, rent: 40_000 });
  });
});
