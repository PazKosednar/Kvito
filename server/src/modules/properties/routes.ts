import { Router } from "express";
import { z } from "zod";
import { badRequest, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { idParam, optionalText, text } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { assertPropertyOwner, assertUnitOwner } from "../access/access.js";

const PropertyBody = z.object({
  name: text(80),
  street: text(80),
  postalCode: z.string().trim().regex(/^\d{4}$/, "INVALID_POSTAL_CODE"),
  city: text(60),
  notes: optionalText(500),
});
const UnitBody = z.object({ name: text(60), floor: optionalText(40), notes: optionalText(500) });

const activeTenancy = { where: { deletedAt: null, status: { in: ["DRAFT", "ACTIVE"] as ("DRAFT" | "ACTIVE")[] } } };

export function propertiesRouter(): Router {
  const router = Router();

  /** Landlord overview: properties → units → current tenancy with members. */
  router.get("/properties", async (req, res) => {
    const properties = await prisma.property.findMany({
      where: { ownerId: authUserId(req), deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        units: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          include: {
            tenancies: {
              ...activeTenancy,
              orderBy: { startDate: "desc" },
              include: {
                members: {
                  where: { deletedAt: null, leftAt: null },
                  include: { user: { select: { id: true, name: true, email: true } } },
                },
              },
            },
          },
        },
      },
    });
    res.json({ properties });
  });

  router.post("/properties", validateBody(PropertyBody), async (req, res) => {
    const userId = authUserId(req);
    const body = req.body as z.infer<typeof PropertyBody>;
    const property = await prisma.$transaction(async (tx) => {
      const created = await tx.property.create({
        data: { ...body, notes: body.notes ?? null, ownerId: userId },
      });
      // Creating a property makes you a landlord.
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (!user.roles.includes("LANDLORD")) {
        await tx.user.update({
          where: { id: userId },
          data: { roles: [...user.roles, "LANDLORD"], lastActiveRole: user.lastActiveRole ?? "LANDLORD" },
        });
      }
      return created;
    });
    res.status(201).json({ property });
  });

  router.get("/properties/:id", async (req, res) => {
    const id = idParam.parse(req.params.id);
    await assertPropertyOwner(authUserId(req), id);
    const property = await prisma.property.findUniqueOrThrow({
      where: { id },
      include: {
        units: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          include: {
            tenancies: {
              where: { deletedAt: null },
              orderBy: { startDate: "desc" },
              include: {
                members: {
                  where: { deletedAt: null, leftAt: null },
                  include: { user: { select: { id: true, name: true, email: true } } },
                },
              },
            },
          },
        },
      },
    });
    res.json({ property });
  });

  router.patch("/properties/:id", validateBody(PropertyBody.partial()), async (req, res) => {
    const id = idParam.parse(req.params.id);
    await assertPropertyOwner(authUserId(req), id);
    const property = await prisma.property.update({ where: { id }, data: req.body as Partial<z.infer<typeof PropertyBody>> });
    res.json({ property });
  });

  router.delete("/properties/:id", async (req, res) => {
    const id = idParam.parse(req.params.id);
    await assertPropertyOwner(authUserId(req), id);
    const active = await prisma.tenancy.count({ where: { unit: { propertyId: id }, deletedAt: null, status: "ACTIVE" } });
    if (active > 0) throw badRequest("PROPERTY_HAS_ACTIVE_TENANCY");
    const now = new Date();
    await prisma.$transaction([
      prisma.unit.updateMany({ where: { propertyId: id, deletedAt: null }, data: { deletedAt: now } }),
      prisma.property.update({ where: { id }, data: { deletedAt: now } }),
    ]);
    res.status(204).end();
  });

  router.post("/properties/:id/units", validateBody(UnitBody), async (req, res) => {
    const propertyId = idParam.parse(req.params.id);
    await assertPropertyOwner(authUserId(req), propertyId);
    const body = req.body as z.infer<typeof UnitBody>;
    const unit = await prisma.unit.create({
      data: { propertyId, name: body.name, floor: body.floor ?? null, notes: body.notes ?? null },
    });
    res.status(201).json({ unit });
  });

  router.patch("/units/:id", validateBody(UnitBody.partial()), async (req, res) => {
    const id = idParam.parse(req.params.id);
    await assertUnitOwner(authUserId(req), id);
    const unit = await prisma.unit.update({ where: { id }, data: req.body as Partial<z.infer<typeof UnitBody>> });
    res.json({ unit });
  });

  router.delete("/units/:id", async (req, res) => {
    const id = idParam.parse(req.params.id);
    await assertUnitOwner(authUserId(req), id);
    const active = await prisma.tenancy.count({ where: { unitId: id, deletedAt: null, status: "ACTIVE" } });
    if (active > 0) throw badRequest("UNIT_HAS_ACTIVE_TENANCY");
    const unit = await prisma.unit.findUnique({ where: { id } });
    if (!unit) throw notFound();
    await prisma.unit.update({ where: { id }, data: { deletedAt: new Date() } });
    res.status(204).end();
  });

  return router;
}
