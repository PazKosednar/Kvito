/**
 * Pavšal and monthly costs: one monthly payment for rent and costs, actual costs entered month by month,
 * a settlement built from them and the tenant's credit carried over or deducted from the next payment.
 * Numbers from a real landlord's spreadsheet: 400 € rent + 110 € costs, Feb–Oct, 223,71 € in the tenant's favour.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { hasDb, setupApp, uniqueEmail } from "./helpers.js";

const COSTS: [string, number, number, number][] = [
  ["2033-02", 4_441, 4_333, 1_402],
  ["2033-03", 4_056, 3_632, 1_402],
  ["2033-04", 4_353, 2_450, 1_402],
  ["2033-05", 5_741, 2_960, 1_402],
  ["2033-06", 4_808, 1_720, 1_402],
  ["2033-07", 4_395, 1_845, 1_402],
  ["2033-08", 4_600, 1_551, 1_402],
  ["2033-09", 4_755, 870, 1_402],
  ["2033-10", 4_800, 2_701, 1_402],
];

describe.skipIf(!hasDb)("pavšal, monthly costs and credit", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let landlord: Awaited<ReturnType<Awaited<ReturnType<typeof setupApp>>["login"]>>;
  let gaja: typeof landlord;
  let stranger: typeof landlord;
  let tenancyId = "";
  let settlementId = "";

  beforeAll(async () => {
    ctx = await setupApp();
    landlord = await ctx.login(uniqueEmail("ll"), "Tomaž Test");
    gaja = await ctx.login(uniqueEmail("gaja"), "Gaja Test");
    stranger = await ctx.login(uniqueEmail("x"), "Tujec");
    const propertyId = (await landlord.post("/api/properties", { name: "Maistrova", street: "Maistrova 26", postalCode: "1000", city: "Ljubljana" }).expect(201)).body.property.id;
    const unit = (await landlord.post(`/api/properties/${propertyId}/units`, { name: "Stanovanje" }).expect(201)).body.unit;
    const created = (
      await landlord
        .post(`/api/units/${unit.id}/tenancies`, {
          startDate: "2033-02-01",
          rentCents: 40_000,
          rentDueDay: 5,
          payeeName: "Tomaž Test",
          payeeIban: "SI56191000000123438",
          payeeStreet: "Cesta 1",
          payeeCity: "1000 Ljubljana",
        })
        .expect(201)
    ).body.tenancy;
    expect(created.billingMode).toBe("COMBINED"); // new tenancies: one payment a month
    tenancyId = created.id;
    const url = (await landlord.post(`/api/tenancies/${tenancyId}/invitations`, {}).expect(201)).body.url as string;
    await gaja.post(`/api/invitations/${url.split("/povabilo/")[1]}/accept`).expect(200);
  });

  it("charges rent and costs as one monthly payment with a breakdown", { timeout: 180_000 }, async () => {
    const { generateMonthlyAdvances, generateMonthlyRent } = await import("../src/services/jobs/rent.js");
    // One lump sum for all costs.
    await landlord.put(`/api/tenancies/${tenancyId}/advances`, { items: [{ costType: "OTHER", amountCents: 11_000 }] }).expect(200);
    for (const [period] of COSTS) {
      const now = new Date(`${period}-02T09:00:00Z`);
      await generateMonthlyRent(now);
      await generateMonthlyAdvances(now);
      await generateMonthlyRent(now); // idempotent
    }
    const charges = await ctx.prisma.charge.findMany({ where: { tenancyId, deletedAt: null }, include: { lines: { orderBy: { sortOrder: "asc" } } }, orderBy: { dueDate: "asc" } });
    expect(charges).toHaveLength(9);
    expect(charges.every((c) => c.type === "RENT" && c.amountCents === 51_000)).toBe(true);
    expect(charges[0]).toMatchObject({ rentPeriod: "2033-02", autoKey: "combined:2033-02", purposeCode: "RENT" });
    expect(charges[0]!.lines.map((l) => [l.costType, l.amountCents])).toEqual([["RENT", 40_000], ["OTHER", 11_000]]);
  });

  it("lets the landlord enter the costs month by month and the tenant follow them", async () => {
    for (const [period, mgmt, elec, tv] of COSTS) {
      await landlord.put(`/api/tenancies/${tenancyId}/costs/${period}/BUILDING_MANAGEMENT`, { amountCents: mgmt }).expect(200);
      await landlord.put(`/api/tenancies/${tenancyId}/costs/${period}/ELECTRICITY`, { amountCents: elec }).expect(200);
      await landlord.put(`/api/tenancies/${tenancyId}/costs/${period}/TV`, { amountCents: tv, note: "RTV prispevek" }).expect(200);
    }
    expect((await landlord.put(`/api/tenancies/${tenancyId}/costs/2033-01/TV`, { amountCents: 1 }).expect(400)).body.error.code).toBe("MONTH_BEFORE_START");
    await gaja.put(`/api/tenancies/${tenancyId}/costs/2033-02/TV`, { amountCents: 1 }).expect(404);
    await stranger.get(`/api/tenancies/${tenancyId}/costs?from=2033-02&to=2033-10`).expect(404);

    const { body } = await gaja.get(`/api/tenancies/${tenancyId}/costs?from=2033-02&to=2033-10`).expect(200);
    expect(body.totals).toMatchObject({ advanceCents: 99_000, costCents: 76_629, balanceCents: -22_371 });
    expect(body.costTypes).toEqual(["ELECTRICITY", "TV", "BUILDING_MANAGEMENT"]);
    expect(body.months[0]).toMatchObject({ period: "2033-02", advanceCents: 11_000, costCents: 10_176, lockedBy: null });
    expect(body.entries).toHaveLength(27);
  });

  it("builds the settlement from the months: 223,71 € in the tenant's favour", async () => {
    let { body } = await landlord.post(`/api/tenancies/${tenancyId}/settlements`, { periodFrom: "2033-02-01", periodTo: "2033-10-31" }).expect(201);
    settlementId = body.settlement.id;
    expect(body.settlement.totals).toEqual({ advanceCents: 99_000, actualCents: 76_629, carriedInCents: 0, balanceCents: -22_371 });
    expect(body.settlement.lines.map((l: { costType: string; advanceCents: number; actualCents: number }) => [l.costType, l.advanceCents, l.actualCents])).toEqual([
      ["ELECTRICITY", 0, 22_062],
      ["TV", 0, 12_618],
      ["BUILDING_MANAGEMENT", 0, 41_949],
      ["OTHER", 99_000, 0],
    ]);
    await landlord.patch(`/api/settlements/${settlementId}`, { recommendedChoice: "CARRY_OVER" }).expect(200);
    await landlord.post(`/api/settlements/${settlementId}/send`).expect(200);
    expect((await landlord.put(`/api/tenancies/${tenancyId}/costs/2033-05/TV`, { amountCents: 1 }).expect(400)).body.error.code).toBe("COST_ENTRY_LOCKED");

    ({ body } = await gaja.get(`/api/settlements/${settlementId}`).expect(200));
    expect(body.settlement).toMatchObject({ status: "SENT", recommendedChoice: "CARRY_OVER", nextPayment: { beforeCents: 51_000, afterCents: 28_629 } });
    expect(body.settlement.months).toHaveLength(9);
  });

  it("deducts the credit from the next monthly payment: 510,00 − 223,71 = 286,29 €", { timeout: 120_000 }, async () => {
    const { generateMonthlyRent } = await import("../src/services/jobs/rent.js");
    let { body } = await gaja.post(`/api/settlements/${settlementId}/accept`, { creditChoice: "OFFSET_NEXT" }).expect(200);
    expect(body.settlement).toMatchObject({ status: "CLOSED", creditChoice: "OFFSET_NEXT", creditRemainingCents: 22_371, charge: null });
    const message = await ctx.prisma.message.findFirst({ where: { tenancyId, systemEvent: "SETTLEMENT_CREDIT_OFFSET_NEXT" } });
    expect(message?.systemData).toEqual({ amountCents: 22_371 });

    await generateMonthlyRent(new Date("2033-11-02T09:00:00Z"));
    const nov = await ctx.prisma.charge.findFirstOrThrow({ where: { tenancyId, rentPeriod: "2033-11" }, include: { lines: { orderBy: { sortOrder: "asc" } }, shares: true } });
    expect(nov.amountCents).toBe(28_629);
    expect(nov.shares.map((s) => s.amountCents)).toEqual([28_629]);
    expect(nov.lines.map((l) => [l.costType, l.amountCents, l.creditSettlementId])).toEqual([
      ["RENT", 40_000, null],
      ["OTHER", 11_000, null],
      ["OTHER", -22_371, settlementId],
    ]);
    ({ body } = await gaja.get(`/api/settlements/${settlementId}`).expect(200));
    expect(body.settlement.creditRemainingCents).toBe(0);

    // The offset pays the advance, it does not reduce it: November still counts 110 € of advances.
    ({ body } = await gaja.get(`/api/tenancies/${tenancyId}/costs?from=2033-11&to=2033-11`).expect(200));
    expect(body.totals.advanceCents).toBe(11_000);

    // A deleted charge gives the credit back.
    await landlord.del(`/api/charges/${nov.id}`).expect(204);
    ({ body } = await gaja.get(`/api/settlements/${settlementId}`).expect(200));
    expect(body.settlement.creditRemainingCents).toBe(22_371);
  });

  it("carries a credit that is left into the next settlement", async () => {
    await landlord.put(`/api/tenancies/${tenancyId}/costs/2033-11/ELECTRICITY`, { amountCents: 30_000 }).expect(200);
    let { body } = await landlord.post(`/api/tenancies/${tenancyId}/settlements`, { periodFrom: "2033-11-01", periodTo: "2034-02-28" }).expect(201);
    const next = body.settlement.id as string;
    // Preview while drafting, taken over on sending.
    expect(body.settlement.totals).toMatchObject({ actualCents: 30_000, carriedInCents: 22_371, balanceCents: 7_629 });
    await landlord.patch(`/api/settlements/${next}`, { dueDate: "2034-03-15" }).expect(200);
    await landlord.post(`/api/settlements/${next}/send`).expect(200);
    expect((await ctx.prisma.costSettlement.findUniqueOrThrow({ where: { id: settlementId } })).creditRemainingCents).toBe(0);

    ({ body } = await gaja.post(`/api/settlements/${next}/accept`).expect(200));
    expect(body.settlement).toMatchObject({ status: "ACCEPTED", carriedInCents: 22_371, totals: { balanceCents: 7_629 } });
    const charge = (await gaja.get(`/api/charges/${body.settlement.charge.id}`).expect(200)).body.charge;
    expect(charge.amountCents).toBe(7_629);
    expect(charge.lines.map((l: { costType: string; amountCents: number }) => [l.costType, l.amountCents])).toEqual([["ELECTRICITY", 30_000], ["OTHER", -22_371]]);
  });

  it("keeps a credit until the end of the tenancy and records its return", async () => {
    await landlord.put(`/api/tenancies/${tenancyId}/costs/2034-03/ELECTRICITY`, { amountCents: 1_000 }).expect(200);
    let { body } = await landlord.post(`/api/tenancies/${tenancyId}/settlements`, { periodFrom: "2034-03-01", periodTo: "2034-03-31" }).expect(201);
    const id = body.settlement.id as string;
    // No advances charged in March 2034 here, so make it a credit by leaving the cost out.
    await landlord.del(`/api/tenancies/${tenancyId}/costs/2034-03/ELECTRICITY`).expect(204);
    await ctx.prisma.costSettlement.update({ where: { id }, data: { carriedInCents: 5_000 } }); // as if carried in from before
    await landlord.post(`/api/settlements/${id}/send`).expect(200);
    ({ body } = await gaja.post(`/api/settlements/${id}/accept`, { creditChoice: "CARRY_OVER" }).expect(200));
    expect(body.settlement).toMatchObject({ status: "CLOSED", creditRemainingCents: 5_000 });

    const closeout = (await gaja.get(`/api/tenancies/${tenancyId}/closeout`).expect(200)).body;
    expect(closeout.items.find((i: { key: string }) => i.key === "credit")).toMatchObject({ state: "pending", detail: { cents: 5_000, settlementId: id } });

    await gaja.post(`/api/settlements/${id}/refunded`, { refundedOn: "2034-04-10" }).expect(404); // landlord only
    ({ body } = await landlord.post(`/api/settlements/${id}/refunded`, { refundedOn: "2034-04-10" }).expect(200));
    expect(body.settlement).toMatchObject({ status: "CLOSED", creditRemainingCents: 0 });
    await gaja.post(`/api/settlements/${id}/refund-receipt`).expect(200);
    const after = (await gaja.get(`/api/tenancies/${tenancyId}/closeout`).expect(200)).body;
    expect(after.items.find((i: { key: string }) => i.key === "credit").state).toBe("na");
  });
});
