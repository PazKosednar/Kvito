import { describe, expect, it } from "vitest";
import { summarizeHistory } from "./tenant-history.js";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const share = (due: string, status: "OPEN" | "REPORTED_PAID" | "CONFIRMED" | "OVERDUE" | "DISPUTED", paidOn: string | null = null) => ({
  dueDate: d(due),
  status,
  paidOn: paidOn ? d(paidOn) : null,
  confirmedAt: status === "CONFIRMED" ? d(paidOn ?? due) : null,
});

describe("tenant history", () => {
  const today = d("2026-11-15");

  it("counts months, payments in time and late, and ignores what is not due yet", () => {
    const h = summarizeHistory({
      memberships: [{ from: d("2026-02-15"), to: null }],
      shares: [share("2026-02-15", "CONFIRMED", "2026-02-14"), share("2026-03-15", "CONFIRMED", "2026-03-20"), share("2026-10-15", "REPORTED_PAID"), share("2026-11-20", "OPEN")],
      deposits: [{ status: "HELD", amountCents: 80_000, returnCents: null }],
      settlementsAccepted: 1,
      today,
    });
    expect(h.monthsRented).toBe(10); // Feb–Nov 2026
    expect(h.payments).toEqual({ due: 3, confirmed: 2, onTime: 1, late: 1, waiting: 1, overdue: 0, disputed: 0 });
    expect(h.onTimePercent).toBe(50);
    expect(h.deposits).toEqual({ returnedInFull: 0, returnedPartly: 0, held: 1 });
    expect(h.months).toHaveLength(24);
    expect(h.months.at(-1)).toEqual({ period: "2026-11", state: "NONE" });
    expect(h.months.find((m) => m.period === "2026-03")!.state).toBe("LATE");
    expect(h.months.find((m) => m.period === "2026-10")!.state).toBe("OPEN");
  });

  it("does not count overlapping tenancies twice and counts returned deposits", () => {
    const h = summarizeHistory({
      memberships: [
        { from: d("2025-01-01"), to: d("2025-06-30") },
        { from: d("2025-06-01"), to: d("2025-08-31") },
      ],
      shares: [share("2025-07-05", "OVERDUE"), share("2025-07-10", "CONFIRMED", "2025-07-01")],
      deposits: [
        { status: "RETURNED", amountCents: 100_000, returnCents: 100_000 },
        { status: "RETURNED", amountCents: 100_000, returnCents: 80_000 },
        { status: "AWAITING_PAYMENT", amountCents: 50_000, returnCents: null },
      ],
      settlementsAccepted: 0,
      today,
    });
    expect(h.monthsRented).toBe(8); // Jan–Aug 2025
    expect(h.tenancies).toBe(2);
    expect(h.deposits).toEqual({ returnedInFull: 1, returnedPartly: 1, held: 0 });
    // The worst state of the month shows.
    expect(h.months.find((m) => m.period === "2025-07")!.state).toBe("OVERDUE");
  });

  it("has no percentage without confirmed payments", () => {
    expect(summarizeHistory({ memberships: [], shares: [], deposits: [], settlementsAccepted: 0, today }).onTimePercent).toBeNull();
  });
});
