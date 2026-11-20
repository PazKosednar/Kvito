import { Router } from "express";
import { z } from "zod";
import { audit, diff } from "../../lib/audit.js";
import { badRequest } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { cents, costType, dateOnly, iban, idParam, optionalText, splitMethod, text } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { assertTenancyAccess, assertTenancyLandlord, assertUnitOwner } from "../access/access.js";
import { tenancyInclude } from "./dto.js";
import { onTimeMonthsByTenancy } from "../reports/on-time.js";
import { assertUnitWritable } from "../billing/plans.js";

const billingMode = z.enum(["COMBINED", "SEPARATE"]);

const TenancyBody = z
  .object({
    startDate: dateOnly,
    endDate: dateOnly.nullable().optional(),
    rentCents: cents,
    rentDueDay: z.number().int().min(1).max(31),
    depositCents: cents.nullable().optional(),
    payeeName: text(33),
    payeeIban: iban,
    payeeStreet: optionalText(33),
    payeeCity: optionalText(33),
    coveredCosts: z.array(costType).max(12).default([]),
    splitMethod: splitMethod.default("EQUAL"),
    noticePeriodDays: z.number().int().min(1).max(730).nullable().optional(),
    rentReviewMonth: z.number().int().min(1).max(12).nullable().optional(),
    paymentNote: optionalText(120),
    /** New tenancies pay rent and cost advances together by default (pavšal). */
    billingMode: billingMode.default("COMBINED"),
  })
  .refine((b) => !b.endDate || b.endDate >= b.startDate, { message: "END_BEFORE_START", path: ["endDate"] });

const TenancyPatch = z
  .object({
    startDate: dateOnly,
    endDate: dateOnly.nullable(),
    rentCents: cents,
    rentDueDay: z.number().int().min(1).max(31),
    depositCents: cents.nullable(),
    payeeName: text(33),
    payeeIban: iban,
    payeeStreet: optionalText(33),
    payeeCity: optionalText(33),
    coveredCosts: z.array(costType).max(12),
    splitMethod,
    status: z.enum(["ACTIVE", "ENDED"]),
    noticePeriodDays: z.number().int().min(1).max(730).nullable(),
    rentReviewMonth: z.number().int().min(1).max(12).nullable(),
    paymentNote: optionalText(120),
    billingMode,
  })
  .partial();

const MemberPatch = z
  .object({
    shareBasisPoints: z.number().int().min(0).max(10_000).nullable(),
    personCount: z.number().int().min(1).max(20),
    isPrimary: z.boolean(),
  })
  .partial();

