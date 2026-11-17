/**
 * Phase 5: landlord overview, yearly payment export (CSV/PDF), data export, account deletion, retention.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { hasDb, setupApp, uniqueEmail } from "./helpers.js";

describe.skipIf(!hasDb)("overview, exports and privacy", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let landlord: Awaited<ReturnType<Awaited<ReturnType<typeof setupApp>>["login"]>>;
  let ana: typeof landlord;
  let stranger: typeof landlord;
  let tenancyId = "";
  const year = new Date().getUTCFullYear();

  beforeAll(async () => {
    ctx = await setupApp();
    landlord = await ctx.login(uniqueEmail("ll"), "Mojca Test");
    ana = await ctx.login(uniqueEmail("ana"), "Ana Test");
    stranger = await ctx.login(uniqueEmail("x"), "Tujec");
    const property = (await landlord.post("/api/properties", { name: "Hiša", street: "Cesta 1", postalCode: "1000", city: "Ljubljana" }).expect(201)).body.property;
    const unit = (await landlord.post(`/api/properties/${property.id}/units`, { name: "Enota 1" }).expect(201)).body.unit;
    tenancyId = (
      await landlord
        .post(`/api/units/${unit.id}/tenancies`, {
          startDate: "2030-01-01",
          rentCents: 0,
          rentDueDay: 5,
          payeeName: "Mojca Test",
          payeeIban: "SI56191000000123438",
          payeeStreet: "Cesta 1",
          payeeCity: "1000 Ljubljana",
          coveredCosts: ["ELECTRICITY"],
          splitMethod: "EQUAL",
        })
        .expect(201)
    ).body.tenancy.id;
    const url = (await landlord.post(`/api/tenancies/${tenancyId}/invitations`, {}).expect(201)).body.url as string;
    await ana.post(`/api/invitations/${url.split("/povabilo/")[1]}/accept`).expect(200);
  });

  async function charge(title: string, cents: number, dueDate: string, confirm: boolean) {
    const created = (await landlord.post(`/api/tenancies/${tenancyId}/charges`, { title, amountCents: cents, dueDate, costType: "ELECTRICITY" }).expect(201)).body.charge;
    const share = created.shares[0].id as string;
    if (confirm) {
      await ana.post(`/api/charges/${created.id}/shares/${share}/report`, { paidOn: dueDate }).expect(200);
      await landlord.post(`/api/charges/${created.id}/shares/${share}/confirm`).expect(200);
    }
    return { id: created.id as string, share };
  }

  it("summarises what is open, overdue and waiting per tenancy – for the landlord only", async () => {
    await charge("Odprto", 1000, "2099-01-01", false);
    await charge("Zamuda", 2000, "2020-01-01", false);
    const waiting = await charge("Čaka", 3000, "2099-02-01", false);
    await ana.post(`/api/charges/${waiting.id}/shares/${waiting.share}/report`, { note: "Plačano" }).expect(200);

    const { body } = await landlord.get("/api/overview").expect(200);
    const row = body.byTenancy[tenancyId];
    expect(row).toMatchObject({ overdueCount: 1, overdueCents: 2000, waitingCount: 1, waitingCents: 3000, openCount: 1 });
    expect(row.openCents).toBe(3000); // 1000 open + 2000 overdue, both still to collect
    expect((await stranger.get("/api/overview").expect(200)).body.byTenancy[tenancyId]).toBeUndefined();
  });

  it("exports confirmed payments of the year as Excel-friendly CSV and as PDF", async () => {
    // Confirmed payments are stamped "now", so they fall into the current year.
    await charge("Elektrika; oktober", 12345, "2099-03-01", true);
    expect((await landlord.get("/api/exports/years").expect(200)).body.years).toContain(year);

    const csv = await landlord.get(`/api/exports/payments?year=${year}&format=csv`).expect(200).expect("Content-Type", /text\/csv/);
    const text = csv.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain("Potrjeno;Plačano;Nepremičnina");
    expect(text).toContain('"Elektrika; oktober"'); // a separator inside a value is quoted
    expect(text).toContain("123,45");
    expect(text).toMatch(/Skupaj;.*;123,45\r\n$/);

    const pdf = await landlord
      .get(`/api/exports/payments?year=${year}&format=pdf`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200)
      .expect("Content-Type", "application/pdf");
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");

    // Other people only ever get their own (empty) list.
    const none = await stranger.get(`/api/exports/payments?year=${year}&format=csv`).expect(200);
    expect(none.text).not.toContain("Elektrika");
    await landlord.get("/api/exports/payments?year=1999&format=csv").expect(400);
  });

  it("lets a person download their data", async () => {
    const res = await ana.get("/api/privacy/export").expect(200).expect("Content-Type", /application\/json/);
    const data = JSON.parse(res.text) as { profile: { email: string }; tenancies: unknown[]; paymentReports: unknown[] };
    expect(data.profile.email).toBe(ana.user.email);
    expect(data.tenancies).toHaveLength(1);
    expect(data.paymentReports.length).toBeGreaterThan(0);
    expect(res.text).not.toContain(landlord.user.email); // nothing about other people's accounts
  });

  it("refuses deletion without the right confirmation or while a landlord has an active tenancy", async () => {
    const bad = await ana.del("/api/privacy/account").send({ email: "nekdo@drug.test" }).expect(400);
    expect(bad.body.error.code).toBe("CONFIRMATION_MISMATCH");
    const blocked = await landlord.del("/api/privacy/account").send({ email: landlord.user.email }).expect(400);
    expect(blocked.body.error.code).toBe("ACCOUNT_HAS_ACTIVE_TENANCIES");
  });

  it("deletes a tenant's account but keeps the landlord's records", async () => {
    await ana.del("/api/privacy/account").send({ email: ana.user.email.toUpperCase() }).expect(204);
    const gone = await ctx.prisma.user.findUniqueOrThrow({ where: { id: ana.user.id } });
    expect(gone.deletedAt).not.toBeNull();
    expect(gone.email).toMatch(/^deleted-.*@deleted\.invalid$/);
    expect(gone.name).toBe("Izbrisan uporabnik");
    expect(await ctx.prisma.pushSubscription.count({ where: { userId: ana.user.id } })).toBe(0);
    // The old token stops working, the landlord still sees the charges and the confirmed payment.
    await ana.get("/api/me").expect(401);
    const charges = (await landlord.get(`/api/tenancies/${tenancyId}/charges`).expect(200)).body.charges as unknown[];
    expect(charges.length).toBeGreaterThanOrEqual(4);
    expect(await ctx.prisma.auditLog.count({ where: { actorId: ana.user.id, action: "account.delete" } })).toBe(1);
  });

  it("purges only expired technical data", async () => {
    const { purgeExpiredData } = await import("../src/services/jobs/retention.js");
    const email = uniqueEmail("old");
    await ctx.prisma.loginCode.create({ data: { email, codeHash: "x", expiresAt: new Date(Date.now() - 5 * 86_400_000) } });
    const fresh = uniqueEmail("fresh");
    await ctx.prisma.loginCode.create({ data: { email: fresh, codeHash: "x", expiresAt: new Date(Date.now() + 600_000) } });
    const result = await purgeExpiredData();
    expect(result["loginCodes"]).toBeGreaterThanOrEqual(1);
    expect(await ctx.prisma.loginCode.count({ where: { email } })).toBe(0);
    expect(await ctx.prisma.loginCode.count({ where: { email: fresh } })).toBe(1);
  });
});
