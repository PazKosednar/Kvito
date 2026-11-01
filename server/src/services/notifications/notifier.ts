import { Prisma } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import type { EmailSender } from "../email/EmailSender.js";
import { notificationEmail } from "../email/templates.js";
import type { PushSender } from "../push/PushSender.js";

export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  /** App path opened when the notification is tapped, e.g. "/najemi/…/obveznosti/…". */
  url?: string | null;
  /** The same key never produces a second notification – this is what makes reminders idempotent. */
  dedupeKey?: string;
  /** "fallback": e-mail only when no push reached the person. "never": in-app + push only (chatty events). */
  email?: "fallback" | "never";
}

export interface Notifier {
  /** Returns false when the notification already existed (dedupeKey). */
  notify(input: NotifyInput): Promise<boolean>;
  readonly pushPublicKey: string | null;
}

/**
 * One notification = one row in the in-app inbox + a push to every device of the person.
 * If no push got through, important notifications go out as e-mail instead.
 */
export function createNotifier(deps: { emailSender: EmailSender; pushSender: PushSender }): Notifier {
  const { emailSender, pushSender } = deps;

  async function deliver(id: string, input: NotifyInput): Promise<void> {
    const subs = await prisma.pushSubscription.findMany({ where: { userId: input.userId } });
    let pushed = 0;
    for (const sub of subs) {
      const result = await pushSender.send(sub, {
        title: input.title,
        body: input.body,
        url: input.url ?? null,
        tag: input.dedupeKey ?? id,
      });
      if (result === "sent") {
        pushed++;
        await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
      } else if (result === "gone") {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      }
    }
    if (pushed > 0) await prisma.notification.update({ where: { id }, data: { pushedAt: new Date() } });

    if (pushed === 0 && (input.email ?? "fallback") === "fallback") {
      const user = await prisma.user.findFirst({ where: { id: input.userId, deletedAt: null }, select: { email: true } });
      if (!user) return;
      await emailSender.send(notificationEmail(user.email, { title: input.title, body: input.body, url: input.url ? `${env.CLIENT_ORIGIN}${input.url}` : env.CLIENT_ORIGIN }));
      await prisma.notification.update({ where: { id }, data: { emailedAt: new Date() } });
    }
  }

  return {
    pushPublicKey: pushSender.publicKey,
    async notify(input) {
      let id: string;
      try {
        const row = await prisma.notification.create({
          data: {
            userId: input.userId,
            type: input.type,
            title: input.title,
            body: input.body,
            url: input.url ?? null,
            dedupeKey: input.dedupeKey ?? null,
          },
          select: { id: true },
        });
        id = row.id;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
        throw err;
      }
      try {
        await deliver(id, input);
      } catch (err) {
        // The inbox entry exists; a failed push/e-mail must not fail the caller.
        logger.warn({ err, type: input.type }, "Notification delivery failed");
      }
      return true;
    },
  };
}
