import { describe, expect, it } from "vitest";
import { SplitError, splitAmount, type SplitMember } from "./split.js";

const m = (id: string, extra: Partial<SplitMember> = {}): SplitMember => ({
  id,
  isPrimary: false,
  shareBasisPoints: null,
  personCount: 1,
  ...extra,
});

const sum = (map: Map<string, number>) => [...map.values()].reduce((s, v) => s + v, 0);

describe("splitAmount", () => {
  it("gives everything to a single tenant", () => {
    expect(splitAmount(65000, [m("a")], "EQUAL").get("a")).toBe(65000);
  });

  it("splits equally and gives the leftover cent to the primary tenant", () => {
    const r = splitAmount(10000, [m("a"), m("b", { isPrimary: true }), m("c")], "EQUAL");
    expect([r.get("a"), r.get("b"), r.get("c")]).toEqual([3333, 3334, 3333]);
    expect(sum(r)).toBe(10000);
  });

  it("splits by percentage (60/40) – seed example 125,50 €", () => {
    const r = splitAmount(12550, [m("luka", { isPrimary: true, shareBasisPoints: 6000 }), m("nina", { shareBasisPoints: 4000 })], "PERCENTAGE");
    expect(r.get("luka")).toBe(7530);
    expect(r.get("nina")).toBe(5020);
  });

  it("hands out rounding cents by largest remainder", () => {
    // 1 cent at 33.33/33.33/33.34 %
    const r = splitAmount(100, [m("a", { shareBasisPoints: 3333 }), m("b", { shareBasisPoints: 3333 }), m("c", { shareBasisPoints: 3334 })], "PERCENTAGE");
    expect(sum(r)).toBe(100);
    expect(r.get("c")).toBe(34);
  });

  it("splits per person", () => {
    const r = splitAmount(9000, [m("couple", { personCount: 2 }), m("single", { personCount: 1 })], "PER_PERSON");
    expect(r.get("couple")).toBe(6000);
    expect(r.get("single")).toBe(3000);
  });

  it("always adds up exactly", () => {
    for (let total = 0; total < 2000; total += 7) {
      const members = [m("a", { personCount: 3 }), m("b", { personCount: 2, isPrimary: true }), m("c", { personCount: 1 })];
      expect(sum(splitAmount(total, members, "PER_PERSON"))).toBe(total);
      expect(sum(splitAmount(total, members, "EQUAL"))).toBe(total);
    }
  });

  it("rejects percentages that do not add up to 100 % and empty member lists", () => {
    expect(() => splitAmount(100, [m("a", { shareBasisPoints: 5000 }), m("b", { shareBasisPoints: 4000 })], "PERCENTAGE")).toThrow(SplitError);
    expect(() => splitAmount(100, [m("a"), m("b")], "PERCENTAGE")).toThrow(SplitError);
    expect(() => splitAmount(100, [], "EQUAL")).toThrow(SplitError);
  });
});
