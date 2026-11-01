import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { audit } from "../../lib/audit.js";
import { DepositTransitionError, depositReturn, nextDepositStatus, type DepositAction } from "../../lib/deposit-status.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { bus } from "../../lib/events.js";
import { prisma } from "../../lib/prisma.js";
import { DEPOSIT_PURPOSE_CODE } from "../../lib/purpose-codes.js";
import { splitProportional } from "../../lib/split.js";
import { dateOnly, idParam, optionalText, positiveCents, text } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { assertTenancyAccess, assertTenancyLandlord } from "../access/access.js";
import { createCharge } from "../charges/service.js";
import { postSystemMessage } from "../messages/system.js";

const RequestBody = z.object({ dueDate: dateOnly });
const ReceivedBody = z.object({ receivedOn: dateOnly });
const ProposalBody = z.object({
  deductions: z
    .array(z.object({ reason: text(200), amountCents: positiveCents, handoverItemId: idParam.nullable().optional() }))
    .max(30),
  note: optionalText(1000),
});
const DisputeBody = z.object({ reason: text(1000) });
const ReturnedBody = z.object({ returnedOn: dateOnly });

const depositInclude = {
  charge: { select: { id: true, status: true, shares: { where: { deletedAt: null }, select: { memberId: true, amountCents: true, status: true } } } },
  deductions: {
    orderBy: { sortOrder: "asc" },
    select: { id: true, reason: true, amountCents: true, handoverItem: { select: { id: true, room: true, name: true, condition: true } } },
  },
} satisfies Prisma.DepositInclude;

type DepositRow = Prisma.DepositGetPayload<{ include: typeof depositInclude }>;

/**
 * What each person gets back: in proportion to what they paid on the deposit charge, or equally among the
 * current tenants when the deposit was received outside Kvito. Shown as guidance; people can agree otherwise.
 */
async function returnByMember(tenancyId: string, d: DepositRow) {
  if (d.returnCents == null) return [];
  const paid = d.charge?.shares.filter((s) => s.status === "CONFIRMED") ?? [];
  const memberIds = paid.length ? paid.map((s) => s.memberId) : (await prisma.tenancyMember.findMany({ where: { tenancyId, deletedAt: null, leftAt: null }, select: { id: true } })).map((m) => m.id);
  if (!memberIds.length) return [];
  const members = await prisma.tenancyMember.findMany({ where: { id: { in: memberIds } }, select: { id: true, user: { select: { name: true, email: true } } } });
  const parts = splitProportional(d.returnCents, paid.length ? paid.map((s) => s.amountCents) : memberIds.map(() => 1));
  return memberIds.map((id, i) => {
    const m = members.find((x) => x.id === id);
    return { memberId: id, name: m?.user.name ?? m?.user.email ?? "", amountCents: parts[i]! };
  });
}

async function loadState(tenancyId: string, isLandlord: boolean) {
  const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId }, select: { depositCents: true, rentCents: true } });
  const d = await prisma.deposit.findUnique({ where: { tenancyId }, include: depositInclude });
  // Damaged or missing items from the move-out record are the natural reasons to keep part of a deposit.
  const damagedItems = isLandlord
    ? await prisma.handoverItem.findMany({
        where: { deletedAt: null, condition: { in: ["DAMAGED", "MISSING"] }, handover: { tenancyId, kind: "MOVE_OUT", deletedAt: null } },
        select: { id: true, room: true, name: true, condition: true, note: true },
        orderBy: { sortOrder: "asc" },
      })
    : [];
  return {
    agreedCents: tenancy.depositCents,
    rentCents: tenancy.rentCents,
    deposit: d
      ? {
          id: d.id,
          amountCents: d.amountCents,
          status: d.status,
          charge: d.charge ? { id: d.charge.id, status: d.charge.status } : null,
          receivedOn: d.receivedOn,
          returnCents: d.returnCents,
          keptCents: d.returnCents == null ? null : d.amountCents - d.returnCents,
          proposalNote: d.proposalNote,
          proposedAt: d.proposedAt,
          disputeReason: d.disputeReason,
          agreedAt: d.agreedAt,
          returnedOn: d.returnedOn,
          receiptConfirmedAt: d.receiptConfirmedAt,
          deductions: d.deductions,
          returnByMember: await returnByMember(tenancyId, d),
        }
      : null,
    damagedItems,
  };
}

