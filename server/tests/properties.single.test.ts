/**
 * A house, an apartment or a commercial space is let as a whole: it gets its one unit (with the details asked
 * in the form) together with the property, and no further units. A multi-unit house keeps separate units.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, setupApp, uniqueEmail } from "./helpers.js";

describe.skipIf(!hasDb)("single-unit properties", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  const users: string[] = [];

  beforeAll(async () => {
    ctx = await setupApp();
  });

  afterAll(async () => {
    await ctx.prisma.subscription.deleteMany({ where: { userId: { in: users } } });
    await ctx.prisma.$disconnect();
  });

  const address = { street: "Ulica 1", postalCode: "1000", city: "Ljubljana" };

  it("a house gets its one unit with the details, and no more units", async () => {
    const l = await ctx.login(uniqueEmail("house"));
    users.push(l.user.id);
    const property = (
      await l
        .post("/api/properties", { type: "HOUSE", name: "Hiša v Radencih", ...address, yearBuilt: 1978, unit: { layout: "FOUR", areaM2: 142.5, hasParking: true, hasStorage: true, hasBalcony: null } })
        .expect(201)
    ).body.property;
    expect(property.yearBuilt).toBe(1978);

    const { units } = (await l.get(`/api/properties/${property.id}`).expect(200)).body.property;
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ name: "Cela hiša", layout: "FOUR", areaM2: 142.5, hasParking: true, hasStorage: true, hasBalcony: null });

    const more = await l.post(`/api/properties/${property.id}/units`, { name: "Soba" });
    expect(more.status).toBe(400);
    expect(more.body.error.code).toBe("PROPERTY_SINGLE_UNIT");

    const del = await l.del(`/api/units/${units[0].id}`);
    expect(del.status).toBe(400);
    expect(del.body.error.code).toBe("UNIT_IS_PROPERTY");

    // A tenancy goes straight onto the whole house.
    await l.post(`/api/units/${units[0].id}/tenancies`, { startDate: "2026-01-01", rentCents: 90000, rentDueDay: 5, payeeName: "Mojca Novak", payeeIban: "SI56191000000123438" }).expect(201);
  });

  it("an apartment without details still gets its unit; the free plan allows one whole property", async () => {
    const l = await ctx.login(uniqueEmail("apt"));
    users.push(l.user.id);
    const first = (await l.post("/api/properties", { name: "Stanovanje na Viču", ...address }).expect(201)).body.property;
    expect(first.type).toBe("APARTMENT");
    const { units } = (await l.get(`/api/properties/${first.id}`).expect(200)).body.property;
    expect(units).toMatchObject([{ name: "Celo stanovanje", layout: null, areaM2: null }]);

    const second = await l.post("/api/properties", { type: "COMMERCIAL", name: "Pisarna", ...address });
    expect(second.status).toBe(403);
    expect(second.body.error.code).toBe("PLAN_LIMIT_UNITS");
  });

  it("a multi-unit house has no unit until one is added, and cannot become a house with several units", async () => {
    const l = await ctx.login(uniqueEmail("multi"));
    users.push(l.user.id);
    await ctx.prisma.subscription.create({ data: { userId: l.user.id, plan: "PLUS" } });
    const property = (await l.post("/api/properties", { type: "MULTI_UNIT_HOUSE", name: "Dvostanovanjska", ...address, unit: { layout: "TWO" } }).expect(201)).body.property;
    expect((await l.get(`/api/properties/${property.id}`).expect(200)).body.property.units).toHaveLength(0);
    await l.post(`/api/properties/${property.id}/units`, { name: "Spodaj" }).expect(201);
    await l.post(`/api/properties/${property.id}/units`, { name: "Zgoraj" }).expect(201);

    const change = await l.patch(`/api/properties/${property.id}`, { type: "HOUSE" });
    expect(change.status).toBe(400);
    expect(change.body.error.code).toBe("PROPERTY_HAS_UNITS");
  });
});
