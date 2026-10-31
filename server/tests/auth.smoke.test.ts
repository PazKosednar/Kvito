/**
 * Smoke test of the main auth flow against the test database:
 * request code → verify → /api/me → switch role → refresh (rotation + reuse detection) → logout.
 */
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import type { EmailMessage, EmailSender } from "../src/services/email/EmailSender.js";

const hasDb = Boolean(process.env["DATABASE_URL_TEST"]);

class CapturingEmailSender implements EmailSender {
  sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
  }
  lastCode(): string {
    const match = this.sent.at(-1)?.text.match(/\b(\d{6})\b/);
    if (!match?.[1]) throw new Error("no code e-mailed");
    return match[1];
  }
}

const cookieFrom = (res: request.Response): string => {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith("kvita_rt="));
  if (!cookie) throw new Error("no refresh cookie");
  return cookie.split(";")[0]!;
};

describe.skipIf(!hasDb)("auth flow (smoke)", () => {
  const email = `smoke-${Date.now()}@kvita.test`;
  const mail = new CapturingEmailSender();
  let app: Express;
  let prisma: typeof import("../src/lib/prisma.js").prisma;

  beforeAll(async () => {
    ({ prisma } = await import("../src/lib/prisma.js"));
    const { createApp } = await import("../src/app.js");
    const { LocalDiskStorage } = await import("../src/services/storage/Storage.js");
    app = createApp({ emailSender: mail, storage: new LocalDiskStorage(process.cwd() + "/.test-uploads") });
  });

  afterAll(async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await prisma.loginCode.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("rejects /api/me without a token", async () => {
    await request(app).get("/api/me").expect(401);
  });

  it("validates input", async () => {
    const res = await request(app).post("/api/auth/request-code").send({ email: "not-an-email" }).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  let accessToken = "";
  let refreshCookie = "";

  it("logs in with an e-mailed one-time code", async () => {
    await request(app).post("/api/auth/request-code").send({ email: email.toUpperCase() }).expect(202);
    expect(mail.sent.at(-1)?.to).toBe(email);

    const wrong = mail.lastCode() === "000000" ? "111111" : "000000";
    const bad = await request(app).post("/api/auth/verify-code").send({ email, code: wrong }).expect(400);
    expect(bad.body.error.code).toBe("OTP_INVALID");

    const res = await request(app).post("/api/auth/verify-code").send({ email, code: mail.lastCode() }).expect(200);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.roles).toEqual([]);
    accessToken = res.body.accessToken;
    refreshCookie = cookieFrom(res);
    expect((res.headers["set-cookie"] as unknown as string[])[0]).toMatch(/HttpOnly/i);
  });

  it("does not accept the same code twice", async () => {
    await request(app).post("/api/auth/verify-code").send({ email, code: mail.lastCode() }).expect(400);
  });

  it("returns and updates the current user", async () => {
    const me = await request(app).get("/api/me").set("Authorization", `Bearer ${accessToken}`).expect(200);
    expect(me.body.user.email).toBe(email);

    const patched = await request(app)
      .patch("/api/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Smoke Test", activeRole: "LANDLORD" })
      .expect(200);
    expect(patched.body.user).toMatchObject({ name: "Smoke Test", roles: ["LANDLORD"], activeRole: "LANDLORD" });
  });

  it("rotates refresh tokens and detects reuse", async () => {
    const first = await request(app).post("/api/auth/refresh").set("Cookie", refreshCookie).expect(200);
    expect(first.body.accessToken).toBeTypeOf("string");
    const rotated = cookieFrom(first);
    expect(rotated).not.toBe(refreshCookie);

    // Re-using the old token revokes the whole family …
    const reuse = await request(app).post("/api/auth/refresh").set("Cookie", refreshCookie).expect(401);
    expect(reuse.body.error.code).toBe("REFRESH_REUSED");
    // … including the newest token.
    await request(app).post("/api/auth/refresh").set("Cookie", rotated).expect(401);
  });

  it("rejects refresh from a foreign origin", async () => {
    await request(app)
      .post("/api/auth/refresh")
      .set("Origin", "https://evil.example")
      .set("Cookie", refreshCookie)
      .expect(403);
  });

  it("locks the code after too many wrong attempts", async () => {
    await request(app).post("/api/auth/request-code").send({ email }).expect(202);
    const right = mail.lastCode();
    const wrong = right === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) {
      await request(app).post("/api/auth/verify-code").send({ email, code: wrong }).expect(400);
    }
    await request(app).post("/api/auth/verify-code").send({ email, code: wrong }).expect(429);
    // Even the correct code no longer works.
    await request(app).post("/api/auth/verify-code").send({ email, code: right }).expect(400);
  });

  it("logs out", async () => {
    await request(app).post("/api/auth/request-code").send({ email }).expect(202);
    const login = await request(app).post("/api/auth/verify-code").send({ email, code: mail.lastCode() }).expect(200);
    const cookie = cookieFrom(login);
    await request(app).post("/api/auth/logout").set("Cookie", cookie).expect(204);
    await request(app).post("/api/auth/refresh").set("Cookie", cookie).expect(401);
  });
});
