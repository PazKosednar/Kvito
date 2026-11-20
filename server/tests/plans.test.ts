/**
 * Plan limits (docs/NAROCNINA.md): off during the test period; when on, the free plan allows one unit,
 * units over the limit are read-only and storage is capped.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, setupApp, uniqueEmail } from "./helpers.js";

describe.skipIf(!hasDb)("plan limits", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let env: { PLAN_LIMITS_ENABLED: boolean };
  const users: string[] = [];

  beforeAll(async () => {
    ctx = await setupApp();
    env = (await import("../src/config/env.js")).env as unknown as { PLAN_LIMITS_ENABLED: boolean };
  });

  afterAll(async () => {
    env.PLAN_LIMITS_ENABLED = false;
    await ctx.prisma.subscription.deleteMany({ where: { userId: { in: users } } });
    await ctx.prisma.$disconnect();
  });

  async function landlordWithProperty() {
    const l = await ctx.login(uniqueEmail("plan"));
    users.push(l.user.id);
    const property = (await l.post("/api/properties", { type: "HOUSE", name: "Hiša", street: "Ulica 1", postalCode: "1000", city: "Ljubljana" }).expect(201)).body.property;
    return { l, propertyId: property.id as string };
  }

  it("does not limit anything while limits are off", async () => {
    env.PLAN_LIMITS_ENABLED = false;
    const { l, propertyId } = await landlordWithProperty();
    for (const name of ["A", "B", "C"]) await l.post(`/api/properties/${propertyId}/units`, { name }).expect(201);
    const billing = (await l.get("/api/billing").expect(200)).body;
    expect(billing.limitsEnabled).toBe(false);
    expect(billing.plan).toBe("FREE");
    expect(billing.usage.units).toBe(3);
    expect(billing.plans).toHaveLength(4);
  });

  it("free plan: one unit, the next is refused; a newer unit over the limit is read-only", async () => {
    env.PLAN_LIMITS_ENABLED = false;
    const { l, propertyId } = await landlordWithProperty();
    const first = (await l.post(`/api/properties/${propertyId}/units`, { name: "Prva" }).expect(201)).body.unit;
    const second = (await l.post(`/api/properties/${propertyId}/units`, { name: "Druga" }).expect(201)).body.unit;

    env.PLAN_LIMITS_ENABLED = true;
    const refused = await l.post(`/api/properties/${propertyId}/units`, { name: "Tretja" });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("PLAN_LIMIT_UNITS");

    const tenancy = { startDate: "2026-01-01", rentCents: 50000, rentDueDay: 5, payeeName: "Mojca Novak", payeeIban: "SI56191000000123438" };
    const locked = await l.post(`/api/units/${second.id}/tenancies`, tenancy);
    expect(locked.status).toBe(403);
    expect(locked.body.error.code).toBe("PLAN_LIMIT_UNIT_LOCKED");
    const ok = await l.post(`/api/units/${first.id}/tenancies`, tenancy);
    expect(ok.status).toBe(201);

    // Upgrading lifts the limit.
    await ctx.prisma.subscription.create({ data: { userId: l.user.id, plan: "PLUS" } });
    await l.post(`/api/properties/${propertyId}/units`, { name: "Tretja" }).expect(201);
    expect((await l.get("/api/billing").expect(200)).body.limits.units).toBe(3);
    env.PLAN_LIMITS_ENABLED = false;
  });
});
