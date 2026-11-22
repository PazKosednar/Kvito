import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError, forbidden } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { authUserId } from "../../middleware/auth.js";
import { PLANS, planOf, usageOf } from "./plans.js";
import { checkoutEnabled, polar, polarStatus, productIdFor } from "./polar.js";

/** Client route of the Naročnina page (client/src/constants: ROUTES.billing). */
const BILLING_PATH = "/narocnina";
const billingUrl = (query = "") => `${env.CLIENT_ORIGIN}${BILLING_PATH}${query}`;

const CheckoutBody = z.object({ plan: z.enum(["PLUS", "PRO", "MANAGER"]), interval: z.enum(["month", "year"]) });

/**
 * A subscription at the provider that still applies – also one cancelled at the period end but paid until then.
 * A new checkout is allowed only after it has run out; until then changes go through the portal.
 */
function subscriptionApplies(s: { providerSubscriptionId: string | null; status: string; currentPeriodEnd: Date | null } | null, now = new Date()): boolean {
  if (!s?.providerSubscriptionId) return false;
  return s.status !== "CANCELED" || (s.currentPeriodEnd !== null && s.currentPeriodEnd > now);
}

async function landlord(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, roles: true } });
  if (!user?.roles.includes("LANDLORD")) throw forbidden();
  return user;
}

/** The landlord's plan, usage, the packages and payments through Polar (mounted behind requireAuth). */
export function billingRouter(): Router {
  const router = Router();

  router.get("/billing", async (req, res) => {
    const userId = authUserId(req);
    const [current, usage, sub] = await Promise.all([
      planOf(userId),
      usageOf(userId),
      prisma.subscription.findUnique({ where: { userId }, select: { providerCustomerId: true } }),
    ]);
    res.json({
      limitsEnabled: env.PLAN_LIMITS_ENABLED,
      ...current,
      limits: PLANS[current.plan],
      usage,
      plans: (Object.keys(PLANS) as (keyof typeof PLANS)[]).map((id) => ({ id, ...PLANS[id] })),
      checkoutEnabled: checkoutEnabled(),
      // The landlord is a customer at Polar: the portal shows the subscription, invoices and the card.
      hasPaidSubscription: Boolean(sub?.providerCustomerId),
    });
  });

  /** Starts a Polar checkout and returns its URL; the plan is applied later by the webhook. */
  router.post("/billing/checkout", async (req, res) => {
    const user = await landlord(authUserId(req));
    const body = CheckoutBody.parse(req.body);
    if (!checkoutEnabled()) throw new AppError(503, "BILLING_DISABLED");
    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
    // One subscription per landlord: changes go through the customer portal.
    if (subscriptionApplies(sub)) throw new AppError(409, "BILLING_HAS_SUBSCRIPTION");

    const productId = productIdFor(body.plan, body.interval)!;
    const discountId = sub?.founder && env.POLAR_FOUNDER_DISCOUNT_ID ? env.POLAR_FOUNDER_DISCOUNT_ID : undefined;
    try {
      const checkout = await polar().checkouts.create({
        products: [productId],
        external_customer_id: user.id,
        customer_email: user.email,
        success_url: billingUrl("?placilo=ok"),
        return_url: billingUrl(),
        locale: "sl",
        allow_discount_codes: true,
        ...(discountId ? { discount_id: discountId } : {}),
      });
      res.json({ url: checkout.url });
    } catch (err) {
      logger.error({ status: polarStatus(err) }, "polar checkout failed");
      throw new AppError(502, "BILLING_PROVIDER");
    }
  });

  /** A short-lived link to Polar's customer portal (change plan, card, cancel). Not stored. */
  router.post("/billing/portal", async (req, res) => {
    const user = await landlord(authUserId(req));
    if (!checkoutEnabled()) throw new AppError(503, "BILLING_DISABLED");
    const sub = await prisma.subscription.findUnique({ where: { userId: user.id }, select: { providerCustomerId: true } });
    // Polar's own customer ID (set by the webhook); without it there is nothing to manage yet.
    if (!sub?.providerCustomerId) throw new AppError(404, "BILLING_NO_CUSTOMER");
    try {
      const session = await polar().customerSessions.create({ customer_id: sub.providerCustomerId, return_url: billingUrl() });
      res.json({ url: session.customer_portal_url });
    } catch (err) {
      if (polarStatus(err) === 404) throw new AppError(404, "BILLING_NO_CUSTOMER");
      logger.error({ status: polarStatus(err) }, "polar customer session failed");
      throw new AppError(502, "BILLING_PROVIDER");
    }
  });

  return router;
}
