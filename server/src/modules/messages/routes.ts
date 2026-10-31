import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { badRequest } from "../../lib/errors.js";
import { bus } from "../../lib/events.js";
import { prisma } from "../../lib/prisma.js";
import { idParam } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { assertTenancyAccess } from "../access/access.js";
import { attachmentDto, attachmentSelect, claimAttachments } from "../attachments/service.js";

export const messageInclude = {
  author: { select: { id: true, name: true, email: true } },
  attachments: attachmentSelect,
  charge: { select: { id: true, title: true } },
  issue: { select: { id: true, title: true } },
} satisfies Prisma.MessageInclude;

type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

export const messageDto = (m: MessageRow) => ({
  id: m.id,
  tenancyId: m.tenancyId,
  kind: m.kind,
  body: m.body,
  systemEvent: m.systemEvent,
  systemData: m.systemData,
  createdAt: m.createdAt,
  author: m.author,
  charge: m.charge,
  issue: m.issue,
  attachments: m.attachments.map(attachmentDto),
});

const SendBody = z
  .object({
    body: z.string().trim().max(4000).default(""),
    attachmentIds: z.array(idParam).max(6).optional(),
    chargeId: idParam.optional(),
    issueId: idParam.optional(),
  })
  .refine((b) => b.body.length > 0 || (b.attachmentIds?.length ?? 0) > 0, { message: "EMPTY_MESSAGE", path: ["body"] });

const PAGE = 50;

/** Conversation per tenancy (authenticated – mounted behind requireAuth). */
export function messagesRouter(): Router {
  const router = Router();

  router.get("/tenancies/:id/messages", async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyAccess(userId, tenancyId);
    const before = typeof req.query["before"] === "string" ? new Date(req.query["before"]) : null;
    const rows = await prisma.message.findMany({
      where: { tenancyId, deletedAt: null, ...(before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}) },
      include: messageInclude,
      orderBy: { createdAt: "desc" },
      take: PAGE + 1,
    });
    const reads = await prisma.conversationRead.findMany({
      where: { tenancyId },
      select: { userId: true, lastReadAt: true },
    });
    res.json({
      messages: rows.slice(0, PAGE).reverse().map(messageDto),
      hasMore: rows.length > PAGE,
      reads,
    });
  });

  router.post("/tenancies/:id/messages", validateBody(SendBody), async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyAccess(userId, tenancyId);
    const body = req.body as z.infer<typeof SendBody>;

    if (body.chargeId) {
      const ok = await prisma.charge.count({ where: { id: body.chargeId, tenancyId, deletedAt: null } });
      if (!ok) throw badRequest("LINK_INVALID");
    }
    if (body.issueId) {
      const ok = await prisma.issue.count({ where: { id: body.issueId, tenancyId, deletedAt: null } });
      if (!ok) throw badRequest("LINK_INVALID");
    }

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          tenancyId,
          kind: "USER",
          authorId: userId,
          body: body.body,
          chargeId: body.chargeId ?? null,
          issueId: body.issueId ?? null,
        },
      });
      await claimAttachments(tx, body.attachmentIds, {
        tenancyId,
        uploadedById: userId,
        kinds: ["MESSAGE"],
        link: { messageId: created.id },
      });
      // Sending a message means you have read everything before it.
      await tx.conversationRead.upsert({
        where: { tenancyId_userId: { tenancyId, userId } },
        update: { lastReadAt: created.createdAt },
        create: { tenancyId, userId, lastReadAt: created.createdAt },
      });
      return tx.message.findUniqueOrThrow({ where: { id: created.id }, include: messageInclude });
    });
    bus.emit("message.created", { tenancyId, messageId: message.id });
    res.status(201).json({ message: messageDto(message) });
  });

  router.post("/tenancies/:id/messages/read", async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyAccess(userId, tenancyId);
    const now = new Date();
    await prisma.conversationRead.upsert({
      where: { tenancyId_userId: { tenancyId, userId } },
      update: { lastReadAt: now },
      create: { tenancyId, userId, lastReadAt: now },
    });
    bus.emit("conversation.read", { tenancyId, userId, lastReadAt: now.toISOString() });
    res.status(204).end();
  });

  /** Unread counts for every conversation the user takes part in (badges). */
  router.get("/messages/unread", async (req, res) => {
    const userId = authUserId(req);
    const tenancies = await prisma.tenancy.findMany({
      where: {
        deletedAt: null,
        OR: [
          { unit: { property: { ownerId: userId, deletedAt: null } } },
          { members: { some: { userId, deletedAt: null, leftAt: null } } },
        ],
      },
      select: { id: true, conversationReads: { where: { userId }, select: { lastReadAt: true } } },
    });
    const counts: Record<string, number> = {};
    for (const t of tenancies) {
      const since = t.conversationReads[0]?.lastReadAt ?? new Date(0);
      counts[t.id] = await prisma.message.count({
        where: { tenancyId: t.id, deletedAt: null, createdAt: { gt: since }, OR: [{ authorId: null }, { authorId: { not: userId } }] },
      });
    }
    res.json({ unread: counts });
  });

  return router;
}
