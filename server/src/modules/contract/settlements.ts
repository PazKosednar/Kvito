import { Router } from "express";
import { z } from "zod";
import type { CostType, Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { audit } from "../../lib/audit.js";
import { addDays, toDateOnly, todayInLjubljana } from "../../lib/dates.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { bus } from "../../lib/events.js";
import { prisma } from "../../lib/prisma.js";
import { SettlementTransitionError, nextSettlementStatus, settlementTotals, type SettlementAction } from "../../lib/settlement.js";
import { SplitError, splitAmount } from "../../lib/split.js";
import { COST_TYPES, cents, costType, dateOnly, idParam, optionalText, positiveCents, text } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { assertTenancyAccess, assertTenancyLandlord } from "../access/access.js";
import { attachmentDto, attachmentSelect, claimAttachments } from "../attachments/service.js";
import { createCharge } from "../charges/service.js";
import { postSystemMessage } from "../messages/system.js";

type Db = PrismaClient | Prisma.TransactionClient;

const MAX_SETTLEMENT_FILES = 20;

const AdvancesBody = z.object({
  items: z
    .array(z.object({ costType: costType.exclude(["RENT"]), amountCents: positiveCents }))
    .max(11)
    .refine((items) => new Set(items.map((i) => i.costType)).size === items.length, "DUPLICATE_COST_TYPE"),
});
const PeriodBody = z
  .object({ periodFrom: dateOnly, periodTo: dateOnly })
  .refine((b) => b.periodTo >= b.periodFrom, { message: "END_BEFORE_START", path: ["periodTo"] });
const PatchBody = z
  .object({
    periodFrom: dateOnly,
    periodTo: dateOnly,
    note: optionalText(1000),
    dueDate: dateOnly.nullable(),
    lines: z
      .array(z.object({ costType: costType.exclude(["RENT"]), actualCents: cents, note: optionalText(200) }))
      .max(11)
      .refine((items) => new Set(items.map((i) => i.costType)).size === items.length, "DUPLICATE_COST_TYPE"),
  })
  .partial();
const DisputeBody = z.object({ reason: text(1000) });
const RefundedBody = z.object({ refundedOn: dateOnly });
const AttachBody = z.object({ attachmentIds: z.array(idParam).min(1).max(10) });

/** Advances charged per cost type in a period – from the lines of ADVANCE charges (paid or not: each is its own obligation). */
async function advancesInPeriod(db: Db, tenancyId: string, from: Date, to: Date): Promise<Map<CostType, number>> {
  const rows = await db.chargeLine.groupBy({
    by: ["costType"],
    where: { charge: { tenancyId, type: "ADVANCE", deletedAt: null, dueDate: { gte: from, lte: to } } },
    _sum: { amountCents: true },
  });
  return new Map(rows.map((r) => [r.costType, r._sum.amountCents ?? 0]));
}

/** Recomputes the advances of every line (the period may have changed, advances may have been added). */
async function refreshAdvances(db: Db, settlementId: string) {
  const s = await db.costSettlement.findUniqueOrThrow({ where: { id: settlementId }, include: { lines: true } });
  const adv = await advancesInPeriod(db, s.tenancyId, s.periodFrom, s.periodTo);
  for (const line of s.lines) {
    const advanceCents = adv.get(line.costType) ?? 0;
    if (advanceCents !== line.advanceCents) await db.settlementLine.update({ where: { id: line.id }, data: { advanceCents } });
  }
}

const settlementInclude = {
  lines: { orderBy: { sortOrder: "asc" }, select: { id: true, costType: true, advanceCents: true, actualCents: true, note: true } },
  attachments: attachmentSelect,
  charge: { select: { id: true, status: true } },
} satisfies Prisma.CostSettlementInclude;

async function settlementDto(s: Prisma.CostSettlementGetPayload<{ include: typeof settlementInclude }>) {
  const totals = settlementTotals(s.lines);
  // An overpayment is returned to the tenants in the tenancy's usual split.
  let refundByMember: { memberId: string; name: string; amountCents: number }[] = [];
  if (totals.balanceCents < 0) {
    const tenancy = await prisma.tenancy.findUniqueOrThrow({
      where: { id: s.tenancyId },
      select: { splitMethod: true, members: { where: { deletedAt: null, leftAt: null }, orderBy: { joinedAt: "asc" }, include: { user: { select: { name: true, email: true } } } } },
    });
    try {
      const parts = splitAmount(-totals.balanceCents, tenancy.members, tenancy.splitMethod);
      refundByMember = tenancy.members.map((m) => ({ memberId: m.id, name: m.user.name ?? m.user.email, amountCents: parts.get(m.id)! }));
    } catch (err) {
      if (!(err instanceof SplitError)) throw err;
    }
  }
  return { ...s, attachments: s.attachments.map(attachmentDto), totals, refundByMember };
}

async function loadSettlement(id: string, userId: string) {
  const s = await prisma.costSettlement.findFirst({ where: { id, deletedAt: null }, include: settlementInclude });
  if (!s) throw notFound();
  const access = await assertTenancyAccess(userId, s.tenancyId);
  // Drafts are the landlord's working copy.
  if (access.role === "TENANT" && s.status === "DRAFT") throw notFound();
  return { s, access };
}

export function settlementsRouter(): Router {
  const router = Router();

  // ---------- Monthly advances ----------

  router.get("/tenancies/:id/advances", async (req, res) => {
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyAccess(authUserId(req), tenancyId);
    const advances = await prisma.costAdvance.findMany({
      where: { tenancyId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, costType: true, amountCents: true },
    });
    res.json({ advances, totalCents: advances.reduce((s, a) => s + a.amountCents, 0) });
  });

  /** Replaces the set of monthly advances; from the next month on they are charged together, once a month. */
  router.put("/tenancies/:id/advances", validateBody(AdvancesBody), async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyLandlord(userId, tenancyId);
    const body = req.body as z.infer<typeof AdvancesBody>;
    await prisma.$transaction(async (tx) => {
      const current = await tx.costAdvance.findMany({ where: { tenancyId, deletedAt: null } });
      const now = new Date();
      for (const a of current) {
        const next = body.items.find((i) => i.costType === a.costType);
        if (!next) await tx.costAdvance.update({ where: { id: a.id }, data: { deletedAt: now } });
        else if (next.amountCents !== a.amountCents) await tx.costAdvance.update({ where: { id: a.id }, data: { amountCents: next.amountCents } });
      }
      for (const i of body.items.filter((i) => !current.some((a) => a.costType === i.costType))) {
        await tx.costAdvance.create({ data: { tenancyId, costType: i.costType, amountCents: i.amountCents } });
      }
      await audit(
        { actorId: userId, entityType: "Tenancy", entityId: tenancyId, action: "advances", before: current.map((a) => ({ costType: a.costType, amountCents: a.amountCents })), after: body.items, ip: req.ip },
        tx,
      );
    });
    bus.emit("tenancy.changed", { tenancyId, what: "contract" });
    const advances = await prisma.costAdvance.findMany({ where: { tenancyId, deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, costType: true, amountCents: true } });
    res.json({ advances, totalCents: advances.reduce((s, a) => s + a.amountCents, 0) });
  });

  // ---------- Settlements ----------

  router.get("/tenancies/:id/settlements", async (req, res) => {
    const tenancyId = idParam.parse(req.params.id);
    const access = await assertTenancyAccess(authUserId(req), tenancyId);
    const rows = await prisma.costSettlement.findMany({
      where: { tenancyId, deletedAt: null, ...(access.role === "TENANT" ? { status: { not: "DRAFT" } } : {}) },
      orderBy: { periodTo: "desc" },
      include: { lines: { select: { advanceCents: true, actualCents: true } } },
    });
    res.json({
      settlements: rows.map(({ lines, ...s }) => ({ id: s.id, periodFrom: s.periodFrom, periodTo: s.periodTo, status: s.status, sentAt: s.sentAt, refundedOn: s.refundedOn, totals: settlementTotals(lines) })),
    });
  });

  /** New draft for a period, with one line per cost type that had advances (or has one now). */
  router.post("/tenancies/:id/settlements", validateBody(PeriodBody), async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyLandlord(userId, tenancyId);
    const body = req.body as z.infer<typeof PeriodBody>;
    const id = await prisma.$transaction(async (tx) => {
      const adv = await advancesInPeriod(tx, tenancyId, body.periodFrom, body.periodTo);
      const active = await tx.costAdvance.findMany({ where: { tenancyId, deletedAt: null }, select: { costType: true } });
      // Always in the same order, so the settlement reads the same every year.
      const types = COST_TYPES.filter((t) => adv.has(t) || active.some((a) => a.costType === t));
      const s = await tx.costSettlement.create({
        data: {
          tenancyId,
          periodFrom: body.periodFrom,
          periodTo: body.periodTo,
          createdById: userId,
          lines: { create: types.map((t, i) => ({ costType: t, advanceCents: adv.get(t) ?? 0, actualCents: 0, sortOrder: i })) },
        },
      });
      await audit({ actorId: userId, entityType: "CostSettlement", entityId: s.id, action: "create", after: { periodFrom: body.periodFrom, periodTo: body.periodTo }, ip: req.ip }, tx);
      return s.id;
    });
    const { s } = await loadSettlement(id, userId);
    res.status(201).json({ settlement: await settlementDto(s) });
  });

  router.get("/settlements/:id", async (req, res) => {
    const userId = authUserId(req);
    const { s, access } = await loadSettlement(idParam.parse(req.params.id), userId);
    res.json({ settlement: await settlementDto(s), access: access.role });
  });

  router.patch("/settlements/:id", validateBody(PatchBody), async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    const body = req.body as z.infer<typeof PatchBody>;
    const existing = await prisma.costSettlement.findFirst({ where: { id, deletedAt: null }, include: { lines: true } });
    if (!existing) throw notFound();
    await assertTenancyLandlord(userId, existing.tenancyId);
    if (existing.status !== "DRAFT" && existing.status !== "DISPUTED") throw badRequest("SETTLEMENT_LOCKED");
    const from = body.periodFrom ?? existing.periodFrom;
    const to = body.periodTo ?? existing.periodTo;
    if (to < from) throw badRequest("END_BEFORE_START");

    await prisma.$transaction(async (tx) => {
      await tx.costSettlement.update({
        where: { id },
        data: {
          periodFrom: from,
          periodTo: to,
          ...(body.note !== undefined ? { note: body.note } : {}),
          ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
        },
      });
      if (body.lines) {
        await tx.settlementLine.deleteMany({ where: { settlementId: id } });
        await tx.settlementLine.createMany({
          data: body.lines.map((l, i) => ({ settlementId: id, costType: l.costType, advanceCents: 0, actualCents: l.actualCents, note: l.note ?? null, sortOrder: i })),
        });
      }
      await refreshAdvances(tx, id);
      const after = await tx.settlementLine.findMany({ where: { settlementId: id } });
      await audit(
        {
          actorId: userId,
          entityType: "CostSettlement",
          entityId: id,
          action: "update",
          before: { periodFrom: existing.periodFrom, periodTo: existing.periodTo, totals: settlementTotals(existing.lines) },
          after: { periodFrom: from, periodTo: to, totals: settlementTotals(after) },
          ip: req.ip,
        },
        tx,
      );
    });
    const { s } = await loadSettlement(id, userId);
    res.json({ settlement: await settlementDto(s) });
  });

  router.delete("/settlements/:id", async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    const existing = await prisma.costSettlement.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw notFound();
    await assertTenancyLandlord(userId, existing.tenancyId);
    if (existing.status !== "DRAFT") throw badRequest("SETTLEMENT_LOCKED");
    await prisma.costSettlement.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit({ actorId: userId, entityType: "CostSettlement", entityId: id, action: "delete", ip: req.ip });
    res.status(204).end();
  });

  // ---------- Transitions ----------

  async function transition(
    req: Parameters<Parameters<typeof router.post>[1]>[0],
    action: SettlementAction,
    extra: (s: { id: string; tenancyId: string; dueDate: Date | null; periodFrom: Date; periodTo: Date }, balanceCents: number, tx: Prisma.TransactionClient, userId: string) => Promise<Prisma.CostSettlementUpdateInput>,
  ) {
    const userId = authUserId(req);
    const id = idParam.parse(req.params["id"]);
    const result = await prisma.$transaction(async (tx) => {
      const s = await tx.costSettlement.findFirst({ where: { id, deletedAt: null }, include: { lines: true } });
      if (!s) throw notFound();
      const access = await assertTenancyAccess(userId, s.tenancyId);
      if (access.role === "TENANT" && s.status === "DRAFT") throw notFound();
      if (action === "send") await refreshAdvances(tx, id);
      const lines = action === "send" ? await tx.settlementLine.findMany({ where: { settlementId: id } }) : s.lines;
      const { balanceCents } = settlementTotals(lines);
      let next;
      try {
        next = nextSettlementStatus(s.status, action, { actor: access.role, balanceCents });
      } catch (err) {
        if (err instanceof SettlementTransitionError) throw badRequest("TRANSITION_NOT_ALLOWED");
        throw err;
      }
      const data = await extra(s, balanceCents, tx, userId);
      await tx.costSettlement.update({ where: { id }, data: { ...data, status: next } });
      await audit({ actorId: userId, entityType: "CostSettlement", entityId: id, action, before: { status: s.status }, after: { status: next, balanceCents }, ip: req.ip }, tx);
      return { s, balanceCents, next };
    });
    bus.emit("tenancy.changed", { tenancyId: result.s.tenancyId, what: "contract" });
    return { ...result, userId };
  }

  router.post("/settlements/:id/send", async (req, res) => {
    const r = await transition(req, "send", async (s, balanceCents, tx) => {
      const lineCount = await tx.settlementLine.count({ where: { settlementId: s.id } });
      if (!lineCount) throw badRequest("SETTLEMENT_EMPTY");
      if (balanceCents > 0 && !s.dueDate) throw badRequest("DUE_DATE_REQUIRED");
      return { sentAt: new Date(), disputeReason: null, respondedAt: null };
    });
    await postSystemMessage(prisma, r.s.tenancyId, "SETTLEMENT_SENT", { balanceCents: r.balanceCents, from: toDateOnly(r.s.periodFrom), to: toDateOnly(r.s.periodTo) });
    bus.emit("contract.activity", { tenancyId: r.s.tenancyId, actorId: r.userId, kind: "settlement.sent", settlementId: r.s.id, periodFrom: r.s.periodFrom, periodTo: r.s.periodTo, balanceCents: r.balanceCents });
    const { s } = await loadSettlement(r.s.id, r.userId);
    res.json({ settlement: await settlementDto(s) });
  });

  /** Tenant agrees. If they owe the difference, it becomes a charge with UPN QR like any other. */
  router.post("/settlements/:id/accept", async (req, res) => {
    const r = await transition(req, "accept", async (s, balanceCents, tx) => {
      const data: Prisma.CostSettlementUpdateInput = { respondedAt: new Date() };
      if (balanceCents > 0) {
        const lines = await tx.settlementLine.findMany({ where: { settlementId: s.id }, orderBy: { sortOrder: "asc" } });
        const from = toDateOnly(s.periodFrom);
        const to = toDateOnly(s.periodTo);
        const charge = await createCharge(
          tx,
          s.tenancyId,
          {
            type: "SETTLEMENT",
            costType: null,
            title: `Poračun stroškov ${from.split("-").reverse().join(". ")} – ${to.split("-").reverse().join(". ")}`,
            amountCents: balanceCents,
            dueDate: s.dueDate ?? addDays(todayInLjubljana(), 14),
            autoKey: `settlement:${from}:${to}:${s.id}`,
            payTo: "LANDLORD",
            purposeCode: "OTHR",
            purpose: `Poračun stroškov ${from.slice(0, 4)}`,
            lines: lines.filter((l) => l.actualCents !== l.advanceCents).map((l) => ({ costType: l.costType, amountCents: l.actualCents - l.advanceCents })),
          },
          // Created by the system on the tenant's acceptance, so every tenant gets the usual "new charge" notice.
          null,
        );
        data.charge = { connect: { id: charge.id } };
      }
      return data;
    });
    await postSystemMessage(prisma, r.s.tenancyId, "SETTLEMENT_ACCEPTED", { balanceCents: r.balanceCents });
    bus.emit("contract.activity", { tenancyId: r.s.tenancyId, actorId: r.userId, kind: "settlement.accepted", settlementId: r.s.id });
    const { s } = await loadSettlement(r.s.id, r.userId);
    res.json({ settlement: await settlementDto(s) });
  });

  router.post("/settlements/:id/dispute", validateBody(DisputeBody), async (req, res) => {
    const body = req.body as z.infer<typeof DisputeBody>;
    const r = await transition(req, "dispute", async () => ({ disputeReason: body.reason, respondedAt: new Date() }));
    await postSystemMessage(prisma, r.s.tenancyId, "SETTLEMENT_DISPUTED", { reason: body.reason });
    bus.emit("contract.activity", { tenancyId: r.s.tenancyId, actorId: r.userId, kind: "settlement.disputed", settlementId: r.s.id });
    const { s } = await loadSettlement(r.s.id, r.userId);
    res.json({ settlement: await settlementDto(s) });
  });

  /** Landlord returned an overpayment (outside Kvito). */
  router.post("/settlements/:id/refunded", validateBody(RefundedBody), async (req, res) => {
    const body = req.body as z.infer<typeof RefundedBody>;
    const r = await transition(req, "refunded", async () => ({ refundedOn: body.refundedOn }));
    bus.emit("contract.activity", { tenancyId: r.s.tenancyId, actorId: r.userId, kind: "settlement.refunded", settlementId: r.s.id, refundCents: -r.balanceCents, refundedOn: body.refundedOn });
    const { s } = await loadSettlement(r.s.id, r.userId);
    res.json({ settlement: await settlementDto(s) });
  });

  router.post("/settlements/:id/refund-receipt", async (req, res) => {
    const userId = authUserId(req);
    const { s, access } = await loadSettlement(idParam.parse(req.params.id), userId);
    if (access.role !== "TENANT" || !s.refundedOn || s.refundConfirmedAt) throw badRequest("TRANSITION_NOT_ALLOWED");
    await prisma.costSettlement.update({ where: { id: s.id }, data: { refundConfirmedAt: new Date() } });
    await audit({ actorId: userId, entityType: "CostSettlement", entityId: s.id, action: "refundReceipt", ip: req.ip });
    bus.emit("contract.activity", { tenancyId: s.tenancyId, actorId: userId, kind: "settlement.refundReceipt", settlementId: s.id });
    bus.emit("tenancy.changed", { tenancyId: s.tenancyId, what: "contract" });
    const fresh = await loadSettlement(s.id, userId);
    res.json({ settlement: await settlementDto(fresh.s) });
  });

  // ---------- Bills attached to a settlement ----------

  router.post("/settlements/:id/attachments", validateBody(AttachBody), async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    const body = req.body as z.infer<typeof AttachBody>;
    const existing = await prisma.costSettlement.findFirst({ where: { id, deletedAt: null }, select: { tenancyId: true } });
    if (!existing) throw notFound();
    await assertTenancyLandlord(userId, existing.tenancyId);
    const current = await prisma.attachment.count({ where: { settlementId: id, deletedAt: null } });
    if (current + new Set(body.attachmentIds).size > MAX_SETTLEMENT_FILES) throw badRequest("TOO_MANY_ATTACHMENTS");
    await prisma.$transaction(async (tx) => {
      await claimAttachments(tx, body.attachmentIds, { tenancyId: existing.tenancyId, uploadedById: userId, kinds: ["BILL"], link: { settlementId: id } });
      await audit({ actorId: userId, entityType: "CostSettlement", entityId: id, action: "attach", after: { attachmentIds: body.attachmentIds }, ip: req.ip }, tx);
    });
    bus.emit("tenancy.changed", { tenancyId: existing.tenancyId, what: "contract" });
    const { s } = await loadSettlement(id, userId);
    res.status(201).json({ settlement: await settlementDto(s) });
  });

  router.delete("/settlements/:id/attachments/:attachmentId", async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    const attachmentId = idParam.parse(req.params.attachmentId);
    const existing = await prisma.costSettlement.findFirst({ where: { id, deletedAt: null }, select: { tenancyId: true } });
    if (!existing) throw notFound();
    await assertTenancyLandlord(userId, existing.tenancyId);
    const { count } = await prisma.attachment.updateMany({ where: { id: attachmentId, settlementId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    if (!count) throw notFound();
    await audit({ actorId: userId, entityType: "CostSettlement", entityId: id, action: "detach", before: { attachmentId }, ip: req.ip });
    bus.emit("tenancy.changed", { tenancyId: existing.tenancyId, what: "contract" });
    res.status(204).end();
  });

  return router;
}
