import { useMemo } from "react";
import { todayInput } from "@/lib/dates";
import type { Charge, ChargeStatus } from "@/types/domain";

/** State of one calendar month of a tenancy: the worst state of the charges due in it, or nothing due. */
export type MonthState = ChargeStatus | "NONE";

export interface StripMonth {
  period: string;
  state: MonthState;
  count: number;
  /** The month has not ended yet. */
  current: boolean;
}

/** Worst first: what the person should notice. */
const SEVERITY: ChargeStatus[] = ["DISPUTED", "OVERDUE", "OPEN", "REPORTED_PAID", "CONFIRMED"];

const addMonths = (period: string, n: number) => {
  const [y, m] = period.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

/**
 * The last `size` months up to the current one (never before the tenancy started), each with the state of the
 * charges due in it. `statusOf` picks the charge's status for the reader (a tenant's own share, the landlord's total).
 */
export function buildMonthStrip(charges: Charge[], statusOf: (c: Charge) => ChargeStatus | null, startDate: string, today = todayInput(), size = 12): StripMonth[] {
  const current = today.slice(0, 7);
  const start = startDate.slice(0, 7);
  let first = addMonths(current, -(size - 1));
  if (first < start) first = start;
  const months: StripMonth[] = [];
  for (let p = first; p <= current; p = addMonths(p, 1)) months.push({ period: p, state: "NONE", count: 0, current: p === current });
  const index = new Map(months.map((m) => [m.period, m]));
  for (const c of charges) {
    const m = index.get(c.dueDate.slice(0, 7));
    const status = statusOf(c);
    if (!m || !status) continue;
    m.count++;
    if (m.state === "NONE" || SEVERITY.indexOf(status) < SEVERITY.indexOf(m.state)) m.state = status;
  }
  return months;
}

/** True when every month that had something due is fully confirmed – the strip's »Kvito ✓«. */
export const stripSettled = (months: StripMonth[]) => months.some((m) => m.count > 0) && months.every((m) => m.state === "NONE" || m.state === "CONFIRMED");

export function useMonthStrip(charges: Charge[] | undefined, statusOf: (c: Charge) => ChargeStatus | null, startDate: string) {
  return useMemo(() => {
    const months = buildMonthStrip(charges ?? [], statusOf, startDate);
    return { months, settled: stripSettled(months) };
    // statusOf is recreated each render by callers; the charges and start define the strip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charges, startDate]);
}
