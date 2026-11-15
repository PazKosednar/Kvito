/**
 * Forecast of running costs until a chosen month, and the monthly lump sum (pavšal) that would make the next
 * settlement come out even. Pure functions; no promises about the future – the client labels it as an estimate.
 *
 * Each cost type of a future month is estimated from the same month a year earlier when there is one (seasons:
 * heating, electricity), otherwise from the average of the months that have that cost type.
 */
import type { CostType } from "../generated/prisma/enums.js";
import { monthsBetween, nextPeriod } from "./costs.js";

export interface HistoryMonth {
  period: string;
  costs: Partial<Record<CostType, number>>;
  costCents: number;
  advanceCents: number;
}

export type ForecastBasis = "LAST_YEAR" | "AVERAGE" | "NONE";

export interface ForecastMonth {
  period: string;
  costCents: number;
  advanceCents: number;
  basis: ForecastBasis;
}

export interface Forecast {
  /** Last month with entered costs; the forecast starts the month after. Null when nothing was entered yet. */
  lastActual: string | null;
  months: ForecastMonth[];
  /** Balance so far (actual costs − advances charged up to lastActual − credit): > 0 the tenant owes. */
  balanceNowCents: number;
  /** Expected balance at the end of the forecast with the current advance. */
  endBalanceCents: number;
  currentAdvanceCents: number;
  /** Monthly advance that brings the end balance to about zero (rounded up to whole euros, never negative). */
  suggestedAdvanceCents: number;
}

const lastYear = (period: string) => `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;

export function forecastCosts(input: {
  history: HistoryMonth[];
  /** The running window (since the last settlement): balance counts from here. */
  windowFrom: string;
  until: string;
  currentAdvanceCents: number;
  creditCents: number;
}): Forecast {
  const { history, windowFrom, until, currentAdvanceCents, creditCents } = input;
  const withCosts = history.filter((m) => m.costCents > 0).map((m) => m.period).sort();
  const lastActual = withCosts.at(-1) ?? null;
  const byPeriod = new Map(history.map((m) => [m.period, m]));

  // Average per cost type over the months where the type appears.
  const sums = new Map<CostType, { total: number; n: number }>();
  for (const m of history) {
    for (const [type, cents] of Object.entries(m.costs) as [CostType, number][]) {
      const s = sums.get(type) ?? { total: 0, n: 0 };
      s.total += cents;
      s.n += 1;
      sums.set(type, s);
    }
  }
  const types = [...sums.keys()];

  // Balance so far: months of the running window up to the last month with costs.
  let balanceNowCents = -creditCents;
  if (lastActual && lastActual >= windowFrom) {
    for (const p of monthsBetween(windowFrom, lastActual)) {
      const m = byPeriod.get(p);
      if (m) balanceNowCents += m.costCents - m.advanceCents;
    }
  }
  const start = lastActual && lastActual >= windowFrom ? nextPeriod(lastActual) : windowFrom;

  const months: ForecastMonth[] = monthsBetween(start, until).map((period) => {
    const ly = byPeriod.get(lastYear(period));
    let costCents = 0;
    let basis: ForecastBasis = types.length ? "AVERAGE" : "NONE";
    if (ly && ly.costCents > 0) {
      basis = "LAST_YEAR";
      for (const type of types) {
        const s = sums.get(type)!;
        costCents += ly.costs[type] ?? Math.round(s.total / s.n);
      }
    } else {
      for (const type of types) {
        const s = sums.get(type)!;
        costCents += Math.round(s.total / s.n);
      }
    }
    // An advance already charged for the month counts as it was charged; later months use today's advance.
    const charged = byPeriod.get(period)?.advanceCents ?? 0;
    return { period, costCents, advanceCents: charged > 0 ? charged : currentAdvanceCents, basis };
  });

  const projected = months.reduce((s, m) => s + m.costCents - m.advanceCents, 0);
  const endBalanceCents = balanceNowCents + projected;

  // Months whose advance can still change (not charged yet).
  const open = months.filter((m) => !(byPeriod.get(m.period)?.advanceCents ?? 0));
  const fixed = months.filter((m) => (byPeriod.get(m.period)?.advanceCents ?? 0) > 0);
  const needed = balanceNowCents + months.reduce((s, m) => s + m.costCents, 0) - fixed.reduce((s, m) => s + m.advanceCents, 0);
  const suggestedAdvanceCents = open.length ? Math.max(0, Math.ceil(needed / open.length / 100) * 100) : currentAdvanceCents;

  return { lastActual, months, balanceNowCents, endBalanceCents, currentAdvanceCents, suggestedAdvanceCents };
}
