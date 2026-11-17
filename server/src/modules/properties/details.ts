import express, { Router } from "express";
import { z } from "zod";
import { audit } from "../../lib/audit.js";
import { randomToken } from "../../lib/crypto.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { cleanFileName, extensionFor, MAX_UPLOAD_BYTES, sniffMime } from "../../lib/files.js";
import { prisma } from "../../lib/prisma.js";
import { idParam, optionalText, text } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import { uploadLimiter } from "../../middleware/rateLimit.js";
import { validateBody } from "../../middleware/validate.js";
import type { Storage } from "../../services/storage/Storage.js";
import { assertPropertyOwner, assertUnitOwner } from "../access/access.js";
import { attachmentDto, attachmentSelect } from "../attachments/service.js";

const UTILITY_KINDS = ["ELECTRICITY", "GAS", "WATER", "HEATING", "INTERNET", "OTHER"] as const;

const UtilityBody = z.object({
  kind: z.enum(UTILITY_KINDS),
  pointNumber: optionalText(60),
  supplier: optionalText(80),
  note: optionalText(200),
});

const KeyBody = z.object({
  label: text(60),
  count: z.number().int().min(0).max(99),
  holder: optionalText(80),
});

const PhotoQuery = z.object({ unitId: idParam.optional(), name: z.string().max(200).optional() });

/** Photos per property (gallery) and per unit. */
const MAX_PHOTOS = 24;

const photoWhere = { kind: "PHOTO" as const, deletedAt: null };

/** Images only: a gallery of photos, not documents. */
const isImage = (mime: string) => mime.startsWith("image/");

/**
 * Details of properties and units (landlord only): the unit page with metering points, keys and photos,
 * and the property's photo gallery. Mounted behind requireAuth in app.ts.
 */
