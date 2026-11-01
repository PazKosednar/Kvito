import type { SplitMethod, TenancyMember } from "@/types/domain";

/**
 * Preview of how an amount is split between flatmates – the same rule as server/src/lib/split.ts
 * (largest remainder, primary member first on ties). Returns null while percentages do not add up to 100 %.
 */
export function splitPreview(totalCents: number, members: Pick<TenancyMember, "id" | "isPrimary" | "shareBasisPoints" | "personCount">[], method: SplitMethod): Map<string, number> | null {
  if (members.length === 0) return null;
  let weights: number[];
  if (method === "PERCENTAGE") {
    const bps = members.map((m) => m.shareBasisPoints);
    if (bps.some((b) => b == null || b < 0) || bps.reduce<number>((s, b) => s + (b ?? 0), 0) !== 10_000) return null;
    weights = bps as number[];
  } else if (method === "PER_PERSON") weights = members.map((m) => Math.max(1, m.personCount));
  else weights = members.map(() => 1);

  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const exact = weights.map((w) => (totalCents * w) / totalWeight);
  const parts = exact.map(Math.floor);
  let left = totalCents - parts.reduce((s, p) => s + p, 0);
  const order = members
    .map((m, i) => ({ i, rem: exact[i]! - parts[i]!, primary: m.isPrimary }))
    .filter((o) => weights[o.i]! > 0)
    .sort((a, b) => b.rem - a.rem || Number(b.primary) - Number(a.primary) || a.i - b.i);
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) parts[order[k]!.i]! += 1;
  return new Map(members.map((m, i) => [m.id, parts[i]!]));
}
