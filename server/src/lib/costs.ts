/**
 * Running costs by month (stroški po mesecih): actual costs entered by the landlord against the advances charged.
 * Pure functions – the routes load the rows, this module shapes them.
 */
import type { CostType } from "../generated/prisma/enums.js";
import { COST_TYPES } from "./validation.js";

const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const isPeriod = (v: string): boolean => PERIOD.test(v);

/** "2026-02".."2026-04" → ["2026-02", "2026-03", "2026-04"]. Empty when to < from. */
export function monthsBetween(from: string, to: string): string[] {
  if (!isPeriod(from) || !isPeriod(to)) throw new Error(`Invalid period: ${from}..${to}`);
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m === 13) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** "2026-11" → "2026-12". */
export function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export interface CostMonth {
  period: string;
  /** Advances charged with a due date in this month (all cost types). */
  advanceCents: number;
  /** Actual costs by type; only types with an entry. */
  costs: Partial<Record<CostType, number>>;
  costCents: number;
  /** costCents − advanceCents: > 0 the tenant owes, < 0 the tenant is in credit. */
  balanceCents: number;
}

export interface CostMatrix {
  months: CostMonth[];
  /** Cost types that appear in any month, in the fixed COST_TYPES order. */
  costTypes: CostType[];
  totals: { advanceCents: number; costCents: number; balanceCents: number; byType: Partial<Record<CostType, number>> };
}

export function buildCostMatrix(
  periods: string[],
  entries: { period: string; costType: CostType; amountCents: number }[],
  advances: { period: string; amountCents: number }[],
): CostMatrix {
  const inRange = new Set(periods);
  const byType: Partial<Record<CostType, number>> = {};
  const months: CostMonth[] = periods.map((period) => ({ period, advanceCents: 0, costs: {}, costCents: 0, balanceCents: 0 }));
  const index = new Map(months.map((m) => [m.period, m]));
  for (const a of advances) {
    const m = index.get(a.period);
    if (m) m.advanceCents += a.amountCents;
  }
  for (const e of entries) {
    if (!inRange.has(e.period)) continue;
    const m = index.get(e.period)!;
    m.costs[e.costType] = (m.costs[e.costType] ?? 0) + e.amountCents;
    m.costCents += e.amountCents;
    byType[e.costType] = (byType[e.costType] ?? 0) + e.amountCents;
  }
  for (const m of months) m.balanceCents = m.costCents - m.advanceCents;
  const advanceCents = months.reduce((s, m) => s + m.advanceCents, 0);
  const costCents = months.reduce((s, m) => s + m.costCents, 0);
  return {
    months,
    costTypes: COST_TYPES.filter((t) => byType[t] !== undefined),
    totals: { advanceCents, costCents, balanceCents: costCents - advanceCents, byType },
  };
}
