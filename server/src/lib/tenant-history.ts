/**
 * A tenant's renting history as a landlord-verified summary (najemniški življenjepis): how long, how many
 * payments, how many in time, deposits returned in full. No amounts and no addresses. Pure functions.
 */
import { monthsBetween, shiftPeriod } from "./costs.js";

export type HistoryState = "ON_TIME" | "LATE" | "OPEN" | "OVERDUE" | "DISPUTED" | "NONE";

export interface HistoryInput {
  memberships: { from: Date; to: Date | null }[];
  /** The tenant's own shares of charges. */
  shares: { dueDate: Date; status: "OPEN" | "REPORTED_PAID" | "CONFIRMED" | "OVERDUE" | "DISPUTED"; paidOn: Date | null; confirmedAt: Date | null }[];
  deposits: { status: string; amountCents: number; returnCents: number | null }[];
  settlementsAccepted: number;
  today: Date;
}

export interface TenantHistory {
  monthsRented: number;
  tenancies: number;
  payments: { due: number; confirmed: number; onTime: number; late: number; waiting: number; overdue: number; disputed: number };
  /** Share of confirmed payments paid by the due date, 0–100; null without confirmed payments. */
  onTimePercent: number | null;
  deposits: { returnedInFull: number; returnedPartly: number; held: number };
  settlementsAccepted: number;
  /** Last 24 months, oldest first. */
  months: { period: string; state: HistoryState }[];
}

const period = (d: Date) => d.toISOString().slice(0, 7);
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Worst first. */
const SEVERITY: HistoryState[] = ["DISPUTED", "OVERDUE", "OPEN", "LATE", "ON_TIME"];

export function summarizeHistory(input: HistoryInput): TenantHistory {
  const today = day(input.today);
  const now = period(input.today);

  const rented = new Set<string>();
  for (const m of input.memberships) {
    const to = m.to && period(m.to) < now ? period(m.to) : now;
    if (period(m.from) <= to) for (const p of monthsBetween(period(m.from), to)) rented.add(p);
  }

  const payments = { due: 0, confirmed: 0, onTime: 0, late: 0, waiting: 0, overdue: 0, disputed: 0 };
  const byMonth = new Map<string, HistoryState>();
  for (const s of input.shares) {
    const due = day(s.dueDate);
    if (due > today) continue; // not due yet: says nothing about the tenant
    payments.due++;
    let state: HistoryState;
    if (s.status === "CONFIRMED") {
      payments.confirmed++;
      const paid = s.paidOn ? day(s.paidOn) : s.confirmedAt ? day(s.confirmedAt) : due;
      if (paid <= due) {
        payments.onTime++;
        state = "ON_TIME";
      } else {
        payments.late++;
        state = "LATE";
      }
    } else if (s.status === "OVERDUE") {
      payments.overdue++;
      state = "OVERDUE";
    } else if (s.status === "DISPUTED") {
      payments.disputed++;
      state = "DISPUTED";
    } else {
      payments.waiting++;
      state = "OPEN";
    }
    const p = due.slice(0, 7);
    const prev = byMonth.get(p);
    if (!prev || SEVERITY.indexOf(state) < SEVERITY.indexOf(prev)) byMonth.set(p, state);
  }

  const deposits = { returnedInFull: 0, returnedPartly: 0, held: 0 };
  for (const d of input.deposits) {
    if (d.status === "RETURNED") {
      if ((d.returnCents ?? 0) >= d.amountCents) deposits.returnedInFull++;
      else deposits.returnedPartly++;
    } else if (d.status !== "AWAITING_PAYMENT") deposits.held++;
  }

  const first = shiftPeriod(now, -23);
  return {
    monthsRented: rented.size,
    tenancies: input.memberships.length,
    payments,
    onTimePercent: payments.confirmed ? Math.round((payments.onTime / payments.confirmed) * 100) : null,
    deposits,
    settlementsAccepted: input.settlementsAccepted,
    months: monthsBetween(first, now).map((p) => ({ period: p, state: byMonth.get(p) ?? "NONE" })),
  };
}
