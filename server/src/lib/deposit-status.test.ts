import { describe, expect, it } from "vitest";
import { DepositTransitionError, depositReturn, nextDepositStatus } from "./deposit-status.js";
import { CreditChoiceRequiredError, SettlementTransitionError, nextSettlementStatus, settlementTotals } from "./settlement.js";

describe("deposit status", () => {
  const L = { actor: "LANDLORD" as const };
  const T = { actor: "TENANT" as const };
  const S = { actor: "SYSTEM" as const };

  it("walks the happy path: paid, proposed, agreed, returned", () => {
    expect(nextDepositStatus("AWAITING_PAYMENT", "paymentConfirmed", S)).toBe("HELD");
    expect(nextDepositStatus("HELD", "propose", L)).toBe("RETURN_PROPOSED");
    expect(nextDepositStatus("RETURN_PROPOSED", "accept", { ...T, returnCents: 50_000 })).toBe("RETURN_AGREED");
    expect(nextDepositStatus("RETURN_AGREED", "markReturned", L)).toBe("RETURNED");
  });

  it("closes right away when everything is kept", () => {
    expect(nextDepositStatus("RETURN_PROPOSED", "accept", { ...T, returnCents: 0 })).toBe("RETURNED");
  });

  it("lets the landlord propose again after a dispute", () => {
    expect(nextDepositStatus("RETURN_PROPOSED", "dispute", T)).toBe("RETURN_DISPUTED");
    expect(nextDepositStatus("RETURN_DISPUTED", "propose", L)).toBe("RETURN_PROPOSED");
  });

  it("goes back to awaiting payment when the deposit charge is reopened", () => {
    expect(nextDepositStatus("HELD", "paymentReopened", S)).toBe("AWAITING_PAYMENT");
  });

  it("refuses the wrong person and the wrong order", () => {
    expect(() => nextDepositStatus("RETURN_PROPOSED", "accept", L)).toThrow(DepositTransitionError);
    expect(() => nextDepositStatus("HELD", "propose", T)).toThrow(DepositTransitionError);
    expect(() => nextDepositStatus("AWAITING_PAYMENT", "propose", L)).toThrow(DepositTransitionError);
    expect(() => nextDepositStatus("HELD", "markReturned", L)).toThrow(DepositTransitionError);
    expect(() => nextDepositStatus("RETURNED", "propose", L)).toThrow(DepositTransitionError);
  });

  it("computes the return and refuses deductions above the deposit", () => {
    expect(depositReturn(130_000, [{ amountCents: 20_000 }, { amountCents: 5_050 }])).toEqual({ keptCents: 25_050, returnCents: 104_950 });
    expect(depositReturn(130_000, [])).toEqual({ keptCents: 0, returnCents: 130_000 });
    expect(() => depositReturn(10_000, [{ amountCents: 10_001 }])).toThrow("DEDUCTIONS_EXCEED_DEPOSIT");
    expect(() => depositReturn(10_000, [{ amountCents: 0 }])).toThrow("DEDUCTION_INVALID");
  });
});

describe("cost settlement", () => {
  it("adds up advances and actual costs", () => {
    const t = settlementTotals([
      { advanceCents: 36_000, actualCents: 41_250 },
      { advanceCents: 12_000, actualCents: 9_000 },
    ]);
    expect(t).toEqual({ advanceCents: 48_000, actualCents: 50_250, carriedInCents: 0, balanceCents: 2_250 });
  });

  it("subtracts credit carried in from an earlier settlement", () => {
    const t = settlementTotals([{ advanceCents: 10_000, actualCents: 12_000 }], 3_000);
    expect(t).toEqual({ advanceCents: 10_000, actualCents: 12_000, carriedInCents: 3_000, balanceCents: -1_000 });
  });

  it("asks the tenant what to do with a credit", () => {
    const T = { actor: "TENANT" as const, balanceCents: -22_371 };
    expect(() => nextSettlementStatus("SENT", "accept", T)).toThrow(CreditChoiceRequiredError);
    expect(nextSettlementStatus("SENT", "accept", { ...T, creditChoice: "REFUND" })).toBe("ACCEPTED");
    expect(nextSettlementStatus("SENT", "accept", { ...T, creditChoice: "CARRY_OVER" })).toBe("CLOSED");
    expect(nextSettlementStatus("SENT", "accept", { ...T, creditChoice: "OFFSET_NEXT" })).toBe("CLOSED");
  });

  it("moves through send, accept and payment", () => {
    const L = { actor: "LANDLORD" as const, balanceCents: 2_250 };
    const T = { actor: "TENANT" as const, balanceCents: 2_250 };
    expect(nextSettlementStatus("DRAFT", "send", L)).toBe("SENT");
    expect(nextSettlementStatus("SENT", "accept", T)).toBe("ACCEPTED");
    expect(nextSettlementStatus("ACCEPTED", "paid", { actor: "SYSTEM", balanceCents: 2_250 })).toBe("CLOSED");
    expect(nextSettlementStatus("CLOSED", "reopened", { actor: "SYSTEM", balanceCents: 2_250 })).toBe("ACCEPTED");
  });

  it("closes on acceptance when there is no difference, and after a refund when the tenant overpaid", () => {
    expect(nextSettlementStatus("SENT", "accept", { actor: "TENANT", balanceCents: 0 })).toBe("CLOSED");
    expect(nextSettlementStatus("ACCEPTED", "refunded", { actor: "LANDLORD", balanceCents: -3_000 })).toBe("CLOSED");
    expect(() => nextSettlementStatus("ACCEPTED", "refunded", { actor: "LANDLORD", balanceCents: 3_000 })).toThrow(SettlementTransitionError);
  });

  it("can be sent again after a dispute, never by the tenant", () => {
    expect(nextSettlementStatus("SENT", "dispute", { actor: "TENANT", balanceCents: 1 })).toBe("DISPUTED");
    expect(nextSettlementStatus("DISPUTED", "send", { actor: "LANDLORD", balanceCents: 1 })).toBe("SENT");
    expect(() => nextSettlementStatus("DRAFT", "send", { actor: "TENANT", balanceCents: 1 })).toThrow(SettlementTransitionError);
    expect(() => nextSettlementStatus("DRAFT", "accept", { actor: "TENANT", balanceCents: 1 })).toThrow(SettlementTransitionError);
  });
});
