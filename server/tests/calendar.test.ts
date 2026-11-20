/** Deadlines calendar and the private .ics link. */
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, setupApp, uniqueEmail } from "./helpers.js";

describe.skipIf(!hasDb)("calendar", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;

  beforeAll(async () => {
    ctx = await setupApp();
  });

  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  it("lists deadlines and serves them as a private .ics feed only to whoever has the link", async () => {
    const l = await ctx.login(uniqueEmail("cal"));
    const property = (await l.post("/api/properties", { type: "HOUSE", name: "Hiša Koledar", street: "Ulica 1", postalCode: "1000", city: "Ljubljana" }).expect(201)).body.property;
    const unit = (await l.post(`/api/properties/${property.id}/units`, { name: "Stanovanje 1" }).expect(201)).body.unit;
    const year = new Date().getUTCFullYear() + 1;
    const tenancy = (
      await l
        .post(`/api/units/${unit.id}/tenancies`, { startDate: "2026-01-01", endDate: `${year}-06-30`, rentCents: 50000, rentDueDay: 5, rentReviewMonth: 3, payeeName: "Mojca Novak", payeeIban: "SI56191000000123438" })
        .expect(201)
    ).body.tenancy;
    await l.patch(`/api/units/${unit.id}`, { energyCertValidUntil: `${year}-02-10` }).expect(200);
    // Obligations need a tenant who has joined.
    const tenant = await ctx.login(uniqueEmail("cal-tenant"));
    await ctx.prisma.tenancyMember.create({ data: { tenancyId: tenancy.id, userId: tenant.user.id, isPrimary: true } });
    await ctx.prisma.tenancy.update({ where: { id: tenancy.id }, data: { status: "ACTIVE" } });
    await l.post(`/api/tenancies/${tenancy.id}/charges`, { title: "Elektrika", amountCents: 4873, dueDate: `${year}-01-15`, costType: "ELECTRICITY" }).expect(201);

    const events = (await l.get(`/api/calendar?from=${year}-01-01&to=${year}-12-31`).expect(200)).body.events as { type: string; date: string; title: string }[];
    const types = events.map((e) => `${e.type}:${e.date}`);
    expect(types).toContain(`CHARGE_DUE:${year}-01-15`);
    expect(types).toContain(`ENERGY_CERT:${year}-02-10`);
    expect(types).toContain(`RENT_REVIEW:${year}-03-01`);
    expect(types).toContain(`LEASE_END:${year}-06-30`);
    // Sorted by date.
    expect([...events.map((e) => e.date)]).toEqual([...events.map((e) => e.date)].sort());

    // Someone else sees none of it.
    const other = await ctx.login(uniqueEmail("cal-other"));
    expect((await other.get(`/api/calendar?from=${year}-01-01&to=${year}-12-31`).expect(200)).body.events).toHaveLength(0);

    // Private link: works without signing in, stops when replaced or removed.
    expect((await l.get("/api/calendar/feed").expect(200)).body.feed).toBeNull();
    const url = (await l.post("/api/calendar/feed").expect(201)).body.url as string;
    const path = new URL(url).pathname;
    const ics = await request(ctx.app).get(path).expect(200);
    expect(ics.headers["content-type"]).toContain("text/calendar");
    expect(ics.text).toContain("BEGIN:VCALENDAR");
    expect(ics.text).toContain("Konec najema");
    expect(ics.text.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75)).toBe(true);

    const url2 = (await l.post("/api/calendar/feed").expect(201)).body.url as string;
    await request(ctx.app).get(path).expect(404);
    await l.del("/api/calendar/feed").expect(204);
    await request(ctx.app).get(new URL(url2).pathname).expect(404);
    await request(ctx.app).get("/api/calendar-feed/not-a-token.ics").expect(404);
  });
});
