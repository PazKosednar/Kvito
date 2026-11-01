import { Router } from "express";
import { z } from "zod";
import { audit, diff } from "../../lib/audit.js";
import { todayInLjubljana } from "../../lib/dates.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { bus } from "../../lib/events.js";
import { formatIban } from "../../lib/iban.js";
import { prisma } from "../../lib/prisma.js";
import { normalizeReference } from "../../lib/reference.js";
import { SplitError, splitAmount } from "../../lib/split.js";
import { upnQrPng, upnQrSvg } from "../../lib/upnqr.js";
import { costType, dateOnly, iban, idParam, optionalText, positiveCents, text } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import type { EmailSender } from "../../services/email/EmailSender.js";
import { paymentEmail } from "../../services/email/templates.js";
import { assertTenancyAccess, assertTenancyLandlord } from "../access/access.js";
import { claimAttachments } from "../attachments/service.js";
import { chargeDto, chargeInclude, createCharge, paymentData, refreshChargeStatus, transitionShare } from "./service.js";

const reference = z
  .string()
  .transform((v, ctx) => {
    if (!v.trim()) return null;
    const r = normalizeReference(v);
    if (!r) ctx.addIssue({ code: "custom", message: "INVALID_REFERENCE" });
    return r;
  })
  .nullable()
  .optional();

const purposeCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}$/, "INVALID_PURPOSE_CODE")
  .nullable()
  .optional();

const CreateChargeBody = z
  .object({
    type: z.enum(["BILL", "OTHER"]).default("BILL"),
    costType: costType.nullable().default(null),
    title: text(80),
    description: optionalText(1000),
    amountCents: positiveCents,
    dueDate: dateOnly,
    payTo: z.enum(["LANDLORD", "SUPPLIER"]).default("LANDLORD"),
    payeeName: optionalText(33),
    payeeIban: iban.nullable().optional(),
    payeeStreet: optionalText(33),
    payeeCity: optionalText(33),
    reference,
    purposeCode,
    purpose: optionalText(42),
    attachmentIds: z.array(idParam).max(5).optional(),
  })
  .refine((b) => b.payTo === "LANDLORD" || (b.payeeName && b.payeeIban), {
    message: "SUPPLIER_PAYEE_REQUIRED",
    path: ["payeeIban"],
  });

const UpdateChargeBody = z
  .object({
    title: text(80),
    description: optionalText(1000),
    amountCents: positiveCents,
    dueDate: dateOnly,
    reference,
    purposeCode,
    purpose: optionalText(42),
  })
  .partial();

const ReportBody = z.object({
  paidOn: dateOnly.nullable().optional(),
  note: optionalText(500),
  attachmentIds: z.array(idParam).max(3).optional(),
});
const ReasonBody = z.object({ reason: optionalText(500) });
const MAX_CHARGE_FILES = 5;
/** Deposit and settlement charges are changed through their own record (see modules/contract). */
const MANAGED: string[] = ["DEPOSIT", "SETTLEMENT"];
const AttachBody = z.object({ attachmentIds: z.array(idParam).min(1).max(MAX_CHARGE_FILES) });

