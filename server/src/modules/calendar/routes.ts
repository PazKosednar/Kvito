import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env.js";
import { audit } from "../../lib/audit.js";
import { randomToken, sha256 } from "../../lib/crypto.js";
import { addDays } from "../../lib/dates.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { dateOnly } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import { defaultWindow, landlordEvents, toIcs } from "./events.js";

const RangeQuery = z.object({ from: dateOnly.optional(), to: dateOnly.optional() });
/** At most ~2 years per request. */
const MAX_DAYS = 800;

const feedUrl = (token: string) => `${env.CLIENT_ORIGIN}/api/calendar-feed/${token}.ics`;

/** Signed in: the landlord's deadlines and their private calendar link. */
export function calendarRouter(): Router {
  const router = Router();

  router.get("/calendar", async (req, res) => {
    const userId = authUserId(req);
    const q = RangeQuery.parse(req.query);
    const window = defaultWindow();
    const from = q.from ?? window.from;
    const to = q.to ?? window.to;
    if (to < from || to.getTime() - from.getTime() > MAX_DAYS * 86_400_000) throw badRequest("BAD_RANGE");
    res.json({ events: await landlordEvents(userId, from, to) });
  });

  router.get("/calendar/feed", async (req, res) => {
    const feed = await prisma.calendarFeed.findUnique({ where: { userId: authUserId(req) }, select: { createdAt: true } });
    res.json({ feed: feed ? { createdAt: feed.createdAt } : null });
  });

  /** A new private link (an older one stops working). The token is shown only now. */
  router.post("/calendar/feed", async (req, res) => {
    const userId = authUserId(req);
    const token = randomToken(24);
    await prisma.calendarFeed.upsert({ where: { userId }, update: { tokenHash: sha256(token), createdAt: new Date() }, create: { userId, tokenHash: sha256(token) } });
    await audit({ actorId: userId, entityType: "CalendarFeed", entityId: userId, action: "create", ip: req.ip });
    res.status(201).json({ url: feedUrl(token) });
  });

  router.delete("/calendar/feed", async (req, res) => {
    const userId = authUserId(req);
    await prisma.calendarFeed.deleteMany({ where: { userId } });
    await audit({ actorId: userId, entityType: "CalendarFeed", entityId: userId, action: "delete", ip: req.ip });
    res.status(204).end();
  });

  return router;
}

/** Calendar apps poll the feed now and then; this keeps a leaked link from being hammered. */
const feedLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
});

/** Public (no sign-in, the secret link is the key): the .ics feed for Google, Apple or Outlook calendars. */
export function calendarPublicRouter(): Router {
  const router = Router();
  router.get("/calendar-feed/:file", feedLimiter, async (req, res) => {
    const m = /^([A-Za-z0-9_-]{20,64})\.ics$/.exec(String(req.params.file));
    if (!m) throw notFound();
    const feed = await prisma.calendarFeed.findUnique({ where: { tokenHash: sha256(m[1]!) }, select: { userId: true, user: { select: { deletedAt: true } } } });
    if (!feed || feed.user.deletedAt) throw notFound();
    const { from } = defaultWindow();
    const events = await landlordEvents(feed.userId, addDays(from, 60), addDays(new Date(), 548));
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="kvito.ics"');
    res.setHeader("Cache-Control", "private, max-age=900");
    res.send(toIcs(events, env.CLIENT_ORIGIN));
  });
  return router;
}
