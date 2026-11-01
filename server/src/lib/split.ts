/**
 * Splits an amount (cents) between tenancy members. The parts always add up exactly to the total:
 * cents left over after rounding go one by one to the members with the largest remainders
 * (ties: primary member first, then the original order).
 */

export type SplitMethod = "EQUAL" | "PERCENTAGE" | "PER_PERSON";

export interface SplitMember {
  id: string;
  isPrimary: boolean;
  /** 10000 = 100 %. Required for PERCENTAGE. */
  shareBasisPoints: number | null;
  personCount: number;
}

export class SplitError extends Error {
  constructor(public readonly code: "NO_MEMBERS" | "SHARES_INVALID") {
    super(code);
    this.name = "SplitError";
  }
}

export function splitAmount(totalCents: number, members: SplitMember[], method: SplitMethod): Map<string, number> {
  if (!Number.isInteger(totalCents) || totalCents < 0) throw new Error("totalCents must be a non-negative integer");
  if (members.length === 0) throw new SplitError("NO_MEMBERS");

  let weights: number[];
  if (method === "PERCENTAGE") {
    const bps = members.map((m) => m.shareBasisPoints);
    if (bps.some((b) => b == null || b < 0) || bps.reduce<number>((s, b) => s + (b ?? 0), 0) !== 10_000) {
      throw new SplitError("SHARES_INVALID");
    }
    weights = bps as number[];
  } else if (method === "PER_PERSON") {
    weights = members.map((m) => Math.max(1, m.personCount));
  } else {
    weights = members.map(() => 1);
  }

  const parts = distribute(totalCents, weights, members.map((m) => m.isPrimary));
  return new Map(members.map((m, i) => [m.id, parts[i]!]));
}

/**
 * Splits an amount in proportion to arbitrary non-negative weights (e.g. what each person paid).
 * All-zero weights split equally. The parts add up exactly to the total.
 */
export function splitProportional(totalCents: number, weights: number[]): number[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) throw new Error("totalCents must be a non-negative integer");
  if (weights.length === 0) return [];
  const usable = weights.some((w) => w > 0) ? weights.map((w) => Math.max(0, w)) : weights.map(() => 1);
  return distribute(totalCents, usable, weights.map(() => false));
}

function distribute(totalCents: number, weights: number[], primary: boolean[]): number[] {
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const exact = weights.map((w) => (totalCents * w) / totalWeight);
  const parts = exact.map(Math.floor);
  let left = totalCents - parts.reduce((s, p) => s + p, 0);

  const order = weights
    .map((_, i) => ({ i, rem: exact[i]! - parts[i]!, primary: primary[i]! }))
    .filter((o) => weights[o.i]! > 0)
    .sort((a, b) => b.rem - a.rem || Number(b.primary) - Number(a.primary) || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) parts[order[k]!.i]! += 1;
  return parts;
}
