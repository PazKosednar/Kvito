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
