import { describe, expect, it } from "vitest";
import type { Billing } from "@/hooks/useBilling";
import { applyPromo, isPromoEligible, parsePromoSeen, promoClosed, promoDue, promoPrices } from "./promo";

const billing = (over: Partial<Billing> = {}): Billing => ({
  plan: "FREE",
  founder: false,
  status: "ACTIVE",
  trialEndsAt: null,
  currentPeriodEnd: null,
  limits: { units: 1, storageBytes: 0, monthlyCents: 0, yearlyCents: 0 },
  usage: { units: 1, storageBytes: 0 },
  plans: [
    { id: "FREE", units: 1, storageBytes: 0, monthlyCents: 0, yearlyCents: 0 },
    { id: "PLUS", units: 3, storageBytes: 0, monthlyCents: 499, yearlyCents: 4990 },
    { id: "PRO", units: 10, storageBytes: 0, monthlyCents: 1199, yearlyCents: 11990 },
    { id: "MANAGER", units: 30, storageBytes: 0, monthlyCents: 2799, yearlyCents: 27990 },
  ],
  checkoutEnabled: true,
  hasPaidSubscription: false,
  ...over,
});

describe("promo NEW30", () => {
  it("takes 30 % off, rounded to cents", () => {
    expect(applyPromo(499)).toBe(349);
    expect(applyPromo(1199)).toBe(839);
    expect(applyPromo(2799)).toBe(1959);
    expect(applyPromo(4990)).toBe(3493);
  });

  it("lists the paid packages only", () => {
    expect(promoPrices(billing()).map((p) => [p.plan, p.discountedMonthlyCents])).toEqual([
      ["PLUS", 349],
      ["PRO", 839],
      ["MANAGER", 1959],
    ]);
  });

  it("is shown only to landlords who can pay and are not customers or founders yet", () => {
    expect(isPromoEligible(billing())).toBe(true);
    expect(isPromoEligible(undefined)).toBe(false);
    expect(isPromoEligible(billing({ founder: true }))).toBe(false);
    expect(isPromoEligible(billing({ hasPaidSubscription: true }))).toBe(false);
    expect(isPromoEligible(billing({ checkoutEnabled: false }))).toBe(false);
    // A trial of a paid plan still counts: the landlord has not paid yet.
    expect(isPromoEligible(billing({ plan: "PLUS", trialEndsAt: "2026-12-22T00:00:00.000Z" }))).toBe(true);
  });
});

describe("promo popup repeats", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const promo = { code: "NEW30", repeatAfterDays: 7, maxShows: 3 };
  const t0 = Date.UTC(2026, 10, 22);

  it("shows the first time and again 7 days after each close, at most 3 times", () => {
    expect(promoDue(null, t0, promo)).toBe(true);
    let seen = promoClosed(null, t0, "NEW30");
    expect(promoDue(seen, t0 + 6 * DAY, promo)).toBe(false);
    expect(promoDue(seen, t0 + 7 * DAY, promo)).toBe(true);
    seen = promoClosed(seen, t0 + 7 * DAY, "NEW30");
    expect(promoDue(seen, t0 + 14 * DAY, promo)).toBe(true);
    seen = promoClosed(seen, t0 + 14 * DAY, "NEW30");
    expect(seen.count).toBe(3);
    expect(promoDue(seen, t0 + 100 * DAY, promo)).toBe(false);
  });

  it("a new code starts over", () => {
    const seen = { code: "OLD", count: 3, at: t0 };
    expect(promoDue(seen, t0, promo)).toBe(true);
    expect(promoClosed(seen, t0, "NEW30").count).toBe(1);
  });

  it("reads the old stored format (just the code) as one close long ago", () => {
    expect(parsePromoSeen("NEW30")).toEqual({ code: "NEW30", count: 1, at: 0 });
    expect(parsePromoSeen(null)).toBeNull();
    expect(promoDue(parsePromoSeen("NEW30"), t0, promo)).toBe(true);
  });
});
