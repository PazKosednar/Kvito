import { bus } from "../../lib/events.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import type { Notifier } from "./notifier.js";

export const eur = (cents: number) =>
  new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR", useGrouping: "always" }).format(cents / 100);

const chargeUrl = (tenancyId: string, chargeId: string) => `/najemi/${tenancyId}/obveznosti/${chargeId}`;

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
      const url = chargeUrl(e.tenancyId, e.chargeId);
      const base = { url, email: "fallback" as const };
      const amount = eur(e.amountCents);

      if (e.kind === "created") {
        for (const userId of ppl.tenantIds.filter((u) => u !== e.actorId)) {
          await notifier.notify({ ...base, userId, type: "charge.created", title: "Nova obveznost", body: `${e.title}: ${amount}`, dedupeKey: `charge.created:${e.chargeId}:${userId}` });
        }
        return;
      }
      if (e.kind === "reported" || e.kind === "disputed") {
        const who = e.shareUserId ? await prisma.user.findUnique({ where: { id: e.shareUserId }, select: { name: true, email: true } }) : null;
        const name = who?.name ?? who?.email ?? "Najemnik";
        if (ppl.landlordId === e.actorId) return;
        await notifier.notify({
          ...base,
          userId: ppl.landlordId,
          type: `payment.${e.kind}`,
          title: e.kind === "reported" ? "Plačilo čaka na potrditev" : "Najemnik se ne strinja z obveznostjo",
          body: `${name}: ${e.title} (${amount})`,
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
        title: e.kind === "confirmed" ? "Plačilo potrjeno" : "Plačilo ni bilo potrjeno",
        body: e.kind === "confirmed" ? `${e.title}: ${amount} je poravnano.` : `${e.title}: preveri razlog in poskusi znova.`,
        dedupeKey: `payment.${e.kind}:${e.chargeId}:${e.shareUserId}:${Date.now()}`,
      });
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
      const preview = message.body.length > 90 ? `${message.body.slice(0, 87)}…` : message.body || "Priloga";
      for (const userId of new Set(recipients)) {
        await notifier.notify({
          userId,
          type: "message",
          title: message.author?.name ?? message.author?.email ?? "Novo sporočilo",
          body: preview,
          url: `/najemi/${tenancyId}/sporocila`,
          email: "never",
          dedupeKey: `message:${message.id}:${userId}`,
        });
      }
    }),
  );

  return () => {
    offCharge();
    offMessage();
  };
}
