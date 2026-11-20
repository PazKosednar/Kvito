import { Router } from "express";
import { env } from "../../config/env.js";
import { authUserId } from "../../middleware/auth.js";
import { PLANS, planOf, usageOf } from "./plans.js";

/** The landlord's plan, usage and the packages (mounted behind requireAuth). Payments come later. */
export function billingRouter(): Router {
  const router = Router();

  router.get("/billing", async (req, res) => {
    const userId = authUserId(req);
    const [current, usage] = await Promise.all([planOf(userId), usageOf(userId)]);
    res.json({
      limitsEnabled: env.PLAN_LIMITS_ENABLED,
      ...current,
      limits: PLANS[current.plan],
      usage,
      plans: (Object.keys(PLANS) as (keyof typeof PLANS)[]).map((id) => ({ id, ...PLANS[id] })),
    });
  });

  return router;
}
