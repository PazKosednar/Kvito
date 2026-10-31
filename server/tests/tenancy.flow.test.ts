/**
 * Phase 1 flow: property → unit → tenancy → invitation → tenant joins.
 * Also verifies that access is checked on the server for every resource.
 */
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { hasDb, setupApp, uniqueEmail } from "./helpers.js";

describe.skipIf(!hasDb)("tenancy flow", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let landlord: Awaited<ReturnType<Awaited<ReturnType<typeof setupApp>>["login"]>>;
  let tenant: typeof landlord;
  let stranger: typeof landlord;
  let propertyId = "";
  let unitId = "";
  let tenancyId = "";
  let inviteToken = "";

  beforeAll(async () => {
    ctx = await setupApp();
    landlord = await ctx.login(uniqueEmail("landlord"), "Mojca Test");
    tenant = await ctx.login(uniqueEmail("tenant"), "Ana Test");
    stranger = await ctx.login(uniqueEmail("stranger"), "Tuji Najemodajalec");
  });

  it("creates a property and becomes a landlord", async () => {
    const res = await landlord
      .post("/api/properties", { name: "Testna hiša", street: "Testna 1", postalCode: "1000", city: "Ljubljana" })
      .expect(201);
    propertyId = res.body.property.id;
    const me = await landlord.get("/api/me").expect(200);
    expect(me.body.user.roles).toContain("LANDLORD");
  });

  it("validates input", async () => {
    const res = await landlord.post("/api/properties", { name: "", street: "x", postalCode: "10", city: "x" }).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("adds a unit and a tenancy (rejecting an invalid IBAN)", async () => {
    unitId = (await landlord.post(`/api/properties/${propertyId}/units`, { name: "Stanovanje 1" }).expect(201)).body.unit.id;

    const base = {
      startDate: "2026-01-01",
      rentCents: 65000,
      rentDueDay: 5,
      depositCents: 130000,
      payeeName: "Mojca Test",
      coveredCosts: ["ELECTRICITY", "WATER"],
      splitMethod: "EQUAL",
    };
    await landlord.post(`/api/units/${unitId}/tenancies`, { ...base, payeeIban: "SI56191000000123439" }).expect(400);
    const res = await landlord
      .post(`/api/units/${unitId}/tenancies`, { ...base, payeeIban: "si56 1910 0000 0123 438" })
      .expect(201);
    tenancyId = res.body.tenancy.id;
    expect(res.body.tenancy.payeeIban).toBe("SI56191000000123438");
    expect(res.body.tenancy.status).toBe("ACTIVE");
  });

  it("keeps other landlords out", async () => {
    await stranger.get(`/api/properties/${propertyId}`).expect(404);
    await stranger.get(`/api/tenancies/${tenancyId}`).expect(404);
    await stranger.patch(`/api/tenancies/${tenancyId}`, { rentCents: 1 }).expect(404);
    await stranger.post(`/api/tenancies/${tenancyId}/invitations`, {}).expect(404);
    const list = await stranger.get("/api/properties").expect(200);
    expect(list.body.properties).toHaveLength(0);
  });

  it("creates an invitation that can be previewed without login", async () => {
    const res = await landlord.post(`/api/tenancies/${tenancyId}/invitations`, { email: "" }).expect(201);
    inviteToken = String(res.body.url).split("/povabilo/")[1] ?? "";
    expect(inviteToken.length).toBeGreaterThan(20);

    const preview = await request(ctx.app).get(`/api/invitations/${inviteToken}`).expect(200);
    expect(preview.body.invitation).toMatchObject({ state: "PENDING", unitName: "Stanovanje 1", landlordName: "Mojca Test" });
    await request(ctx.app).get("/api/invitations/not-a-real-token-but-long-enough").expect(404);
  });

  it("does not let the tenant see the tenancy before joining", async () => {
    await tenant.get(`/api/tenancies/${tenancyId}`).expect(404);
  });

  it("lets the tenant accept once", async () => {
    const res = await tenant.post(`/api/invitations/${inviteToken}/accept`).expect(200);
    expect(res.body.tenancyId).toBe(tenancyId);
    await tenant.post(`/api/invitations/${inviteToken}/accept`).expect(410);

    const view = await tenant.get(`/api/tenancies/${tenancyId}`).expect(200);
    expect(view.body.access).toBe("TENANT");
    expect(view.body.tenancy.members).toHaveLength(1);
    expect(view.body.tenancy.members[0].isPrimary).toBe(true);

    const me = await tenant.get("/api/me").expect(200);
    expect(me.body.user).toMatchObject({ roles: ["TENANT"], activeRole: "TENANT" });
  });

  it("restricts e-mail bound invitations to that address", async () => {
    const res = await landlord.post(`/api/tenancies/${tenancyId}/invitations`, { email: "someone-else@kvita.test" }).expect(201);
    expect(ctx.mail.sent.at(-1)?.to).toBe("someone-else@kvita.test");
    const token = String(res.body.url).split("/povabilo/")[1];
    const denied = await stranger.post(`/api/invitations/${token}/accept`).expect(403);
    expect(denied.body.error.code).toBe("INVITE_EMAIL_MISMATCH");
  });

  it("tenants cannot change the tenancy", async () => {
    await tenant.patch(`/api/tenancies/${tenancyId}`, { rentCents: 1 }).expect(404);
    await tenant.post(`/api/tenancies/${tenancyId}/invitations`, {}).expect(404);
  });

  it("audits rent changes", async () => {
    await landlord.patch(`/api/tenancies/${tenancyId}`, { rentCents: 70000 }).expect(200);
    const log = await ctx.prisma.auditLog.findFirst({
      where: { entityType: "Tenancy", entityId: tenancyId, action: "update" },
      orderBy: { createdAt: "desc" },
    });
    expect(log?.before).toMatchObject({ rentCents: 65000 });
    expect(log?.after).toMatchObject({ rentCents: 70000 });
    expect(log?.actorId).toBe(landlord.user.id);
  });

  it("lists tenancies per role", async () => {
    const asTenant = await tenant.get("/api/tenancies").expect(200);
    expect(asTenant.body.tenancies.map((t: { id: string }) => t.id)).toEqual([tenancyId]);
    const asLandlord = await landlord.get("/api/tenancies?as=LANDLORD").expect(200);
    expect(asLandlord.body.tenancies.map((t: { id: string }) => t.id)).toContain(tenancyId);
    const strangerView = await stranger.get("/api/tenancies?as=LANDLORD").expect(200);
    expect(strangerView.body.tenancies).toHaveLength(0);
  });

  it("refuses to delete a property with an active tenancy", async () => {
    const res = await landlord.del(`/api/properties/${propertyId}`).expect(400);
    expect(res.body.error.code).toBe("PROPERTY_HAS_ACTIVE_TENANCY");
  });
});
