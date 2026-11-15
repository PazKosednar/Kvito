import { Router } from "express";
import { z } from "zod";
import { audit } from "../../lib/audit.js";
import { addDays, parseDateOnly, periodOf, todayInLjubljana } from "../../lib/dates.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { bus } from "../../lib/events.js";
import { prisma } from "../../lib/prisma.js";
import { cents, idParam, optionalText } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { assertTenancyAccess, assertTenancyLandlord } from "../access/access.js";
import { postSystemMessage } from "../messages/system.js";

const RentChangeBody = z.object({
  /** "2027-01": the new rent applies to that month's rent and after. */
  effectiveFrom: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "INVALID_MONTH"),
  rentCents: cents,
  note: optionalText(300),
});

/** Meter readings within this many days of the end count as the final readings. */
const FINAL_READING_WINDOW_DAYS = 14;

export function rentRouter(): Router {
  const router = Router();

  router.get("/tenancies/:id/rent-changes", async (req, res) => {
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyAccess(authUserId(req), tenancyId);
    const changes = await prisma.rentChange.findMany({
      where: { tenancyId, deletedAt: null },
      orderBy: { effectiveFrom: "desc" },
      select: { id: true, effectiveFrom: true, rentCents: true, previousCents: true, note: true, appliedAt: true, createdAt: true },
    });
    res.json({ changes });
  });

  /**
   * Schedules a new rent from a month on. Kvito does not calculate indexation – the landlord enters the amount
   * agreed in the contract. TODO(preveri): whether and how a rent may be indexed depends on the contract and the law.
   */
  router.post("/tenancies/:id/rent-changes", validateBody(RentChangeBody), async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyLandlord(userId, tenancyId);
    const body = req.body as z.infer<typeof RentChangeBody>;
    if (body.effectiveFrom < periodOf(todayInLjubljana())) throw badRequest("MONTH_IN_PAST");
    const effectiveFrom = parseDateOnly(`${body.effectiveFrom}-01`);

    const change = await prisma.$transaction(async (tx) => {
      const tenancy = await tx.tenancy.findUniqueOrThrow({ where: { id: tenancyId }, select: { rentCents: true, status: true } });
      if (tenancy.status !== "ACTIVE") throw badRequest("TENANCY_NOT_ACTIVE");
      // That month's rent is already out – the change would silently miss it.
      if (await tx.charge.count({ where: { tenancyId, rentPeriod: body.effectiveFrom, deletedAt: null } })) throw badRequest("RENT_ALREADY_CREATED");
      // One scheduled change per month: a new one replaces the old.
      await tx.rentChange.updateMany({ where: { tenancyId, effectiveFrom, appliedAt: null, deletedAt: null }, data: { deletedAt: new Date() } });
      const earlier = await tx.rentChange.findFirst({
        where: { tenancyId, deletedAt: null, appliedAt: null, effectiveFrom: { lt: effectiveFrom } },
        orderBy: { effectiveFrom: "desc" },
      });
      const created = await tx.rentChange.create({
        data: { tenancyId, effectiveFrom, rentCents: body.rentCents, previousCents: earlier?.rentCents ?? tenancy.rentCents, note: body.note ?? null, createdById: userId },
      });
      await audit({ actorId: userId, entityType: "RentChange", entityId: created.id, action: "create", before: { rentCents: created.previousCents }, after: { rentCents: created.rentCents, effectiveFrom }, ip: req.ip }, tx);
      return created;
    });
    await postSystemMessage(prisma, tenancyId, "RENT_CHANGED", { rentCents: change.rentCents, from: body.effectiveFrom });
    bus.emit("contract.activity", { tenancyId, actorId: userId, kind: "rent.scheduled", rentCents: change.rentCents, effectiveFrom });
    bus.emit("tenancy.changed", { tenancyId, what: "contract" });
    res.status(201).json({ change });
  });

  router.delete("/rent-changes/:id", async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    const change = await prisma.rentChange.findFirst({ where: { id, deletedAt: null } });
    if (!change) throw notFound();
    await assertTenancyLandlord(userId, change.tenancyId);
    if (change.appliedAt) throw badRequest("RENT_CHANGE_APPLIED");
    await prisma.rentChange.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit({ actorId: userId, entityType: "RentChange", entityId: id, action: "delete", before: { rentCents: change.rentCents, effectiveFrom: change.effectiveFrom }, ip: req.ip });
    bus.emit("tenancy.changed", { tenancyId: change.tenancyId, what: "contract" });
    res.status(204).end();
  });

  /**
   * End-of-stay checklist: what is still missing before the tenancy can be closed cleanly.
   * Each item is "done", "pending" or "na" (does not apply to this tenancy).
   */
  router.get("/tenancies/:id/closeout", async (req, res) => {
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyAccess(authUserId(req), tenancyId);
    const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId }, select: { status: true, endDate: true, depositCents: true, unitId: true } });
    const end = tenancy.endDate ?? todayInLjubljana();

    const [moveOut, unpaid, deposit, lastAdvance, closedSettlements, advancesSetUp, credit] = await Promise.all([
      prisma.handover.findFirst({
        where: { tenancyId, kind: "MOVE_OUT", deletedAt: null },
        orderBy: { handoverOn: "desc" },
        select: { id: true, status: true, keysCount: true, _count: { select: { meterReadings: { where: { deletedAt: null } } } } },
      }),
      prisma.chargeShare.aggregate({
        where: { deletedAt: null, status: { not: "CONFIRMED" }, charge: { tenancyId, deletedAt: null } },
        _count: true,
        _sum: { amountCents: true },
      }),
      prisma.deposit.findUnique({ where: { tenancyId }, select: { status: true } }),
      // The last charge with advances in it: a separate advance or a combined monthly payment.
      prisma.charge.findFirst({
        where: { tenancyId, deletedAt: null, OR: [{ type: "ADVANCE" }, { type: "RENT", autoKey: { startsWith: "combined:" } }] },
        orderBy: { dueDate: "desc" },
        select: { dueDate: true },
      }),
      prisma.costSettlement.findMany({ where: { tenancyId, deletedAt: null, status: "CLOSED" }, select: { periodTo: true } }),
      prisma.costAdvance.count({ where: { tenancyId, deletedAt: null } }),
      prisma.costSettlement.findMany({
        where: { tenancyId, deletedAt: null, status: "CLOSED", creditRemainingCents: { gt: 0 } },
        orderBy: { periodTo: "desc" },
        select: { id: true, creditRemainingCents: true },
      }),
    ]);
    const creditCents = credit.reduce((s, c) => s + c.creditRemainingCents, 0);
    const finalReadings = moveOut?._count.meterReadings
      ? moveOut._count.meterReadings
      : await prisma.meterReading.count({ where: { unitId: tenancy.unitId, deletedAt: null, readOn: { gte: addDays(end, -FINAL_READING_WINDOW_DAYS) } } });

    type State = "done" | "pending" | "na";
    const items: { key: string; state: State; detail?: Record<string, string | number | null> }[] = [
      { key: "charges", state: unpaid._count ? "pending" : "done", detail: { count: unpaid._count, cents: unpaid._sum.amountCents ?? 0 } },
      { key: "moveOut", state: moveOut?.status === "CONFIRMED" ? "done" : "pending", detail: { status: moveOut?.status ?? null, handoverId: moveOut?.id ?? null } },
      { key: "meters", state: finalReadings > 0 ? "done" : "pending", detail: { count: finalReadings } },
      { key: "keys", state: moveOut?.keysCount != null ? "done" : "pending", detail: { count: moveOut?.keysCount ?? null } },
      {
        key: "settlement",
        state: !lastAdvance ? "na" : closedSettlements.some((s) => s.periodTo >= lastAdvance.dueDate) ? "done" : "pending",
        // Advances set up but not charged yet: nothing to settle so far.
        detail: { configured: advancesSetUp > 0 ? 1 : 0 },
      },
      {
        key: "deposit",
        state: !deposit && !tenancy.depositCents ? "na" : deposit?.status === "RETURNED" ? "done" : "pending",
        detail: { status: deposit?.status ?? null },
      },
      {
        // Credit from settlements that is still with the landlord: returned when the tenancy ends.
        key: "credit",
        state: creditCents > 0 ? "pending" : "na",
        detail: { cents: creditCents, settlementId: credit[0]?.id ?? null },
      },
    ];
    res.json({ items, ready: items.every((i) => i.state !== "pending"), status: tenancy.status, endDate: tenancy.endDate });
  });

  return router;
}
