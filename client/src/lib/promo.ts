import { PROMO } from "@/constants";
import type { Billing, PaidPlan } from "@/hooks/useBilling";

export interface PromoPrice {
  plan: PaidPlan;
  units: number;
  monthlyCents: number;
  /** Price of the first payment with the code (Polar applies it once: first month or first year). */
  discountedMonthlyCents: number;
  yearlyCents: number;
  discountedYearlyCents: number;
}

/** What the device remembers about the popup: for which code, how many times it was closed and when last. */
export interface PromoSeen {
  code: string;
  count: number;
  /** Epoch ms of the last close. */
  at: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Reads the stored value; the old format (just the code) counts as closed once, long ago. */
export function parsePromoSeen(raw: string | null): PromoSeen | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PromoSeen>;
    if (typeof v.code === "string" && typeof v.count === "number" && typeof v.at === "number") return { code: v.code, count: v.count, at: v.at };
  } catch {
    /* old format */
  }
  return { code: raw, count: 1, at: 0 };
}

/** Show again after `repeatAfterDays`, at most `maxShows` times; a new code starts over. */
export function promoDue(seen: PromoSeen | null, now: number, promo: { code: string; repeatAfterDays: number; maxShows: number } = PROMO): boolean {
  if (!seen || seen.code !== promo.code) return true;
  return seen.count < promo.maxShows && now - seen.at >= promo.repeatAfterDays * DAY_MS;
}

/** The value to store after the popup was closed. */
export function promoClosed(seen: PromoSeen | null, now: number, code: string = PROMO.code): PromoSeen {
  return { code, count: seen?.code === code ? seen.count + 1 : 1, at: now };
}

/** Polar rounds a percentage discount to whole cents. */
export const applyPromo = (cents: number, percent: number = PROMO.percent) => Math.round((cents * (100 - percent)) / 100);

/**
 * Who sees the promo code: a landlord who can pay (checkout is on) and is not a customer yet.
 * Founders already get −30 % forever automatically, and Polar applies one discount per checkout,
 * so the code would bring them nothing – they never see it.
 */
export function isPromoEligible(b: Billing | undefined): b is Billing {
  return !!b && b.checkoutEnabled && !b.founder && !b.hasPaidSubscription;
}

/** Prices of the paid packages with the code applied, in the package order. */
export function promoPrices(b: Billing): PromoPrice[] {
  return b.plans
    .filter((p): p is typeof p & { id: PaidPlan } => p.id !== "FREE")
    .map((p) => ({
      plan: p.id,
      units: p.units,
      monthlyCents: p.monthlyCents,
      discountedMonthlyCents: applyPromo(p.monthlyCents),
      yearlyCents: p.yearlyCents,
      discountedYearlyCents: applyPromo(p.yearlyCents),
    }));
}
