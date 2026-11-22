/**
 * Plan limits (docs/NAROCNINA.md): the free plan allows one unit, units over the limit are read-only and storage
 * is capped. Kvito's own trial (TRIALING without a provider subscription) applies until trialEndsAt.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, setupApp, uniqueEmail } from "./helpers.js";

describe.skipIf(!hasDb)("plan limits", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  const users: string[] = [];

  beforeAll(async () => {
    ctx = await setupApp();
  });

  afterAll(async () => {
    await ctx.prisma.subscription.deleteMany({ where: { userId: { in: users } } });
    await ctx.prisma.$disconnect();
  });

  async function landlordWithProperty() {
    const l = await ctx.login(uniqueEmail("plan"));
    users.push(l.user.id);
    const property = (await l.post("/api/properties", { type: "HOUSE", name: "Hiša", street: "Ulica 1", postalCode: "1000", city: "Ljubljana" }).expect(201)).body.property;
    return { l, propertyId: property.id as string };
  }

  const tenancy = { startDate: "2026-01-01", rentCents: 50000, rentDueDay: 5, payeeName: "Mojca Novak", payeeIban: "SI56191000000123438" };

  it("free plan: one unit, the next is refused; upgrading lifts the limit", async () => {
    const { l, propertyId } = await landlordWithProperty();
    const first = (await l.post(`/api/properties/${propertyId}/units`, { name: "Prva" }).expect(201)).body.unit;
    const refused = await l.post(`/api/properties/${propertyId}/units`, { name: "Druga" });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("PLAN_LIMIT_UNITS");
    await l.post(`/api/units/${first.id}/tenancies`, tenancy).expect(201);

    const billing = (await l.get("/api/billing").expect(200)).body;
    expect(billing).not.toHaveProperty("limitsEnabled");
    expect(billing.plan).toBe("FREE");
    expect(billing.usage.units).toBe(1);
    expect(billing.plans).toHaveLength(4);

    await ctx.prisma.subscription.create({ data: { userId: l.user.id, plan: "PLUS" } });
    await l.post(`/api/properties/${propertyId}/units`, { name: "Druga" }).expect(201);
    expect((await l.get("/api/billing").expect(200)).body.limits.units).toBe(3);
  });

  it("Kvito's own trial: the plan applies until trialEndsAt, then FREE and units over the limit are read-only", async () => {
    const { l, propertyId } = await landlordWithProperty();
    const trialEndsAt = new Date(Date.now() + 30 * 86_400_000);
    await ctx.prisma.subscription.create({ data: { userId: l.user.id, plan: "PLUS", status: "TRIALING", trialEndsAt, founder: true } });
    const first = (await l.post(`/api/properties/${propertyId}/units`, { name: "Prva" }).expect(201)).body.unit;
    const second = (await l.post(`/api/properties/${propertyId}/units`, { name: "Druga" }).expect(201)).body.unit;

    const during = (await l.get("/api/billing").expect(200)).body;
    expect(during).toMatchObject({ plan: "PLUS", status: "TRIALING", founder: true, trialEndsAt: trialEndsAt.toISOString() });

    // The trial runs out.
    await ctx.prisma.subscription.update({ where: { userId: l.user.id }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    const after = (await l.get("/api/billing").expect(200)).body;
    expect(after).toMatchObject({ plan: "FREE", status: "ACTIVE", founder: true, trialEndsAt: null });

    const locked = await l.post(`/api/units/${second.id}/tenancies`, tenancy);
    expect(locked.status).toBe(403);
    expect(locked.body.error.code).toBe("PLAN_LIMIT_UNIT_LOCKED");
    await l.post(`/api/units/${first.id}/tenancies`, tenancy).expect(201);
  });
});
