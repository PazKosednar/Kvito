import { Prisma } from "../../generated/prisma/client.js";
import { audit } from "../../lib/audit.js";
import { dueDateInMonth, todayInLjubljana } from "../../lib/dates.js";
import { bus } from "../../lib/events.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { refreshChargeStatus, createCharge } from "../../modules/charges/service.js";

const MONTHS_SL = ["januar", "februar", "marec", "april", "maj", "junij", "julij", "avgust", "september", "oktober", "november", "december"];

/**
 * Creates this month's rent for every active tenancy. Idempotent: the unique (tenancyId, rentPeriod)
 * constraint guarantees one rent per month even if two instances run at the same time.
 */
export async function generateMonthlyRent(now = new Date()): Promise<number> {
  const today = todayInLjubljana(now);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const monthStart = new Date(Date.UTC(year, month - 1, 1));

  const tenancies = await prisma.tenancy.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      rentCents: { gt: 0 },
      startDate: { lte: dueDateInMonth(year, month, 31) },
      OR: [{ endDate: null }, { endDate: { gte: monthStart } }],
      members: { some: { deletedAt: null, leftAt: null } },
      charges: { none: { rentPeriod: period } },
    },
    select: { id: true, rentCents: true, rentDueDay: true, startDate: true },
  });

  let created = 0;
  for (const t of tenancies) {
    const dueDate = dueDateInMonth(year, month, t.rentDueDay);
    // The first month's rent is usually settled when signing; skip a due date before the tenancy starts.
    if (dueDate < t.startDate) continue;
    try {
      await prisma.$transaction((tx) =>
        createCharge(
          tx,
          t.id,
          {
            type: "RENT",
            costType: "RENT",
            title: `Najemnina ${MONTHS_SL[month - 1]} ${year}`,
            amountCents: t.rentCents,
            dueDate,
            rentPeriod: period,
            payTo: "LANDLORD",
            purposeCode: "RENT",
            purpose: `Najemnina ${MONTHS_SL[month - 1]} ${year}`,
          },
          null,
        ),
      );
      created++;
    } catch (err) {
      // P2002 = another run created it first – exactly what idempotency means.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      logger.error({ err, tenancyId: t.id }, "Rent generation failed");
    }
  }
  if (created) logger.info(`Najemnine za ${period}: ustvarjenih ${created}`);
  return created;
}

/** OPEN shares whose due date has passed become OVERDUE. Idempotent. */
export async function markOverdue(now = new Date()): Promise<number> {
  const today = todayInLjubljana(now);
  const shares = await prisma.chargeShare.findMany({
    where: { status: "OPEN", deletedAt: null, charge: { deletedAt: null, dueDate: { lt: today } } },
    select: { id: true, chargeId: true, charge: { select: { tenancyId: true } } },
  });
  if (shares.length === 0) return 0;
  const chargeIds = [...new Set(shares.map((s) => s.chargeId))];
  await prisma.$transaction(async (tx) => {
    await tx.chargeShare.updateMany({ where: { id: { in: shares.map((s) => s.id) }, status: "OPEN" }, data: { status: "OVERDUE" } });
    for (const id of chargeIds) await refreshChargeStatus(tx, id);
    for (const s of shares) {
      await audit({ actorId: null, entityType: "ChargeShare", entityId: s.id, action: "overdue", before: { status: "OPEN" }, after: { status: "OVERDUE" } }, tx);
    }
  });
  for (const tenancyId of new Set(shares.map((s) => s.charge.tenancyId))) bus.emit("tenancy.changed", { tenancyId, what: "charges" });
  return shares.length;
}
