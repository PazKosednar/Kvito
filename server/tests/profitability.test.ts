/** Profitability: own costs per unit, building costs split equally, months let. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, setupApp, uniqueEmail } from "./helpers.js";

describe.skipIf(!hasDb)("profitability", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;

  beforeAll(async () => {
    ctx = await setupApp();
  });

  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  it("splits building costs equally and counts the months a unit was let", async () => {
    const l = await ctx.login(uniqueEmail("profit"));
    // Several units need a paid plan (plan limits always apply).
    await ctx.prisma.subscription.create({ data: { userId: l.user.id, plan: "PRO" } });
    const property = (await l.post("/api/properties", { type: "MULTI_UNIT_HOUSE", name: "Hiša", street: "Ulica 1", postalCode: "1000", city: "Ljubljana" }).expect(201)).body.property;
    const a = (await l.post(`/api/properties/${property.id}/units`, { name: "A" }).expect(201)).body.unit;
    const b = (await l.post(`/api/properties/${property.id}/units`, { name: "B" }).expect(201)).body.unit;
    const year = 2025;
    await l.post("/api/expenses", { propertyId: property.id, unitId: null, category: "INSURANCE", title: "Zavarovanje hiše", amountCents: 1001, spentOn: `${year}-03-10` }).expect(201);
    await l.post("/api/expenses", { propertyId: property.id, unitId: a.id, category: "MAINTENANCE", title: "Popravilo", amountCents: 500, spentOn: `${year}-05-02` }).expect(201);
    await l.post("/api/expenses", { propertyId: property.id, unitId: a.id, category: "MAINTENANCE", title: "Lani", amountCents: 9999, spentOn: `${year - 1}-12-31` }).expect(201);

    // A let from 1 March to 31 August (6 months).
    const t = (
      await l.post(`/api/units/${a.id}/tenancies`, { startDate: `${year}-03-01`, endDate: `${year}-08-31`, rentCents: 50000, rentDueDay: 5, payeeName: "Mojca Novak", payeeIban: "SI56191000000123438" }).expect(201)
    ).body.tenancy;
    await ctx.prisma.tenancy.update({ where: { id: t.id }, data: { status: "ENDED" } });

    const p = (await l.get(`/api/profitability?year=${year}`).expect(200)).body.profitability;
    expect(p.monthsElapsed).toBe(12);
    const ua = p.units.find((u: { unitId: string }) => u.unitId === a.id);
    const ub = p.units.find((u: { unitId: string }) => u.unitId === b.id);
    expect(ua.unitCostsCents).toBe(500);
    expect(ua.sharedCostsCents + ub.sharedCostsCents).toBe(1001);
    expect([ua.sharedCostsCents, ub.sharedCostsCents].sort()).toEqual([500, 501]);
    expect(ua.occupiedMonths).toBe(6);
    expect(ub.occupiedMonths).toBe(0);
    expect(p.totals.costsCents).toBe(1501);
    expect(p.totals.netCents).toBe(-1501);
    expect(p.years).toContain(year);

    // Somebody else's numbers are not visible.
    const other = await ctx.login(uniqueEmail("profit-other"));
    expect((await other.get(`/api/profitability?year=${year}`).expect(200)).body.profitability.units).toHaveLength(0);
  });
});
