import { describe, expect, it } from "vitest";
import { aggregateStatus, nextShareStatus, TransitionError, type ChargeStatus } from "./charge-status.js";

const tenant = { actor: "TENANT" as const, ownsShare: true, isPastDue: false };
const tenantLate = { ...tenant, isPastDue: true };
const landlord = { actor: "LANDLORD" as const, ownsShare: false, isPastDue: false };
const landlordLate = { ...landlord, isPastDue: true };

describe("share status transitions", () => {
  it("follows the happy path OPEN → REPORTED_PAID → CONFIRMED", () => {
    const reported = nextShareStatus("OPEN", "report", tenant);
    expect(reported).toBe("REPORTED_PAID");
    expect(nextShareStatus(reported, "confirm", landlord)).toBe("CONFIRMED");
  });

  it("lets an overdue share be reported", () => {
    expect(nextShareStatus("OVERDUE", "report", tenantLate)).toBe("REPORTED_PAID");
  });

  it("returns a rejected report to OPEN or OVERDUE depending on the due date", () => {
    expect(nextShareStatus("REPORTED_PAID", "reject", landlord)).toBe("OPEN");
    expect(nextShareStatus("REPORTED_PAID", "reject", landlordLate)).toBe("OVERDUE");
  });

  it("marks only open past-due shares overdue", () => {
    expect(nextShareStatus("OPEN", "markOverdue", landlordLate)).toBe("OVERDUE");
    expect(nextShareStatus("OPEN", "markOverdue", landlord)).toBe("OPEN");
    expect(nextShareStatus("REPORTED_PAID", "markOverdue", landlordLate)).toBe("REPORTED_PAID");
    expect(nextShareStatus("CONFIRMED", "markOverdue", landlordLate)).toBe("CONFIRMED");
  });

  it("allows disputes by both sides, then reopening by the landlord", () => {
    expect(nextShareStatus("OPEN", "dispute", tenant)).toBe("DISPUTED");
    expect(nextShareStatus("REPORTED_PAID", "dispute", landlord)).toBe("DISPUTED");
    expect(nextShareStatus("DISPUTED", "reopen", landlordLate)).toBe("OVERDUE");
    expect(nextShareStatus("DISPUTED", "confirm", landlord)).toBe("CONFIRMED");
  });

  it("lets the landlord confirm directly (cash) and reopen a confirmed share", () => {
    expect(nextShareStatus("OPEN", "confirm", landlord)).toBe("CONFIRMED");
    expect(nextShareStatus("CONFIRMED", "reopen", landlord)).toBe("OPEN");
  });

  it("refuses transitions that make no sense", () => {
    const cases: [ChargeStatus, Parameters<typeof nextShareStatus>[1], Parameters<typeof nextShareStatus>[2]][] = [
      ["CONFIRMED", "report", tenant],
      ["REPORTED_PAID", "report", tenant],
      ["OPEN", "confirm", tenant],
      ["OPEN", "report", landlord],
      ["OPEN", "reject", landlord],
      ["CONFIRMED", "confirm", landlord],
      ["CONFIRMED", "dispute", tenant],
      ["DISPUTED", "reopen", tenant],
    ];
    for (const [from, action, ctx] of cases) {
      expect(() => nextShareStatus(from, action, ctx), `${from} --${action}--> by ${ctx.actor}`).toThrow(TransitionError);
    }
  });

  it("does not let a tenant act on a flatmate's share", () => {
    expect(() => nextShareStatus("OPEN", "report", { ...tenant, ownsShare: false })).toThrow(/NOT_YOUR_SHARE/);
  });
});

describe("aggregateStatus", () => {
  it("is CONFIRMED only when every share is confirmed", () => {
    expect(aggregateStatus(["CONFIRMED", "CONFIRMED"])).toBe("CONFIRMED");
    expect(aggregateStatus(["CONFIRMED", "REPORTED_PAID"])).toBe("REPORTED_PAID");
  });
  it("shows the most urgent state", () => {
    expect(aggregateStatus(["CONFIRMED", "OVERDUE", "DISPUTED"])).toBe("DISPUTED");
    expect(aggregateStatus(["REPORTED_PAID", "OVERDUE"])).toBe("OVERDUE");
    expect(aggregateStatus(["REPORTED_PAID", "OPEN"])).toBe("OPEN");
    expect(aggregateStatus([])).toBe("OPEN");
  });
});
