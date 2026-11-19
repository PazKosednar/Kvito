/**
 * Informative tax estimate for income from renting out property (dohodek iz oddajanja premoženja v najem),
 * natural person, renting to natural persons. Pure, so it is unit-tested.
 *
 * What we rely on (checked 19. 11. 2026; TODO(preveri) every year with FURS):
 * - Rate 25 % (ZDoh-2, final tax), costs: either 10 % flat-rate (normirani) or actual costs, whichever is higher.
 * - ZIURS (adopted 11. 5. 2026) lowers the rate to 15 % (5 % for long-term rentals to young people / young
 *   families) from tax year 2026, but only if it survives the referendum on 6. 12. 2026. Until then the
 *   landlord picks which rate to see.
 * - Return for the previous year: by 28 February (next working day if that is a weekend).
 * Not covered: rentals to companies/s.p. (the payer withholds the tax), short-term rentals (business income),
 * which actual costs are recognised. Kvito only estimates; it gives no tax advice.
 */

/** Share of income recognised as flat-rate costs (normirani stroški). */
export const FLAT_COST_SHARE = 0.1;

export type TaxRateKind = "CURRENT" | "ZIURS" | "ZIURS_YOUNG";

export interface TaxRateOption {
  kind: TaxRateKind;
  percent: number;
}

/** Rates the landlord can choose for a tax year (ZIURS only from 2026). The first one is the default. */
export function rateOptions(year: number): TaxRateOption[] {
  const current: TaxRateOption = { kind: "CURRENT", percent: 25 };
  if (year < 2026) return [current];
  return [current, { kind: "ZIURS", percent: 15 }, { kind: "ZIURS_YOUNG", percent: 5 }];
}

export interface TaxEstimate {
  incomeCents: number;
  flatCostsCents: number;
  actualCostsCents: number;
  /** Which costs give the lower tax: the higher of flat-rate and actual. */
  method: "FLAT" | "ACTUAL";
  deductionCents: number;
  baseCents: number;
  ratePercent: number;
  taxCents: number;
  /** Tax with the other method, so the landlord sees the difference. */
  otherMethodTaxCents: number;
}

export function estimateRentalTax(incomeCents: number, actualCostsCents: number, ratePercent: number): TaxEstimate {
  const income = Math.max(0, Math.round(incomeCents));
  const actual = Math.max(0, Math.round(actualCostsCents));
  const flat = Math.round(income * FLAT_COST_SHARE);
  const method = actual > flat ? "ACTUAL" : "FLAT";
  const taxWith = (deduction: number) => Math.round((Math.max(0, income - deduction) * ratePercent) / 100);
  const deduction = method === "ACTUAL" ? actual : flat;
  return {
    incomeCents: income,
    flatCostsCents: flat,
    actualCostsCents: actual,
    method,
    deductionCents: deduction,
    baseCents: Math.max(0, income - deduction),
    ratePercent,
    taxCents: taxWith(deduction),
    otherMethodTaxCents: taxWith(method === "ACTUAL" ? flat : actual),
  };
}

/** Deadline for the return for `year`: 28 February of the next year, moved to Monday if it is a weekend. */
export function filingDeadline(year: number): Date {
  const d = new Date(Date.UTC(year + 1, 1, 28));
  const day = d.getUTCDay();
  if (day === 6) d.setUTCDate(d.getUTCDate() + 2);
  if (day === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}
