import { Router } from "express";
import { z } from "zod";
import { notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { idParam } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";

const SubscribeBody = z.object({
  endpoint: z.string().url().max(1000).startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  userAgent: z.string().max(300).optional(),
});
const UnsubscribeBody = z.object({ endpoint: z.string().url().max(1000) });
const ReadBody = z.object({ ids: z.array(idParam).max(100).optional() });

export function notificationsRouter(deps: { pushPublicKey?: string | null }): Router {
  const router = Router();

  /** Inbox: latest 50 and the number of unread ones. */
  router.get("/notifications", async (req, res) => {
    const userId = authUserId(req);
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, type: true, title: true, body: true, url: true, readAt: true, createdAt: true },
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    res.json({ notifications: items, unread });
  });

  /** Marks the given notifications (or all of them) as read. */
  router.post("/notifications/read", validateBody(ReadBody), async (req, res) => {
    const userId = authUserId(req);
    const { ids } = req.body as z.infer<typeof ReadBody>;
    await prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    res.status(204).end();
  });

  /** Public VAPID key the browser needs to subscribe (null = push is not configured on this server). */
  router.get("/push/config", (_req, res) => {
    res.json({ publicKey: deps.pushPublicKey ?? null });
  });

  router.post("/push/subscriptions", validateBody(SubscribeBody), async (req, res) => {
    const userId = authUserId(req);
    const b = req.body as z.infer<typeof SubscribeBody>;
    // The endpoint is unique per browser; if the device switched accounts, it now belongs to this user.
    await prisma.pushSubscription.upsert({
      where: { endpoint: b.endpoint },
      update: { userId, p256dh: b.keys.p256dh, auth: b.keys.auth, userAgent: b.userAgent ?? null },
      create: { userId, provider: "WEB_PUSH", endpoint: b.endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth, userAgent: b.userAgent ?? null },
    });
    res.status(201).json({ ok: true });
  });

  router.delete("/push/subscriptions", validateBody(UnsubscribeBody), async (req, res) => {
    const userId = authUserId(req);
    const { endpoint } = req.body as z.infer<typeof UnsubscribeBody>;
    const { count } = await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    if (!count) throw notFound();
    res.status(204).end();
  });

  return router;
}
