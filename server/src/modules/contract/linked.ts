import type { ChargeStatus, ChargeType, Prisma } from "../../generated/prisma/client.js";
import { audit } from "../../lib/audit.js";
import { todayInLjubljana } from "../../lib/dates.js";
import { bus } from "../../lib/events.js";

/**
 * Keeps the deposit and the cost settlement in step with the charge they are paid with:
 * a confirmed deposit charge means the deposit is held; a confirmed settlement charge closes the settlement.
 * Reopening the charge undoes it. Runs inside the share transition's transaction.
 */
export async function syncLinkedRecords(
  tx: Prisma.TransactionClient,
  charge: { id: string; type: ChargeType; tenancyId: string },
  chargeStatus: ChargeStatus,
  actorId: string | null,
): Promise<void> {
  const paid = chargeStatus === "CONFIRMED";

  if (charge.type === "DEPOSIT") {
    const deposit = await tx.deposit.findUnique({ where: { chargeId: charge.id } });
    if (!deposit) return;
    let next: "HELD" | "AWAITING_PAYMENT" | null = null;
    if (paid && deposit.status === "AWAITING_PAYMENT") next = "HELD";
    if (!paid && deposit.status === "HELD") next = "AWAITING_PAYMENT";
    if (!next) return;
    await tx.deposit.update({ where: { id: deposit.id }, data: { status: next, receivedOn: next === "HELD" ? todayInLjubljana() : null } });
    await audit({ actorId, entityType: "Deposit", entityId: deposit.id, action: next === "HELD" ? "received" : "reopened", before: { status: deposit.status }, after: { status: next } }, tx);
    bus.emit("tenancy.changed", { tenancyId: charge.tenancyId, what: "contract" });
  }

  if (charge.type === "SETTLEMENT") {
    const settlement = await tx.costSettlement.findUnique({ where: { chargeId: charge.id } });
    if (!settlement) return;
    let next: "CLOSED" | "ACCEPTED" | null = null;
    if (paid && settlement.status === "ACCEPTED") next = "CLOSED";
    if (!paid && settlement.status === "CLOSED") next = "ACCEPTED";
    if (!next) return;
    await tx.costSettlement.update({ where: { id: settlement.id }, data: { status: next } });
    await audit({ actorId, entityType: "CostSettlement", entityId: settlement.id, action: next === "CLOSED" ? "paid" : "reopened", before: { status: settlement.status }, after: { status: next } }, tx);
    bus.emit("tenancy.changed", { tenancyId: charge.tenancyId, what: "contract" });
  }
}
