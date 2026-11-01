/**
 * Phase 5: notifications (inbox, push with e-mail fallback), payment reminders and the landlord's weekly summary.
 * Reminders are driven with a fake clock; nothing is sent to a real push service.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { PushPayload, PushSender, PushTarget } from "../src/services/push/PushSender.js";
import { hasDb, setupApp, uniqueEmail } from "./helpers.js";

class FakePush implements PushSender {
  publicKey = "test-public-key";
  sent: { target: PushTarget; payload: PushPayload }[] = [];
  gone = new Set<string>();
  async send(target: PushTarget, payload: PushPayload) {
    if (this.gone.has(target.endpoint)) return "gone" as const;
    this.sent.push({ target, payload });
    return "sent" as const;
  }
}

describe.skipIf(!hasDb)("notifications and reminders", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let landlord: Awaited<ReturnType<Awaited<ReturnType<typeof setupApp>>["login"]>>;
  let luka: typeof landlord;
  let tenancyId = "";
  let chargeId = "";
  const push = new FakePush();

  // 09:00 in Ljubljana (UTC+1 in winter): reminders are allowed from 08:00.
  const at = (date: string, hour = 9) => new Date(`${date}T${String(hour - 1).padStart(2, "0")}:00:00Z`);

  beforeAll(async () => {
    ctx = await setupApp();
    landlord = await ctx.login(uniqueEmail("ll"), "Mojca Test");
    luka = await ctx.login(uniqueEmail("luka"), "Luka Test");
    const property = (await landlord.post("/api/properties", { name: "Hiša", street: "Cesta 1", postalCode: "1000", city: "Ljubljana" }).expect(201)).body.property;
    const unit = (await landlord.post(`/api/properties/${property.id}/units`, { name: "Enota" }).expect(201)).body.unit;
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
    await luka.post(`/api/invitations/${url.split("/povabilo/")[1]}/accept`).expect(200);
  });

  it("exposes the push key and stores subscriptions per user", async () => {
    const cfg = await luka.get("/api/push/config").expect(200);
    expect(cfg.body).toEqual({ publicKey: null }); // the test app has no push configured
    const sub = { endpoint: "https://push.example.test/abc", keys: { p256dh: "p", auth: "a" } };
    await luka.post("/api/push/subscriptions", sub).expect(201);
    await luka.post("/api/push/subscriptions", sub).expect(201); // idempotent
    expect(await ctx.prisma.pushSubscription.count({ where: { userId: luka.user.id } })).toBe(1);
    await luka.post("/api/push/subscriptions", { ...sub, endpoint: "http://insecure.test/x" }).expect(400);
  });

  // The jobs scan the whole (shared) test database, so give them room.
  it("sends reminders once per milestone, by push when a device is registered", { timeout: 60_000 }, async () => {
    const { createNotifier } = await import("../src/services/notifications/notifier.js");
    const { sendPaymentReminders } = await import("../src/services/jobs/reminders.js");
    const notifier = createNotifier({ emailSender: ctx.mail, pushSender: push });

    const created = await landlord.post(`/api/tenancies/${tenancyId}/charges`, { title: "Elektrika", amountCents: 5000, dueDate: "2031-03-10", costType: "ELECTRICITY" }).expect(201);
    chargeId = created.body.charge.id;
    const mailBefore = ctx.mail.sent.length;

    expect(await sendPaymentReminders(notifier, at("2031-03-06"))).toBe(0); // 4 days before: too early
    expect(await sendPaymentReminders(notifier, at("2031-03-07"))).toBe(1); // 3 days before
    expect(await sendPaymentReminders(notifier, at("2031-03-07"))).toBe(0); // same day again: deduplicated
    expect(await sendPaymentReminders(notifier, at("2031-03-10", 7))).toBe(0); // before 08:00 nothing goes out
    expect(await sendPaymentReminders(notifier, at("2031-03-10"))).toBe(1); // due today
    expect(await sendPaymentReminders(notifier, at("2031-03-11"))).toBe(1); // overdue, week 0
    expect(await sendPaymentReminders(notifier, at("2031-03-14"))).toBe(0); // still week 0
    expect(await sendPaymentReminders(notifier, at("2031-03-18"))).toBe(1); // week 1

    const mine = push.sent.filter((p) => p.target.endpoint === "https://push.example.test/abc");
    expect(mine.map((p) => p.payload.title)).toEqual(
      expect.arrayContaining(["Rok za plačilo čez 3 dni", "Rok za plačilo je danes", "Obveznost je v zamudi"]),
    );
    expect(mine[0]?.payload.url).toBe(`/najemi/${tenancyId}/obveznosti/${chargeId}`);
    // Push reached the device, so no e-mail was needed.
    expect(ctx.mail.sent.length).toBe(mailBefore);
  });

  it("falls back to e-mail when the person has no device, and removes dead subscriptions", async () => {
    const { createNotifier } = await import("../src/services/notifications/notifier.js");
    const notifier = createNotifier({ emailSender: ctx.mail, pushSender: push });

    push.gone.add("https://push.example.test/abc");
    const before = ctx.mail.sent.length;
    await notifier.notify({ userId: luka.user.id, type: "test", title: "Preizkus", body: "Telo", dedupeKey: `t:${Date.now()}` });
    expect(await ctx.prisma.pushSubscription.count({ where: { userId: luka.user.id } })).toBe(0); // gone → deleted
    expect(ctx.mail.sent.length).toBe(before + 1);
    expect(ctx.mail.sent.at(-1)?.to).toBe(luka.user.email);

    await notifier.notify({ userId: luka.user.id, type: "chat", title: "Klepet", body: "x", email: "never", dedupeKey: `c:${Date.now()}` });
    expect(ctx.mail.sent.length).toBe(before + 1); // never e-mailed
  });

  it("notifies the other side of a payment and keeps the inbox private", async () => {
    const { createNotifier } = await import("../src/services/notifications/notifier.js");
    const { attachNotificationListeners } = await import("../src/services/notifications/listeners.js");
    const detach = attachNotificationListeners(createNotifier({ emailSender: ctx.mail, pushSender: push }));
    try {
      const charge = (await luka.get(`/api/charges/${chargeId}`).expect(200)).body.charge;
      const share = charge.shares[0].id as string;
      await luka.post(`/api/charges/${chargeId}/shares/${share}/report`, { note: "Plačano" }).expect(200);
      await new Promise((r) => setTimeout(r, 400));

      const inbox = await landlord.get("/api/notifications").expect(200);
      expect(inbox.body.notifications.some((n: { type: string }) => n.type === "payment.reported")).toBe(true);
      expect(inbox.body.unread).toBeGreaterThan(0);

      // Tenants never get a notification about their own report, and cannot read the landlord's inbox.
      const mine = await luka.get("/api/notifications").expect(200);
      expect(mine.body.notifications.some((n: { type: string }) => n.type === "payment.reported")).toBe(false);

      await landlord.post("/api/notifications/read", {}).expect(204);
      expect((await landlord.get("/api/notifications").expect(200)).body.unread).toBe(0);
    } finally {
      detach();
    }
  });

  it("sends the landlord a summary on Mondays only", async () => {
    const { createNotifier } = await import("../src/services/notifications/notifier.js");
    const { sendWeeklySummaries } = await import("../src/services/jobs/reminders.js");
    const notifier = createNotifier({ emailSender: ctx.mail, pushSender: push });
    // 2031-03-11 is a Tuesday, 2031-03-17 a Monday.
    expect(await sendWeeklySummaries(notifier, at("2031-03-11"))).toBe(0);
    const sent = await sendWeeklySummaries(notifier, at("2031-03-17"));
    expect(sent).toBeGreaterThanOrEqual(1);
    expect(await sendWeeklySummaries(notifier, at("2031-03-17"))).toBe(0); // once per week
    const note = await ctx.prisma.notification.findFirst({ where: { userId: landlord.user.id, type: "summary.weekly" } });
    expect(note?.body).toMatch(/čaka na tvojo potrditev: 1/);
  }, 60_000);
});
