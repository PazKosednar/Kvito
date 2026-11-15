/**
 * SKIP_EMAIL_VERIFICATION (temporary test setting): sign-up signs in right away, no code is e-mailed,
 * the e-mail stays unconfirmed, and an existing unconfirmed account cannot be taken over by signing up again.
 */
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import type { EmailMessage, EmailSender } from "../src/services/email/EmailSender.js";

const hasDb = Boolean(process.env["DATABASE_URL_TEST"]);

describe.skipIf(!hasDb)("auth without e-mail confirmation (SKIP_EMAIL_VERIFICATION)", () => {
  const email = `skip-${Date.now()}@kvita.test`;
  const password = "Kvito-geslo-1";
  const sent: EmailMessage[] = [];
  const mail: EmailSender = { send: async (m) => void sent.push(m) };
  let app: Express;
  let prisma: typeof import("../src/lib/prisma.js").prisma;
  let env: typeof import("../src/config/env.js").env;

  beforeAll(async () => {
    ({ env } = await import("../src/config/env.js"));
    env.SKIP_EMAIL_VERIFICATION = true;
    ({ prisma } = await import("../src/lib/prisma.js"));
    const { createApp } = await import("../src/app.js");
    const { LocalDiskStorage } = await import("../src/services/storage/Storage.js");
    app = createApp({ emailSender: mail, storage: new LocalDiskStorage(process.cwd() + "/.test-uploads") });
  });

  afterAll(async () => {
    env.SKIP_EMAIL_VERIFICATION = false;
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await prisma.$disconnect();
  });

  it("signs up and signs in without a code", { timeout: 30_000 }, async () => {
    const res = await request(app).post("/api/auth/register").send({ name: "Brez kode", email, password, acceptTerms: true }).expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(email);
    expect(sent).toHaveLength(0);
    await request(app).get("/api/me").set("Authorization", `Bearer ${res.body.accessToken}`).expect(200);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.emailVerifiedAt).toBeNull();

    await request(app).post("/api/auth/login").send({ email, password }).expect(200);
  });

  it("does not let anyone sign up again over the unconfirmed account", { timeout: 30_000 }, async () => {
    const res = await request(app).post("/api/auth/register").send({ name: "Vsiljivec", email: email.toUpperCase(), password: "drugo-geslo-9", acceptTerms: true }).expect(400);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
    await request(app).post("/api/auth/login").send({ email, password: "drugo-geslo-9" }).expect(400);
  });
});
