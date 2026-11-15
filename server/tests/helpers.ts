import type { Express } from "express";
import request from "supertest";
import type { EmailMessage, EmailSender } from "../src/services/email/EmailSender.js";

export const hasDb = Boolean(process.env["DATABASE_URL_TEST"]);

export class CapturingEmailSender implements EmailSender {
  sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
  }
}

/** Unique e-mail per test run so tests never collide with each other or with old data. */
export const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@kvita.test`;

export async function setupApp() {
  const { prisma } = await import("../src/lib/prisma.js");
  const { createApp } = await import("../src/app.js");
  const { signAccessToken } = await import("../src/modules/auth/tokens.js");
  const { LocalDiskStorage } = await import("../src/services/storage/Storage.js");
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const mail = new CapturingEmailSender();
  const storage = new LocalDiskStorage(await mkdtemp(path.join(tmpdir(), "kvita-test-")));
  const app: Express = createApp({ emailSender: mail, storage });

  /** Creates a user and returns an authenticated supertest agent factory. */
  async function login(email: string, name?: string) {
    // Accounts in tests have a confirmed e-mail, as after a normal sign-up.
    const user = await prisma.user.create({ data: { email, name: name ?? null, emailVerifiedAt: new Date() } });
    const token = await signAccessToken(user.id);
    const auth = { Authorization: `Bearer ${token}` };
    return {
      user,
      get: (url: string) => request(app).get(url).set(auth),
      post: (url: string, body?: object) => request(app).post(url).set(auth).send(body ?? {}),
      patch: (url: string, body: object) => request(app).patch(url).set(auth).send(body),
      put: (url: string, body: object) => request(app).put(url).set(auth).send(body),
      del: (url: string) => request(app).delete(url).set(auth),
    };
  }

  return { app, prisma, mail, login };
}