export function propertyDetailsRouter(deps: { storage: Storage }): Router {
  const router = Router();

  const ownerOfUtility = async (userId: string, id: string) => {
    const row = await prisma.utilityPoint.findFirst({ where: { id, unit: { deletedAt: null, property: { ownerId: userId, deletedAt: null } } }, select: { id: true, unitId: true } });
    if (!row) throw notFound();
    return row;
  };
  const ownerOfKeys = async (userId: string, id: string) => {
    const row = await prisma.keySet.findFirst({ where: { id, unit: { deletedAt: null, property: { ownerId: userId, deletedAt: null } } }, select: { id: true, unitId: true } });
    if (!row) throw notFound();
    return row;
  };

  /** Property photos (the gallery on the property page; unit photos are on the unit page). */
  router.get("/properties/:id/photos", async (req, res) => {
    const id = idParam.parse(req.params.id);
    await assertPropertyOwner(authUserId(req), id);
    const photos = await prisma.attachment.findMany({ where: { ...photoWhere, propertyId: id, unitId: null }, orderBy: { createdAt: "asc" }, select: attachmentSelect.select });
    res.json({ photos: photos.map(attachmentDto) });
  });

  /** Everything about one unit: details, its property, current tenancy, metering points, keys and photos. */
  router.get("/units/:id", async (req, res) => {
    const id = idParam.parse(req.params.id);
    await assertUnitOwner(authUserId(req), id);
    const unit = await prisma.unit.findUniqueOrThrow({
      where: { id },
      include: {
        property: { select: { id: true, name: true, type: true, street: true, postalCode: true, city: true } },
        tenancies: {
          where: { deletedAt: null, status: { in: ["DRAFT", "ACTIVE"] } },
          orderBy: { startDate: "desc" },
          take: 1,
          select: { id: true, status: true, startDate: true, rentCents: true, members: { where: { deletedAt: null, leftAt: null }, select: { user: { select: { id: true, name: true, email: true } } } } },
        },
        utilityPoints: { orderBy: { createdAt: "asc" } },
        keySets: { orderBy: { createdAt: "asc" } },
        photos: { where: photoWhere, orderBy: { createdAt: "asc" }, select: attachmentSelect.select },
      },
    });
    res.json({ unit: { ...unit, photos: unit.photos.map(attachmentDto) } });
  });

  router.post("/units/:id/utilities", validateBody(UtilityBody), async (req, res) => {
    const unitId = idParam.parse(req.params.id);
    const userId = authUserId(req);
    await assertUnitOwner(userId, unitId);
    const body = req.body as z.infer<typeof UtilityBody>;
    const point = await prisma.utilityPoint.create({ data: { ...body, unitId } });
    await audit({ actorId: userId, entityType: "UtilityPoint", entityId: point.id, action: "create", after: { kind: point.kind }, ip: req.ip });
    res.status(201).json({ point });
  });

  router.patch("/utilities/:id", validateBody(UtilityBody), async (req, res) => {
    const id = idParam.parse(req.params.id);
    const userId = authUserId(req);
    await ownerOfUtility(userId, id);
    const point = await prisma.utilityPoint.update({ where: { id }, data: req.body as z.infer<typeof UtilityBody> });
    await audit({ actorId: userId, entityType: "UtilityPoint", entityId: id, action: "update", ip: req.ip });
    res.json({ point });
  });

  router.delete("/utilities/:id", async (req, res) => {
    const id = idParam.parse(req.params.id);
    const userId = authUserId(req);
    await ownerOfUtility(userId, id);
    await prisma.utilityPoint.delete({ where: { id } });
    await audit({ actorId: userId, entityType: "UtilityPoint", entityId: id, action: "delete", ip: req.ip });
    res.status(204).end();
  });

  router.post("/units/:id/keys", validateBody(KeyBody), async (req, res) => {
    const unitId = idParam.parse(req.params.id);
    const userId = authUserId(req);
    await assertUnitOwner(userId, unitId);
    const body = req.body as z.infer<typeof KeyBody>;
    const keys = await prisma.keySet.create({ data: { ...body, unitId } });
    await audit({ actorId: userId, entityType: "KeySet", entityId: keys.id, action: "create", after: { label: keys.label, count: keys.count }, ip: req.ip });
    res.status(201).json({ keys });
  });

  router.patch("/keys/:id", validateBody(KeyBody), async (req, res) => {
    const id = idParam.parse(req.params.id);
    const userId = authUserId(req);
    await ownerOfKeys(userId, id);
    const keys = await prisma.keySet.update({ where: { id }, data: req.body as z.infer<typeof KeyBody> });
    await audit({ actorId: userId, entityType: "KeySet", entityId: id, action: "update", ip: req.ip });
    res.json({ keys });
  });

  router.delete("/keys/:id", async (req, res) => {
    const id = idParam.parse(req.params.id);
    const userId = authUserId(req);
    await ownerOfKeys(userId, id);
    await prisma.keySet.delete({ where: { id } });
    await audit({ actorId: userId, entityType: "KeySet", entityId: id, action: "delete", ip: req.ip });
    res.status(204).end();
  });

  /** Upload a photo (raw bytes) to a property's gallery, or with ?unitId= to one of its units. */
  router.post("/properties/:id/photos", uploadLimiter, express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }), async (req, res) => {
    const propertyId = idParam.parse(req.params.id);
    const userId = authUserId(req);
    await assertPropertyOwner(userId, propertyId);
    const { unitId, name } = PhotoQuery.parse(req.query);
    if (unitId) {
      const unit = await prisma.unit.findFirst({ where: { id: unitId, propertyId, deletedAt: null }, select: { id: true } });
      if (!unit) throw badRequest("UNIT_NOT_IN_PROPERTY");
    }
    const existing = await prisma.attachment.count({ where: { ...photoWhere, propertyId, unitId: unitId ?? null } });
    if (existing >= MAX_PHOTOS) throw badRequest("TOO_MANY_GALLERY_PHOTOS");
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest("FILE_EMPTY");
    const mime = sniffMime(body);
    if (!mime || !isImage(mime)) throw badRequest("FILE_TYPE_NOT_ALLOWED");
    const key = `properties/${propertyId}/${randomToken(16)}.${extensionFor(mime)}`;
    await deps.storage.put(key, body, mime);
    const att = await prisma.attachment.create({
      data: { kind: "PHOTO", uploadedById: userId, propertyId, unitId: unitId ?? null, storageKey: key, fileName: cleanFileName(name, mime), mimeType: mime, sizeBytes: body.length },
    });
    await audit({ actorId: userId, entityType: "Attachment", entityId: att.id, action: "photo.create", after: { propertyId, unitId }, ip: req.ip });
    res.status(201).json({ photo: attachmentDto(att) });
  });

  router.delete("/photos/:id", async (req, res) => {
    const id = idParam.parse(req.params.id);
    const userId = authUserId(req);
    const photo = await prisma.attachment.findFirst({
      where: { id, ...photoWhere, property: { ownerId: userId, deletedAt: null } },
      select: { id: true },
    });
    if (!photo) throw notFound();
    await prisma.attachment.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit({ actorId: userId, entityType: "Attachment", entityId: id, action: "photo.delete", ip: req.ip });
    res.status(204).end();
  });

  return router;
}
