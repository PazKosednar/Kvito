import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import type { Storage } from "../storage/Storage.js";

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
  /** A deleted file stays in storage this long (undo, support), then the bytes are removed. */
  deletedFiles: 30,
  /** An uploaded file that was never attached to anything (abandoned form) counts as deleted after this. */
  unattachedFiles: 7,
} as const;

/** Files removed from storage per run; the job runs every 15 minutes, so a backlog clears quickly. */
const FILE_BATCH = 200;

/** Upload slots on Attachment: a row with none of them set was never attached to anything. */
const UNATTACHED = {
  chargeId: null,
  paymentReportId: null,
  messageId: null,
  issueId: null,
  issueCommentId: null,
  meterReadingId: null,
  handoverItemId: null,
  documentId: null,
  settlementId: null,
  costEntryId: null,
  expenseId: null,
  propertyId: null,
  unitId: null,
} as const;

/**
 * Deleted files leave storage for good: abandoned uploads are marked deleted, and files deleted more than
 * RETENTION_DAYS.deletedFiles ago are removed from storage (the database row stays, marked purgedAt).
 * TODO(pravnik): confirm the 30-day period (and that it fits the privacy policy).
 */
export async function purgeDeletedFiles(storage: Storage, now = new Date()): Promise<{ unattached: number; files: number }> {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const unattached = (
    await prisma.attachment.updateMany({ where: { deletedAt: null, createdAt: { lt: ago(RETENTION_DAYS.unattachedFiles) }, ...UNATTACHED }, data: { deletedAt: now } })
  ).count;
  const due = await prisma.attachment.findMany({
    where: { deletedAt: { lt: ago(RETENTION_DAYS.deletedFiles) }, purgedAt: null },
    select: { id: true, storageKey: true },
    orderBy: { deletedAt: "asc" },
    take: FILE_BATCH,
  });
  let files = 0;
  for (const a of due) {
    try {
      await storage.remove(a.storageKey);
      await prisma.attachment.update({ where: { id: a.id }, data: { purgedAt: now } });
      files++;
    } catch (err) {
      // Try again on the next run; one broken object must not stop the rest.
      logger.warn({ err, attachmentId: a.id }, "Hramba: datoteke ni bilo mogoče izbrisati");
    }
  }
  if (unattached || files) logger.info({ unattached, files }, "Hramba: izbrisane datoteke");
  return { unattached, files };
}

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
