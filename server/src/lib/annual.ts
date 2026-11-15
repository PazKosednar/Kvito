/**
 * Yearly summary of money a landlord received, split into what it was for: rent, reimbursed running costs,
 * security deposit and other. Pure part – the route loads the rows.
 *
 * TODO(preveri): which of these count as income from renting property for the tax return, and whether the
 * payment date (used here) or another date decides the year. Kvito only sorts the money; it gives no tax advice.
 */

export type MoneyKind = "rent" | "costs" | "deposit" | "other";

export interface ReceivedShare {
  /** Share of the charge that was paid (cents). */
  amountCents: number;
  charge: {
    type: "RENT" | "BILL" | "OTHER" | "DEPOSIT" | "ADVANCE" | "SETTLEMENT";
    amountCents: number;
    lines: { costType: string; amountCents: number; creditSettlementId: string | null }[];
  };
}

/** How one paid share splits into rent / costs / deposit / other. Parts always add up to the share. */
export function splitReceived(s: ReceivedShare): Record<MoneyKind, number> {
  const out: Record<MoneyKind, number> = { rent: 0, costs: 0, deposit: 0, other: 0 };
  const { charge } = s;
  if (charge.type === "DEPOSIT") return { ...out, deposit: s.amountCents };
  if (charge.type === "ADVANCE" || charge.type === "BILL" || charge.type === "SETTLEMENT") return { ...out, costs: s.amountCents };
  if (charge.type === "OTHER") return { ...out, other: s.amountCents };
  // RENT: without a breakdown it is all rent; a combined payment splits by its lines.
  const rentLines = charge.lines.filter((l) => l.costType === "RENT").reduce((sum, l) => sum + l.amountCents, 0);
  if (!charge.lines.length || charge.amountCents <= 0) return { ...out, rent: s.amountCents };
  // The tenant's share of the rent, never more than what was paid (a credit may have paid part of the costs).
  const rent = Math.min(s.amountCents, Math.round((rentLines * s.amountCents) / charge.amountCents));
  return { ...out, rent, costs: s.amountCents - rent };
}

export interface MonthTotals extends Record<MoneyKind, number> {
  month: number;
}

export const emptyMonths = (): MonthTotals[] => Array.from({ length: 12 }, (_, i) => ({ month: i + 1, rent: 0, costs: 0, deposit: 0, other: 0 }));

export function addTo(months: MonthTotals[], month: number, parts: Record<MoneyKind, number>): void {
  const m = months[month - 1]!;
  m.rent += parts.rent;
  m.costs += parts.costs;
  m.deposit += parts.deposit;
  m.other += parts.other;
}

export const sumMonths = (months: MonthTotals[]): Record<MoneyKind, number> =>
  months.reduce((t, m) => ({ rent: t.rent + m.rent, costs: t.costs + m.costs, deposit: t.deposit + m.deposit, other: t.other + m.other }), { rent: 0, costs: 0, deposit: 0, other: 0 });
