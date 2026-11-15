import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { audit } from "../../lib/audit.js";
import { randomToken, sha256 } from "../../lib/crypto.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { summarizeHistory, type TenantHistory } from "../../lib/tenant-history.js";
import { idParam } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";

/**
 * Najemniški življenjepis: a tenant shares a link with a future landlord. The summary is built from what
 * landlords entered and confirmed in Kvito (payments, deposits), without amounts or addresses. Kvito does not verify
 * who a landlord is, so the reader also gets how long each landlord has used Kvito and with how many other tenants. The tenant decides who sees it
 * (the link), for how long (expiry) and can revoke it any time.
 */

const CreateBody = z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30) });
const MAX_ACTIVE = 10;

/** What the reader may want to know to weigh the confirmations: how long each landlord has used Kvito, and with how many other tenants. */
export interface LandlordInfo {
  since: Date;
  otherTenants: number;
}

async function historyOf(userId: string): Promise<{ name: string; history: TenantHistory; landlords: number; landlordInfo: LandlordInfo[] }> {
  const user = await prisma.user.findFirstOrThrow({ where: { id: userId, deletedAt: null }, select: { name: true, email: true } });
  // Only tenancies of other people with a confirmed e-mail count: a tenant cannot confirm their own payments
  // by renting from themselves.
  const memberships = await prisma.tenancyMember.findMany({
    where: {
      userId,
      deletedAt: null,
      tenancy: { deletedAt: null, unit: { property: { ownerId: { not: userId }, owner: { deletedAt: null, emailVerifiedAt: { not: null } } } } },
    },
    select: {
      joinedAt: true,
      leftAt: true,
      tenancy: { select: { id: true, startDate: true, endDate: true, status: true, unit: { select: { property: { select: { ownerId: true } } } } } },
    },
  });
  const tenancyIds = memberships.map((m) => m.tenancy.id);
  const [shares, deposits, settlementsAccepted] = await Promise.all([
    prisma.chargeShare.findMany({
      where: { deletedAt: null, member: { userId, deletedAt: null }, charge: { deletedAt: null, tenancyId: { in: tenancyIds } } },
      select: {
        status: true,
        confirmedAt: true,
        charge: { select: { dueDate: true } },
        paymentReports: { where: { status: "ACCEPTED", deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { paidOn: true } },
      },
    }),
    prisma.deposit.findMany({ where: { tenancyId: { in: tenancyIds } }, select: { status: true, amountCents: true, returnCents: true } }),
    prisma.costSettlement.count({ where: { tenancyId: { in: tenancyIds }, deletedAt: null, status: { in: ["ACCEPTED", "CLOSED"] } } }),
  ]);
  const history = summarizeHistory({
    memberships: memberships.map((m) => ({
      from: m.joinedAt > m.tenancy.startDate ? m.joinedAt : m.tenancy.startDate,
      to: m.leftAt ?? (m.tenancy.status === "ENDED" ? (m.tenancy.endDate ?? null) : null),
    })),
    shares: shares.map((s) => ({ dueDate: s.charge.dueDate, status: s.status, paidOn: s.paymentReports[0]?.paidOn ?? null, confirmedAt: s.confirmedAt })),
    deposits,
    settlementsAccepted,
    today: new Date(),
  });
  const ownerIds = [...new Set(memberships.map((m) => m.tenancy.unit.property.ownerId))];
  const landlordInfo = await Promise.all(
    ownerIds.map(async (ownerId) => {
      const [owner, others] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { createdAt: true } }),
        prisma.tenancyMember.findMany({
          where: { deletedAt: null, userId: { not: userId }, tenancy: { deletedAt: null, unit: { property: { ownerId } } } },
          distinct: ["userId"],
          select: { userId: true },
        }),
      ]);
      return { since: owner.createdAt, otherTenants: others.length };
    }),
  );
  return { name: user.name ?? user.email.split("@")[0]!, history, landlords: ownerIds.length, landlordInfo };
}

const urlFor = (token: string) => `${env.CLIENT_ORIGIN}/referenca/${token}`;

/** Public: what a future landlord sees behind the link. */
export function referencesPublicRouter(): Router {
  const router = Router();
  router.get("/references/:token", async (req, res) => {
    const token = z.string().min(20).max(100).parse(req.params.token);
    const ref = await prisma.tenantReference.findUnique({ where: { tokenHash: sha256(token) } });
    if (!ref || ref.revokedAt || ref.expiresAt < new Date()) throw notFound();
    const { name, history, landlords, landlordInfo } = await historyOf(ref.userId);
    await prisma.tenantReference.update({ where: { id: ref.id }, data: { views: { increment: 1 }, lastViewedAt: new Date() } });
    res.setHeader("Cache-Control", "no-store");
    res.json({ reference: { name, history, landlords, landlordInfo, createdAt: ref.createdAt, expiresAt: ref.expiresAt } });
  });
  return router;
}

/** Signed in: the tenant's own history and the links they shared. */
export function referencesRouter(): Router {
  const router = Router();

  router.get("/my-history", async (req, res) => {
    res.json(await historyOf(authUserId(req)));
  });

  router.get("/references", async (req, res) => {
    const references = await prisma.tenantReference.findMany({
      where: { userId: authUserId(req), revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, expiresAt: true, views: true, lastViewedAt: true },
    });
    res.json({ references });
  });

  /** The link is shown once, at creation; only its hash is stored. */
  router.post("/references", validateBody(CreateBody), async (req, res) => {
    const userId = authUserId(req);
    const body = req.body as z.infer<typeof CreateBody>;
    const active = await prisma.tenantReference.count({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (active >= MAX_ACTIVE) throw badRequest("TOO_MANY_LINKS");
    const token = randomToken(24);
    const reference = await prisma.tenantReference.create({
      data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + body.days * 86_400_000) },
      select: { id: true, createdAt: true, expiresAt: true, views: true, lastViewedAt: true },
    });
    await audit({ actorId: userId, entityType: "TenantReference", entityId: reference.id, action: "create", after: { days: body.days }, ip: req.ip });
    res.status(201).json({ reference, url: urlFor(token) });
  });

  router.delete("/references/:id", async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    const { count } = await prisma.tenantReference.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!count) throw notFound();
    await audit({ actorId: userId, entityType: "TenantReference", entityId: id, action: "revoke", ip: req.ip });
    res.status(204).end();
  });

  return router;
}
