/**
 * Phase 3: conversation (messages, read markers, attachments), issues (status rules, comments) and realtime delivery.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canSetIssueStatus } from "../src/modules/issues/routes.js";
import { hasDb, setupApp, uniqueEmail } from "./helpers.js";

describe("issue status rules", () => {
  it("lets the landlord move freely and the reporter only resolve/reopen", () => {
    expect(canSetIssueStatus("LANDLORD", false, "NEW", "IN_PROGRESS")).toBe(true);
    expect(canSetIssueStatus("LANDLORD", false, "RESOLVED", "NEW")).toBe(true);
    expect(canSetIssueStatus("TENANT", true, "NEW", "RESOLVED")).toBe(true);
    expect(canSetIssueStatus("TENANT", true, "RESOLVED", "NEW")).toBe(true);
    expect(canSetIssueStatus("TENANT", true, "NEW", "IN_PROGRESS")).toBe(false);
    expect(canSetIssueStatus("TENANT", false, "NEW", "RESOLVED")).toBe(false);
    expect(canSetIssueStatus("LANDLORD", false, "NEW", "NEW")).toBe(false);
  });
});

describe.skipIf(!hasDb)("messages, issues, realtime", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  type Agent = Awaited<ReturnType<typeof ctx.login>>;
  let landlord: Agent;
  let tenant: Agent;
  let stranger: Agent;
  let tenancyId = "";
  let otherTenancyId = "";
  const sockets: Socket[] = [];
  let close: () => Promise<void> = async () => {};
  let baseUrl = "";

  async function token(agent: Agent) {
    const { signAccessToken } = await import("../src/modules/auth/tokens.js");
    return signAccessToken(agent.user.id);
  }

  beforeAll(async () => {
    ctx = await setupApp();
    landlord = await ctx.login(uniqueEmail("ll3"), "Mojca");
    tenant = await ctx.login(uniqueEmail("t3"), "Ana");
    stranger = await ctx.login(uniqueEmail("s3"), "Tujec");
    const prop = (await landlord.post("/api/properties", { name: "Blok", street: "Ulica 1", postalCode: "1000", city: "Ljubljana" }).expect(201)).body.property;
    const unit = (await landlord.post(`/api/properties/${prop.id}/units`, { name: "S1" }).expect(201)).body.unit;
    const terms = { startDate: "2026-01-01", rentCents: 50000, rentDueDay: 5, payeeName: "Mojca", payeeIban: "SI56191000000123438" };
    tenancyId = (await landlord.post(`/api/units/${unit.id}/tenancies`, terms).expect(201)).body.tenancy.id;
    const url = (await landlord.post(`/api/tenancies/${tenancyId}/invitations`, {}).expect(201)).body.url as string;
    await tenant.post(`/api/invitations/${url.split("/povabilo/")[1]}/accept`).expect(200);

    const prop2 = (await stranger.post("/api/properties", { name: "Druga", street: "Pot 2", postalCode: "2000", city: "Maribor" }).expect(201)).body.property;
    const unit2 = (await stranger.post(`/api/properties/${prop2.id}/units`, { name: "X" }).expect(201)).body.unit;
    otherTenancyId = (await stranger.post(`/api/units/${unit2.id}/tenancies`, terms).expect(201)).body.tenancy.id;

    const { attachRealtime } = await import("../src/services/realtime.js");
    const http = createServer(ctx.app);
    const io = attachRealtime(http);
    await new Promise<void>((r) => http.listen(0, r));
    baseUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    close = async () => {
      sockets.forEach((s) => s.close());
      await io.close();
    };
  });

  afterAll(() => close());

  it("keeps the conversation private to the tenancy", async () => {
    await stranger.get(`/api/tenancies/${tenancyId}/messages`).expect(404);
    await stranger.post(`/api/tenancies/${tenancyId}/messages`, { body: "hej" }).expect(404);
  });

  it("sends messages and tracks what the other side has read", async () => {
    const sent = await tenant.post(`/api/tenancies/${tenancyId}/messages`, { body: "Pozdravljeni, pipa v kopalnici kaplja." }).expect(201);
    expect(sent.body.message.author.id).toBe(tenant.user.id);
    await tenant.post(`/api/tenancies/${tenancyId}/messages`, { body: "  " }).expect(400);

    let unread = (await landlord.get("/api/messages/unread").expect(200)).body.unread;
    expect(unread[tenancyId]).toBeGreaterThanOrEqual(1);

    await landlord.post(`/api/tenancies/${tenancyId}/messages/read`).expect(204);
    unread = (await landlord.get("/api/messages/unread").expect(200)).body.unread;
    expect(unread[tenancyId]).toBe(0);

    const list = (await tenant.get(`/api/tenancies/${tenancyId}/messages`).expect(200)).body;
    expect(list.messages.some((m: { kind: string; systemEvent: string }) => m.kind === "SYSTEM" && m.systemEvent === "MEMBER_JOINED")).toBe(true);
    const landlordRead = list.reads.find((r: { userId: string }) => r.userId === landlord.user.id);
    expect(new Date(landlordRead.lastReadAt) >= new Date(sent.body.message.createdAt)).toBe(true);
  });

  it("refuses links to another tenancy's charge or issue", async () => {
    const otherIssue = (await stranger.post(`/api/tenancies/${otherTenancyId}/issues`, { category: "OTHER", title: "X", description: "Y" }).expect(201)).body.issue;
    const res = await tenant.post(`/api/tenancies/${tenancyId}/messages`, { body: "glej", issueId: otherIssue.id }).expect(400);
    expect(res.body.error.code).toBe("LINK_INVALID");
  });

  it("runs an issue from report to resolved with comments", async () => {
    const created = (
      await tenant
        .post(`/api/tenancies/${tenancyId}/issues`, { category: "PLUMBING", title: "Kaplja pipa", description: "Pipa v kopalnici kaplja že dva dni.", urgency: "NORMAL" })
        .expect(201)
    ).body.issue;
    expect(created.status).toBe("NEW");

    await tenant.patch(`/api/issues/${created.id}/status`, { status: "IN_PROGRESS" }).expect(400);
    await stranger.patch(`/api/issues/${created.id}/status`, { status: "RESOLVED" }).expect(404);
    await landlord.patch(`/api/issues/${created.id}/status`, { status: "IN_PROGRESS" }).expect(200);
    await landlord.post(`/api/issues/${created.id}/comments`, { body: "Vodovodar pride v četrtek." }).expect(201);
    await tenant.patch(`/api/issues/${created.id}/status`, { status: "RESOLVED" }).expect(200);

    const issue = (await tenant.get(`/api/issues/${created.id}`).expect(200)).body.issue;
    expect(issue.status).toBe("RESOLVED");
    expect(issue.comments).toHaveLength(1);
    const events = await ctx.prisma.message.findMany({ where: { issueId: created.id, kind: "SYSTEM" } });
    expect(events.map((m) => m.systemEvent)).toEqual(expect.arrayContaining(["ISSUE_CREATED", "ISSUE_STATUS"]));
    const audits = await ctx.prisma.auditLog.findMany({ where: { entityType: "Issue", entityId: created.id } });
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(["create", "status"]));
  });

  it("delivers new messages over Socket.IO only to members of the tenancy", async () => {
    const open = async (agent: Agent) => {
      const s = connect(baseUrl, { path: "/socket.io", auth: { token: await token(agent) }, transports: ["websocket"] });
      sockets.push(s);
      await new Promise<void>((r, j) => {
        s.once("connect", () => r());
        s.once("connect_error", j);
      });
      return s;
    };
    const join = (s: Socket, id: string) => new Promise<boolean>((r) => s.emit("join", id, r));

    const landlordSocket = await open(landlord);
    const strangerSocket = await open(stranger);
    expect(await join(landlordSocket, tenancyId)).toBe(true);
    expect(await join(strangerSocket, tenancyId)).toBe(false);

    let strangerGot = false;
    strangerSocket.on("message", () => (strangerGot = true));
    const received = new Promise<{ body: string }>((r) => landlordSocket.once("message", r));
    await tenant.post(`/api/tenancies/${tenancyId}/messages`, { body: "Realtime test" }).expect(201);
    expect((await received).body).toBe("Realtime test");
    await new Promise((r) => setTimeout(r, 200));
    expect(strangerGot).toBe(false);

    const bad = connect(baseUrl, { path: "/socket.io", auth: { token: "nope" }, transports: ["websocket"] });
    sockets.push(bad);
    await expect(
      new Promise((r, j) => {
        bad.once("connect", () => r(undefined));
        bad.once("connect_error", j);
      }),
    ).rejects.toThrow(/UNAUTHORIZED/);
  });
});