export function tenanciesRouter(): Router {
  const router = Router();

  /** Tenancies of the signed-in user in the given role (default: tenant view). */
  router.get("/tenancies", async (req, res) => {
    const userId = authUserId(req);
    const as = req.query["as"] === "LANDLORD" ? "LANDLORD" : "TENANT";
    const tenancies = await prisma.tenancy.findMany({
      where:
        as === "LANDLORD"
          ? { deletedAt: null, unit: { deletedAt: null, property: { ownerId: userId, deletedAt: null } } }
          : { deletedAt: null, members: { some: { userId, deletedAt: null, leftAt: null } } },
      include: tenancyInclude,
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
    });
    res.json({ tenancies });
  });

  router.post("/units/:unitId/tenancies", validateBody(TenancyBody), async (req, res) => {
    const userId = authUserId(req);
    const unitId = idParam.parse(req.params.unitId);
    await assertUnitOwner(userId, unitId);
    await assertUnitWritable(userId, unitId);
    const body = req.body as z.infer<typeof TenancyBody>;
    const existing = await prisma.tenancy.count({ where: { unitId, deletedAt: null, status: "ACTIVE" } });
    if (existing > 0) throw badRequest("UNIT_HAS_ACTIVE_TENANCY");

    const tenancy = await prisma.$transaction(async (tx) => {
      const created = await tx.tenancy.create({
        data: {
          unitId,
          status: "ACTIVE",
          startDate: body.startDate,
          endDate: body.endDate ?? null,
          rentCents: body.rentCents,
          rentDueDay: body.rentDueDay,
          depositCents: body.depositCents ?? null,
          payeeName: body.payeeName,
          payeeIban: body.payeeIban,
          payeeStreet: body.payeeStreet ?? null,
          payeeCity: body.payeeCity ?? null,
          coveredCosts: body.coveredCosts,
          splitMethod: body.splitMethod,
          noticePeriodDays: body.noticePeriodDays ?? null,
          rentReviewMonth: body.rentReviewMonth ?? null,
          paymentNote: body.paymentNote ?? null,
          billingMode: body.billingMode,
        },
        include: tenancyInclude,
      });
      await audit(
        { actorId: userId, entityType: "Tenancy", entityId: created.id, action: "create", after: { rentCents: created.rentCents, rentDueDay: created.rentDueDay }, ip: req.ip },
        tx,
      );
      return created;
    });
    res.status(201).json({ tenancy });
  });

  router.get("/tenancies/:id", async (req, res) => {
    const id = idParam.parse(req.params.id);
    const access = await assertTenancyAccess(authUserId(req), id);
    const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id }, include: tenancyInclude });
    const onTimeMonths = (await onTimeMonthsByTenancy({ id }))[id] ?? 0;
    res.json({ tenancy, access: access.role, memberId: access.memberId, onTimeMonths });
  });

  router.patch("/tenancies/:id", validateBody(TenancyPatch), async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    await assertTenancyLandlord(userId, id);
    const body = req.body as z.infer<typeof TenancyPatch>;
    const tenancy = await prisma.$transaction(async (tx) => {
      const before = await tx.tenancy.findUniqueOrThrow({ where: { id } });
      const next = { ...before, ...body };
      if (next.endDate && next.endDate < next.startDate) throw badRequest("END_BEFORE_START");
      const updated = await tx.tenancy.update({ where: { id }, data: body, include: tenancyInclude });
      const d = diff(before as unknown as Record<string, unknown>, body as Record<string, unknown>);
      if (d.changed) {
        await audit({ actorId: userId, entityType: "Tenancy", entityId: id, action: "update", before: d.before, after: d.after, ip: req.ip }, tx);
      }
      return updated;
    });
    res.json({ tenancy });
  });

  router.delete("/tenancies/:id", async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    await assertTenancyLandlord(userId, id);
    const charges = await prisma.charge.count({ where: { tenancyId: id, deletedAt: null } });
    if (charges > 0) throw badRequest("TENANCY_HAS_CHARGES");
    await prisma.tenancy.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit({ actorId: userId, entityType: "Tenancy", entityId: id, action: "delete", ip: req.ip });
    res.status(204).end();
  });

  router.patch("/tenancies/:id/members/:memberId", validateBody(MemberPatch), async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    const memberId = idParam.parse(req.params.memberId);
    await assertTenancyLandlord(userId, id);
    const body = req.body as z.infer<typeof MemberPatch>;
    const member = await prisma.$transaction(async (tx) => {
      const existing = await tx.tenancyMember.findFirstOrThrow({ where: { id: memberId, tenancyId: id, deletedAt: null } });
      if (body.isPrimary) {
        await tx.tenancyMember.updateMany({ where: { tenancyId: id }, data: { isPrimary: false } });
      }
      const updated = await tx.tenancyMember.update({ where: { id: memberId }, data: body });
      const d = diff(existing as unknown as Record<string, unknown>, body as Record<string, unknown>);
      if (d.changed) {
        await audit({ actorId: userId, entityType: "TenancyMember", entityId: memberId, action: "update", before: d.before, after: d.after, ip: req.ip }, tx);
      }
      return updated;
    });
    res.json({ member });
  });

  router.delete("/tenancies/:id/members/:memberId", async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    const memberId = idParam.parse(req.params.memberId);
    await assertTenancyLandlord(userId, id);
    await prisma.tenancyMember.findFirstOrThrow({ where: { id: memberId, tenancyId: id, deletedAt: null } });
    await prisma.tenancyMember.update({ where: { id: memberId }, data: { leftAt: new Date() } });
    await audit({ actorId: userId, entityType: "TenancyMember", entityId: memberId, action: "remove", ip: req.ip });
    res.status(204).end();
  });

  return router;
}
