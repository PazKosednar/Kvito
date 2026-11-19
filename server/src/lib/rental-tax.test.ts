import { describe, expect, it } from "vitest";
import { estimateRentalTax, filingDeadline, rateOptions } from "./rental-tax.js";

describe("estimateRentalTax", () => {
  it("uses 10 % flat-rate costs when actual costs are lower", () => {
    // 12.000,00 € rent, 500,00 € costs → base 10.800,00 €, 25 % = 2.700,00 €
    const t = estimateRentalTax(1_200_000, 50_000, 25);
    expect(t.method).toBe("FLAT");
    expect(t.flatCostsCents).toBe(120_000);
    expect(t.baseCents).toBe(1_080_000);
    expect(t.taxCents).toBe(270_000);
    expect(t.otherMethodTaxCents).toBe(287_500);
  });

  it("uses actual costs when they are higher", () => {
    const t = estimateRentalTax(840_000, 200_000, 15);
    expect(t.method).toBe("ACTUAL");
    expect(t.baseCents).toBe(640_000);
    expect(t.taxCents).toBe(96_000);
  });

  it("never goes below zero", () => {
    const t = estimateRentalTax(100_000, 500_000, 25);
    expect(t.baseCents).toBe(0);
    expect(t.taxCents).toBe(0);
  });
});

describe("rateOptions", () => {
  it("offers ZIURS rates only from 2026", () => {
    expect(rateOptions(2025).map((r) => r.percent)).toEqual([25]);
    expect(rateOptions(2026).map((r) => r.percent)).toEqual([25, 15, 5]);
  });
});

describe("filingDeadline", () => {
  it("is 28 February, moved to Monday after a weekend", () => {
    expect(filingDeadline(2024).toISOString().slice(0, 10)).toBe("2025-02-28"); // Friday
    expect(filingDeadline(2025).toISOString().slice(0, 10)).toBe("2026-03-02"); // Saturday → Monday
    expect(filingDeadline(2026).toISOString().slice(0, 10)).toBe("2027-03-01"); // Sunday → Monday
  });
});
