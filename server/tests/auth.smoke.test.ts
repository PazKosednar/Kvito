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
    await prisma.$disconnect();
  });

  it("rejects /api/me without a token", async () => {
    await request(app).get("/api/me").expect(401);
  });

  const signup = (body: object) => request(app).post("/api/auth/register").send({ acceptTerms: true, ...body });

  it("validates input", async () => {
    const codes = async (body: object) => (await signup(body).expect(400)).body.error;
    expect((await codes({ name: "X", email: "not-an-email", password: "dolgo-geslo" })).code).toBe("VALIDATION_ERROR");
    expect((await codes({ name: "X", email, password: "kratko" })).details).toEqual(expect.arrayContaining([expect.objectContaining({ message: "PASSWORD_TOO_SHORT" })]));
    expect((await codes({ name: "X", email, password: "admin123" })).details).toEqual(expect.arrayContaining([expect.objectContaining({ message: "PASSWORD_TOO_COMMON" })]));
    const noTerms = await request(app).post("/api/auth/register").send({ name: "X", email, password: "dolgo-geslo" }).expect(400);
    expect(noTerms.body.error.code).toBe("VALIDATION_ERROR");
  });

  let accessToken = "";
  let refreshCookie = "";
  const password = "Kvito-geslo-1";

  // Several scrypt hashes (≈32 MiB each): can take longer than the default 5 s when the whole suite runs.
  it("registers, but the account works only after the e-mailed code", { timeout: 30_000 }, async () => {
    await signup({ name: "Napačno ime", email, password: "prvo-geslo-1" }).expect(202);
    // Signing up again before confirming replaces the attempt (nobody can sit on an address).
    await signup({ name: "Smoke Test", email: email.toUpperCase(), password, locale: "en" }).expect(202);
    expect(mail.sent.at(-1)?.to).toBe(email);
    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored).toMatchObject({ name: "Smoke Test", emailVerifiedAt: null, termsVersion: expect.any(String) });
    expect(stored.passwordHash).toMatch(/^scrypt\$/);

    // No session before the e-mail is confirmed.
    expect((await request(app).post("/api/auth/login").send({ email, password }).expect(400)).body.error.code).toBe("EMAIL_NOT_VERIFIED");
    const wrong = mail.lastCode() === "000000" ? "111111" : "000000";
    expect((await request(app).post("/api/auth/verify-email").send({ email, code: wrong, password }).expect(400)).body.error.code).toBe("CODE_INVALID");
    // The code alone is not enough: someone who re-registered this e-mail with their own password cannot use the owner's code.
    expect((await request(app).post("/api/auth/verify-email").send({ email, code: mail.lastCode(), password: "tuje-geslo-9" }).expect(400)).body.error.code).toBe("CODE_INVALID");
    expect((await request(app).post("/api/auth/verify-email").send({ email: `nobody-${Date.now()}@kvita.test`, code: mail.lastCode(), password }).expect(400)).body.error.code).toBe("CODE_INVALID");

    await request(app).post("/api/auth/resend-verification").send({ email }).expect(202);
    const res = await request(app).post("/api/auth/verify-email").send({ email, code: mail.lastCode(), password }).expect(200);
    expect(res.body.user).toMatchObject({ email, name: "Smoke Test", roles: [], locale: "en" });
    expect(res.body.user.passwordHash).toBeUndefined();
    accessToken = res.body.accessToken;
    refreshCookie = cookieFrom(res);
    expect((res.headers["set-cookie"] as unknown as string[])[0]).toMatch(/HttpOnly/i);
    // A code works once.
    await request(app).post("/api/auth/verify-email").send({ email, code: mail.lastCode(), password }).expect(400);
  });

  it("does not register a confirmed e-mail again", async () => {
    const res = await signup({ name: "Drugi", email, password: "drugo-geslo" }).expect(400);
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

  it("locks the account after five wrong passwords, also for the right one", async () => {
    for (let i = 0; i < 5; i++) await request(app).post("/api/auth/login").send({ email, password: `napacno-${i}` }).expect(400);
    const locked = await request(app).post("/api/auth/login").send({ email, password: "novo-geslo-2" }).expect(429);
    expect(locked.body.error.code).toBe("ACCOUNT_LOCKED");
  });

  it("sets a new password with an e-mailed code, which also unlocks the account", async () => {
    await request(app).post("/api/auth/forgot-password").send({ email: `nobody-${Date.now()}@kvita.test` }).expect(202); // same answer
    const sentBefore = mail.sent.length;
    await request(app).post("/api/auth/forgot-password").send({ email }).expect(202);
    expect(mail.sent.length).toBe(sentBefore + 1);
    const code = mail.lastCode();
    await request(app).post("/api/auth/reset-password").send({ email, code, password: "12345678" }).expect(400); // too common
    const res = await request(app).post("/api/auth/reset-password").send({ email, code, password: "tretje-geslo-3" }).expect(200);
    expect(res.body.user.email).toBe(email);
    await request(app).post("/api/auth/reset-password").send({ email, code, password: "cetrto-geslo-4" }).expect(400); // single use
    await request(app).post("/api/auth/login").send({ email, password: "tretje-geslo-3" }).expect(200);
  });
});
