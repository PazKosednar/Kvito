import { Router } from "express";
import { z } from "zod";
import type { CostType, Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { audit } from "../../lib/audit.js";
import { addDays, periodOf, toDateOnly, todayInLjubljana } from "../../lib/dates.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { bus } from "../../lib/events.js";
import { prisma } from "../../lib/prisma.js";
import { monthsBetween, nextPeriod } from "../../lib/costs.js";
import { CreditChoiceRequiredError, SettlementTransitionError, nextSettlementStatus, settlementTotals, type SettlementAction } from "../../lib/settlement.js";
import { SplitError, splitAmount } from "../../lib/split.js";
import { COST_TYPES, dateOnly, idParam, optionalText, positiveCents, costType, text } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { assertTenancyAccess, assertTenancyLandlord } from "../access/access.js";
import { attachmentDto, attachmentSelect, claimAttachments } from "../attachments/service.js";
import { createCharge } from "../charges/service.js";
import { postSystemMessage } from "../messages/system.js";
import { actualByType, costMatrix } from "./costs.js";
import { advanceLineWhere, availableCredit } from "./credit.js";

type Db = PrismaClient | Prisma.TransactionClient;

const MAX_SETTLEMENT_FILES = 20;

const creditChoice = z.enum(["CARRY_OVER", "OFFSET_NEXT", "REFUND"]);

const AdvancesBody = z.object({
  items: z
    .array(z.object({ costType: costType.exclude(["RENT"]), amountCents: positiveCents }))
    .max(11)
    .refine((items) => new Set(items.map((i) => i.costType)).size === items.length, "DUPLICATE_COST_TYPE"),
});
const PeriodBody = z
  .object({ periodFrom: dateOnly, periodTo: dateOnly })
  .refine((b) => b.periodTo >= b.periodFrom, { message: "END_BEFORE_START", path: ["periodTo"] });
/** Amounts come from the monthly cost entries; the settlement itself only carries notes and the period. */
const PatchBody = z
  .object({
    periodFrom: dateOnly,
    periodTo: dateOnly,
    note: optionalText(1000),
    dueDate: dateOnly.nullable(),
    recommendedChoice: creditChoice.nullable(),
    lines: z
      .array(z.object({ costType: costType.exclude(["RENT"]), note: optionalText(200) }))
      .max(11)
      .refine((items) => new Set(items.map((i) => i.costType)).size === items.length, "DUPLICATE_COST_TYPE"),
  })
  .partial();
const AcceptBody = z.object({ creditChoice: creditChoice.optional() });
const DisputeBody = z.object({ reason: text(1000) });
const RefundedBody = z.object({ refundedOn: dateOnly });
const AttachBody = z.object({ attachmentIds: z.array(idParam).min(1).max(10) });

/** Advances charged per cost type in a period (paid or not: each monthly charge is its own obligation). */
async function advancesInPeriod(db: Db, tenancyId: string, from: Date, to: Date): Promise<Map<CostType, number>> {
  const rows = await db.chargeLine.groupBy({ by: ["costType"], where: advanceLineWhere(tenancyId, from, to), _sum: { amountCents: true } });
  return new Map(rows.map((r) => [r.costType, r._sum.amountCents ?? 0]));
}

/**
 * Rebuilds the lines from the charged advances and the monthly cost entries of the period: one line per cost type
 * that has either (or an advance set up now), in the fixed order. Notes stay with their cost type.
 */
async function refreshLines(db: Db, settlementId: string, notes?: Map<CostType, string | null>) {
  const s = await db.costSettlement.findUniqueOrThrow({ where: { id: settlementId }, include: { lines: true } });
  const [adv, actual, active] = await Promise.all([
    advancesInPeriod(db, s.tenancyId, s.periodFrom, s.periodTo),
    actualByType(db, s.tenancyId, s.periodFrom, s.periodTo),
    db.costAdvance.findMany({ where: { tenancyId: s.tenancyId, deletedAt: null }, select: { costType: true } }),
  ]);
  const keptNotes = new Map(s.lines.map((l) => [l.costType, l.note]));
  for (const [t, n] of notes ?? []) keptNotes.set(t, n);
  const types = COST_TYPES.filter((t) => adv.has(t) || actual.has(t) || active.some((a) => a.costType === t));
  await db.settlementLine.deleteMany({ where: { settlementId } });
  await db.settlementLine.createMany({
    data: types.map((t, i) => ({ settlementId, costType: t, advanceCents: adv.get(t) ?? 0, actualCents: actual.get(t) ?? 0, note: keptNotes.get(t) ?? null, sortOrder: i })),
  });
}

const CARRIED_IN_LABEL = "Dobroimetje iz prejšnjega obračuna";

/** On sending, the settlement takes over whatever credit earlier settlements still hold (added on a re-send). */
async function takeCarryIn(tx: Prisma.TransactionClient, tenancyId: string, settlementId: string, userId: string) {
  const sources = await tx.costSettlement.findMany({
    where: { tenancyId, deletedAt: null, status: "CLOSED", creditRemainingCents: { gt: 0 }, id: { not: settlementId } },
    select: { id: true, creditRemainingCents: true },
  });
  if (!sources.length) return;
  const total = sources.reduce((s, c) => s + c.creditRemainingCents, 0);
  for (const src of sources) {
    await tx.costSettlement.update({ where: { id: src.id }, data: { creditRemainingCents: 0 } });
    await audit({ actorId: userId, entityType: "CostSettlement", entityId: src.id, action: "creditCarried", before: { creditRemainingCents: src.creditRemainingCents }, after: { toSettlementId: settlementId } }, tx);
  }
  await tx.costSettlement.update({ where: { id: settlementId }, data: { carriedInCents: { increment: total } } });
}

/** The next monthly payment the credit would reduce: the first month without a rent charge yet. */
async function nextPaymentPreview(tenancyId: string, creditCents: number) {
  const tenancy = await prisma.tenancy.findUniqueOrThrow({
    where: { id: tenancyId },
    select: { rentCents: true, costAdvances: { where: { deletedAt: null }, select: { amountCents: true } } },
  });
  const beforeCents = tenancy.rentCents + tenancy.costAdvances.reduce((s, a) => s + a.amountCents, 0);
  if (beforeCents <= 0) return null;
  let period = periodOf(todayInLjubljana());
  for (let i = 0; i < 3 && (await prisma.charge.count({ where: { tenancyId, rentPeriod: period, deletedAt: null } })); i++) period = nextPeriod(period);
  return { period, beforeCents, afterCents: Math.max(0, beforeCents - creditCents) };
}

const settlementInclude = {
  lines: { orderBy: { sortOrder: "asc" }, select: { id: true, costType: true, advanceCents: true, actualCents: true, note: true } },
  attachments: attachmentSelect,
  charge: { select: { id: true, status: true } },
} satisfies Prisma.CostSettlementInclude;

async function settlementDto(s: Prisma.CostSettlementGetPayload<{ include: typeof settlementInclude }>) {
  const editable = s.status === "DRAFT" || s.status === "DISPUTED";
  // Before sending, show the credit that sending would take over from earlier settlements.
  const carriedInCents = s.carriedInCents + (editable ? await availableCredit(prisma, s.tenancyId, s.id) : 0);
  const totals = settlementTotals(s.lines, carriedInCents);
  const months = await costMatrix(prisma, s.tenancyId, monthsBetween(periodOf(s.periodFrom), periodOf(s.periodTo)));
  const nextPayment = totals.balanceCents < 0 && (s.status === "SENT" || editable) ? await nextPaymentPreview(s.tenancyId, -totals.balanceCents) : null;
  // A credit is returned to the tenants in the tenancy's usual split: the whole credit when they chose a refund,
  // whatever is left of it when the tenancy ends.
  const refundCents = s.creditChoice && s.creditChoice !== "REFUND" ? s.creditRemainingCents : Math.max(0, -totals.balanceCents);
  let refundByMember: { memberId: string; name: string; amountCents: number }[] = [];
  if (refundCents > 0) {
    const tenancy = await prisma.tenancy.findUniqueOrThrow({
      where: { id: s.tenancyId },
      select: { splitMethod: true, members: { where: { deletedAt: null, leftAt: null }, orderBy: { joinedAt: "asc" }, include: { user: { select: { name: true, email: true } } } } },
    });
    try {
      const parts = splitAmount(refundCents, tenancy.members, tenancy.splitMethod);
      refundByMember = tenancy.members.map((m) => ({ memberId: m.id, name: m.user.name ?? m.user.email, amountCents: parts.get(m.id)! }));
    } catch (err) {
      if (!(err instanceof SplitError)) throw err;
    }
  }
  return {
    ...s,
    carriedInCents,
    attachments: s.attachments.map(attachmentDto),
    totals,
    refundCents,
    refundByMember,
    months: months.months,
    monthCostTypes: months.costTypes,
    nextPayment,
  };
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
      settlements: rows.map(({ lines, ...s }) => ({
        id: s.id,
        periodFrom: s.periodFrom,
        periodTo: s.periodTo,
        status: s.status,
        sentAt: s.sentAt,
        refundedOn: s.refundedOn,
        creditChoice: s.creditChoice,
        creditRemainingCents: s.creditRemainingCents,
        totals: settlementTotals(lines, s.carriedInCents),
      })),
    });
  });

  /** New draft for a period: lines from the advances charged and the monthly cost entries. */
  router.post("/tenancies/:id/settlements", validateBody(PeriodBody), async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyLandlord(userId, tenancyId);
    const body = req.body as z.infer<typeof PeriodBody>;
    const id = await prisma.$transaction(async (tx) => {
      const s = await tx.costSettlement.create({
        data: { tenancyId, periodFrom: body.periodFrom, periodTo: body.periodTo, createdById: userId },
      });
      await refreshLines(tx, s.id);
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
          ...(body.recommendedChoice !== undefined ? { recommendedChoice: body.recommendedChoice } : {}),
        },
      });
      await refreshLines(tx, id, body.lines ? new Map(body.lines.map((l) => [l.costType, l.note ?? null])) : undefined);
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
    extra: (
      s: { id: string; tenancyId: string; dueDate: Date | null; periodFrom: Date; periodTo: Date; carriedInCents: number },
      balanceCents: number,
      tx: Prisma.TransactionClient,
      userId: string,
    ) => Promise<Prisma.CostSettlementUpdateInput>,
    opts: { creditChoice?: "CARRY_OVER" | "OFFSET_NEXT" | "REFUND" | undefined } = {},
  ) {
    const userId = authUserId(req);
    const id = idParam.parse(req.params["id"]);
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.costSettlement.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw notFound();
      const access = await assertTenancyAccess(userId, before.tenancyId);
      if (access.role === "TENANT" && before.status === "DRAFT") throw notFound();
      if (action === "send" && (before.status === "DRAFT" || before.status === "DISPUTED")) {
        await refreshLines(tx, id);
        await takeCarryIn(tx, before.tenancyId, id, userId);
      }
      const s = await tx.costSettlement.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      const { balanceCents } = settlementTotals(s.lines, s.carriedInCents);
      let next;
      try {
        next = nextSettlementStatus(s.status, action, { actor: access.role, balanceCents, creditChoice: opts.creditChoice ?? null });
      } catch (err) {
        if (err instanceof SettlementTransitionError) throw badRequest("TRANSITION_NOT_ALLOWED");
        if (err instanceof CreditChoiceRequiredError) throw badRequest("CREDIT_CHOICE_REQUIRED");
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

  /**
   * Tenant agrees. If they owe the difference, it becomes a charge with UPN QR like any other. If they are in credit,
   * they choose: keep it until the next settlement, have it deducted from the next payments, or get it back.
   */
  router.post("/settlements/:id/accept", validateBody(AcceptBody), async (req, res) => {
    const body = req.body as z.infer<typeof AcceptBody>;
    const r = await transition(
      req,
      "accept",
      async (s, balanceCents, tx) => {
      const data: Prisma.CostSettlementUpdateInput = { respondedAt: new Date() };
      if (balanceCents < 0 && body.creditChoice) {
        data.creditChoice = body.creditChoice;
        data.creditRemainingCents = body.creditChoice === "REFUND" ? 0 : -balanceCents;
      }
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
            lines: [
              ...lines.filter((l) => l.actualCents !== l.advanceCents).map((l) => ({ costType: l.costType, amountCents: l.actualCents - l.advanceCents })),
              ...(s.carriedInCents > 0 ? [{ costType: "OTHER" as const, label: CARRIED_IN_LABEL, amountCents: -s.carriedInCents }] : []),
            ],
          },
          // Created by the system on the tenant's acceptance, so every tenant gets the usual "new charge" notice.
          null,
        );
        data.charge = { connect: { id: charge.id } };
      }
      return data;
      },
      { creditChoice: body.creditChoice },
    );
    if (r.balanceCents < 0 && body.creditChoice) {
      await audit({ actorId: r.userId, entityType: "CostSettlement", entityId: r.s.id, action: "creditChoice", after: { creditChoice: body.creditChoice, cents: -r.balanceCents }, ip: req.ip });
    }
    if (r.balanceCents < 0 && body.creditChoice) {
      await postSystemMessage(prisma, r.s.tenancyId, `SETTLEMENT_CREDIT_${body.creditChoice}`, { amountCents: -r.balanceCents });
    } else {
      await postSystemMessage(prisma, r.s.tenancyId, "SETTLEMENT_ACCEPTED", { balanceCents: r.balanceCents });
    }
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

  /**
   * Landlord returned money (outside Kvito): the overpayment the tenant asked back, or – typically when the tenancy
   * ends – the credit that is still left from a settlement.
   */
  router.post("/settlements/:id/refunded", validateBody(RefundedBody), async (req, res) => {
    const body = req.body as z.infer<typeof RefundedBody>;
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    const current = await prisma.costSettlement.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw notFound();
    if (current.status === "CLOSED" && current.creditRemainingCents > 0) {
      await assertTenancyLandlord(userId, current.tenancyId);
      const refundCents = await prisma.$transaction(async (tx) => {
        // Re-read inside the transaction: the monthly job may have used part of the credit meanwhile.
        const s = await tx.costSettlement.findUniqueOrThrow({ where: { id } });
        if (s.creditRemainingCents <= 0) throw badRequest("TRANSITION_NOT_ALLOWED");
        await tx.costSettlement.update({ where: { id }, data: { creditRemainingCents: 0, refundedOn: body.refundedOn, refundConfirmedAt: null } });
        await audit({ actorId: userId, entityType: "CostSettlement", entityId: id, action: "creditRefunded", before: { creditRemainingCents: s.creditRemainingCents }, after: { refundedOn: body.refundedOn }, ip: req.ip }, tx);
        return s.creditRemainingCents;
      });
      bus.emit("tenancy.changed", { tenancyId: current.tenancyId, what: "contract" });
      bus.emit("contract.activity", { tenancyId: current.tenancyId, actorId: userId, kind: "settlement.refunded", settlementId: id, refundCents, refundedOn: body.refundedOn });
      const { s } = await loadSettlement(id, userId);
      res.json({ settlement: await settlementDto(s) });
      return;
    }
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
