import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { bus } from "../../lib/events.js";

type Db = PrismaClient | Prisma.TransactionClient;

/** Event codes of system messages; the client renders them as friendly sentences. */
export type SystemEvent =
  | "MEMBER_JOINED"
  | "CHARGE_CREATED"
  | "PAYMENT_REPORTED"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_REJECTED"
  | "CHARGE_DISPUTED"
  | "ISSUE_CREATED"
  | "ISSUE_STATUS"
  | "HANDOVER_READY"
  | "HANDOVER_CONFIRMED"
  | "DOCUMENT_ADDED";

export async function postSystemMessage(
  db: Db,
  tenancyId: string,
  event: SystemEvent,
  data: Record<string, string | number | null>,
  links: { chargeId?: string; issueId?: string } = {},
): Promise<void> {
  const message = await db.message.create({
    data: {
      tenancyId,
      kind: "SYSTEM",
      body: event,
      systemEvent: event,
      systemData: data,
      chargeId: links.chargeId ?? null,
      issueId: links.issueId ?? null,
    },
  });
  // Emitted right away; listeners re-read from the DB, so a rolled-back transaction only causes a harmless refetch.
  bus.emit("message.created", { tenancyId, messageId: message.id });
}
