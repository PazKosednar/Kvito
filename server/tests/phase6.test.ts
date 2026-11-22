/**
 * Phase 6: deposit, monthly cost advances and settlement, rent changes, contract reminders, closing a tenancy,
 * bank statement import.
 */
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { hasDb, setupApp, uniqueEmail } from "./helpers.js";

describe.skipIf(!hasDb)("contract money and bank import", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let landlord: Awaited<ReturnType<Awaited<ReturnType<typeof setupApp>>["login"]>>;
  let ana: typeof landlord;
  let stranger: typeof landlord;
  let tenancyId = "";
  let propertyId = "";

  async function newTenancy(opts: { startDate: string; endDate?: string; rentCents?: number; depositCents?: number; rentReviewMonth?: number }) {
    const unit = (await landlord.post(`/api/properties/${propertyId}/units`, { name: `Enota ${Math.random().toString(36).slice(2, 6)}` }).expect(201)).body.unit;
    const id = (
      await landlord
        .post(`/api/units/${unit.id}/tenancies`, {
          startDate: opts.startDate,
          endDate: opts.endDate ?? null,
          rentCents: opts.rentCents ?? 0,
          rentDueDay: 5,
          depositCents: opts.depositCents ?? null,
          payeeName: "Mojca Test",
          payeeIban: "SI56191000000123438",
          payeeStreet: "Cesta 1",
          payeeCity: "1000 Ljubljana",
          splitMethod: "EQUAL",
          noticePeriodDays: 30,
          rentReviewMonth: opts.rentReviewMonth ?? null,
          paymentNote: "Flik: 041 123 456",
          // Rent and advances as two charges; the combined payment is covered in billing.test.ts.
          billingMode: "SEPARATE",
        })
        .expect(201)
    ).body.tenancy.id as string;
    const url = (await landlord.post(`/api/tenancies/${id}/invitations`, {}).expect(201)).body.url as string;
    await ana.post(`/api/invitations/${url.split("/povabilo/")[1]}/accept`).expect(200);
    return id;
  }

  async function pay(chargeId: string) {
    const charge = (await landlord.get(`/api/charges/${chargeId}`).expect(200)).body.charge;
    const share = charge.shares[0].id as string;
    await ana.post(`/api/charges/${chargeId}/shares/${share}/report`, { paidOn: "2031-01-02" }).expect(200);
    await landlord.post(`/api/charges/${chargeId}/shares/${share}/confirm`).expect(200);
    return share;
  }

  beforeAll(async () => {
    ctx = await setupApp();
    landlord = await ctx.login(uniqueEmail("ll"), "Mojca Test");
    // Every test adds a unit: a paid plan (plan limits always apply).
    await ctx.prisma.subscription.create({ data: { userId: landlord.user.id, plan: "MANAGER" } });
    ana = await ctx.login(uniqueEmail("ana"), "Ana Test");
    stranger = await ctx.login(uniqueEmail("x"), "Tujec");
    propertyId = (await landlord.post("/api/properties", { type: "MULTI_UNIT_HOUSE", name: "Hiša", street: "Cesta 1", postalCode: "1000", city: "Ljubljana" }).expect(201)).body.property.id;
    tenancyId = await newTenancy({ startDate: "2031-01-01", rentCents: 65_000, depositCents: 130_000 });
  });

  // ---------- Deposit ----------

  it("asks for the deposit as a normal charge and holds it once the payment is confirmed", async () => {
    await ana.post(`/api/tenancies/${tenancyId}/deposit/request`, { dueDate: "2031-01-05" }).expect(404); // tenant: not the landlord
    const { body } = await landlord.post(`/api/tenancies/${tenancyId}/deposit/request`, { dueDate: "2031-01-05" }).expect(201);
    expect(body.deposit).toMatchObject({ amountCents: 130_000, status: "AWAITING_PAYMENT" });
    await landlord.post(`/api/tenancies/${tenancyId}/deposit/request`, { dueDate: "2031-01-05" }).expect(400);

    const chargeId = body.deposit.charge.id as string;
    const charge = (await ana.get(`/api/charges/${chargeId}`).expect(200)).body.charge;
    expect(charge).toMatchObject({ type: "DEPOSIT", purposeCode: "DEPT", amountCents: 130_000 });
    // Changed only through the deposit itself.
    expect((await landlord.patch(`/api/charges/${chargeId}`, { amountCents: 1 }).expect(400)).body.error.code).toBe("CHARGE_MANAGED");
    await landlord.del(`/api/charges/${chargeId}`).expect(400);

    await pay(chargeId);
    const state = (await ana.get(`/api/tenancies/${tenancyId}/deposit`).expect(200)).body;
    expect(state.deposit).toMatchObject({ status: "HELD" });
    expect(state.damagedItems).toEqual([]); // landlord-only list
    await stranger.get(`/api/tenancies/${tenancyId}/deposit`).expect(404);
  });

  it("agrees on the return: proposal, dispute, new proposal, acceptance, returned, receipt", async () => {
    await ana.post(`/api/tenancies/${tenancyId}/deposit/proposal`, { deductions: [] }).expect(400); // tenants do not propose
    const tooMuch = await landlord.post(`/api/tenancies/${tenancyId}/deposit/proposal`, { deductions: [{ reason: "Vse", amountCents: 130_001 }] }).expect(400);
    expect(tooMuch.body.error.code).toBe("DEDUCTIONS_EXCEED_DEPOSIT");

    let { body } = await landlord
      .post(`/api/tenancies/${tenancyId}/deposit/proposal`, { deductions: [{ reason: "Poškodovan parket", amountCents: 20_000 }], note: "Po zapisniku." })
      .expect(200);
    expect(body.deposit).toMatchObject({ status: "RETURN_PROPOSED", returnCents: 110_000, keptCents: 20_000 });
    expect(body.deposit.returnByMember).toEqual([expect.objectContaining({ amountCents: 110_000 })]);

    await ana.post(`/api/tenancies/${tenancyId}/deposit/dispute`, { reason: "Parket je bil že prej obrabljen." }).expect(200);
    ({ body } = await landlord.post(`/api/tenancies/${tenancyId}/deposit/proposal`, { deductions: [{ reason: "Čiščenje", amountCents: 5_000 }] }).expect(200));
    expect(body.deposit).toMatchObject({ status: "RETURN_PROPOSED", returnCents: 125_000, disputeReason: null });

    await landlord.post(`/api/tenancies/${tenancyId}/deposit/returned`, { returnedOn: "2031-02-01" }).expect(400); // not agreed yet
    ({ body } = await ana.post(`/api/tenancies/${tenancyId}/deposit/accept`).expect(200));
    expect(body.deposit.status).toBe("RETURN_AGREED");
    ({ body } = await landlord.post(`/api/tenancies/${tenancyId}/deposit/returned`, { returnedOn: "2031-02-01" }).expect(200));
    expect(body.deposit.status).toBe("RETURNED");
    ({ body } = await ana.post(`/api/tenancies/${tenancyId}/deposit/receipt`).expect(200));
    expect(body.deposit.receiptConfirmedAt).not.toBeNull();
    await ana.post(`/api/tenancies/${tenancyId}/deposit/receipt`).expect(400);

    const trail = await ctx.prisma.auditLog.findMany({ where: { entityType: "Deposit" , entityId: body.deposit.id }, select: { action: true } });
    expect(trail.map((a) => a.action)).toEqual(expect.arrayContaining(["request", "received", "propose", "dispute", "accept", "markReturned", "receipt"]));
  });

  it("records a deposit paid before Kvito", async () => {
    const id = await newTenancy({ startDate: "2031-01-01", depositCents: 50_000 });
    const { body } = await landlord.post(`/api/tenancies/${id}/deposit/received`, { receivedOn: "2030-12-20" }).expect(201);
    expect(body.deposit).toMatchObject({ status: "HELD", charge: null });
  });

  // ---------- Advances and settlement ----------

  it("charges the monthly advances once a month, with a breakdown", { timeout: 60_000 }, async () => {
    const { generateMonthlyAdvances } = await import("../src/services/jobs/rent.js");
    await ana.put(`/api/tenancies/${tenancyId}/advances`, { items: [] }).expect(404);
    const put = (await landlord.put(`/api/tenancies/${tenancyId}/advances`, { items: [{ costType: "HEATING", amountCents: 6_000 }, { costType: "WATER", amountCents: 2_000 }] }).expect(200)).body;
    expect(put.totalCents).toBe(8_000);

    const march = new Date("2031-03-02T09:00:00Z");
    await generateMonthlyAdvances(march);
    await generateMonthlyAdvances(march); // idempotent
    const charges = await ctx.prisma.charge.findMany({ where: { tenancyId, type: "ADVANCE" }, include: { lines: true } });
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ amountCents: 8_000, autoKey: "advance:2031-03", payTo: "LANDLORD" });
    expect(charges[0]!.lines.map((l) => [l.costType, l.amountCents])).toEqual([["HEATING", 6_000], ["WATER", 2_000]]);
  });

  it("settles the year: advances and monthly costs prefilled, sent, accepted, the difference becomes a charge", async () => {
    await ana.put(`/api/tenancies/${tenancyId}/costs/2031-03/HEATING`, { amountCents: 1 }).expect(404); // tenants only read
    await landlord.put(`/api/tenancies/${tenancyId}/costs/2031-03/HEATING`, { amountCents: 9_000 }).expect(200);
    await landlord.put(`/api/tenancies/${tenancyId}/costs/2031-03/HEATING`, { amountCents: 9_500, note: "Popravek" }).expect(200); // same month: corrected
    await landlord.put(`/api/tenancies/${tenancyId}/costs/2031-03/WATER`, { amountCents: 1_500 }).expect(200);
    await landlord.put(`/api/tenancies/${tenancyId}/costs/2031-03/RENT`, { amountCents: 1 }).expect(400);

    let { body } = await landlord.post(`/api/tenancies/${tenancyId}/settlements`, { periodFrom: "2031-01-01", periodTo: "2031-12-31" }).expect(201);
    const id = body.settlement.id as string;
    expect(body.settlement.lines.map((l: { costType: string; advanceCents: number; actualCents: number }) => [l.costType, l.advanceCents, l.actualCents])).toEqual([
      ["WATER", 2_000, 1_500],
      ["HEATING", 6_000, 9_500],
    ]);
    expect(body.settlement.totals).toEqual({ advanceCents: 8_000, actualCents: 11_000, carriedInCents: 0, balanceCents: 3_000 });
    expect(body.settlement.months).toHaveLength(12);
    expect(body.settlement.months[2]).toMatchObject({ period: "2031-03", advanceCents: 8_000, costCents: 11_000 });
    await ana.get(`/api/settlements/${id}`).expect(404); // draft = landlord's working copy

    expect((await landlord.post(`/api/settlements/${id}/send`).expect(400)).body.error.code).toBe("DUE_DATE_REQUIRED");
    await landlord.patch(`/api/settlements/${id}`, { dueDate: "2032-01-20", lines: [{ costType: "HEATING", note: "Po računih upravnika" }] }).expect(200);
    await landlord.post(`/api/settlements/${id}/send`).expect(200);
    await landlord.patch(`/api/settlements/${id}`, { note: "x" }).expect(400); // sent = locked
    // The months of a sent settlement are fixed.
    expect((await landlord.put(`/api/tenancies/${tenancyId}/costs/2031-03/WATER`, { amountCents: 1 }).expect(400)).body.error.code).toBe("COST_ENTRY_LOCKED");

    ({ body } = await ana.post(`/api/settlements/${id}/accept`).expect(200));
    expect(body.settlement.status).toBe("ACCEPTED");
    expect(body.settlement.lines.find((l: { costType: string }) => l.costType === "HEATING").note).toBe("Po računih upravnika");
    const chargeId = body.settlement.charge.id as string;
    const charge = (await ana.get(`/api/charges/${chargeId}`).expect(200)).body.charge;
    expect(charge).toMatchObject({ type: "SETTLEMENT", amountCents: 3_000 });
    expect(charge.lines.map((l: { costType: string; amountCents: number }) => [l.costType, l.amountCents])).toEqual([["WATER", -500], ["HEATING", 3_500]]);

    await pay(chargeId);
    ({ body } = await ana.get(`/api/settlements/${id}`).expect(200));
    expect(body.settlement.status).toBe("CLOSED");
  });

  it("returns an overpayment: the landlord records the refund, the tenant confirms it", { timeout: 60_000 }, async () => {
    const { generateMonthlyAdvances } = await import("../src/services/jobs/rent.js");
    const other = await newTenancy({ startDate: "2031-01-01" });
    await landlord.put(`/api/tenancies/${other}/advances`, { items: [{ costType: "HEATING", amountCents: 6_000 }, { costType: "WATER", amountCents: 2_000 }] }).expect(200);
    await generateMonthlyAdvances(new Date("2031-03-02T09:00:00Z"));
    await landlord.put(`/api/tenancies/${other}/costs/2031-03/HEATING`, { amountCents: 1_000 }).expect(200);

    let { body } = await landlord.post(`/api/tenancies/${other}/settlements`, { periodFrom: "2031-01-01", periodTo: "2031-06-30" }).expect(201);
    const id = body.settlement.id as string;
    await landlord.post(`/api/settlements/${id}/send`).expect(200);
    await ana.post(`/api/settlements/${id}/dispute`, { reason: "Preveri prosim." }).expect(200);
    // Disputed: the landlord may correct the month again.
    await landlord.put(`/api/tenancies/${other}/costs/2031-03/WATER`, { amountCents: 0 }).expect(200);
    await landlord.post(`/api/settlements/${id}/send`).expect(200);
    expect((await ana.post(`/api/settlements/${id}/accept`).expect(400)).body.error.code).toBe("CREDIT_CHOICE_REQUIRED");
    ({ body } = await ana.post(`/api/settlements/${id}/accept`, { creditChoice: "REFUND" }).expect(200));
    expect(body.settlement).toMatchObject({ status: "ACCEPTED", charge: null, totals: { balanceCents: -7_000 } });
    expect(body.settlement.refundByMember).toEqual([expect.objectContaining({ amountCents: 7_000 })]);
    ({ body } = await landlord.post(`/api/settlements/${id}/refunded`, { refundedOn: "2031-07-10" }).expect(200));
    expect(body.settlement.status).toBe("CLOSED");
    ({ body } = await ana.post(`/api/settlements/${id}/refund-receipt`).expect(200));
    expect(body.settlement.refundConfirmedAt).not.toBeNull();
  });

  // ---------- Rent and contract ----------

  it("schedules a rent change and the rent job uses it from that month", { timeout: 60_000 }, async () => {
    const { applyRentChanges, generateMonthlyRent } = await import("../src/services/jobs/rent.js");
    expect((await landlord.post(`/api/tenancies/${tenancyId}/rent-changes`, { effectiveFrom: "2020-01", rentCents: 1 }).expect(400)).body.error.code).toBe("MONTH_IN_PAST");
    await ana.post(`/api/tenancies/${tenancyId}/rent-changes`, { effectiveFrom: "2031-04", rentCents: 70_000 }).expect(404);
    const { body } = await landlord.post(`/api/tenancies/${tenancyId}/rent-changes`, { effectiveFrom: "2031-04", rentCents: 70_000, note: "Uskladitev po pogodbi" }).expect(201);
    expect(body.change).toMatchObject({ rentCents: 70_000, previousCents: 65_000, appliedAt: null });

    await applyRentChanges(new Date(Date.UTC(2031, 2, 1))); // March: not yet
    expect((await ctx.prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } })).rentCents).toBe(65_000);
    await generateMonthlyRent(new Date("2031-04-02T09:00:00Z"));
    expect((await ctx.prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } })).rentCents).toBe(70_000);
    const rent = await ctx.prisma.charge.findFirstOrThrow({ where: { tenancyId, rentPeriod: "2031-04" } });
    expect(rent.amountCents).toBe(70_000);
    expect((await landlord.post(`/api/tenancies/${tenancyId}/rent-changes`, { effectiveFrom: "2031-04", rentCents: 1 }).expect(400)).body.error.code).toBe("RENT_ALREADY_CREATED");
  });

  it("reminds both sides before a fixed-term tenancy ends, once, and the landlord about the rent review", { timeout: 60_000 }, async () => {
    const { createNotifier } = await import("../src/services/notifications/notifier.js");
    const { NullPushSender } = await import("../src/services/push/WebPushSender.js");
    const { sendContractReminders } = await import("../src/services/jobs/contract.js");
    const id = await newTenancy({ startDate: "2031-01-01", endDate: "2031-03-30", rentReviewMonth: 3 });
    const notifier = createNotifier({ emailSender: ctx.mail, pushSender: new NullPushSender() });
    const now = new Date("2031-03-10T09:00:00Z"); // 20 days before the end, 10:00 in Ljubljana
    await sendContractReminders(notifier, now);
    await sendContractReminders(notifier, now);

    const rows = await ctx.prisma.notification.findMany({ where: { dedupeKey: { contains: id } }, select: { userId: true, type: true, body: true } });
    const ending = rows.filter((r) => r.type === "contract.ending");
    expect(ending.map((r) => r.userId).sort()).toEqual([landlord.user.id, ana.user.id].sort());
    expect(ending[0]!.body).toContain("Odpovedni rok po pogodbi: 30 dni");
    expect(rows.filter((r) => r.type === "rent.review").map((r) => r.userId)).toEqual([landlord.user.id]);
  });

  it("lists what is missing before the tenancy can be closed", async () => {
    const { body } = await ana.get(`/api/tenancies/${tenancyId}/closeout`).expect(200);
    const state = Object.fromEntries(body.items.map((i: { key: string; state: string }) => [i.key, i.state]));
    // The closed yearly settlement covers the last advance; the move-out record is still missing.
    expect(state).toMatchObject({ deposit: "done", settlement: "done", moveOut: "pending", keys: "pending", charges: "pending" });
    expect(body.ready).toBe(false);
  });

  // ---------- Bank import ----------

  it("matches an incoming payment by its Kvito reference and confirms it on request", async () => {
    const { shareReference } = await import("../src/lib/reference.js");
    const created = (await landlord.post(`/api/tenancies/${tenancyId}/charges`, { title: "Elektrika", amountCents: 4_321, dueDate: "2031-05-05", costType: "ELECTRICITY" }).expect(201)).body.charge;
    const share = created.shares[0];
    const camt = `<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>
      <Ntry><Amt Ccy="EUR">43.21</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2031-05-03</Dt></BookgDt><AcctSvcrRef>E-${share.id}</AcctSvcrRef>
        <NtryDtls><TxDtls><RltdPties><Dbtr><Nm>Ana Test</Nm></Dbtr></RltdPties><RmtInf><Strd><CdtrRefInf><Ref>${shareReference(share.refNo)}</Ref></CdtrRefInf></Strd></RmtInf></TxDtls></NtryDtls></Ntry>
      <Ntry><Amt Ccy="EUR">10.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2031-05-04</Dt></BookgDt><NtryDtls><TxDtls><RmtInf><Ustrd>Vračilo</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
    </Stmt></BkToCstmrStmt></Document>`;
    const upload = (who: typeof landlord) =>
      import("../src/modules/auth/tokens.js").then(async ({ signAccessToken }) =>
        request(ctx.app).post("/api/bank-import/preview").set({ Authorization: `Bearer ${await signAccessToken(who.user.id)}`, "Content-Type": "application/xml" }).send(camt),
      );

    let res = await upload(landlord);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ format: "camt", credits: 2, foreignReferences: 0 });
    expect(res.body.matches).toEqual([expect.objectContaining({ state: "READY", bookedOn: "2031-05-03", share: expect.objectContaining({ id: share.id, amountCents: 4_321 }) })]);
    expect(res.body.unmatched).toHaveLength(1);

    // Somebody else's statement with this reference sees nothing of this tenancy.
    res = await upload(stranger);
    expect(res.body).toMatchObject({ matches: [], foreignReferences: 1 });

    const confirm = await landlord.post("/api/bank-import/confirm", { items: [{ shareId: share.id, entryId: `E-${share.id}`, paidOn: "2031-05-03" }] }).expect(200);
    expect(confirm.body).toEqual({ confirmed: 1, skipped: [] });
    const report = await ctx.prisma.paymentReport.findFirstOrThrow({ where: { chargeShareId: share.id } });
    expect(report).toMatchObject({ source: "BANK_IMPORT", status: "ACCEPTED", bankEntryRef: `E-${share.id}` });

    res = await upload(landlord);
    expect(res.body.matches[0].state).toBe("ALREADY_CONFIRMED");
    expect((await stranger.post("/api/bank-import/confirm", { items: [{ shareId: share.id, entryId: "x", paidOn: null }] }).expect(200)).body.skipped[0].reason).toBe("NOT_FOUND");
  });

  it("shows the landlord's payment note next to the payment data", async () => {
    const created = (await landlord.post(`/api/tenancies/${tenancyId}/charges`, { title: "Voda", amountCents: 1_000, dueDate: "2031-05-05" }).expect(201)).body.charge;
    const { body } = await ana.get(`/api/charges/${created.id}/shares/${created.shares[0].id}/payment`).expect(200);
    expect(body.payment.paymentNote).toBe("Flik: 041 123 456");
  });
});
