import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { audit } from "../../lib/audit.js";
import { compareHandovers, summarize } from "../../lib/handover-compare.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { bus } from "../../lib/events.js";
import { prisma } from "../../lib/prisma.js";
import { dateOnly, idParam, optionalText, text } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import type { Storage } from "../../services/storage/Storage.js";
import { assertTenancyAccess, assertTenancyLandlord } from "../access/access.js";
import { attachmentDto, attachmentSelect, claimAttachments } from "../attachments/service.js";
import { createReading, ReadingBody, readingDto, readingInclude } from "../meters/routes.js";
import { postSystemMessage } from "../messages/system.js";
import { renderHandoverPdf } from "./pdf.js";

const CONDITIONS = ["GOOD", "WORN", "DAMAGED", "MISSING"] as const;

const CreateBody = z.object({ kind: z.enum(["MOVE_IN", "MOVE_OUT"]), handoverOn: dateOnly });
const PatchBody = z
  .object({
    handoverOn: dateOnly,
    keysCount: z.number().int().min(0).max(99).nullable(),
    keysNote: optionalText(300),
    notes: optionalText(2000),
  })
  .partial();
const ItemBody = z.object({
  room: text(60),
  name: text(80),
  condition: z.enum(CONDITIONS).default("GOOD"),
  note: optionalText(500),
  attachmentIds: z.array(idParam).max(6).optional(),
});
const ItemPatch = z.object({ room: text(60), name: text(80), condition: z.enum(CONDITIONS), note: optionalText(500) }).partial();
const PhotosBody = z.object({ attachmentIds: z.array(idParam).min(1).max(6) });
/** Most photos one item may have (move-in and move-out each). */
const MAX_ITEM_PHOTOS = 12;

/** Latest (by date) non-deleted handover of a kind. */
const latestOfKind = (tenancyId: string, kind: "MOVE_IN" | "MOVE_OUT") =>
  prisma.handover.findFirst({ where: { tenancyId, kind, deletedAt: null }, orderBy: [{ handoverOn: "desc" }, { createdAt: "desc" }], include: handoverInclude });

