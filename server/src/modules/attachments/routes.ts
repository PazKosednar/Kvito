import express, { Router } from "express";
import { z } from "zod";
import type { AttachmentKind } from "../../generated/prisma/client.js";
import { randomToken } from "../../lib/crypto.js";
import { badRequest, forbidden, notFound } from "../../lib/errors.js";
import { cleanFileName, extensionFor, MAX_UPLOAD_BYTES, sniffMime, verifyFileSignature } from "../../lib/files.js";
import { prisma } from "../../lib/prisma.js";
import { idParam } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import type { Storage } from "../../services/storage/Storage.js";
import { assertTenancyAccess } from "../access/access.js";
import { attachmentDto } from "./service.js";

const KINDS = ["BILL", "PAYMENT_PROOF", "MESSAGE", "ISSUE", "METER", "HANDOVER", "DOCUMENT"] as const;
const LANDLORD_ONLY: AttachmentKind[] = ["BILL", "DOCUMENT"];
const TENANT_ONLY: AttachmentKind[] = ["PAYMENT_PROOF"];

const UploadQuery = z.object({ kind: z.enum(KINDS), name: z.string().max(200).optional() });

/** Public: download through a signed, short-lived URL (no Authorization header, works in <img src>). */
export function filesPublicRouter(deps: { storage: Storage }): Router {
  const router = Router();
  router.get("/files/:id", async (req, res) => {
    const id = idParam.parse(req.params.id);
    const exp = typeof req.query["exp"] === "string" ? req.query["exp"] : undefined;
    const sig = typeof req.query["sig"] === "string" ? req.query["sig"] : undefined;
    if (!verifyFileSignature(id, exp, sig)) throw forbidden("FILE_LINK_EXPIRED");
    const att = await prisma.attachment.findFirst({ where: { id, deletedAt: null } });
    if (!att) throw notFound();
    const { stream, size } = await deps.storage.get(att.storageKey);
    res.setHeader("Content-Type", att.mimeType);
    res.setHeader("Content-Length", String(size));
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(att.fileName)}`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    stream.pipe(res);
  });
  return router;
}

/** Authenticated (mounted behind requireAuth in app.ts). */
export function attachmentsRouter(deps: { storage: Storage }): Router {
  const router = Router();

  /** Upload: raw file bytes in the body (no multipart parser needed), kind + name in the query. */
  router.post(
    "/tenancies/:id/attachments",
    express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
    async (req, res) => {
      const userId = authUserId(req);
      const tenancyId = idParam.parse(req.params.id);
      const access = await assertTenancyAccess(userId, tenancyId);
      const { kind, name } = UploadQuery.parse(req.query);
      if (access.role === "TENANT" && LANDLORD_ONLY.includes(kind)) throw forbidden();
      if (access.role === "LANDLORD" && TENANT_ONLY.includes(kind)) throw forbidden();

      const body = req.body as unknown;
      if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest("FILE_EMPTY");
      const mime = sniffMime(body);
      if (!mime) throw badRequest("FILE_TYPE_NOT_ALLOWED");

      const key = `${tenancyId}/${new Date().toISOString().slice(0, 7)}/${randomToken(16)}.${extensionFor(mime)}`;
      await deps.storage.put(key, body, mime);
      const att = await prisma.attachment.create({
        data: {
          kind,
          tenancyId,
          uploadedById: userId,
          storageKey: key,
          fileName: cleanFileName(name, mime),
          mimeType: mime,
          sizeBytes: body.length,
        },
      });
      res.status(201).json({ attachment: attachmentDto(att) });
    },
  );

  /** Remove an upload that was never linked (e.g. the user changed their mind before saving). */
  router.delete("/attachments/:id", async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    const att = await prisma.attachment.findFirst({ where: { id, uploadedById: userId, deletedAt: null } });
    if (!att) throw notFound();
    await prisma.attachment.update({ where: { id }, data: { deletedAt: new Date() } });
    res.status(204).end();
  });

  return router;
}
