import { createPolar, type Polar } from "@polar-sh/sdk/2026-10";
import { env } from "../../config/env.js";

export type PaidPlan = "PLUS" | "PRO" | "MANAGER";
export type BillingInterval = "month" | "year";
export const PAID_PLANS: readonly PaidPlan[] = ["PLUS", "PRO", "MANAGER"];
export const INTERVALS: readonly BillingInterval[] = ["month", "year"];

/** The part of the Polar client Kvito uses (tests replace it with a stand-in). */
export type PolarClient = Pick<Polar, "checkouts" | "customerSessions">;

/** Product IDs from the environment, per plan and interval (read on every call: tests change env). */
function configuredProducts(): Record<PaidPlan, Record<BillingInterval, string | undefined>> {
  return {
    PLUS: { month: env.POLAR_PRODUCT_PLUS_MONTHLY, year: env.POLAR_PRODUCT_PLUS_YEARLY },
    PRO: { month: env.POLAR_PRODUCT_PRO_MONTHLY, year: env.POLAR_PRODUCT_PRO_YEARLY },
    MANAGER: { month: env.POLAR_PRODUCT_MANAGER_MONTHLY, year: env.POLAR_PRODUCT_MANAGER_YEARLY },
  };
}

/** Payments are on only with the token, the webhook secret and all six product IDs. */
export function checkoutEnabled(): boolean {
  const products = configuredProducts();
  return Boolean(env.POLAR_ACCESS_TOKEN && env.POLAR_WEBHOOK_SECRET) && PAID_PLANS.every((p) => INTERVALS.every((i) => Boolean(products[p][i])));
}

export function productIdFor(plan: PaidPlan, interval: BillingInterval): string | undefined {
  return configuredProducts()[plan][interval];
}

/**
 * Which plan a Polar product is: from the env IDs first, otherwise from the product's metadata
 * (products in Polar carry plan=PLUS|PRO|MANAGER and interval=month|year). Unknown → null.
 */
export function productPlan(productId: string, metadata?: Record<string, unknown> | null): { plan: PaidPlan; interval: BillingInterval } | null {
  const products = configuredProducts();
  for (const plan of PAID_PLANS) for (const interval of INTERVALS) if (products[plan][interval] === productId) return { plan, interval };
  const plan = metadata?.["plan"];
  const interval = metadata?.["interval"];
  if (typeof plan === "string" && (PAID_PLANS as readonly string[]).includes(plan) && typeof interval === "string" && (INTERVALS as readonly string[]).includes(interval)) {
    return { plan: plan as PaidPlan, interval: interval as BillingInterval };
  }
  return null;
}

let client: PolarClient | null = null;
let override: PolarClient | null = null;

/** The Polar client, created on first use and only when payments are configured. */
export function polar(): PolarClient {
  if (override) return override;
  if (!checkoutEnabled() || !env.POLAR_ACCESS_TOKEN) throw new Error("Polar is not configured");
  client ??= createPolar({ accessToken: env.POLAR_ACCESS_TOKEN, environment: env.POLAR_SERVER });
  return client;
}

/** Tests only: replace the Polar client with a stand-in (null restores the real one). */
export function setPolarClientForTests(stand: PolarClient | null): void {
  override = stand;
}

/** HTTP status of an error thrown by the Polar SDK (PolarClientError / PolarServerError), if any. */
export function polarStatus(err: unknown): number | null {
  if (err && typeof err === "object" && "statusCode" in err && typeof (err as { statusCode: unknown }).statusCode === "number") {
    return (err as { statusCode: number }).statusCode;
  }
  return null;
}
