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
  | "DOCUMENT_ADDED"
  | "DEPOSIT_PROPOSED"
  | "DEPOSIT_AGREED"
  | "DEPOSIT_DISPUTED"
  | "DEPOSIT_RETURNED"
  | "SETTLEMENT_SENT"
  | "SETTLEMENT_ACCEPTED"
  | "SETTLEMENT_DISPUTED"
  /** Accepted with a credit: what the tenant chose to do with it. */
  | "SETTLEMENT_CREDIT_CARRY_OVER"
  | "SETTLEMENT_CREDIT_OFFSET_NEXT"
  | "SETTLEMENT_CREDIT_REFUND"
  | "RENT_CHANGED";

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
