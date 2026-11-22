/**
 * Polar subscriptions (docs/NAROCNINA.md, step 4): status mapping, signed webhooks that upsert the subscription
 * idempotently and drop older events, and checkout with a stand-in client (no real Polar calls).
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { polarState } from "../src/modules/billing/webhook.js";
import { hasDb, setupApp, uniqueEmail } from "./helpers.js";

const PERIOD_END = "2033-02-01T00:00:00.000Z";
const base = { status: "active", current_period_end: PERIOD_END, cancel_at_period_end: false, ends_at: null, ended_at: null };

describe("Polar status → SubscriptionStatus", () => {
  const now = new Date("2033-01-15T12:00:00Z");
  it("maps the active states", () => {
    expect(polarState("subscription.active", base, now)).toEqual({ status: "ACTIVE", currentPeriodEnd: new Date(PERIOD_END) });
    expect(polarState("subscription.updated", { ...base, status: "trialing" }, now)?.status).toBe("TRIALING");
    expect(polarState("subscription.past_due", { ...base, status: "past_due" }, now)?.status).toBe("PAST_DUE");
    expect(polarState("subscription.updated", { ...base, status: "unpaid" }, now)?.status).toBe("PAST_DUE");
  });
  it("leaves unfinished checkouts alone", () => {
    expect(polarState("subscription.created", { ...base, status: "incomplete" }, now)).toBeNull();
    expect(polarState("subscription.updated", { ...base, status: "incomplete_expired" }, now)).toBeNull();
  });
  it("cancel at period end keeps the plan until the end of the period", () => {
    expect(polarState("subscription.canceled", { ...base, cancel_at_period_end: true }, now)).toEqual({ status: "CANCELED", currentPeriodEnd: new Date(PERIOD_END) });
    expect(polarState("subscription.canceled", { ...base, cancel_at_period_end: true, ends_at: "2033-01-31T00:00:00.000Z" }, now)?.currentPeriodEnd).toEqual(new Date("2033-01-31T00:00:00.000Z"));
  });
  it("canceled and revoked end the subscription", () => {
    expect(polarState("subscription.updated", { ...base, status: "canceled", ended_at: "2033-01-10T00:00:00.000Z" }, now)).toEqual({ status: "CANCELED", currentPeriodEnd: new Date("2033-01-10T00:00:00.000Z") });
    expect(polarState("subscription.revoked", { ...base, status: "canceled", ended_at: "2033-01-12T00:00:00.000Z" }, now)?.currentPeriodEnd).toEqual(new Date("2033-01-12T00:00:00.000Z"));
    expect(polarState("subscription.revoked", { ...base, status: "canceled" }, now)).toEqual({ status: "CANCELED", currentPeriodEnd: now });
  });
});

const SECRET = `whsec_${randomBytes(24).toString("base64")}`;
const PRODUCTS = {
  POLAR_PRODUCT_PLUS_MONTHLY: "prod-plus-m",
  POLAR_PRODUCT_PLUS_YEARLY: "prod-plus-y",
  POLAR_PRODUCT_PRO_MONTHLY: "prod-pro-m",
  POLAR_PRODUCT_PRO_YEARLY: "prod-pro-y",
  POLAR_PRODUCT_MANAGER_MONTHLY: "prod-man-m",
  POLAR_PRODUCT_MANAGER_YEARLY: "prod-man-y",
};

/** Standard Webhooks signature: base64(HMAC-SHA256(key, "id.timestamp.body")), key = the secret without whsec_. */
function signed(body: string, secret = SECRET) {
  const id = `msg_${randomUUID()}`;
  const ts = Math.floor(Date.now() / 1000).toString();
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}`, "content-type": "application/json" };
}

describe.skipIf(!hasDb)("Polar webhook and checkout", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let env: Record<string, unknown>;
  let saved: Record<string, unknown>;
  let setClient: (c: unknown) => void;
  const users: string[] = [];
  const calls: { checkouts: Record<string, unknown>[]; sessions: Record<string, unknown>[] } = { checkouts: [], sessions: [] };
  let portalStatus = 200;

  beforeAll(async () => {
    ctx = await setupApp();
    env = (await import("../src/config/env.js")).env as unknown as Record<string, unknown>;
    const keys = ["POLAR_ACCESS_TOKEN", "POLAR_WEBHOOK_SECRET", "POLAR_FOUNDER_DISCOUNT_ID", ...Object.keys(PRODUCTS)];
    saved = Object.fromEntries(keys.map((k) => [k, env[k]]));
    Object.assign(env, { POLAR_ACCESS_TOKEN: "test-token", POLAR_WEBHOOK_SECRET: SECRET, POLAR_FOUNDER_DISCOUNT_ID: "disc-founder", ...PRODUCTS });
    const polar = await import("../src/modules/billing/polar.js");
    setClient = polar.setPolarClientForTests as (c: unknown) => void;
    setClient({
      checkouts: {
        create: async (body: Record<string, unknown>) => {
          calls.checkouts.push(body);
          return { url: "https://sandbox.polar.sh/checkout/test" };
        },
      },
      customerSessions: {
        create: async (body: Record<string, unknown>) => {
          calls.sessions.push(body);
          if (portalStatus === 404) throw Object.assign(new Error("not found"), { statusCode: 404 });
          return { customer_portal_url: "https://sandbox.polar.sh/portal/test" };
        },
      },
    });
  });

  afterAll(async () => {
    Object.assign(env, saved);
    setClient(null);
    await ctx.prisma.subscription.deleteMany({ where: { userId: { in: users } } });
    await ctx.prisma.$disconnect();
  });

  async function landlord() {
    const l = await ctx.login(uniqueEmail("polar"));
    await ctx.prisma.user.update({ where: { id: l.user.id }, data: { roles: ["LANDLORD"] } });
    users.push(l.user.id);
    return l;
  }

  function event(type: string, userId: string, over: Record<string, unknown> = {}) {
    return {
      type,
      timestamp: new Date().toISOString(),
      data: {
        id: "sub-" + userId,
        status: "active",
        created_at: "2033-01-01T10:00:00.000Z",
        modified_at: "2033-01-01T10:00:00.000Z",
        current_period_end: PERIOD_END,
        cancel_at_period_end: false,
        ends_at: null,
        ended_at: null,
        customer_id: "cust-" + userId,
        product_id: "prod-plus-y",
        customer: { external_id: userId },
        product: { metadata: {} },
        ...over,
      },
    };
  }

  const send = (payload: unknown, headers?: Record<string, string>) => {
    const body = JSON.stringify(payload);
    return request(ctx.app).post("/api/webhooks/polar").set(headers ?? signed(body)).send(body);
  };

  it("refuses an invalid signature with 403", async () => {
    const l = await landlord();
    const body = JSON.stringify(event("subscription.active", l.user.id));
    await request(ctx.app).post("/api/webhooks/polar").set(signed(body, `whsec_${randomBytes(24).toString("base64")}`)).send(body).expect(403);
    expect(await ctx.prisma.subscription.findUnique({ where: { userId: l.user.id } })).toBeNull();
  });

  it("a signed event upserts the subscription; the same event twice gives the same state", async () => {
    const l = await landlord();
    await ctx.prisma.subscription.create({ data: { userId: l.user.id, founder: true } });
    const payload = event("subscription.active", l.user.id);
    await send(payload).expect(202);
    const first = await ctx.prisma.subscription.findUniqueOrThrow({ where: { userId: l.user.id } });
    expect(first).toMatchObject({ plan: "PLUS", status: "ACTIVE", founder: true, providerCustomerId: "cust-" + l.user.id, providerSubscriptionId: "sub-" + l.user.id });
    expect(first.currentPeriodEnd?.toISOString()).toBe(PERIOD_END);

    await send(payload).expect(202);
    const second = await ctx.prisma.subscription.findUniqueOrThrow({ where: { userId: l.user.id } });
    expect({ ...second, updatedAt: null }).toEqual({ ...first, updatedAt: null });

    const audits = await ctx.prisma.auditLog.count({ where: { entityType: "Subscription", entityId: l.user.id } });
    expect(audits).toBe(1);
    const billing = (await l.get("/api/billing").expect(200)).body;
    expect(billing).toMatchObject({ plan: "PLUS", hasPaidSubscription: true, checkoutEnabled: true });
    expect(JSON.stringify(billing)).not.toContain("test-token");
  });

  it("drops an older event that arrives after a newer one", async () => {
    const l = await landlord();
    await send(event("subscription.updated", l.user.id, { product_id: "prod-pro-m", modified_at: "2033-01-05T10:00:00.000Z" })).expect(202);
    await send(event("subscription.updated", l.user.id, { product_id: "prod-plus-m", modified_at: "2033-01-02T10:00:00.000Z" })).expect(202);
    const s = await ctx.prisma.subscription.findUniqueOrThrow({ where: { userId: l.user.id } });
    expect(s.plan).toBe("PRO");
  });

  it("uses the product metadata for an unknown ID; unknown product or user changes nothing", async () => {
    const l = await landlord();
    await send(event("subscription.active", l.user.id, { product_id: "other", product: { metadata: { plan: "MANAGER", interval: "month" } } })).expect(202);
    expect((await ctx.prisma.subscription.findUniqueOrThrow({ where: { userId: l.user.id } })).plan).toBe("MANAGER");

    const m = await landlord();
    await send(event("subscription.active", m.user.id, { product_id: "other" })).expect(202);
    expect(await ctx.prisma.subscription.findUnique({ where: { userId: m.user.id } })).toBeNull();
    await send(event("subscription.active", "no-such-user")).expect(202);
    await send({ type: "checkout.created", timestamp: new Date().toISOString(), data: {} }).expect(202);
  });

  it("cancel at period end keeps the plan; revoked ends it", async () => {
    const l = await landlord();
    await send(event("subscription.active", l.user.id)).expect(202);
    await send(event("subscription.canceled", l.user.id, { cancel_at_period_end: true, modified_at: "2033-01-03T10:00:00.000Z" })).expect(202);
    let s = await ctx.prisma.subscription.findUniqueOrThrow({ where: { userId: l.user.id } });
    expect(s.status).toBe("CANCELED");
    expect(s.currentPeriodEnd?.toISOString()).toBe(PERIOD_END);
    await send(event("subscription.revoked", l.user.id, { status: "canceled", ended_at: "2026-01-04T10:00:00.000Z", modified_at: "2033-01-04T10:00:00.000Z" })).expect(202);
    s = await ctx.prisma.subscription.findUniqueOrThrow({ where: { userId: l.user.id } });
    expect(s.currentPeriodEnd?.toISOString()).toBe("2026-01-04T10:00:00.000Z");
    expect((await l.get("/api/billing").expect(200)).body.plan).toBe("FREE");
  });

  it("checkout: founder gets the discount, others do not; an existing subscription gives 409", async () => {
    const founder = await landlord();
    await ctx.prisma.subscription.create({ data: { userId: founder.user.id, founder: true } });
    const res = await founder.post("/api/billing/checkout", { plan: "PRO", interval: "year" }).expect(200);
    expect(res.body.url).toBe("https://sandbox.polar.sh/checkout/test");
    const sent = calls.checkouts.at(-1)!;
    expect(sent).toMatchObject({
      products: ["prod-pro-y"],
      external_customer_id: founder.user.id,
      customer_email: founder.user.email,
      success_url: "http://localhost:5180/narocnina?placilo=ok",
      return_url: "http://localhost:5180/narocnina",
      locale: "sl",
      allow_discount_codes: true,
      discount_id: "disc-founder",
    });

    const regular = await landlord();
    await regular.post("/api/billing/checkout", { plan: "PLUS", interval: "month" }).expect(200);
    expect(calls.checkouts.at(-1)).not.toHaveProperty("discount_id");
    expect(calls.checkouts.at(-1)!["products"]).toEqual(["prod-plus-m"]);

    await send(event("subscription.active", regular.user.id)).expect(202);
    const count = calls.checkouts.length;
    const conflict = await regular.post("/api/billing/checkout", { plan: "PRO", interval: "month" }).expect(409);
    expect(conflict.body.error.code).toBe("BILLING_HAS_SUBSCRIPTION");
    expect(calls.checkouts.length).toBe(count);
  });

  it("checkout: tenants are refused, a bad body is 400, disabled billing is 503", async () => {
    const tenant = await ctx.login(uniqueEmail("tenant"));
    await tenant.post("/api/billing/checkout", { plan: "PLUS", interval: "month" }).expect(403);
    const l = await landlord();
    await l.post("/api/billing/checkout", { plan: "FREE", interval: "month" }).expect(400);
    env["POLAR_PRODUCT_PRO_YEARLY"] = undefined;
    try {
      const res = await l.post("/api/billing/checkout", { plan: "PLUS", interval: "month" }).expect(503);
      expect(res.body.error.code).toBe("BILLING_DISABLED");
      expect((await l.get("/api/billing").expect(200)).body.checkoutEnabled).toBe(false);
    } finally {
      env["POLAR_PRODUCT_PRO_YEARLY"] = PRODUCTS.POLAR_PRODUCT_PRO_YEARLY;
    }
  });

  it("checkout: a subscription cancelled at the period end gives 409 until the period runs out", async () => {
    const l = await landlord();
    await send(event("subscription.active", l.user.id)).expect(202);
    await send(event("subscription.canceled", l.user.id, { cancel_at_period_end: true, modified_at: "2033-01-03T10:00:00.000Z" })).expect(202);
    expect((await ctx.prisma.subscription.findUniqueOrThrow({ where: { userId: l.user.id } })).status).toBe("CANCELED");
    const count = calls.checkouts.length;
    expect((await l.post("/api/billing/checkout", { plan: "PRO", interval: "year" }).expect(409)).body.error.code).toBe("BILLING_HAS_SUBSCRIPTION");
    expect(calls.checkouts.length).toBe(count);

    // The period is over: a new subscription may start.
    await ctx.prisma.subscription.update({ where: { userId: l.user.id }, data: { currentPeriodEnd: new Date("2026-01-01T00:00:00Z") } });
    await l.post("/api/billing/checkout", { plan: "PRO", interval: "year" }).expect(200);
    expect(calls.checkouts.length).toBe(count + 1);
  });

  it("portal: no Polar customer yet → 404 without calling Polar; otherwise a session by customer_id", async () => {
    const l = await landlord();
    portalStatus = 200;
    const before = calls.sessions.length;
    expect((await l.post("/api/billing/portal").expect(404)).body.error.code).toBe("BILLING_NO_CUSTOMER");
    expect(calls.sessions.length).toBe(before);
    expect((await l.get("/api/billing").expect(200)).body.hasPaidSubscription).toBe(false);

    await send(event("subscription.active", l.user.id)).expect(202);
    expect((await l.get("/api/billing").expect(200)).body.hasPaidSubscription).toBe(true);
    const res = await l.post("/api/billing/portal").expect(200);
    expect(res.body.url).toBe("https://sandbox.polar.sh/portal/test");
    expect(calls.sessions.at(-1)).toEqual({ customer_id: "cust-" + l.user.id, return_url: "http://localhost:5180/narocnina" });

    // The customer was removed at Polar.
    portalStatus = 404;
    expect((await l.post("/api/billing/portal").expect(404)).body.error.code).toBe("BILLING_NO_CUSTOMER");
    portalStatus = 200;
  });
});
