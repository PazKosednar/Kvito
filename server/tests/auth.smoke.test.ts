/**
 * Smoke test of the main auth flow against the test database:
 * register → login → /api/me → switch role → refresh (rotation + reuse detection) → change password → logout.
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
    await prisma.$disconnect();
  });

  it("rejects /api/me without a token", async () => {
    await request(app).get("/api/me").expect(401);
  });

  it("validates input", async () => {
    let res = await request(app).post("/api/auth/register").send({ name: "X", email: "not-an-email", password: "dolgo-geslo" }).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    res = await request(app).post("/api/auth/register").send({ name: "X", email, password: "kratko" }).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  let accessToken = "";
  let refreshCookie = "";
  const password = "Kvito-geslo-1";

  it("registers with name, e-mail and password and is signed in", async () => {
    const res = await request(app).post("/api/auth/register").send({ name: "Smoke Test", email: email.toUpperCase(), password, locale: "en" }).expect(201);
    expect(res.body.user).toMatchObject({ email, name: "Smoke Test", roles: [], locale: "en" });
    expect(res.body.user.passwordHash).toBeUndefined();
    accessToken = res.body.accessToken;
    refreshCookie = cookieFrom(res);
    expect((res.headers["set-cookie"] as unknown as string[])[0]).toMatch(/HttpOnly/i);
    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
  });

  it("does not register the same e-mail twice", async () => {
    const res = await request(app).post("/api/auth/register").send({ name: "Drugi", email, password: "drugo-geslo" }).expect(400);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("signs in with the password, and answers the same for a wrong password or an unknown e-mail", async () => {
    const wrong = await request(app).post("/api/auth/login").send({ email, password: "napacno-geslo" }).expect(400);
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
    const unknown = await request(app).post("/api/auth/login").send({ email: `nobody-${Date.now()}@kvita.test`, password }).expect(400);
    expect(unknown.body.error.code).toBe("INVALID_CREDENTIALS");
    const res = await request(app).post("/api/auth/login").send({ email: ` ${email.toUpperCase()} `, password }).expect(200);
    expect(res.body.user.email).toBe(email);
    cookieFrom(res);
  });

  it("returns and updates the current user", async () => {
    const me = await request(app).get("/api/me").set("Authorization", `Bearer ${accessToken}`).expect(200);
    expect(me.body.user.email).toBe(email);

    const patched = await request(app)
      .patch("/api/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Smoke Test", activeRole: "LANDLORD" })
      .expect(200);
    expect(patched.body.user).toMatchObject({ name: "Smoke Test", roles: ["LANDLORD"], activeRole: "LANDLORD" });  });

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

  it("changes the password: the old one stops working and other sessions end", async () => {
    const other = cookieFrom(await request(app).post("/api/auth/login").send({ email, password }).expect(200));
    const wrong = await request(app).post("/api/auth/change-password").set("Authorization", `Bearer ${accessToken}`).send({ currentPassword: "napacno", newPassword: "novo-geslo-2" }).expect(400);
    expect(wrong.body.error.code).toBe("WRONG_PASSWORD");
    await request(app).post("/api/auth/change-password").send({ currentPassword: password, newPassword: "novo-geslo-2" }).expect(401);

    const res = await request(app).post("/api/auth/change-password").set("Authorization", `Bearer ${accessToken}`).send({ currentPassword: password, newPassword: "novo-geslo-2" }).expect(200);
    expect(res.body.accessToken).toBeTypeOf("string");
    await request(app).post("/api/auth/refresh").set("Cookie", cookieFrom(res)).expect(200); // this device stays signed in
    await request(app).post("/api/auth/refresh").set("Cookie", other).expect(401);
    await request(app).post("/api/auth/login").send({ email, password }).expect(400);
    await request(app).post("/api/auth/login").send({ email, password: "novo-geslo-2" }).expect(200);
  });

  it("logs out", async () => {
    const login = await request(app).post("/api/auth/login").send({ email, password: "novo-geslo-2" }).expect(200);
    const cookie = cookieFrom(login);
    await request(app).post("/api/auth/logout").set("Cookie", cookie).expect(204);
    await request(app).post("/api/auth/refresh").set("Cookie", cookie).expect(401);
  });
});
