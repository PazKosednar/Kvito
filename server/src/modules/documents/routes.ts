import { Router } from "express";
import { z } from "zod";
import { audit } from "../../lib/audit.js";
import { notFound } from "../../lib/errors.js";
import { bus } from "../../lib/events.js";
import { prisma } from "../../lib/prisma.js";
import { idParam, text } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { assertTenancyAccess, assertTenancyLandlord } from "../access/access.js";
import { attachmentDto, attachmentSelect, claimAttachments } from "../attachments/service.js";
import { postSystemMessage } from "../messages/system.js";

const CATEGORIES = ["CONTRACT", "ANNEX", "HOUSE_RULES", "MANUAL", "OTHER"] as const;

const CreateBody = z.object({
  category: z.enum(CATEGORIES),
  title: text(120),
  visibility: z.enum(["LANDLORD_ONLY", "TENANTS"]).default("TENANTS"),
  /** UNIT: stays with the flat for future tenancies (e.g. appliance manuals). */
  scope: z.enum(["TENANCY", "UNIT"]).default("TENANCY"),
  attachmentIds: z.array(idParam).min(1).max(5),
});
const PatchBody = z.object({ title: text(120), visibility: z.enum(["LANDLORD_ONLY", "TENANTS"]) }).partial();

export function documentsRouter(): Router {
  const router = Router();

  router.get("/tenancies/:id/documents", async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    const access = await assertTenancyAccess(userId, tenancyId);
    const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId }, select: { unitId: true } });
    const documents = await prisma.document.findMany({
      where: {
        deletedAt: null,
        OR: [{ tenancyId }, { unitId: tenancy.unitId, tenancyId: null }],
        ...(access.role === "TENANT" ? { visibility: "TENANTS" as const } : {}),
      },
      include: { attachments: attachmentSelect, uploadedBy: { select: { id: true, name: true, email: true } } },
      orderBy: [{ category: "asc" }, { createdAt: "desc" }],
    });
    res.json({ documents: documents.map((d) => ({ ...d, attachments: d.attachments.map(attachmentDto) })) });
  });

  router.post("/tenancies/:id/documents", validateBody(CreateBody), async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyLandlord(userId, tenancyId);
    const body = req.body as z.infer<typeof CreateBody>;
    const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId }, select: { unitId: true } });
    const doc = await prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          category: body.category,
          title: body.title,
          visibility: body.visibility,
          uploadedById: userId,
          ...(body.scope === "UNIT" ? { unitId: tenancy.unitId } : { tenancyId }),
        },
      });
      await claimAttachments(tx, body.attachmentIds, { tenancyId, uploadedById: userId, kinds: ["DOCUMENT"], link: { documentId: created.id } });
      await audit({ actorId: userId, entityType: "Document", entityId: created.id, action: "create", after: { visibility: body.visibility }, ip: req.ip }, tx);
      if (body.visibility === "TENANTS") await postSystemMessage(tx, tenancyId, "DOCUMENT_ADDED", { title: body.title });
      return created;
    });
    bus.emit("tenancy.changed", { tenancyId, what: "documents" });
    res.status(201).json({ document: doc });
  });

  /** Documents are reachable through their tenancy, or through the unit for unit-wide documents. */
  async function loadForLandlord(userId: string, id: string, tenancyId: string) {
    await assertTenancyLandlord(userId, tenancyId);
    const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId }, select: { unitId: true } });
    const doc = await prisma.document.findFirst({ where: { id, deletedAt: null, OR: [{ tenancyId }, { unitId: tenancy.unitId }] } });
    if (!doc) throw notFound();
    return doc;
  }

  router.patch("/tenancies/:tid/documents/:id", validateBody(PatchBody), async (req, res) => {
    const userId = authUserId(req);
    const doc = await loadForLandlord(userId, idParam.parse(req.params.id), idParam.parse(req.params.tid));
    const body = req.body as z.infer<typeof PatchBody>;
    const updated = await prisma.document.update({ where: { id: doc.id }, data: body });
    if (body.visibility && body.visibility !== doc.visibility) {
      await audit({ actorId: userId, entityType: "Document", entityId: doc.id, action: "visibility", before: { visibility: doc.visibility }, after: { visibility: body.visibility }, ip: req.ip });
    }
    res.json({ document: updated });
  });

  router.delete("/tenancies/:tid/documents/:id", async (req, res) => {
    const userId = authUserId(req);
    const doc = await loadForLandlord(userId, idParam.parse(req.params.id), idParam.parse(req.params.tid));
    await prisma.document.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
    await audit({ actorId: userId, entityType: "Document", entityId: doc.id, action: "delete", ip: req.ip });
    res.status(204).end();
  });

  return router;
}
