import { N, type LocalizedText } from "../../i18n/notifications.js";
import { bus } from "../../lib/events.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import type { Notifier } from "./notifier.js";

export const eur = (cents: number) =>
  new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR", useGrouping: "always" }).format(cents / 100);

const chargeUrl = (tenancyId: string, chargeId: string) => `/najemi/${tenancyId}/obveznosti/${chargeId}`;
const contractUrl = (tenancyId: string) => `/najemi/${tenancyId}/pogodba`;
const settlementUrl = (tenancyId: string, settlementId: string) => `/najemi/${tenancyId}/pogodba/obracun/${settlementId}`;

/** Landlord and current tenants of a tenancy – the people who may get a notification about it. */
async function people(tenancyId: string) {
  const tenancy = await prisma.tenancy.findFirst({
    where: { id: tenancyId, deletedAt: null },
    select: {
      unit: { select: { name: true, property: { select: { ownerId: true } } } },
      members: { where: { deletedAt: null, leftAt: null }, select: { userId: true } },
    },
  });
  if (!tenancy) return null;
  return {
    unitName: tenancy.unit.name,
    landlordId: tenancy.unit.property.ownerId,
    tenantIds: tenancy.members.map((m) => m.userId),
  };
}

async function displayName(userId: string | null | undefined, fallback: string): Promise<string> {
  if (!userId) return fallback;
  const who = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  return who?.name ?? who?.email ?? fallback;
}

/**
 * Turns domain events into notifications. Everything here is best-effort: a failure is logged and never
 * reaches the request that caused the event.
 */
export function attachNotificationListeners(notifier: Notifier): () => void {
  const guard = (label: string, fn: () => Promise<void>) => void fn().catch((err: unknown) => logger.warn({ err }, `Notification listener failed: ${label}`));

  const offCharge = bus.on("charge.activity", (e) =>
    guard("charge.activity", async () => {
      const ppl = await people(e.tenancyId);
      if (!ppl) return;
      const base = { url: chargeUrl(e.tenancyId, e.chargeId), email: "fallback" as const };

      if (e.kind === "created") {
        for (const userId of ppl.tenantIds.filter((u) => u !== e.actorId)) {
          await notifier.notify({ ...base, userId, type: "charge.created", text: N.chargeCreated(e.charge, e.amountCents), dedupeKey: `charge.created:${e.chargeId}:${userId}` });
        }
        return;
      }
      if (e.kind === "reported" || e.kind === "disputed") {
        if (ppl.landlordId === e.actorId) return;
        const name = await displayName(e.shareUserId, "Najemnik");
        await notifier.notify({
          ...base,
          userId: ppl.landlordId,
          type: `payment.${e.kind}`,
          text: e.kind === "reported" ? N.paymentReported(name, e.charge, e.amountCents) : N.paymentDisputed(name, e.charge, e.amountCents),
          dedupeKey: `payment.${e.kind}:${e.chargeId}:${e.shareUserId ?? ""}:${Date.now()}`,
        });
        return;
      }
      // confirmed / rejected → the tenant whose share it is
      if (!e.shareUserId || e.shareUserId === e.actorId) return;
      await notifier.notify({
        ...base,
        userId: e.shareUserId,
        type: `payment.${e.kind}`,
        text: e.kind === "confirmed" ? N.paymentConfirmed(e.charge, e.amountCents) : N.paymentRejected(e.charge),
        dedupeKey: `payment.${e.kind}:${e.chargeId}:${e.shareUserId}:${Date.now()}`,
      });
    }),
  );

  // Deposit, settlement and rent changes go to the other side of the tenancy.
  const offContract = bus.on("contract.activity", (e) =>
    guard("contract.activity", async () => {
      const ppl = await people(e.tenancyId);
      if (!ppl) return;
      const name = await displayName(e.actorId, "Najemnik");
      const toTenants = (text: LocalizedText, url: string) => ({ to: ppl.tenantIds, text, url });
      const toLandlord = (text: LocalizedText, url: string) => ({ to: [ppl.landlordId], text, url });

      let n: { to: string[]; text: LocalizedText; url: string };
      switch (e.kind) {
        case "deposit.proposed":
          n = toTenants(N.depositProposed(e.returnCents, e.keptCents), contractUrl(e.tenancyId));
          break;
        case "deposit.agreed":
          n = toLandlord(N.depositAgreed(name), contractUrl(e.tenancyId));
          break;
        case "deposit.disputed":
          n = toLandlord(N.depositDisputed(name), contractUrl(e.tenancyId));
          break;
        case "deposit.returned":
          n = toTenants(N.depositReturned(e.returnCents, e.returnedOn), contractUrl(e.tenancyId));
          break;
        case "deposit.receipt":
          n = toLandlord(N.depositReceipt(name), contractUrl(e.tenancyId));
          break;
        case "settlement.sent":
          n = toTenants(N.settlementSent(e.periodFrom, e.periodTo, e.balanceCents), settlementUrl(e.tenancyId, e.settlementId));
          break;
        case "settlement.accepted":
          n = toLandlord(N.settlementAccepted(name), settlementUrl(e.tenancyId, e.settlementId));
          break;
        case "settlement.disputed":
          n = toLandlord(N.settlementDisputed(name), settlementUrl(e.tenancyId, e.settlementId));
          break;
        case "settlement.refunded":
          n = toTenants(N.settlementRefunded(e.refundCents, e.refundedOn), settlementUrl(e.tenancyId, e.settlementId));
          break;
        case "settlement.refundReceipt":
          n = toLandlord(N.settlementRefundReceipt(name), settlementUrl(e.tenancyId, e.settlementId));
          break;
        case "rent.scheduled":
          n = toTenants(N.rentScheduled(e.rentCents, e.effectiveFrom), contractUrl(e.tenancyId));
          break;
      }
      const stamp = Date.now();
      for (const userId of new Set(n.to.filter((u) => u !== e.actorId))) {
        await notifier.notify({ userId, type: e.kind, text: n.text, url: n.url, email: "fallback", dedupeKey: `${e.kind}:${e.tenancyId}:${userId}:${stamp}` });
      }
    }),
  );

  // Chat messages: in-app + push only. They are never e-mailed (people read them in the app).
  const offMessage = bus.on("message.created", ({ tenancyId, messageId }) =>
    guard("message.created", async () => {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { id: true, kind: true, body: true, authorId: true, author: { select: { name: true, email: true } } },
      });
      if (!message || message.kind !== "USER" || !message.authorId) return;
      const ppl = await people(tenancyId);
      if (!ppl) return;
      const recipients = [ppl.landlordId, ...ppl.tenantIds].filter((u) => u !== message.authorId);
      const preview = message.body.length > 90 ? `${message.body.slice(0, 87)}…` : message.body;
      for (const userId of new Set(recipients)) {
        await notifier.notify({
          userId,
          type: "message",
          text: N.message(message.author?.name ?? message.author?.email ?? null, preview),
          url: `/najemi/${tenancyId}/sporocila`,
          email: "never",
          dedupeKey: `message:${message.id}:${userId}`,
        });
      }
    }),
  );

  return () => {
    offCharge();
    offContract();
    offMessage();
  };
}
