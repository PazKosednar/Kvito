import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";

const DAY = 86_400_000;

/**
 * Retention periods (see docs/RETENTION.md). Only short-lived technical data is removed here.
 * Financial records (charges, payments, audit log) are never purged automatically.
 * TODO(pravnik): confirm the retention periods for accounting records and the audit log.
 */
export const RETENTION_DAYS = {
  loginCodes: 1,
  sessions: 30,
  readNotifications: 180,
  unreadNotifications: 365,
  invitations: 90,
} as const;

export async function purgeExpiredData(now = new Date()): Promise<Record<string, number>> {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const result = {
    loginCodes: (await prisma.loginCode.deleteMany({ where: { expiresAt: { lt: ago(RETENTION_DAYS.loginCodes) } } })).count,
    sessions: (
      await prisma.refreshToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: ago(RETENTION_DAYS.sessions) } }, { revokedAt: { lt: ago(RETENTION_DAYS.sessions) } }] },
      })
    ).count,
    notifications: (
      await prisma.notification.deleteMany({
        where: { OR: [{ readAt: { lt: ago(RETENTION_DAYS.readNotifications) } }, { createdAt: { lt: ago(RETENTION_DAYS.unreadNotifications) } }] },
      })
    ).count,
    invitations: (
      await prisma.invitation.deleteMany({
        where: {
          acceptedAt: null,
          OR: [{ expiresAt: { lt: ago(RETENTION_DAYS.invitations) } }, { revokedAt: { lt: ago(RETENTION_DAYS.invitations) } }],
        },
      })
    ).count,
  };
  const total = Object.values(result).reduce((a, b) => a + b, 0);
  if (total) logger.info(result, "Hramba: izbrisani pretečeni podatki");
  return result;
}
