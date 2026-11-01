/**
 * Status rules for the security deposit (varščina). Kvito only records what the people agreed;
 * the money itself moves outside the app.
 *
 *   AWAITING_PAYMENT ──(deposit charge confirmed)──▶ HELD
 *   HELD | RETURN_PROPOSED | RETURN_DISPUTED ──propose (landlord)──▶ RETURN_PROPOSED
 *   RETURN_PROPOSED ──accept (tenant)──▶ RETURN_AGREED (RETURNED right away when nothing is to be returned)
 *   RETURN_PROPOSED ──dispute (tenant)──▶ RETURN_DISPUTED
 *   RETURN_AGREED ──markReturned (landlord)──▶ RETURNED
 *   HELD ──(deposit charge reopened)──▶ AWAITING_PAYMENT
 */

export type DepositStatus = "AWAITING_PAYMENT" | "HELD" | "RETURN_PROPOSED" | "RETURN_DISPUTED" | "RETURN_AGREED" | "RETURNED";
export type DepositAction = "paymentConfirmed" | "paymentReopened" | "propose" | "accept" | "dispute" | "markReturned";
export type DepositActor = "LANDLORD" | "TENANT" | "SYSTEM";

export class DepositTransitionError extends Error {
  constructor() {
    super("TRANSITION_NOT_ALLOWED");
    this.name = "DepositTransitionError";
  }
}

const ACTOR: Record<DepositAction, DepositActor> = {
  paymentConfirmed: "SYSTEM",
  paymentReopened: "SYSTEM",
  propose: "LANDLORD",
  accept: "TENANT",
  dispute: "TENANT",
  markReturned: "LANDLORD",
};

export function nextDepositStatus(current: DepositStatus, action: DepositAction, ctx: { actor: DepositActor; returnCents?: number | null }): DepositStatus {
  const deny = (): never => {
    throw new DepositTransitionError();
  };
  if (ACTOR[action] !== ctx.actor) return deny();
  switch (action) {
    case "paymentConfirmed":
      return current === "AWAITING_PAYMENT" ? "HELD" : deny();
    case "paymentReopened":
      return current === "HELD" ? "AWAITING_PAYMENT" : deny();
    case "propose":
      return current === "HELD" || current === "RETURN_PROPOSED" || current === "RETURN_DISPUTED" ? "RETURN_PROPOSED" : deny();
    case "accept":
      if (current !== "RETURN_PROPOSED") return deny();
      return ctx.returnCents === 0 ? "RETURNED" : "RETURN_AGREED";
    case "dispute":
      return current === "RETURN_PROPOSED" ? "RETURN_DISPUTED" : deny();
    case "markReturned":
      return current === "RETURN_AGREED" ? "RETURNED" : deny();
  }
}

/** What is returned after deductions. Deductions may never exceed the deposit. */
export function depositReturn(amountCents: number, deductions: { amountCents: number }[]): { keptCents: number; returnCents: number } {
  const keptCents = deductions.reduce((s, d) => s + d.amountCents, 0);
  if (deductions.some((d) => !Number.isInteger(d.amountCents) || d.amountCents <= 0)) throw new RangeError("DEDUCTION_INVALID");
  if (keptCents > amountCents) throw new RangeError("DEDUCTIONS_EXCEED_DEPOSIT");
  return { keptCents, returnCents: amountCents - keptCents };
}
