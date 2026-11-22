/** Phase 4: meter readings, documents with visibility, handover record with both confirmations and PDF. */
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { hasDb, setupApp, uniqueEmail } from "./helpers.js";

describe.skipIf(!hasDb)("meters, documents, handover", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  type Agent = Awaited<ReturnType<typeof ctx.login>>;
  let landlord: Agent;
  let tenant: Agent;
  let stranger: Agent;
  let tenancyId = "";

  async function auth(agent: Agent) {
    const { signAccessToken } = await import("../src/modules/auth/tokens.js");
    return { Authorization: `Bearer ${await signAccessToken(agent.user.id)}` };
  }
  async function upload(agent: Agent, kind: string, bytes: Buffer, type: string, name: string) {
    const res = await request(ctx.app)
      .post(`/api/tenancies/${tenancyId}/attachments?kind=${kind}&name=${encodeURIComponent(name)}`)
      .set(await auth(agent))
      .set("Content-Type", type)
      .send(bytes)
      .expect(201);
    return res.body.attachment.id as string;
  }

  beforeAll(async () => {
    ctx = await setupApp();
    landlord = await ctx.login(uniqueEmail("ll4"), "Mojca Novak");
    tenant = await ctx.login(uniqueEmail("t4"), "Žiga Čeh");
    stranger = await ctx.login(uniqueEmail("s4"), "Tujec");
    const prop = (await landlord.post("/api/properties", { type: "MULTI_UNIT_HOUSE", name: "Hiša ob Savi", street: "Šmartinska 12", postalCode: "1000", city: "Ljubljana" }).expect(201)).body.property;
    const unit = (await landlord.post(`/api/properties/${prop.id}/units`, { name: "Stanovanje 4" }).expect(201)).body.unit;
    tenancyId = (await landlord.post(`/api/units/${unit.id}/tenancies`, { startDate: "2026-01-01", rentCents: 70000, rentDueDay: 5, payeeName: "Mojca Novak", payeeIban: "SI56191000000123438" }).expect(201)).body.tenancy.id;
    const url = (await landlord.post(`/api/tenancies/${tenancyId}/invitations`, {}).expect(201)).body.url as string;
    await tenant.post(`/api/invitations/${url.split("/povabilo/")[1]}/accept`).expect(200);
  });

  it("records meter readings and warns when a value goes down", async () => {
    const first = await tenant.post(`/api/tenancies/${tenancyId}/meters`, { meterType: "ELECTRICITY", value: "12.345,6", readOn: "2026-10-01" }).expect(201);
    expect(first.body.reading.value).toBe("12345,6");
    const lower = await tenant.post(`/api/tenancies/${tenancyId}/meters`, { meterType: "ELECTRICITY", value: "12000", readOn: "2026-10-31" }).expect(201);
    expect(lower.body.lowerThanPrevious).toBe(true);
    await tenant.post(`/api/tenancies/${tenancyId}/meters`, { meterType: "WATER", value: "abc", readOn: "2026-10-31" }).expect(400);
    await stranger.get(`/api/tenancies/${tenancyId}/meters`).expect(404);
    const list = (await landlord.get(`/api/tenancies/${tenancyId}/meters`).expect(200)).body.readings;
    expect(list).toHaveLength(2);
  });

  it("hides landlord-only documents from tenants", async () => {
    const pdf = Buffer.from("%PDF-1.7\n% contract\n");
    const a1 = await upload(landlord, "DOCUMENT", pdf, "application/pdf", "pogodba.pdf");
    const a2 = await upload(landlord, "DOCUMENT", pdf, "application/pdf", "zapiski.pdf");
    await landlord.post(`/api/tenancies/${tenancyId}/documents`, { category: "CONTRACT", title: "Najemna pogodba", attachmentIds: [a1] }).expect(201);
    await landlord.post(`/api/tenancies/${tenancyId}/documents`, { category: "OTHER", title: "Moji zapiski", visibility: "LANDLORD_ONLY", attachmentIds: [a2] }).expect(201);
    await tenant.post(`/api/tenancies/${tenancyId}/documents`, { category: "OTHER", title: "X", attachmentIds: [a1] }).expect(404);

    const forTenant = (await tenant.get(`/api/tenancies/${tenancyId}/documents`).expect(200)).body.documents;
    expect(forTenant.map((d: { title: string }) => d.title)).toEqual(["Najemna pogodba"]);
    const forLandlord = (await landlord.get(`/api/tenancies/${tenancyId}/documents`).expect(200)).body.documents;
    expect(forLandlord).toHaveLength(2);
  });

  it("runs a move-in record: draft → submitted → confirmed by the tenant, then locked; PDF renders", async () => {
    const h = (await landlord.post(`/api/tenancies/${tenancyId}/handovers`, { kind: "MOVE_IN", handoverOn: "2026-01-01" }).expect(201)).body.handover;
    await tenant.post(`/api/tenancies/${tenancyId}/handovers`, { kind: "MOVE_IN", handoverOn: "2026-01-01" }).expect(404);

    // Submitting an empty record is refused.
    expect((await landlord.post(`/api/handovers/${h.id}/submit`).expect(400)).body.error.code).toBe("HANDOVER_EMPTY");

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const photo = await upload(landlord, "HANDOVER", png, "image/png", "stedilnik.png");
    await landlord.patch(`/api/handovers/${h.id}`, { keysCount: 3, keysNote: "2 ključa za stanovanje, 1 za kolesarnico", notes: "Stanovanje je čisto in prezračeno." }).expect(200);
    await landlord.post(`/api/handovers/${h.id}/items`, { room: "Kuhinja", name: "Štedilnik", condition: "GOOD", attachmentIds: [photo] }).expect(201);
    await landlord.post(`/api/handovers/${h.id}/items`, { room: "Kopalnica", name: "Pipa nad umivalnikom", condition: "WORN", note: "Rahlo kaplja." }).expect(201);
    await landlord.post(`/api/handovers/${h.id}/meters`, { meterType: "ELECTRICITY", value: "12000", readOn: "2026-01-01" }).expect(201);

    // The tenant can't confirm a draft, and can't edit.
    await tenant.post(`/api/handovers/${h.id}/confirm`).expect(400);
    await tenant.post(`/api/handovers/${h.id}/items`, { room: "X", name: "Y" }).expect(404);

    await landlord.post(`/api/handovers/${h.id}/submit`).expect(200);
    // Locked while awaiting confirmation.
    await landlord.post(`/api/handovers/${h.id}/items`, { room: "X", name: "Y" }).expect(400);
    // Tenant sends it back, landlord fixes and resubmits, tenant confirms.
    await tenant.post(`/api/handovers/${h.id}/reopen`).expect(200);
    await landlord.post(`/api/handovers/${h.id}/items`, { room: "Dnevna soba", name: "Kavč", condition: "GOOD" }).expect(201);
    await landlord.post(`/api/handovers/${h.id}/submit`).expect(200);
    await stranger.post(`/api/handovers/${h.id}/confirm`).expect(404);
    await tenant.post(`/api/handovers/${h.id}/confirm`).expect(200);

    const view = (await tenant.get(`/api/handovers/${h.id}`).expect(200)).body.handover;
    expect(view.status).toBe("CONFIRMED");
    expect(view.items).toHaveLength(3);
    expect(view.meterReadings[0].value).toBe("12000");
    await tenant.post(`/api/handovers/${h.id}/reopen`).expect(400);

    const pdf = await tenant.get(`/api/handovers/${h.id}/pdf`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    const bytes = pdf.body as Buffer;
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(5000);
    // Footer must not spill onto extra pages.
    expect(bytes.toString("latin1").match(/\/Type \/Page\b/g)?.length).toBe(2);
    writeFileSync(path.join(tmpdir(), "kvita-zapisnik-test.pdf"), bytes);

    const events = await ctx.prisma.message.findMany({ where: { tenancyId, kind: "SYSTEM", systemEvent: { in: ["HANDOVER_READY", "HANDOVER_CONFIRMED"] } } });
    expect(events.length).toBeGreaterThanOrEqual(2);
  });
});
