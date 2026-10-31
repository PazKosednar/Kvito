import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env.js";
import { audit } from "../../lib/audit.js";
import { randomToken, sha256 } from "../../lib/crypto.js";
import { AppError, badRequest, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { idParam } from "../../lib/validation.js";
import { authUserId, requireAuth } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import type { EmailSender } from "../../services/email/EmailSender.js";
import { invitationEmail } from "../../services/email/templates.js";
import { assertTenancyLandlord } from "../access/access.js";
import { postSystemMessage } from "../messages/system.js";

const INVITE_TTL_DAYS = 14;

const CreateInvitationBody = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email().max(254))
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

const tokenParam = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);

const previewLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  message: { error: { code: "TOO_MANY_REQUESTS" } },
});

export const inviteUrl = (token: string) => `${env.CLIENT_ORIGIN}/povabilo/${token}`;

function invitationState(inv: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }) {
  if (inv.revokedAt) return "REVOKED" as const;
  if (inv.acceptedAt) return "ACCEPTED" as const;
  if (inv.expiresAt <= new Date()) return "EXPIRED" as const;
  return "PENDING" as const;
}

export function invitationsRouter(deps: { emailSender: EmailSender }): Router {
  const router = Router();

  // ---------- Public: preview an invitation (no login needed to see what you are joining) ----------
  router.get("/invitations/:token", previewLimiter, async (req, res) => {
    const token = tokenParam.parse(req.params.token);
    const inv = await prisma.invitation.findUnique({
      where: { tokenHash: sha256(token) },
      include: {
        inviter: { select: { name: true } },
        tenancy: {
          select: {
            deletedAt: true,
            unit: { select: { name: true, property: { select: { name: true, street: true, city: true } } } },
          },
        },
      },
    });
    if (!inv || inv.tenancy.deletedAt) throw notFound("INVITE_NOT_FOUND");
    res.json({
      invitation: {
        state: invitationState(inv),
        email: inv.email,
        landlordName: inv.inviter.name,
        unitName: inv.tenancy.unit.name,
        propertyName: inv.tenancy.unit.property.name,
        street: inv.tenancy.unit.property.street,
        city: inv.tenancy.unit.property.city,
        expiresAt: inv.expiresAt,
      },
    });
  });

  router.use(requireAuth);

  // ---------- Tenant: accept ----------
  router.post("/invitations/:token/accept", previewLimiter, async (req, res) => {
    const userId = authUserId(req);
    const token = tokenParam.parse(req.params.token);
    const result = await prisma.$transaction(async (tx) => {
      const inv = await tx.invitation.findUnique({
        where: { tokenHash: sha256(token) },
        include: { tenancy: { include: { unit: { include: { property: true } } } } },
      });
      if (!inv || inv.tenancy.deletedAt) throw notFound("INVITE_NOT_FOUND");
      const state = invitationState(inv);
      if (state !== "PENDING") throw new AppError(410, `INVITE_${state}`);
      if (inv.tenancy.unit.property.ownerId === userId) throw badRequest("INVITE_OWN_PROPERTY");

      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (inv.email && inv.email !== user.email) throw new AppError(403, "INVITE_EMAIL_MISMATCH");

      const member = await tx.tenancyMember.upsert({
        where: { tenancyId_userId: { tenancyId: inv.tenancyId, userId } },
        update: { leftAt: null, deletedAt: null, joinedAt: new Date() },
        create: { tenancyId: inv.tenancyId, userId },
      });
      const memberCount = await tx.tenancyMember.count({ where: { tenancyId: inv.tenancyId, deletedAt: null, leftAt: null } });
      if (memberCount === 1) await tx.tenancyMember.update({ where: { id: member.id }, data: { isPrimary: true } });

      await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date(), acceptedById: userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          roles: user.roles.includes("TENANT") ? user.roles : [...user.roles, "TENANT"],
          lastActiveRole: "TENANT",
        },
      });
      await audit({ actorId: userId, entityType: "Invitation", entityId: inv.id, action: "accept", ip: req.ip }, tx);
      await postSystemMessage(tx, inv.tenancyId, "MEMBER_JOINED", { name: user.name ?? user.email });
      return { tenancyId: inv.tenancyId };
    });
    res.json(result);
  });

  // ---------- Landlord: create / list / revoke ----------
  router.post("/tenancies/:id/invitations", validateBody(CreateInvitationBody), async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyLandlord(userId, tenancyId);
    const { email } = req.body as z.infer<typeof CreateInvitationBody>;

    const token = randomToken(24);
    const invitation = await prisma.invitation.create({
      data: {
        tenancyId,
        inviterId: userId,
        email: email ?? null,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      },
      include: {
        inviter: { select: { name: true } },
        tenancy: { select: { unit: { select: { name: true, property: { select: { name: true } } } } } },
      },
    });
    await audit({ actorId: userId, entityType: "Invitation", entityId: invitation.id, action: "create", after: { email: email ?? null }, ip: req.ip });

    const url = inviteUrl(token);
    if (email) {
      await deps.emailSender.send(
        invitationEmail(email, {
          url,
          landlordName: invitation.inviter.name,
          place: `${invitation.tenancy.unit.property.name}, ${invitation.tenancy.unit.name}`,
          days: INVITE_TTL_DAYS,
        }),
      );
    }
    // The token is only ever returned here; the server keeps just its hash.
    res.status(201).json({
      invitation: { id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt, state: "PENDING" },
      url,
    });
  });

  router.get("/tenancies/:id/invitations", async (req, res) => {
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyLandlord(authUserId(req), tenancyId);
    const invitations = await prisma.invitation.findMany({
      where: { tenancyId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { acceptedBy: { select: { name: true, email: true } } },
    });
    res.json({
      invitations: invitations.map((i) => ({
        id: i.id,
        email: i.email,
        state: invitationState(i),
        createdAt: i.createdAt,
        expiresAt: i.expiresAt,
        acceptedBy: i.acceptedBy,
      })),
    });
  });

  router.delete("/invitations/:id", async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    const inv = await prisma.invitation.findUnique({ where: { id } });
    if (!inv) throw notFound();
    await assertTenancyLandlord(userId, inv.tenancyId);
    await prisma.invitation.update({ where: { id }, data: { revokedAt: new Date() } });
    await audit({ actorId: userId, entityType: "Invitation", entityId: id, action: "revoke", ip: req.ip });
    res.status(204).end();
  });

  return router;
}
