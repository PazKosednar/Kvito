/**
 * Phase 7: cost forecast and suggested lump sum, yearly summary for the landlord, tenant's shareable renting history.
 */
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { hasDb, setupApp, uniqueEmail } from "./helpers.js";

describe.skipIf(!hasDb)("forecast, yearly summary and renting history", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let landlord: Awaited<ReturnType<Awaited<ReturnType<typeof setupApp>>["login"]>>;
  let tina: typeof landlord;
  let stranger: typeof landlord;
  let tenancyId = "";
  let memberId = "";

  /** A monthly payment (400 € rent + 110 € costs) as the rent job creates it. */
  async function combinedCharge(period: string) {
    const tenancy = await ctx.prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
    const charge = await ctx.prisma.charge.create({
      data: {
        tenancyId,
        type: "RENT",
        costType: "RENT",
        title: `Najemnina in stroški ${period}`,
        amountCents: 51_000,
        dueDate: new Date(`${period}-05T00:00:00Z`),
        rentPeriod: period,
        autoKey: `combined:${period}`,
        payeeName: tenancy.payeeName,
        payeeIban: tenancy.payeeIban,
        lines: { create: [{ costType: "RENT", amountCents: 40_000, sortOrder: 0 }, { costType: "OTHER", amountCents: 11_000, sortOrder: 1 }] },
        shares: { create: { memberId, amountCents: 51_000 } },
      },
      include: { shares: true },
    });
    return { chargeId: charge.id, shareId: charge.shares[0]!.id };
  }

  async function pay(c: { chargeId: string; shareId: string }, paidOn: string) {
    await tina.post(`/api/charges/${c.chargeId}/shares/${c.shareId}/report`, { paidOn }).expect(200);
    await landlord.post(`/api/charges/${c.chargeId}/shares/${c.shareId}/confirm`).expect(200);
  }

  beforeAll(async () => {
    ctx = await setupApp();
    landlord = await ctx.login(uniqueEmail("ll"), "Tomaž Test");
    tina = await ctx.login(uniqueEmail("tina"), "Tina Test");
    stranger = await ctx.login(uniqueEmail("x"), "Tujec");
    const propertyId = (await landlord.post("/api/properties", { name: "Maistrova", street: "Maistrova 26", postalCode: "2000", city: "Maribor" }).expect(201)).body.property.id;
    const unit = (await landlord.post(`/api/properties/${propertyId}/units`, { name: "Stanovanje" }).expect(201)).body.unit;
    tenancyId = (
      await landlord
        .post(`/api/units/${unit.id}/tenancies`, { startDate: "2026-01-01", rentCents: 40_000, rentDueDay: 5, depositCents: 80_000, payeeName: "Tomaž Test", payeeIban: "SI56191000000123438", payeeStreet: "Cesta 1", payeeCity: "2000 Maribor" })
        .expect(201)
    ).body.tenancy.id;
    const url = (await landlord.post(`/api/tenancies/${tenancyId}/invitations`, {}).expect(201)).body.url as string;
    await tina.post(`/api/invitations/${url.split("/povabilo/")[1]}/accept`).expect(200);
    memberId = (await ctx.prisma.tenancyMember.findFirstOrThrow({ where: { tenancyId, userId: tina.user.id } })).id;
    await landlord.put(`/api/tenancies/${tenancyId}/advances`, { items: [{ costType: "OTHER", amountCents: 11_000 }] }).expect(200);
  });

  it("forecasts the costs and suggests the monthly lump sum", async () => {
    for (const [p, c] of [["2026-01", 8_000], ["2026-02", 9_000], ["2026-03", 10_000]] as const) {
      await combinedCharge(p);
      await landlord.put(`/api/tenancies/${tenancyId}/costs/${p}/BUILDING_MANAGEMENT`, { amountCents: c }).expect(200);
    }
    await tina.get(`/api/tenancies/${tenancyId}/costs/forecast?until=2026-05`).expect(200);
    await stranger.get(`/api/tenancies/${tenancyId}/costs/forecast`).expect(404);
    const { body } = await landlord.get(`/api/tenancies/${tenancyId}/costs/forecast?until=2026-05`).expect(200);
    expect(body).toMatchObject({ windowFrom: "2026-01", lastActual: "2026-03", currentAdvanceCents: 11_000, creditCents: 0 });
    // Jan–Mar: costs 270 € against 330 € advances → 60 € in credit so far.
    expect(body.balanceNowCents).toBe(-6_000);
    // No last year: the average (90 €) for April and May.
    expect(body.months.map((m: { period: string; costCents: number; basis: string }) => [m.period, m.costCents, m.basis])).toEqual([
      ["2026-04", 9_000, "AVERAGE"],
      ["2026-05", 9_000, "AVERAGE"],
    ]);
    expect(body.endBalanceCents).toBe(-6_000 + 2 * (9_000 - 11_000));
    // (−60 + 180) / 2 = 60 € a month would come out even.
    expect(body.suggestedAdvanceCents).toBe(6_000);
    expect((await landlord.get(`/api/tenancies/${tenancyId}/costs/forecast?until=2030-01`).expect(400)).body.error.code).toBe("RANGE_TOO_LONG");
  });

  it("sums up the year by unit and month: rent apart from costs and deposit", async () => {
    const charges = await ctx.prisma.charge.findMany({ where: { tenancyId }, include: { shares: true }, orderBy: { dueDate: "asc" } });
    await pay({ chargeId: charges[0]!.id, shareId: charges[0]!.shares[0]!.id }, "2026-01-04");
    await pay({ chargeId: charges[1]!.id, shareId: charges[1]!.shares[0]!.id }, "2026-02-10");
    // Paid in the year before: belongs to that year.
    await pay({ chargeId: charges[2]!.id, shareId: charges[2]!.shares[0]!.id }, "2025-12-30");
    await landlord.post(`/api/tenancies/${tenancyId}/deposit/received`, { receivedOn: "2026-01-02" }).expect(201);

    const { body } = await landlord.get("/api/annual?year=2026").expect(200);
    expect(body.summary.units).toHaveLength(1);
    const unit = body.summary.units[0];
    expect(unit.totals).toEqual({ rent: 80_000, costs: 22_000, deposit: 80_000, other: 0 });
    expect(unit.months[0]).toMatchObject({ month: 1, rent: 40_000, costs: 11_000, deposit: 80_000 });
    expect(unit.months[1]).toMatchObject({ month: 2, rent: 40_000, costs: 11_000 });
    expect((await landlord.get("/api/annual?year=2025").expect(200)).body.summary.totals.rent).toBe(40_000);
    // Only the landlord's own units.
    expect((await stranger.get("/api/annual?year=2026").expect(200)).body.summary.units).toEqual([]);

    const csv = await landlord.get("/api/annual?year=2026&format=csv").expect(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain("januar;Maistrova;Stanovanje;400,00;110,00;800,00;0,00");
    const pdf = await landlord.get("/api/annual?year=2026&format=pdf").buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("lets the tenant share a verified renting history, and revoke it", async () => {
    const own = (await tina.get("/api/my-history").expect(200)).body;
    expect(own.name).toBe("Tina Test");
    expect(own.history.payments).toMatchObject({ confirmed: 3, onTime: 2, late: 1 });
    expect(own.history.onTimePercent).toBe(67);

    const created = (await tina.post("/api/references", { days: 7 }).expect(201)).body;
    const token = (created.url as string).split("/referenca/")[1]!;
    expect(token.length).toBeGreaterThan(20);
    expect(await ctx.prisma.tenantReference.count({ where: { tokenHash: token } })).toBe(0); // only a hash is stored

    // A future landlord opens it without an account.
    const shown = (await request(ctx.app).get(`/api/references/${token}`).expect(200)).body.reference;
    expect(shown).toMatchObject({ name: "Tina Test", landlords: 1 });
    // The reader sees how much weight the confirmations carry.
    // In ranges only: the landlord did not share these details.
    expect(shown.landlordInfo).toEqual([{ accountAge: "UNDER_1_MONTH", otherTenants: "0" }]);
    const { ageBucket, tenantBucket } = await import("../src/modules/references/routes.js");
    const now = new Date("2026-11-15T00:00:00Z");
    expect([10, 90, 200, 800].map((d) => ageBucket(new Date(now.getTime() - d * 86_400_000), now))).toEqual(["UNDER_1_MONTH", "1_TO_6_MONTHS", "6_TO_12_MONTHS", "OVER_1_YEAR"]);
    expect([0, 2, 5, 6].map(tenantBucket)).toEqual(["0", "1-2", "3-5", "6+"]);

    // A landlord without a confirmed e-mail does not count (e.g. a second account the tenant opened herself).
    await ctx.prisma.user.update({ where: { id: landlord.user.id }, data: { emailVerifiedAt: null } });
    const unverified = (await request(ctx.app).get(`/api/references/${token}`).expect(200)).body.reference;
    expect(unverified).toMatchObject({ landlords: 0, history: { monthsRented: 0, payments: { confirmed: 0 } } });
    await ctx.prisma.user.update({ where: { id: landlord.user.id }, data: { emailVerifiedAt: new Date() } });
    expect(shown.history.monthsRented).toBeGreaterThan(0);
    expect(JSON.stringify(shown)).not.toMatch(/Maistrova|51000|tina-/); // no address, amounts or e-mail

    const list = (await tina.get("/api/references").expect(200)).body.references;
    expect(list).toEqual([expect.objectContaining({ id: created.reference.id, views: 2 })]);
    await stranger.del(`/api/references/${created.reference.id}`).expect(404);
    await tina.del(`/api/references/${created.reference.id}`).expect(204);
    await request(ctx.app).get(`/api/references/${token}`).expect(404);
    await request(ctx.app).get(`/api/references/${"x".repeat(32)}`).expect(404);
  });
});
