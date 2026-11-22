import type { RequestHandler } from "express";
import { webhooks } from "@polar-sh/sdk/2026-10";
import type { Plan, SubscriptionStatus } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { audit } from "../../lib/audit.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { productPlan } from "./polar.js";

/** The subscription fields Kvito reads from a Polar `subscription.*` event (the full state, not a delta). */
export interface PolarSubscriptionData {
  id: string;
  status: string;
  created_at: string;
  modified_at: string | null;
  current_period_end: string;
  cancel_at_period_end: boolean;
  ends_at: string | null;
  ended_at: string | null;
  customer_id: string;
  product_id: string;
  customer: { external_id?: string | null };
  product?: { metadata?: Record<string, unknown> | null } | null;
}

export const HANDLED_EVENTS = new Set([
  "subscription.created",
  "subscription.active",
  "subscription.updated",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.past_due",
  "subscription.revoked",
]);

/**
 * Polar's subscription state → Kvito's status and the date until which the plan applies.
 * null = leave the stored subscription as it is (checkout not finished yet, or a state Kvito does not use).
 * A cancelled subscription keeps its plan until the end of the paid period (planOf returns FREE after it).
 */
export function polarState(type: string, sub: Pick<PolarSubscriptionData, "status" | "current_period_end" | "cancel_at_period_end" | "ends_at" | "ended_at">, now = new Date()): { status: SubscriptionStatus; currentPeriodEnd: Date } | null {
  if (type === "subscription.revoked") return { status: "CANCELED", currentPeriodEnd: sub.ended_at ? new Date(sub.ended_at) : now };
  if (sub.status === "incomplete" || sub.status === "incomplete_expired") return null;
  if (sub.status === "canceled") return { status: "CANCELED", currentPeriodEnd: new Date(sub.ended_at ?? sub.ends_at ?? sub.current_period_end) };
  if (sub.cancel_at_period_end) return { status: "CANCELED", currentPeriodEnd: new Date(sub.ends_at ?? sub.current_period_end) };
  const status: SubscriptionStatus | null =
    sub.status === "active" ? "ACTIVE" : sub.status === "trialing" ? "TRIALING" : sub.status === "past_due" || sub.status === "unpaid" ? "PAST_DUE" : null;
  return status ? { status, currentPeriodEnd: new Date(sub.current_period_end) } : null;
}

export type SyncOutcome = "updated" | "unchanged" | "ignored" | "stale" | "no_user" | "unknown_product";

/**
 * Writes the subscription from one event, idempotently: the same event twice gives the same row, and an event
 * older than the last one applied (events can arrive late or repeated) is dropped.
 */
export async function syncSubscription(type: string, data: PolarSubscriptionData, now = new Date()): Promise<SyncOutcome> {
  const userId = data.customer?.external_id ?? null;
  if (!userId) return "no_user";
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return "no_user";

  const product = productPlan(data.product_id, data.product?.metadata);
  if (!product) return "unknown_product";
  const state = polarState(type, data, now);
  if (!state) return "ignored";
  const eventAt = new Date(data.modified_at ?? data.created_at);

  return prisma.$transaction(async (tx) => {
    // Serialise concurrent deliveries for the same landlord.
    await tx.$queryRaw`SELECT 1 FROM "Subscription" WHERE "userId" = ${userId} FOR UPDATE`;
    const before = await tx.subscription.findUnique({ where: { userId } });
    if (before?.providerUpdatedAt && eventAt < before.providerUpdatedAt) return "stale";

    const next = {
      plan: product.plan as Plan,
      status: state.status,
      currentPeriodEnd: state.currentPeriodEnd,
      providerCustomerId: data.customer_id,
      providerSubscriptionId: data.id,
      providerUpdatedAt: eventAt,
    };
    // founder and trialEndsAt are Kvito's own and stay as they are.
    await tx.subscription.upsert({ where: { userId }, create: { userId, ...next }, update: next });

    const changed = !before || before.plan !== next.plan || before.status !== next.status || before.currentPeriodEnd?.getTime() !== next.currentPeriodEnd.getTime();
    if (before?.plan !== next.plan || before?.status !== next.status) {
      await audit(
        {
          actorId: null,
          entityType: "Subscription",
          entityId: userId,
          action: "subscription.sync",
          before: before ? { plan: before.plan, status: before.status, currentPeriodEnd: before.currentPeriodEnd } : null,
          after: { plan: next.plan, status: next.status, currentPeriodEnd: next.currentPeriodEnd, event: type },
        },
        tx,
      );
    }
    return changed ? "updated" : "unchanged";
  });
}

const header = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * POST /api/webhooks/polar – mounted before express.json() with express.raw(), because the signature covers the
 * exact bytes. The body is never logged. Answers 202 for everything that is verified (also ignored events).
 */
export const polarWebhook: RequestHandler = async (req, res) => {
  const secret = env.POLAR_WEBHOOK_SECRET;
  if (!secret) {
    res.status(503).json({ error: { code: "BILLING_DISABLED" } });
    return;
  }
  if (!Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: { code: "BAD_REQUEST" } });
    return;
  }

  let event: Awaited<ReturnType<typeof webhooks.validateEvent>>;
  try {
    event = await webhooks.validateEvent(
      req.body,
      { "webhook-id": header(req.headers["webhook-id"]), "webhook-timestamp": header(req.headers["webhook-timestamp"]), "webhook-signature": header(req.headers["webhook-signature"]) },
      secret,
    );
  } catch (err) {
    if (err instanceof webhooks.PolarWebhookVerificationError) {
      res.status(403).json({ error: { code: "WEBHOOK_SIGNATURE" } });
      return;
    }
    if (err instanceof webhooks.PolarWebhookUnknownTypeError) {
      res.status(202).end();
      return;
    }
    // A verified but unreadable payload: nothing to retry.
    logger.warn({ webhook: "polar" }, "polar webhook: unreadable payload");
    res.status(202).end();
    return;
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    res.status(202).end();
    return;
  }
  const outcome = await syncSubscription(event.type, event.data as unknown as PolarSubscriptionData);
  if (outcome === "no_user" || outcome === "unknown_product" || outcome === "stale") {
    // Ids only – no e-mails, names or the payload.
    logger.warn({ webhook: "polar", type: event.type, subscriptionId: (event.data as { id?: string }).id, outcome }, "polar webhook: subscription not applied");
  }
  res.status(202).end();
};
