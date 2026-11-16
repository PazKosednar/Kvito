import { describe, expect, it } from "vitest";
import { onTimeMonths, type OnTimeShare } from "./on-time.js";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const share = (due: string, status: OnTimeShare["status"], paidOn: string | null = null): OnTimeShare => ({
  dueDate: d(due),
  status,
  paidOn: paidOn ? d(paidOn) : null,
  confirmedAt: status === "CONFIRMED" ? d(paidOn ?? due) : null,
});

describe("on-time months", () => {
  const today = d("2026-11-15");

  it("counts months where everything due was paid by the due date", () => {
    expect(
      onTimeMonths(
        [
          share("2026-08-05", "CONFIRMED", "2026-08-04"), // Aug: on time
          share("2026-09-05", "CONFIRMED", "2026-09-05"), // Sep: on the day counts
          share("2026-09-20", "CONFIRMED", "2026-09-18"), // Sep: second charge also on time
          share("2026-10-05", "CONFIRMED", "2026-10-09"), // Oct: late
          share("2026-11-05", "REPORTED_PAID", "2026-11-04"), // Nov: not confirmed yet
          share("2026-12-05", "OPEN"), // not due yet
        ],
        today,
      ),
    ).toBe(2);
  });

  it("a month with one late or open share does not count", () => {
    expect(onTimeMonths([share("2026-07-05", "CONFIRMED", "2026-07-01"), share("2026-07-15", "OVERDUE")], today)).toBe(0);
    expect(onTimeMonths([], today)).toBe(0);
  });
});
