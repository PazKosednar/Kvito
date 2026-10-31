/**
 * Status rules for charge shares (each tenant's part of a charge) and the charge as a whole.
 *
 *   OPEN ──report──▶ REPORTED_PAID ──confirm──▶ CONFIRMED
 *    │ ▲                  │ reject (back to OPEN/OVERDUE)
 *    │ └──────────────────┘
 *    └─(due date passes)─▶ OVERDUE ──report──▶ REPORTED_PAID
 *   any unconfirmed ──dispute──▶ DISPUTED ──reopen──▶ OPEN/OVERDUE
 *   landlord can confirm directly (e.g. paid in cash) and reopen a confirmed share (audited).
 */

export type ChargeStatus = "OPEN" | "REPORTED_PAID" | "CONFIRMED" | "OVERDUE" | "DISPUTED";
export type ShareAction = "report" | "confirm" | "reject" | "dispute" | "reopen" | "markOverdue";
export type Actor = "LANDLORD" | "TENANT";

export class TransitionError extends Error {
  constructor(public readonly code: "TRANSITION_NOT_ALLOWED" | "NOT_YOUR_SHARE") {
    super(code);
    this.name = "TransitionError";
  }
}

interface Ctx {
  actor: Actor;
  /** Is the acting tenant the owner of this share? */
  ownsShare: boolean;
  /** Is the due date in the past (Ljubljana calendar day)? */
  isPastDue: boolean;
}

const unpaid = (overdue: boolean): ChargeStatus => (overdue ? "OVERDUE" : "OPEN");

export function nextShareStatus(current: ChargeStatus, action: ShareAction, ctx: Ctx): ChargeStatus {
  const deny = (): never => {
    throw new TransitionError("TRANSITION_NOT_ALLOWED");
  };
  if (ctx.actor === "TENANT" && !ctx.ownsShare && action !== "markOverdue") throw new TransitionError("NOT_YOUR_SHARE");

  switch (action) {
    case "report":
      if (ctx.actor !== "TENANT") return deny();
      return current === "OPEN" || current === "OVERDUE" ? "REPORTED_PAID" : deny();
    case "confirm":
      if (ctx.actor !== "LANDLORD") return deny();
      return current === "CONFIRMED" ? deny() : "CONFIRMED";
    case "reject":
      if (ctx.actor !== "LANDLORD") return deny();
      return current === "REPORTED_PAID" ? unpaid(ctx.isPastDue) : deny();
    case "dispute":
      return current === "CONFIRMED" || current === "DISPUTED" ? deny() : "DISPUTED";
    case "reopen":
      if (ctx.actor !== "LANDLORD") return deny();
      return current === "DISPUTED" || current === "CONFIRMED" ? unpaid(ctx.isPastDue) : deny();
    case "markOverdue":
      return current === "OPEN" && ctx.isPastDue ? "OVERDUE" : current;
  }
}

/** The charge's status from its shares: the most urgent state wins, CONFIRMED only when everyone is settled. */
export function aggregateStatus(shares: ChargeStatus[]): ChargeStatus {
  if (shares.length === 0) return "OPEN";
  if (shares.every((s) => s === "CONFIRMED")) return "CONFIRMED";
  if (shares.includes("DISPUTED")) return "DISPUTED";
  if (shares.includes("OVERDUE")) return "OVERDUE";
  if (shares.includes("OPEN")) return "OPEN";
  return "REPORTED_PAID";
}
