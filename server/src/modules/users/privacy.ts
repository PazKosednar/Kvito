import { Router } from "express";
import { z } from "zod";
import { audit } from "../../lib/audit.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { REFRESH_COOKIE } from "../auth/routes.js";
import { authUserId } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";

const DeleteBody = z.object({ email: z.string().trim().toLowerCase() });

/** Name shown to the other party for things this person wrote or paid before leaving. */
export const DELETED_USER_NAME = "Izbrisan uporabnik";

/**
 * Everything Kvito holds about one person, as plain data (GDPR access/portability).
 * Files are listed by name only; binary content is not part of the export.
 */
export async function exportUserData(userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) throw notFound();

  const [properties, memberships, reports, messages, issues, issueComments, meters, documents, notifications, subscriptions, audits] = await Promise.all([
    prisma.property.findMany({
      where: { ownerId: userId, deletedAt: null },
      select: { id: true, name: true, street: true, postalCode: true, city: true, createdAt: true, units: { where: { deletedAt: null }, select: { id: true, name: true, floor: true } } },
    }),
    prisma.tenancyMember.findMany({
      where: { userId },
      select: {
        id: true,
        joinedAt: true,
        leftAt: true,
        tenancy: { select: { id: true, startDate: true, endDate: true, rentCents: true, unit: { select: { name: true, property: { select: { name: true } } } } } },
        shares: { where: { deletedAt: null }, select: { amountCents: true, status: true, confirmedAt: true, charge: { select: { title: true, dueDate: true, costType: true } } } },
      },
    }),
    prisma.paymentReport.findMany({ where: { reportedById: userId, deletedAt: null }, select: { paidOn: true, amountCents: true, note: true, status: true, createdAt: true } }),
    prisma.message.findMany({ where: { authorId: userId, kind: "USER" }, select: { tenancyId: true, body: true, createdAt: true } }),
    prisma.issue.findMany({ where: { reporterId: userId, deletedAt: null }, select: { title: true, description: true, status: true, createdAt: true } }),
    prisma.issueComment.findMany({ where: { authorId: userId }, select: { body: true, createdAt: true } }),
    prisma.meterReading.findMany({ where: { recordedById: userId, deletedAt: null }, select: { meterType: true, meterLabel: true, valueMilli: true, readOn: true } }),
    prisma.document.findMany({ where: { uploadedById: userId, deletedAt: null }, select: { title: true, category: true, createdAt: true } }),
    prisma.notification.findMany({ where: { userId }, select: { type: true, title: true, body: true, createdAt: true, readAt: true } }),
    prisma.pushSubscription.findMany({ where: { userId }, select: { provider: true, userAgent: true, createdAt: true } }),
    prisma.auditLog.findMany({ where: { actorId: userId }, orderBy: { createdAt: "desc" }, take: 1000, select: { entityType: true, action: true, createdAt: true, ip: true } }),
  ]);

  return JSON.parse(
    JSON.stringify(
      {
        exportedAt: new Date(),
        note: "Podatki, ki jih Kvito hrani o tebi. Datotek (slike, PDF) izvoz ne vsebuje.",
        profile: { id: user.id, email: user.email, name: user.name, phone: user.phone, locale: user.locale, roles: user.roles, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt },
        propertiesAsLandlord: properties,
        tenancies: memberships,
        paymentReports: reports,
        messages,
        issues,
        issueComments,
        meterReadings: meters.map((m) => ({ ...m, value: Number(m.valueMilli) / 1000, valueMilli: undefined })),
        documents,
        notifications,
        pushDevices: subscriptions,
        activityLog: audits,
      },
      (_k, v: unknown) => (typeof v === "bigint" ? Number(v) : v),
    ),
  ) as Record<string, unknown>;
}

/**
 * Deletes the account the way an app that keeps other people's bookkeeping must: the person disappears
 * (name, e-mail, phone, devices, sessions, notifications), while records the other party still needs
 * (charges, confirmed payments, messages) stay, attached to "Izbrisan uporabnik".
 * TODO(pravnik): confirm retention periods for accounting records before launch.
 */
export async function deleteAccount(userId: string, ip: string | undefined): Promise<void> {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) throw notFound();

  const active = await prisma.tenancy.count({
    where: { deletedAt: null, status: "ACTIVE", unit: { property: { ownerId: userId, deletedAt: null } } },
  });
  if (active > 0) throw badRequest("ACCOUNT_HAS_ACTIVE_TENANCIES");

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Landlord side: empty properties go away with the account.
    const props = await tx.property.findMany({ where: { ownerId: userId, deletedAt: null }, select: { id: true } });
    const propertyIds = props.map((p) => p.id);
    if (propertyIds.length) {
      await tx.unit.updateMany({ where: { propertyId: { in: propertyIds }, deletedAt: null }, data: { deletedAt: now } });
      await tx.property.updateMany({ where: { id: { in: propertyIds } }, data: { deletedAt: now } });
    }
    // Tenant side: leave every tenancy.
    await tx.tenancyMember.updateMany({ where: { userId, leftAt: null, deletedAt: null }, data: { leftAt: now } });
    // Pending invitations of this person can no longer be used.
    await tx.invitation.updateMany({ where: { inviterId: userId, acceptedAt: null, revokedAt: null }, data: { revokedAt: now } });

    await tx.refreshToken.deleteMany({ where: { userId } });
    // Shared renting-history links stop working with the account.
    await tx.tenantReference.deleteMany({ where: { userId } });
    await tx.pushSubscription.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.loginCode.deleteMany({ where: { email: user.email } });
    await tx.user.update({
      where: { id: userId },
      data: { email: `deleted-${userId}@deleted.invalid`, name: DELETED_USER_NAME, phone: null, passwordHash: null, roles: [], lastActiveRole: null, deletedAt: now },
    });
    await audit({ actorId: userId, entityType: "User", entityId: userId, action: "account.delete", ip }, tx);
  });
}

export function privacyRouter(): Router {
  const router = Router();

  router.get("/privacy/export", async (req, res) => {
    const userId = authUserId(req);
    const data = await exportUserData(userId);
    await audit({ actorId: userId, entityType: "User", entityId: userId, action: "export.data", ip: req.ip });
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="kvito-moji-podatki.json"');
    res.send(JSON.stringify(data, null, 2));
  });

  /** The person types their own e-mail address to confirm. */
  router.delete("/privacy/account", validateBody(DeleteBody), async (req, res) => {
    const userId = authUserId(req);
    const { email } = req.body as z.infer<typeof DeleteBody>;
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { email: true } });
    if (!user) throw notFound();
    if (user.email !== email) throw badRequest("CONFIRMATION_MISMATCH");
    await deleteAccount(userId, req.ip);
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    res.status(204).end();
  });

  return router;
}
