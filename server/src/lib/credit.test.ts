import { describe, expect, it } from "vitest";
import { allocateCredit, carriedIn } from "./credit.js";

describe("settlement credit", () => {
  it("pays part of the next monthly payment: 510,00 − 223,71 = 286,29 €", () => {
    expect(allocateCredit([{ id: "s1", remainingCents: 22_371 }], 51_000)).toEqual({ used: [{ id: "s1", cents: 22_371 }], usedCents: 22_371, chargeCents: 28_629 });
  });

  it("covers the whole charge and keeps the rest for later", () => {
    expect(allocateCredit([{ id: "s1", remainingCents: 60_000 }], 51_000)).toEqual({ used: [{ id: "s1", cents: 51_000 }], usedCents: 51_000, chargeCents: 0 });
  });

  it("uses the oldest credit first and skips empty ones", () => {
    const r = allocateCredit(
      [
        { id: "old", remainingCents: 1_000 },
        { id: "empty", remainingCents: 0 },
        { id: "new", remainingCents: 5_000 },
      ],
      3_000,
    );
    expect(r).toEqual({ used: [{ id: "old", cents: 1_000 }, { id: "new", cents: 2_000 }], usedCents: 3_000, chargeCents: 0 });
  });

  it("does nothing without credit or with a zero charge", () => {
    expect(allocateCredit([], 51_000)).toEqual({ used: [], usedCents: 0, chargeCents: 51_000 });
    expect(allocateCredit([{ id: "s1", remainingCents: 100 }], 0)).toEqual({ used: [], usedCents: 0, chargeCents: 0 });
    expect(() => allocateCredit([], -1)).toThrow();
  });

  it("carries whatever is left into the next settlement", () => {
    expect(carriedIn([{ id: "a", remainingCents: 22_371 }, { id: "b", remainingCents: 0 }, { id: "c", remainingCents: 129 }])).toBe(22_500);
  });
});
