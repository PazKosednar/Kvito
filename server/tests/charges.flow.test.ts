/**
 * Phase 2 flow: bill split between flatmates → report → confirm → "Kvita ✓"; UPN payment data; uploads;
 * idempotent monthly rent and overdue marking; access rules for every action.
 */
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { hasDb, setupApp, uniqueEmail } from "./helpers.js";

describe.skipIf(!hasDb)("charges flow", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  type Agent = Awaited<ReturnType<typeof ctx.login>>;
  let landlord: Agent;
  let luka: Agent;
  let nina: Agent;
  let stranger: Agent;
  let tenancyId = "";
  let chargeId = "";
  let lukaShare = "";
  let ninaShare = "";

  beforeAll(async () => {
    ctx = await setupApp();
    landlord = await ctx.login(uniqueEmail("ll"), "Mojca Test");
    luka = await ctx.login(uniqueEmail("luka"), "Luka Test");
    nina = await ctx.login(uniqueEmail("nina"), "Nina Test");
    stranger = await ctx.login(uniqueEmail("x"), "Tujec");

    const property = (await landlord.post("/api/properties", { name: "Blok", street: "Cesta 5", postalCode: "1000", city: "Ljubljana" }).expect(201)).body.property;
    const unit = (await landlord.post(`/api/properties/${property.id}/units`, { name: "Stanovanje 2" }).expect(201)).body.unit;
    tenancyId = (
      await landlord
        .post(`/api/units/${unit.id}/tenancies`, {
          startDate: "2025-01-01",
          rentCents: 90000,
          rentDueDay: 5,
          payeeName: "Mojca Test",
          payeeIban: "SI56191000000123438",
          payeeStreet: "Cesta 5",
          payeeCity: "1000 Ljubljana",
          coveredCosts: ["ELECTRICITY"],
          splitMethod: "PERCENTAGE",
        })
        .expect(201)
    ).body.tenancy.id;

    for (const tenant of [luka, nina]) {
      const url = (await landlord.post(`/api/tenancies/${tenancyId}/invitations`, {}).expect(201)).body.url as string;
      await tenant.post(`/api/invitations/${url.split("/povabilo/")[1]}/accept`).expect(200);
    }
  });

  it("refuses to split by percentage before shares add up to 100 %", async () => {
    const res = await landlord
      .post(`/api/tenancies/${tenancyId}/charges`, { title: "Elektrika", amountCents: 4873, dueDate: "2099-01-15", costType: "ELECTRICITY" })
      .expect(400);
    expect(res.body.error.code).toBe("SHARES_INVALID");
  });

  it("creates a bill split 60/40 with an uploaded PDF", async () => {
    const t = (await landlord.get(`/api/tenancies/${tenancyId}`).expect(200)).body.tenancy;
    const [m1, m2] = t.members;
    await landlord.patch(`/api/tenancies/${tenancyId}/members/${m1.id}`, { shareBasisPoints: 6000 }).expect(200);
    await landlord.patch(`/api/tenancies/${tenancyId}/members/${m2.id}`, { shareBasisPoints: 4000 }).expect(200);

    const upload = await request(ctx.app)
      .post(`/api/tenancies/${tenancyId}/attachments?kind=BILL&name=racun.pdf`)
      .set(await authHeader(landlord))
      .set("Content-Type", "application/pdf")
      .send(Buffer.from("%PDF-1.7\n% test bill\n"))
      .expect(201);
    const attachmentId = upload.body.attachment.id;

    const res = await landlord
      .post(`/api/tenancies/${tenancyId}/charges`, {
        title: "Elektrika oktober",
        amountCents: 4873,
        dueDate: "2099-01-15",
        costType: "ELECTRICITY",
        attachmentIds: [attachmentId],
      })
      .expect(201);
    const charge = res.body.charge;
    chargeId = charge.id;
    expect(charge.purposeCode).toBe("ELEC");
    expect(charge.attachments).toHaveLength(1);
    const byUser = Object.fromEntries(charge.shares.map((s: { member: { userId: string }; amountCents: number; id: string }) => [s.member.userId, s]));
    lukaShare = byUser[m1.userId].id;
    ninaShare = byUser[m2.userId].id;
    expect(byUser[m1.userId].amountCents + byUser[m2.userId].amountCents).toBe(4873);
    expect(charge.shares.every((s: { reference: string }) => /^RF\d{2}\d{8}$/.test(s.reference))).toBe(true);

    // Signed link works without auth, tampering does not.
    const fileUrl = charge.attachments[0].url as string;
    await request(ctx.app).get(fileUrl).expect(200).expect("Content-Type", "application/pdf");
    await request(ctx.app).get(fileUrl.replace(/sig=[0-9a-f]/, "sig=0")).expect(403);
  });

  it("rejects uploads that are not PDF or images", async () => {
    const res = await request(ctx.app)
      .post(`/api/tenancies/${tenancyId}/attachments?kind=BILL&name=x.pdf`)
      .set(await authHeader(landlord))
      .set("Content-Type", "application/pdf")
      .send(Buffer.from("<html><script>alert(1)</script></html>"))
      .expect(400);
    expect(res.body.error.code).toBe("FILE_TYPE_NOT_ALLOWED");
  });

  it("gives each tenant UPN payment data for their own share only", async () => {
    const pay = (await luka.get(`/api/charges/${chargeId}/shares/${lukaShare}/payment`).expect(200)).body.payment;
    expect(pay.qrText).toContain("UPNQR\n");
    expect(pay.qrText).toContain("\nELEC\n");
    expect(pay.qrText).toContain("\nLuka Test\nCesta 5\n1000 Ljubljana\n");
    expect(pay.qrText).toContain(`\n${pay.reference}\n`);
    expect(pay.qrSvg).toMatch(/^<svg/);
    expect(pay.payeeIban).toBe("SI56 1910 0000 0123 438");

    await luka.get(`/api/charges/${chargeId}/shares/${ninaShare}/payment`).expect(404);
    await stranger.get(`/api/charges/${chargeId}/shares/${lukaShare}/payment`).expect(404);
    const png = await luka.get(`/api/charges/${chargeId}/shares/${lukaShare}/payment/qr.png`).expect(200);
    expect(png.headers["content-type"]).toBe("image/png");

    await luka.post(`/api/charges/${chargeId}/shares/${lukaShare}/payment/email`).expect(202);
    const mail = ctx.mail.sent.at(-1)!;
    expect(mail.to).toBe(luka.user.email);
    expect(mail.attachments?.[0]?.contentType).toBe("image/png");
  });

  it("does not let a tenant report a flatmate's share or confirm anything", async () => {
    const res = await luka.post(`/api/charges/${chargeId}/shares/${ninaShare}/report`, {}).expect(400);
    expect(res.body.error.code).toBe("NOT_YOUR_SHARE");
    await luka.post(`/api/charges/${chargeId}/shares/${lukaShare}/confirm`).expect(400);
    await stranger.post(`/api/charges/${chargeId}/shares/${lukaShare}/report`, {}).expect(404);
  });

  it("runs report → reject → report → confirm and reaches Kvita ✓", async () => {
    await luka.post(`/api/charges/${chargeId}/shares/${lukaShare}/report`, { paidOn: "2026-10-20", note: "Plačano v NLB Klik" }).expect(200);
    const rejected = await landlord.post(`/api/charges/${chargeId}/shares/${lukaShare}/reject`, { reason: "Nakazila ne vidim" }).expect(200);
    expect(rejected.body.status).toBe("OPEN");
    await luka.post(`/api/charges/${chargeId}/shares/${lukaShare}/report`, {}).expect(200);
    await landlord.post(`/api/charges/${chargeId}/shares/${lukaShare}/confirm`).expect(200);

    let summary = (await luka.get(`/api/tenancies/${tenancyId}/charges`).expect(200)).body.summary;
    expect(summary.kvita).toBe(true); // Luka's own shares are all confirmed

    summary = (await landlord.get(`/api/tenancies/${tenancyId}/charges`).expect(200)).body.summary;
    expect(summary.kvita).toBe(false); // Nina still owes her part
    expect(summary.openCents).toBeGreaterThan(0);

    await nina.post(`/api/charges/${chargeId}/shares/${ninaShare}/report`, {}).expect(200);
    const confirmed = await landlord.post(`/api/charges/${chargeId}/shares/${ninaShare}/confirm`).expect(200);
    expect(confirmed.body.chargeStatus).toBe("CONFIRMED");
    summary = (await landlord.get(`/api/tenancies/${tenancyId}/charges`).expect(200)).body.summary;
    expect(summary.kvita).toBe(true);

    const reports = await ctx.prisma.paymentReport.findMany({ where: { chargeShareId: lukaShare }, orderBy: { createdAt: "asc" } });
    expect(reports.map((r) => r.status)).toEqual(["REJECTED", "ACCEPTED"]);
    expect(reports[0]!.rejectReason).toBe("Nakazila ne vidim");

    const audits = await ctx.prisma.auditLog.findMany({ where: { entityType: "ChargeShare", entityId: lukaShare }, orderBy: { createdAt: "asc" } });
    expect(audits.map((a) => a.action)).toEqual(["report", "reject", "report", "confirm"]);

    const system = await ctx.prisma.message.findMany({ where: { tenancyId, kind: "SYSTEM", chargeId } });
    expect(system.map((m) => m.systemEvent)).toEqual(expect.arrayContaining(["CHARGE_CREATED", "PAYMENT_REPORTED", "PAYMENT_CONFIRMED", "PAYMENT_REJECTED"]));
  });

  it("locks confirmed charges against edits", async () => {
    const res = await landlord.patch(`/api/charges/${chargeId}`, { amountCents: 100 }).expect(400);
    expect(res.body.error.code).toBe("CHARGE_LOCKED");
  });

  it("generates monthly rent exactly once and marks it overdue after the due date", async () => {
    const { generateMonthlyRent, markOverdue } = await import("../src/services/jobs/rent.js");
    const now = new Date("2026-11-03T08:00:00Z");
    await generateMonthlyRent(now);
    await generateMonthlyRent(now);
    const rents = await ctx.prisma.charge.findMany({ where: { tenancyId, rentPeriod: "2026-11" }, include: { shares: true } });
    expect(rents).toHaveLength(1);
    expect(rents[0]!.amountCents).toBe(90000);
    expect(rents[0]!.dueDate.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(rents[0]!.shares.map((s) => s.amountCents).sort()).toEqual([36000, 54000]);
    expect(rents[0]!.purposeCode).toBe("RENT");

    await markOverdue(new Date("2026-11-06T08:00:00Z"));
    const after = await ctx.prisma.charge.findUniqueOrThrow({ where: { id: rents[0]!.id }, include: { shares: true } });
    expect(after.status).toBe("OVERDUE");
    expect(after.shares.every((s) => s.status === "OVERDUE")).toBe(true);
  });
});

async function authHeader(agent: { user: { id: string } }) {
  const { signAccessToken } = await import("../src/modules/auth/tokens.js");
  return { Authorization: `Bearer ${await signAccessToken(agent.user.id)}` };
}
