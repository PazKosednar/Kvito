import type { CostType, Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { audit } from "../../lib/audit.js";
import { allocateCredit } from "../../lib/credit.js";

type Db = PrismaClient | Prisma.TransactionClient;

/** Label of the negative charge line that pays part of a charge with a settlement credit. */
export const CREDIT_LINE_LABEL = "Dobroimetje iz obračuna";

/**
 * Charge lines that count as charged advances: every non-rent line of a monthly charge (combined or separate),
 * except credit offsets (they pay the advance, they do not reduce it).
 */
export const advanceLineWhere = (tenancyId: string, from: Date, to: Date): Prisma.ChargeLineWhereInput => ({
  costType: { not: "RENT" },
  creditSettlementId: null,
  charge: { tenancyId, type: { in: ["RENT", "ADVANCE"] }, deletedAt: null, dueDate: { gte: from, lte: to } },
});

/** Settlements whose credit the tenant chose to have deducted from the next charges, oldest first. */
const offsetSources = (db: Db, tenancyId: string) =>
  db.costSettlement.findMany({
    where: { tenancyId, deletedAt: null, status: "CLOSED", creditChoice: "OFFSET_NEXT", creditRemainingCents: { gt: 0 } },
    orderBy: [{ respondedAt: "asc" }, { createdAt: "asc" }],
    select: { id: true, creditRemainingCents: true },
  });

/**
 * Pays as much of a new monthly charge as the tenant's offset credit allows. Decrements the settlements and returns
 * the negative lines to add to the charge. Must run in the same transaction as the charge creation, so a failed or
 * duplicate charge leaves the credit untouched.
 */
export async function takeOffsetCredit(
  tx: Prisma.TransactionClient,
  tenancyId: string,
  grossCents: number,
): Promise<{ netCents: number; lines: { costType: CostType; label: string; amountCents: number; creditSettlementId: string }[] }> {
  const sources = await offsetSources(tx, tenancyId);
  if (!sources.length || grossCents <= 0) return { netCents: grossCents, lines: [] };
  const alloc = allocateCredit(
    sources.map((s) => ({ id: s.id, remainingCents: s.creditRemainingCents })),
    grossCents,
  );
  for (const u of alloc.used) {
    await tx.costSettlement.update({ where: { id: u.id }, data: { creditRemainingCents: { decrement: u.cents } } });
    await audit({ actorId: null, entityType: "CostSettlement", entityId: u.id, action: "creditOffset", after: { cents: u.cents } }, tx);
  }
  return {
    netCents: alloc.chargeCents,
    lines: alloc.used.map((u) => ({ costType: "OTHER" as const, label: CREDIT_LINE_LABEL, amountCents: -u.cents, creditSettlementId: u.id })),
  };
}

/** A charge that used credit was deleted: the credit goes back to its settlements. */
export async function restoreOffsetCredit(tx: Prisma.TransactionClient, chargeId: string, actorId: string | null): Promise<void> {
  const lines = await tx.chargeLine.findMany({ where: { chargeId, creditSettlementId: { not: null } }, select: { creditSettlementId: true, amountCents: true } });
  for (const l of lines) {
    await tx.costSettlement.update({ where: { id: l.creditSettlementId! }, data: { creditRemainingCents: { increment: -l.amountCents } } });
    await audit({ actorId, entityType: "CostSettlement", entityId: l.creditSettlementId!, action: "creditRestored", after: { cents: -l.amountCents, chargeId } }, tx);
  }
}

/** Credit the tenant still has with the landlord (any choice), e.g. for the running balance or closing a tenancy. */
export async function availableCredit(db: Db, tenancyId: string, exceptSettlementId?: string): Promise<number> {
  const r = await db.costSettlement.aggregate({
    where: { tenancyId, deletedAt: null, status: "CLOSED", creditRemainingCents: { gt: 0 }, ...(exceptSettlementId ? { id: { not: exceptSettlementId } } : {}) },
    _sum: { creditRemainingCents: true },
  });
  return r._sum.creditRemainingCents ?? 0;
}
