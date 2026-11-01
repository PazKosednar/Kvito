/**
 * Cost settlement (letni obračun stroškov): actual costs from the bills against the advances charged.
 *
 *   DRAFT | DISPUTED ──send (landlord)──▶ SENT
 *   SENT ──accept (tenant)──▶ ACCEPTED, or CLOSED right away when there is no difference
 *   SENT ──dispute (tenant)──▶ DISPUTED
 *   ACCEPTED ──(additional payment confirmed | overpayment returned)──▶ CLOSED
 */

export type SettlementStatus = "DRAFT" | "SENT" | "DISPUTED" | "ACCEPTED" | "CLOSED";
export type SettlementAction = "send" | "accept" | "dispute" | "paid" | "refunded" | "reopened";

export class SettlementTransitionError extends Error {
  constructor() {
    super("TRANSITION_NOT_ALLOWED");
    this.name = "SettlementTransitionError";
  }
}

export interface SettlementTotals {
  advanceCents: number;
  actualCents: number;
  /** > 0: the tenant pays the difference; < 0: the landlord returns the overpayment. */
  balanceCents: number;
}

export function settlementTotals(lines: { advanceCents: number; actualCents: number }[]): SettlementTotals {
  const advanceCents = lines.reduce((s, l) => s + l.advanceCents, 0);
  const actualCents = lines.reduce((s, l) => s + l.actualCents, 0);
  return { advanceCents, actualCents, balanceCents: actualCents - advanceCents };
}

const ACTOR: Record<SettlementAction, "LANDLORD" | "TENANT" | "SYSTEM"> = {
  send: "LANDLORD",
  accept: "TENANT",
  dispute: "TENANT",
  paid: "SYSTEM",
  refunded: "LANDLORD",
  reopened: "SYSTEM",
};

export function nextSettlementStatus(
  current: SettlementStatus,
  action: SettlementAction,
  ctx: { actor: "LANDLORD" | "TENANT" | "SYSTEM"; balanceCents: number },
): SettlementStatus {
  const deny = (): never => {
    throw new SettlementTransitionError();
  };
  if (ACTOR[action] !== ctx.actor) return deny();
  switch (action) {
    case "send":
      return current === "DRAFT" || current === "DISPUTED" ? "SENT" : deny();
    case "accept":
      if (current !== "SENT") return deny();
      return ctx.balanceCents === 0 ? "CLOSED" : "ACCEPTED";
    case "dispute":
      return current === "SENT" ? "DISPUTED" : deny();
    case "paid":
      return current === "ACCEPTED" && ctx.balanceCents > 0 ? "CLOSED" : deny();
    case "refunded":
      return current === "ACCEPTED" && ctx.balanceCents < 0 ? "CLOSED" : deny();
    case "reopened":
      return current === "CLOSED" && ctx.balanceCents > 0 ? "ACCEPTED" : deny();
  }
}
