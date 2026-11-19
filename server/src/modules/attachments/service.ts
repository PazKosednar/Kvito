import type { AttachmentKind, Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { badRequest } from "../../lib/errors.js";
import { signedFileUrl } from "../../lib/files.js";

type Db = PrismaClient | Prisma.TransactionClient;

export interface AttachmentDto {
  id: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: Date;
}

export const attachmentDto = (a: {
  id: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}): AttachmentDto => ({
  id: a.id,
  kind: a.kind,
  fileName: a.fileName,
  mimeType: a.mimeType,
  sizeBytes: a.sizeBytes,
  url: signedFileUrl(a.id),
  createdAt: a.createdAt,
});

export const attachmentSelect = {
  where: { deletedAt: null },
  select: { id: true, kind: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
  orderBy: { createdAt: "asc" },
} as const;

type Link =
  | { chargeId: string }
  | { paymentReportId: string }
  | { messageId: string }
  | { issueId: string }
  | { issueCommentId: string }
  | { meterReadingId: string }
  | { handoverItemId: string }
  | { documentId: string }
  | { settlementId: string }
  | { costEntryId: string };

/**
 * Links freshly uploaded files to a record. Only files uploaded by the same person, to the same tenancy,
 * of the expected kind and not linked yet can be claimed.
 */
export async function claimAttachments(
  db: Db,
  ids: string[] | undefined,
  opts: { tenancyId: string; uploadedById: string; kinds: AttachmentKind[]; link: Link },
): Promise<void> {
  if (!ids?.length) return;
  const unique = [...new Set(ids)];
  const { count } = await db.attachment.updateMany({
    where: {
      id: { in: unique },
      tenancyId: opts.tenancyId,
      uploadedById: opts.uploadedById,
      kind: { in: opts.kinds },
      deletedAt: null,
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
    },
    data: opts.link,
  });
  if (count !== unique.length) throw badRequest("ATTACHMENT_INVALID");
}
