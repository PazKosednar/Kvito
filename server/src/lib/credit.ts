/**
 * Settlement credit (dobroimetje): a tenant's overpayment that stays with the landlord, either until the next
 * settlement (carried in) or deducted from the next monthly charges (offset). Pure functions.
 */

export interface CreditSource {
  /** Settlement the credit comes from. */
  id: string;
  remainingCents: number;
}

export interface CreditAllocation {
  /** How much each source pays, oldest first; only sources that pay something. */
  used: { id: string; cents: number }[];
  usedCents: number;
  /** What is left to pay on the charge. */
  chargeCents: number;
}

/** Pays as much of a charge as the credits allow, oldest credit first. Never makes the charge negative. */
export function allocateCredit(sources: CreditSource[], chargeCents: number): CreditAllocation {
  if (!Number.isInteger(chargeCents) || chargeCents < 0) throw new Error("chargeCents must be a non-negative integer");
  let left = chargeCents;
  const used: { id: string; cents: number }[] = [];
  for (const s of sources) {
    if (left === 0) break;
    if (s.remainingCents <= 0) continue;
    const cents = Math.min(s.remainingCents, left);
    used.push({ id: s.id, cents });
    left -= cents;
  }
  return { used, usedCents: chargeCents - left, chargeCents: left };
}

/** Credit the next settlement takes over: whatever earlier settlements still hold. */
export const carriedIn = (sources: CreditSource[]): number => sources.reduce((s, c) => s + Math.max(0, c.remainingCents), 0);
