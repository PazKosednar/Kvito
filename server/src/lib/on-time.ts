/**
 * Months paid on time (the town's reward garden): a month counts when it had at least one share due
 * and every share due in it was confirmed and paid by its due date. Same "on time" rule as the tenant
 * history (paid date = reported paidOn, else confirmation date). Pure function.
 */

export interface OnTimeShare {
  dueDate: Date;
  status: "OPEN" | "REPORTED_PAID" | "CONFIRMED" | "OVERDUE" | "DISPUTED";
  paidOn: Date | null;
  confirmedAt: Date | null;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export function onTimeMonths(shares: OnTimeShare[], today: Date): number {
  const t = day(today);
  const months = new Map<string, boolean>();
  for (const s of shares) {
    const due = day(s.dueDate);
    if (due > t) continue; // not due yet
    const paid = s.paidOn ? day(s.paidOn) : s.confirmedAt ? day(s.confirmedAt) : null;
    const ok = s.status === "CONFIRMED" && paid !== null && paid <= due;
    const p = due.slice(0, 7);
    months.set(p, (months.get(p) ?? true) && ok);
  }
  let n = 0;
  for (const ok of months.values()) if (ok) n++;
  return n;
}