export function chargesRouter(deps: { emailSender: EmailSender }): Router {
  const router = Router();

  /** Charges of a tenancy + the viewer's summary ("Kvito ✓" when everything is confirmed). */
  router.get("/tenancies/:id/charges", async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    const access = await assertTenancyAccess(userId, tenancyId);
    const charges = await prisma.charge.findMany({
      where: { tenancyId, deletedAt: null },
      include: chargeInclude,
      orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    const relevant = charges.flatMap((c) =>
      c.shares.filter((s) => access.role === "LANDLORD" || s.memberId === access.memberId),
    );
    const sumWhere = (pred: (s: (typeof relevant)[number]) => boolean) =>
      relevant.filter(pred).reduce((sum, s) => sum + s.amountCents, 0);
    res.json({
      charges: charges.map(chargeDto),
      summary: {
        kvita: relevant.length > 0 && relevant.every((s) => s.status === "CONFIRMED"),
        openCents: sumWhere((s) => s.status === "OPEN" || s.status === "OVERDUE" || s.status === "DISPUTED"),
        overdueCents: sumWhere((s) => s.status === "OVERDUE"),
        awaitingConfirmationCents: sumWhere((s) => s.status === "REPORTED_PAID"),
        count: relevant.length,
      },
      access: access.role,
      memberId: access.memberId,
    });
  });

  router.post("/tenancies/:id/charges", validateBody(CreateChargeBody), async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyLandlord(userId, tenancyId);
    const body = req.body as z.infer<typeof CreateChargeBody>;
    const charge = await prisma.$transaction((tx) =>
      createCharge(
        tx,
        tenancyId,
        {
          type: body.type,
          costType: body.costType,
          title: body.title,
          description: body.description ?? null,
          amountCents: body.amountCents,
          dueDate: body.dueDate,
          payTo: body.payTo,
          payeeName: body.payeeName ?? null,
          payeeIban: body.payeeIban ?? null,
          payeeStreet: body.payeeStreet ?? null,
          payeeCity: body.payeeCity ?? null,
          reference: body.reference ?? null,
          purposeCode: body.purposeCode ?? null,
          purpose: body.purpose ?? null,
          ...(body.attachmentIds ? { attachmentIds: body.attachmentIds } : {}),
        },
        userId,
      ),
    );
    const full = await prisma.charge.findUniqueOrThrow({ where: { id: charge.id }, include: chargeInclude });
    res.status(201).json({ charge: chargeDto(full) });
  });

  router.get("/charges/:id", async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    const charge = await prisma.charge.findFirst({ where: { id, deletedAt: null }, include: chargeInclude });
    if (!charge) throw notFound();
    const access = await assertTenancyAccess(userId, charge.tenancyId);
    res.json({ charge: chargeDto(charge), access: access.role, memberId: access.memberId });
  });

  router.patch("/charges/:id", validateBody(UpdateChargeBody), async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    const body = req.body as z.infer<typeof UpdateChargeBody>;
    const existing = await prisma.charge.findFirst({ where: { id, deletedAt: null }, include: { shares: { where: { deletedAt: null } } } });
    if (!existing) throw notFound();
    await assertTenancyLandlord(userId, existing.tenancyId);
    if (MANAGED.includes(existing.type)) throw badRequest("CHARGE_MANAGED");
    if (existing.shares.some((s) => s.status === "CONFIRMED" || s.status === "REPORTED_PAID")) throw badRequest("CHARGE_LOCKED");

    await prisma.$transaction(async (tx) => {
      await tx.charge.update({ where: { id }, data: body });
      if (body.amountCents !== undefined && body.amountCents !== existing.amountCents) {
        const tenancy = await tx.tenancy.findUniqueOrThrow({ where: { id: existing.tenancyId } });
        const members = await tx.tenancyMember.findMany({ where: { id: { in: existing.shares.map((s) => s.memberId) } } });
        let parts: Map<string, number>;
        try {
          parts = splitAmount(body.amountCents, members, tenancy.splitMethod);
        } catch (err) {
          if (err instanceof SplitError) throw badRequest(err.code);
          throw err;
        }
        for (const s of existing.shares) {
          await tx.chargeShare.update({ where: { id: s.id }, data: { amountCents: parts.get(s.memberId)! } });
        }
      }
      if (body.dueDate) {
        const past = body.dueDate < todayInLjubljana();
        await tx.chargeShare.updateMany({
          where: { chargeId: id, status: { in: ["OPEN", "OVERDUE"] } },
          data: { status: past ? "OVERDUE" : "OPEN" },
        });
        await refreshChargeStatus(tx, id);
      }
      const d = diff(existing as unknown as Record<string, unknown>, body as Record<string, unknown>);
      if (d.changed) {
        await audit({ actorId: userId, entityType: "Charge", entityId: id, action: "update", before: d.before, after: d.after, ip: req.ip }, tx);
      }
    });
    bus.emit("tenancy.changed", { tenancyId: existing.tenancyId, what: "charges" });
    const full = await prisma.charge.findUniqueOrThrow({ where: { id }, include: chargeInclude });
    res.json({ charge: chargeDto(full) });
  });

  router.delete("/charges/:id", async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    const existing = await prisma.charge.findFirst({ where: { id, deletedAt: null }, include: { shares: true } });
    if (!existing) throw notFound();
    await assertTenancyLandlord(userId, existing.tenancyId);
    if (MANAGED.includes(existing.type)) throw badRequest("CHARGE_MANAGED");
    if (existing.shares.some((s) => s.status === "CONFIRMED")) throw badRequest("CHARGE_LOCKED");
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.chargeShare.updateMany({ where: { chargeId: id }, data: { deletedAt: now } });
      await tx.charge.update({ where: { id }, data: { deletedAt: now } });
      await audit({ actorId: userId, entityType: "Charge", entityId: id, action: "delete", before: { amountCents: existing.amountCents, status: existing.status }, ip: req.ip }, tx);
    });
    bus.emit("tenancy.changed", { tenancyId: existing.tenancyId, what: "charges" });
    res.status(204).end();
  });

  // ---------- Bill attachments (e.g. a scanned položnica) ----------

  /** Landlord attaches more files to an existing charge, also to automatic rent charges. */
  router.post("/charges/:id/attachments", validateBody(AttachBody), async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    const body = req.body as z.infer<typeof AttachBody>;
    const charge = await prisma.charge.findFirst({ where: { id, deletedAt: null }, select: { tenancyId: true } });
    if (!charge) throw notFound();
    await assertTenancyLandlord(userId, charge.tenancyId);
    const current = await prisma.attachment.count({ where: { chargeId: id, deletedAt: null } });
    if (current + new Set(body.attachmentIds).size > MAX_CHARGE_FILES) throw badRequest("TOO_MANY_ATTACHMENTS");
    await prisma.$transaction(async (tx) => {
      await claimAttachments(tx, body.attachmentIds, {
        tenancyId: charge.tenancyId,
        uploadedById: userId,
        kinds: ["BILL"],
        link: { chargeId: id },
      });
      await audit({ actorId: userId, entityType: "Charge", entityId: id, action: "attach", after: { attachmentIds: body.attachmentIds }, ip: req.ip }, tx);
    });
    bus.emit("tenancy.changed", { tenancyId: charge.tenancyId, what: "charges" });
    const full = await prisma.charge.findUniqueOrThrow({ where: { id }, include: chargeInclude });
    res.status(201).json({ charge: chargeDto(full) });
  });

  router.delete("/charges/:id/attachments/:attachmentId", async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    const attachmentId = idParam.parse(req.params.attachmentId);
    const charge = await prisma.charge.findFirst({ where: { id, deletedAt: null }, select: { tenancyId: true } });
    if (!charge) throw notFound();
    await assertTenancyLandlord(userId, charge.tenancyId);
    const { count } = await prisma.attachment.updateMany({
      where: { id: attachmentId, chargeId: id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!count) throw notFound();
    await audit({ actorId: userId, entityType: "Charge", entityId: id, action: "detach", before: { attachmentId }, ip: req.ip });
    bus.emit("tenancy.changed", { tenancyId: charge.tenancyId, what: "charges" });
    res.status(204).end();
  });

  // ---------- Share actions ----------

  const shareAction =
    (action: "report" | "confirm" | "reject" | "dispute" | "reopen") =>
    async (req: Parameters<Parameters<typeof router.post>[1]>[0], res: Parameters<Parameters<typeof router.post>[1]>[1]) => {
      const userId = authUserId(req);
      const chargeId = idParam.parse(req.params["id"]);
      const shareId = idParam.parse(req.params["shareId"]);
      const charge = await prisma.charge.findFirst({ where: { id: chargeId, deletedAt: null }, select: { tenancyId: true } });
      if (!charge) throw notFound();
      const access = await assertTenancyAccess(userId, charge.tenancyId);
      const body = (req.body ?? {}) as z.infer<typeof ReportBody> & z.infer<typeof ReasonBody>;
      const result = await transitionShare({
        chargeId,
        shareId,
        action,
        actorId: userId,
        role: access.role,
        memberId: access.memberId,
        ip: req.ip,
        ...(action === "report"
          ? { report: { paidOn: body.paidOn ?? null, note: body.note ?? null, ...(body.attachmentIds ? { attachmentIds: body.attachmentIds } : {}) } }
          : {}),
        reason: body.reason ?? null,
      });
      res.json(result);
    };

  router.post("/charges/:id/shares/:shareId/report", validateBody(ReportBody), shareAction("report"));
  router.post("/charges/:id/shares/:shareId/confirm", shareAction("confirm"));
  router.post("/charges/:id/shares/:shareId/reject", validateBody(ReasonBody), shareAction("reject"));
  router.post("/charges/:id/shares/:shareId/dispute", validateBody(ReasonBody), shareAction("dispute"));
  router.post("/charges/:id/shares/:shareId/reopen", shareAction("reopen"));

  // ---------- Payment data: UPN QR + values to copy ----------

  /** Only the share's tenant and the landlord may see payment data. */
  async function loadPayment(req: Parameters<Parameters<typeof router.get>[1]>[0]) {
    const userId = authUserId(req);
    const data = await paymentData(idParam.parse(req.params["id"]), idParam.parse(req.params["shareId"]));
    const access = await assertTenancyAccess(userId, data.tenancyId);
    if (access.role === "TENANT") {
      const own = await prisma.chargeShare.count({ where: { id: data.shareId, memberId: access.memberId ?? "" } });
      if (!own) throw notFound();
    }
    return data;
  }

  router.get("/charges/:id/shares/:shareId/payment", async (req, res) => {
    const data = await loadPayment(req);
    res.json({ payment: { ...data, qrSvg: data.qrText ? upnQrSvg(data.qrText) : null } });
  });

  router.get("/charges/:id/shares/:shareId/payment/qr.png", async (req, res) => {
    const data = await loadPayment(req);
    if (!data.qrText) throw badRequest(data.qrUnavailable ?? "QR_UNAVAILABLE");
    const png = await upnQrPng(data.qrText, 800);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `attachment; filename="kvita-upn-${data.shareId}.png"`);
    res.send(png);
  });

  router.post("/charges/:id/shares/:shareId/payment/email", async (req, res) => {
    const data = await loadPayment(req);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: authUserId(req) } });
    const png = data.qrText ? await upnQrPng(data.qrText, 600) : null;
    await deps.emailSender.send(
      paymentEmail(user.email, {
        title: data.title,
        amountCents: data.amountCents,
        dueDate: data.dueDate,
        payeeName: data.payeeName,
        payeeIban: data.payeeIban ?? formatIban(""),
        reference: data.reference,
        purpose: data.purpose,
        qrPng: png,
      }),
    );
    res.status(202).json({ ok: true, to: user.email });
  });

  return router;
}