export const handoverInclude = {
  items: {
    where: { deletedAt: null },
    orderBy: [{ room: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: { attachments: attachmentSelect },
  },
  meterReadings: { where: { deletedAt: null }, include: readingInclude, orderBy: { meterType: "asc" } },
  createdBy: { select: { id: true, name: true, email: true } },
  tenantConfirmedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.HandoverInclude;

type HandoverRow = Prisma.HandoverGetPayload<{ include: typeof handoverInclude }>;

const handoverDto = (h: HandoverRow) => ({
  ...h,
  items: h.items.map((i) => ({ ...i, attachments: i.attachments.map(attachmentDto) })),
  meterReadings: h.meterReadings.map(readingDto),
});

/** Loads a handover and checks access; `edit` additionally requires the landlord and an unconfirmed record. */
async function load(userId: string, id: string, mode: "view" | "edit" | "any" = "view") {
  const h = await prisma.handover.findFirst({ where: { id, deletedAt: null } });
  if (!h) throw notFound();
  const access = await assertTenancyAccess(userId, h.tenancyId);
  if (mode === "edit") {
    if (access.role !== "LANDLORD") throw notFound();
    if (h.status !== "DRAFT") throw badRequest("HANDOVER_LOCKED");
  }
  return { h, access };
}

export function handoversRouter(deps: { storage: Storage }): Router {
  const router = Router();

  router.get("/tenancies/:id/handovers", async (req, res) => {
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyAccess(authUserId(req), tenancyId);
    const handovers = await prisma.handover.findMany({
      where: { tenancyId, deletedAt: null },
      orderBy: { handoverOn: "desc" },
      include: { _count: { select: { items: { where: { deletedAt: null } } } } },
    });
    res.json({ handovers });
  });

  router.post("/tenancies/:id/handovers", validateBody(CreateBody), async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyLandlord(userId, tenancyId);
    const body = req.body as z.infer<typeof CreateBody>;
    // A move-out starts with the rooms and items of the move-in, so the same things get checked and photographed again.
    const moveIn = body.kind === "MOVE_OUT" ? await latestOfKind(tenancyId, "MOVE_IN") : null;
    const handover = await prisma.handover.create({
      data: {
        tenancyId,
        kind: body.kind,
        handoverOn: body.handoverOn,
        createdById: userId,
        items: moveIn ? { create: moveIn.items.map((i, n) => ({ room: i.room, name: i.name, sortOrder: n })) } : undefined,
      },
    });
    await audit({ actorId: userId, entityType: "Handover", entityId: handover.id, action: "create", after: { kind: body.kind, copiedItems: moveIn?.items.length ?? 0 }, ip: req.ip });
    res.status(201).json({ handover, copiedItems: moveIn?.items.length ?? 0 });
  });

  // Before and after: latest move-in vs latest move-out, item by item.
  router.get("/tenancies/:id/handovers/compare", async (req, res) => {
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyAccess(authUserId(req), tenancyId);
    const [moveIn, moveOut] = await Promise.all([latestOfKind(tenancyId, "MOVE_IN"), latestOfKind(tenancyId, "MOVE_OUT")]);
    const items = (h: typeof moveIn) => (h ? handoverDto(h).items : []);
    const rows = compareHandovers(items(moveIn), items(moveOut));
    const head = (h: typeof moveIn) => (h ? { id: h.id, status: h.status, handoverOn: h.handoverOn } : null);
    res.json({ moveIn: head(moveIn), moveOut: head(moveOut), rows, summary: summarize(rows) });
  });

  router.get("/handovers/:id", async (req, res) => {
    const { h, access } = await load(authUserId(req), idParam.parse(req.params.id));
    const full = await prisma.handover.findUniqueOrThrow({ where: { id: h.id }, include: handoverInclude });
    res.json({ handover: handoverDto(full), access: access.role });
  });

  router.patch("/handovers/:id", validateBody(PatchBody), async (req, res) => {
    const { h } = await load(authUserId(req), idParam.parse(req.params.id), "edit");
    const handover = await prisma.handover.update({ where: { id: h.id }, data: req.body as z.infer<typeof PatchBody> });
    res.json({ handover });
  });

  router.post("/handovers/:id/items", validateBody(ItemBody), async (req, res) => {
    const userId = authUserId(req);
    const { h } = await load(userId, idParam.parse(req.params.id), "edit");
    const body = req.body as z.infer<typeof ItemBody>;
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.handoverItem.create({
        data: { handoverId: h.id, room: body.room, name: body.name, condition: body.condition, note: body.note ?? null },
      });
      await claimAttachments(tx, body.attachmentIds, { tenancyId: h.tenancyId, uploadedById: userId, kinds: ["HANDOVER"], link: { handoverItemId: created.id } });
      return created;
    });
    res.status(201).json({ item });
  });

  router.patch("/handovers/:id/items/:itemId", validateBody(ItemPatch), async (req, res) => {
    const { h } = await load(authUserId(req), idParam.parse(req.params.id), "edit");
    const item = await prisma.handoverItem.findFirst({ where: { id: idParam.parse(req.params.itemId), handoverId: h.id, deletedAt: null } });
    if (!item) throw notFound();
    res.json({ item: await prisma.handoverItem.update({ where: { id: item.id }, data: req.body as z.infer<typeof ItemPatch> }) });
  });

  // Add photos to an existing item (e.g. items carried over from the move-in).
  router.post("/handovers/:id/items/:itemId/photos", validateBody(PhotosBody), async (req, res) => {
    const userId = authUserId(req);
    const { h } = await load(userId, idParam.parse(req.params.id), "edit");
    const item = await prisma.handoverItem.findFirst({
      where: { id: idParam.parse(req.params.itemId), handoverId: h.id, deletedAt: null },
      include: { _count: { select: { attachments: { where: { deletedAt: null } } } } },
    });
    if (!item) throw notFound();
    const body = req.body as z.infer<typeof PhotosBody>;
    if (item._count.attachments + body.attachmentIds.length > MAX_ITEM_PHOTOS) throw badRequest("TOO_MANY_PHOTOS");
    await prisma.$transaction((tx) =>
      claimAttachments(tx, body.attachmentIds, { tenancyId: h.tenancyId, uploadedById: userId, kinds: ["HANDOVER"], link: { handoverItemId: item.id } }),
    );
    res.status(201).json({ ok: true });
  });

  router.delete("/handovers/:id/items/:itemId", async (req, res) => {
    const { h } = await load(authUserId(req), idParam.parse(req.params.id), "edit");
    const item = await prisma.handoverItem.findFirst({ where: { id: idParam.parse(req.params.itemId), handoverId: h.id, deletedAt: null } });
    if (!item) throw notFound();
    await prisma.handoverItem.update({ where: { id: item.id }, data: { deletedAt: new Date() } });
    res.status(204).end();
  });

  router.post("/handovers/:id/meters", validateBody(ReadingBody), async (req, res) => {
    const userId = authUserId(req);
    const { h } = await load(userId, idParam.parse(req.params.id), "edit");
    const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: h.tenancyId }, select: { unitId: true } });
    const reading = await prisma.$transaction((tx) =>
      createReading(tx, { tenancyId: h.tenancyId, unitId: tenancy.unitId, userId, handoverId: h.id, body: req.body as z.infer<typeof ReadingBody> }),
    );
    res.status(201).json({ reading: readingDto(reading) });
  });

  router.delete("/handovers/:id/meters/:readingId", async (req, res) => {
    const { h } = await load(authUserId(req), idParam.parse(req.params.id), "edit");
    const r = await prisma.meterReading.findFirst({ where: { id: idParam.parse(req.params.readingId), handoverId: h.id, deletedAt: null } });
    if (!r) throw notFound();
    await prisma.meterReading.update({ where: { id: r.id }, data: { deletedAt: new Date() } });
    res.status(204).end();
  });

  /** Landlord signs off and sends the record to the tenant for confirmation. */
  router.post("/handovers/:id/submit", async (req, res) => {
    const userId = authUserId(req);
    const { h } = await load(userId, idParam.parse(req.params.id), "edit");
    const items = await prisma.handoverItem.count({ where: { handoverId: h.id, deletedAt: null } });
    if (items === 0) throw badRequest("HANDOVER_EMPTY");
    await prisma.$transaction(async (tx) => {
      await tx.handover.update({ where: { id: h.id }, data: { status: "AWAITING_CONFIRMATION", landlordConfirmedAt: new Date() } });
      await audit({ actorId: userId, entityType: "Handover", entityId: h.id, action: "submit", before: { status: "DRAFT" }, after: { status: "AWAITING_CONFIRMATION" }, ip: req.ip }, tx);
      await postSystemMessage(tx, h.tenancyId, "HANDOVER_READY", { kind: h.kind });
    });
    bus.emit("tenancy.changed", { tenancyId: h.tenancyId, what: "handover" });
    res.json({ status: "AWAITING_CONFIRMATION" });
  });

  /** Tenant confirms the record – both sides have now agreed; the record is locked. */
  router.post("/handovers/:id/confirm", async (req, res) => {
    const userId = authUserId(req);
    const { h, access } = await load(userId, idParam.parse(req.params.id), "any");
    if (access.role !== "TENANT") throw notFound();
    if (h.status !== "AWAITING_CONFIRMATION") throw badRequest("TRANSITION_NOT_ALLOWED");
    await prisma.$transaction(async (tx) => {
      await tx.handover.update({ where: { id: h.id }, data: { status: "CONFIRMED", tenantConfirmedAt: new Date(), tenantConfirmedById: userId } });
      await audit({ actorId: userId, entityType: "Handover", entityId: h.id, action: "confirm", before: { status: h.status }, after: { status: "CONFIRMED" }, ip: req.ip }, tx);
      await postSystemMessage(tx, h.tenancyId, "HANDOVER_CONFIRMED", { kind: h.kind });
    });
    bus.emit("tenancy.changed", { tenancyId: h.tenancyId, what: "handover" });
    res.json({ status: "CONFIRMED" });
  });

  /** Either side sends an unconfirmed record back to draft (something needs fixing – they talk in messages). */
  router.post("/handovers/:id/reopen", async (req, res) => {
    const userId = authUserId(req);
    const { h } = await load(userId, idParam.parse(req.params.id), "any");
    if (h.status !== "AWAITING_CONFIRMATION") throw badRequest("TRANSITION_NOT_ALLOWED");
    await prisma.handover.update({ where: { id: h.id }, data: { status: "DRAFT", landlordConfirmedAt: null } });
    await audit({ actorId: userId, entityType: "Handover", entityId: h.id, action: "reopen", before: { status: h.status }, after: { status: "DRAFT" }, ip: req.ip });
    bus.emit("tenancy.changed", { tenancyId: h.tenancyId, what: "handover" });
    res.json({ status: "DRAFT" });
  });

  router.get("/handovers/:id/pdf", async (req, res) => {
    const { h } = await load(authUserId(req), idParam.parse(req.params.id));
    const full = await prisma.handover.findUniqueOrThrow({
      where: { id: h.id },
      include: {
        ...handoverInclude,
        tenancy: {
          include: {
            unit: { include: { property: { include: { owner: { select: { name: true, email: true } } } } } },
            members: { where: { deletedAt: null }, include: { user: { select: { name: true, email: true } } } },
          },
        },
      },
    });
    const pdf = await renderHandoverPdf(full, deps.storage);
    const name = `kvita-zapisnik-${full.kind === "MOVE_IN" ? "vselitev" : "izselitev"}-${full.handoverOn.toISOString().slice(0, 10)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(pdf);
  });

  return router;
}