export function depositRouter(): Router {
  const router = Router();

  router.get("/tenancies/:id/deposit", async (req, res) => {
    const tenancyId = idParam.parse(req.params.id);
    const access = await assertTenancyAccess(authUserId(req), tenancyId);
    res.json(await loadState(tenancyId, access.role === "LANDLORD"));
  });

  /** Landlord asks for the agreed deposit: a DEPOSIT charge with UPN QR, like any other payment. */
  router.post("/tenancies/:id/deposit/request", validateBody(RequestBody), async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyLandlord(userId, tenancyId);
    const body = req.body as z.infer<typeof RequestBody>;
    await prisma.$transaction(async (tx) => {
      const tenancy = await tx.tenancy.findUniqueOrThrow({ where: { id: tenancyId }, select: { depositCents: true } });
      if (!tenancy.depositCents) throw badRequest("DEPOSIT_NOT_AGREED");
      if (await tx.deposit.findUnique({ where: { tenancyId } })) throw badRequest("DEPOSIT_EXISTS");
      const charge = await createCharge(
        tx,
        tenancyId,
        { type: "DEPOSIT", costType: null, title: "Varščina", amountCents: tenancy.depositCents, dueDate: body.dueDate, payTo: "LANDLORD", purposeCode: DEPOSIT_PURPOSE_CODE, purpose: "Varščina" },
        userId,
      );
      const deposit = await tx.deposit.create({ data: { tenancyId, amountCents: tenancy.depositCents, status: "AWAITING_PAYMENT", chargeId: charge.id } });
      await audit({ actorId: userId, entityType: "Deposit", entityId: deposit.id, action: "request", after: { amountCents: deposit.amountCents, chargeId: charge.id }, ip: req.ip }, tx);
    });
    bus.emit("tenancy.changed", { tenancyId, what: "contract" });
    res.status(201).json(await loadState(tenancyId, true));
  });

  /** The deposit was paid before the tenancy came to Kvito (e.g. in cash at signing). */
  router.post("/tenancies/:id/deposit/received", validateBody(ReceivedBody), async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyLandlord(userId, tenancyId);
    const body = req.body as z.infer<typeof ReceivedBody>;
    await prisma.$transaction(async (tx) => {
      const tenancy = await tx.tenancy.findUniqueOrThrow({ where: { id: tenancyId }, select: { depositCents: true } });
      if (!tenancy.depositCents) throw badRequest("DEPOSIT_NOT_AGREED");
      if (await tx.deposit.findUnique({ where: { tenancyId } })) throw badRequest("DEPOSIT_EXISTS");
      const deposit = await tx.deposit.create({ data: { tenancyId, amountCents: tenancy.depositCents, status: "HELD", receivedOn: body.receivedOn } });
      await audit({ actorId: userId, entityType: "Deposit", entityId: deposit.id, action: "received", after: { amountCents: deposit.amountCents, receivedOn: body.receivedOn }, ip: req.ip }, tx);
    });
    bus.emit("tenancy.changed", { tenancyId, what: "contract" });
    res.status(201).json(await loadState(tenancyId, true));
  });

  /** Withdraw a deposit request that nobody has paid yet. */
  router.delete("/tenancies/:id/deposit", async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyLandlord(userId, tenancyId);
    await prisma.$transaction(async (tx) => {
      const d = await tx.deposit.findUnique({ where: { tenancyId }, include: { charge: { include: { shares: { where: { deletedAt: null } } } } } });
      if (!d) throw notFound();
      if (d.status !== "AWAITING_PAYMENT" || d.charge?.shares.some((s) => s.status === "CONFIRMED" || s.status === "REPORTED_PAID")) throw badRequest("DEPOSIT_LOCKED");
      if (d.chargeId) {
        const now = new Date();
        await tx.chargeShare.updateMany({ where: { chargeId: d.chargeId }, data: { deletedAt: now } });
        await tx.charge.update({ where: { id: d.chargeId }, data: { deletedAt: now } });
      }
      await tx.deposit.delete({ where: { id: d.id } });
      await audit({ actorId: userId, entityType: "Deposit", entityId: d.id, action: "delete", before: { amountCents: d.amountCents, status: d.status }, ip: req.ip }, tx);
    });
    bus.emit("tenancy.changed", { tenancyId, what: "charges" });
    res.status(204).end();
  });

  // ---------- Return ----------

  async function transition(
    req: Parameters<Parameters<typeof router.post>[1]>[0],
    action: DepositAction,
    apply: (tx: Prisma.TransactionClient, d: NonNullable<Awaited<ReturnType<typeof prisma.deposit.findUnique>>>, ctx: { userId: string; role: "LANDLORD" | "TENANT" }) => Promise<Prisma.DepositUpdateInput & { returnCents?: number | null }>,
  ) {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params["id"]);
    const access = await assertTenancyAccess(userId, tenancyId);
    const result = await prisma.$transaction(async (tx) => {
      const d = await tx.deposit.findUnique({ where: { tenancyId } });
      if (!d) throw notFound();
      const data = await apply(tx, d, { userId, role: access.role });
      let next;
      try {
        next = nextDepositStatus(d.status, action, { actor: access.role, returnCents: data.returnCents ?? d.returnCents });
      } catch (err) {
        if (err instanceof DepositTransitionError) throw badRequest("TRANSITION_NOT_ALLOWED");
        throw err;
      }
      const updated = await tx.deposit.update({ where: { id: d.id }, data: { ...data, status: next } });
      await audit(
        { actorId: userId, entityType: "Deposit", entityId: d.id, action, before: { status: d.status, returnCents: d.returnCents }, after: { status: next, returnCents: updated.returnCents }, ip: req.ip },
        tx,
      );
      return { tenancyId, before: d, updated };
    });
    bus.emit("tenancy.changed", { tenancyId, what: "contract" });
    return { ...result, userId, isLandlord: access.role === "LANDLORD" };
  }

  router.post("/tenancies/:id/deposit/proposal", validateBody(ProposalBody), async (req, res) => {
    const body = req.body as z.infer<typeof ProposalBody>;
    const r = await transition(req, "propose", async (tx, d) => {
      let totals;
      try {
        totals = depositReturn(d.amountCents, body.deductions);
      } catch (err) {
        if (err instanceof RangeError) throw badRequest(err.message);
        throw err;
      }
      const itemIds = body.deductions.map((x) => x.handoverItemId).filter((x): x is string => !!x);
      if (itemIds.length) {
        const own = await tx.handoverItem.count({ where: { id: { in: itemIds }, deletedAt: null, handover: { tenancyId: d.tenancyId, deletedAt: null } } });
        if (own !== new Set(itemIds).size) throw badRequest("HANDOVER_ITEM_INVALID");
      }
      await tx.depositDeduction.deleteMany({ where: { depositId: d.id } });
      if (body.deductions.length) {
        await tx.depositDeduction.createMany({
          data: body.deductions.map((x, i) => ({ depositId: d.id, reason: x.reason, amountCents: x.amountCents, handoverItemId: x.handoverItemId ?? null, sortOrder: i })),
        });
      }
      return { returnCents: totals.returnCents, proposalNote: body.note ?? null, proposedAt: new Date(), disputeReason: null, agreedAt: null, agreedById: null };
    });
    const kept = r.updated.amountCents - (r.updated.returnCents ?? 0);
    await postSystemMessage(prisma, r.tenancyId, "DEPOSIT_PROPOSED", { returnCents: r.updated.returnCents ?? 0, keptCents: kept });
    bus.emit("contract.activity", { tenancyId: r.tenancyId, actorId: r.userId, kind: "deposit.proposed", returnCents: r.updated.returnCents ?? 0, keptCents: kept });
    res.json(await loadState(r.tenancyId, true));
  });

  router.post("/tenancies/:id/deposit/accept", async (req, res) => {
    const r = await transition(req, "accept", async (_tx, _d, ctx) => ({ agreedAt: new Date(), agreedById: ctx.userId }));
    await postSystemMessage(prisma, r.tenancyId, "DEPOSIT_AGREED", { returnCents: r.updated.returnCents ?? 0 });
    bus.emit("contract.activity", { tenancyId: r.tenancyId, actorId: r.userId, kind: "deposit.agreed" });
    res.json(await loadState(r.tenancyId, false));
  });

  router.post("/tenancies/:id/deposit/dispute", validateBody(DisputeBody), async (req, res) => {
    const body = req.body as z.infer<typeof DisputeBody>;
    const r = await transition(req, "dispute", async () => ({ disputeReason: body.reason }));
    await postSystemMessage(prisma, r.tenancyId, "DEPOSIT_DISPUTED", { reason: body.reason });
    bus.emit("contract.activity", { tenancyId: r.tenancyId, actorId: r.userId, kind: "deposit.disputed" });
    res.json(await loadState(r.tenancyId, false));
  });

  /** The landlord records that the agreed amount was paid back (outside Kvito). */
  router.post("/tenancies/:id/deposit/returned", validateBody(ReturnedBody), async (req, res) => {
    const body = req.body as z.infer<typeof ReturnedBody>;
    const r = await transition(req, "markReturned", async () => ({ returnedOn: body.returnedOn }));
    await postSystemMessage(prisma, r.tenancyId, "DEPOSIT_RETURNED", { returnCents: r.updated.returnCents ?? 0 });
    bus.emit("contract.activity", { tenancyId: r.tenancyId, actorId: r.userId, kind: "deposit.returned", returnCents: r.updated.returnCents ?? 0, returnedOn: body.returnedOn });
    res.json(await loadState(r.tenancyId, true));
  });

  /** A tenant confirms the returned deposit arrived. */
  router.post("/tenancies/:id/deposit/receipt", async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    const access = await assertTenancyAccess(userId, tenancyId);
    if (access.role !== "TENANT") throw badRequest("TRANSITION_NOT_ALLOWED");
    const d = await prisma.deposit.findUnique({ where: { tenancyId } });
    if (!d) throw notFound();
    if (d.status !== "RETURNED" || d.receiptConfirmedAt || !d.returnCents) throw badRequest("TRANSITION_NOT_ALLOWED");
    await prisma.deposit.update({ where: { id: d.id }, data: { receiptConfirmedAt: new Date() } });
    await audit({ actorId: userId, entityType: "Deposit", entityId: d.id, action: "receipt", ip: req.ip });
    bus.emit("contract.activity", { tenancyId, actorId: userId, kind: "deposit.receipt" });
    bus.emit("tenancy.changed", { tenancyId, what: "contract" });
    res.json(await loadState(tenancyId, false));
  });

  return router;
}
