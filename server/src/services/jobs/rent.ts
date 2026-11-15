import { Prisma } from "../../generated/prisma/client.js";
import { audit } from "../../lib/audit.js";
import { dueDateInMonth, todayInLjubljana } from "../../lib/dates.js";
import { bus } from "../../lib/events.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { refreshChargeStatus, createCharge } from "../../modules/charges/service.js";
import { takeOffsetCredit } from "../../modules/contract/credit.js";

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
  // A scheduled rent change for this month must be in place before this month's rent is created.
  await applyRentChanges(monthStart);

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
    select: {
      id: true,
      rentCents: true,
      rentDueDay: true,
      startDate: true,
      billingMode: true,
      costAdvances: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, select: { costType: true, amountCents: true } },
    },
  });

  let created = 0;
  for (const t of tenancies) {
    const dueDate = dueDateInMonth(year, month, t.rentDueDay);
    // The first month's rent is usually settled when signing; skip a due date before the tenancy starts.
    if (dueDate < t.startDate) continue;
    try {
      await prisma.$transaction(async (tx) => {
        // Pavšal: rent and cost advances in one payment – unless this month's advances already went out separately.
        const combined =
          t.billingMode === "COMBINED" && t.costAdvances.length > 0 && !(await tx.charge.count({ where: { tenancyId: t.id, autoKey: `advance:${period}` } }));
        const lines = combined ? [{ costType: "RENT" as const, amountCents: t.rentCents }, ...t.costAdvances] : [];
        const gross = lines.length ? lines.reduce((s, l) => s + l.amountCents, 0) : t.rentCents;
        const credit = await takeOffsetCredit(tx, t.id, gross);
        // TODO(preveri): purpose code for one payment of rent and running costs; RENT is used for now.
        const title = combined ? `Najemnina in stroški ${MONTHS_SL[month - 1]} ${year}` : `Najemnina ${MONTHS_SL[month - 1]} ${year}`;
        const allLines = [...(lines.length ? lines : credit.lines.length ? [{ costType: "RENT" as const, amountCents: t.rentCents }] : []), ...credit.lines];
        await createCharge(
          tx,
          t.id,
          {
            type: "RENT",
            costType: "RENT",
            title,
            amountCents: credit.netCents,
            dueDate,
            rentPeriod: period,
            autoKey: combined ? `combined:${period}` : null,
            payTo: "LANDLORD",
            purposeCode: "RENT",
            purpose: title,
            lines: allLines,
          },
          null,
        );
      });
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

/** Scheduled rent changes that are due: the tenancy's rent becomes the newest one. Idempotent (appliedAt). */
export async function applyRentChanges(monthStart: Date): Promise<number> {
  const due = await prisma.rentChange.findMany({
    where: { deletedAt: null, appliedAt: null, effectiveFrom: { lte: monthStart }, tenancy: { deletedAt: null } },
    orderBy: { effectiveFrom: "asc" },
  });
  const latest = new Map(due.map((c) => [c.tenancyId, c]));
  for (const [tenancyId, change] of latest) {
    await prisma.$transaction(async (tx) => {
      const before = await tx.tenancy.findUniqueOrThrow({ where: { id: tenancyId }, select: { rentCents: true } });
      await tx.tenancy.update({ where: { id: tenancyId }, data: { rentCents: change.rentCents } });
      await tx.rentChange.updateMany({ where: { id: { in: due.filter((c) => c.tenancyId === tenancyId).map((c) => c.id) } }, data: { appliedAt: new Date() } });
      await audit({ actorId: null, entityType: "Tenancy", entityId: tenancyId, action: "rentChange", before: { rentCents: before.rentCents }, after: { rentCents: change.rentCents, rentChangeId: change.id } }, tx);
    });
    bus.emit("tenancy.changed", { tenancyId, what: "contract" });
  }
  return latest.size;
}

/**
 * One charge per month with all monthly cost advances (akontacije) of a tenancy, due with the rent.
 * Idempotent through the unique (tenancyId, autoKey) – "advance:YYYY-MM".
 */
export async function generateMonthlyAdvances(now = new Date()): Promise<number> {
  const today = todayInLjubljana(now);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const autoKey = `advance:${period}`;

  const tenancies = await prisma.tenancy.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      startDate: { lte: dueDateInMonth(year, month, 31) },
      OR: [{ endDate: null }, { endDate: { gte: monthStart } }],
      members: { some: { deletedAt: null, leftAt: null } },
      costAdvances: { some: { deletedAt: null } },
      // Already part of this month's combined payment.
      charges: { none: { autoKey: { in: [autoKey, `combined:${period}`] } } },
      // Pavšal tenancies get their advances with the rent (one without rent still gets them here).
      NOT: { billingMode: "COMBINED", rentCents: { gt: 0 } },
    },
    select: { id: true, rentDueDay: true, startDate: true, costAdvances: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
  });

  let created = 0;
  for (const t of tenancies) {
    const dueDate = dueDateInMonth(year, month, t.rentDueDay);
    if (dueDate < t.startDate) continue;
    const total = t.costAdvances.reduce((s, a) => s + a.amountCents, 0);
    const title = `Akontacija stroškov ${MONTHS_SL[month - 1]} ${year}`;
    try {
      await prisma.$transaction(async (tx) => {
        const credit = await takeOffsetCredit(tx, t.id, total);
        await createCharge(
          tx,
          t.id,
          {
            type: "ADVANCE",
            costType: null,
            title,
            amountCents: credit.netCents,
            dueDate,
            autoKey,
            payTo: "LANDLORD",
            // TODO(preveri): purpose code for cost advances; OTHR ("Drugo") is always valid.
            purposeCode: "OTHR",
            purpose: title,
            lines: [...t.costAdvances.map((a) => ({ costType: a.costType, amountCents: a.amountCents })), ...credit.lines],
          },
          null,
        );
      });
      created++;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      logger.error({ err, tenancyId: t.id }, "Advance generation failed");
    }
  }
  if (created) logger.info(`Akontacije za ${period}: ustvarjenih ${created}`);
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
