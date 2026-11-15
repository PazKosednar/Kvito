import type { Locale } from "../../i18n/format.js";
import { badRequest } from "../../lib/errors.js";
import { dummyHash, hashPassword, verifyPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import { issueSession, type ClientMeta } from "./sessions.js";

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** New account with e-mail and password; signs in right away. */
export async function register(input: { name: string; email: string; password: string; locale?: Locale | undefined }, meta: ClientMeta) {
  const email = normalizeEmail(input.email);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, deletedAt: true } });
  if (existing?.deletedAt) throw badRequest("ACCOUNT_DELETED");
  if (existing) throw badRequest("EMAIL_TAKEN");

  const passwordHash = await hashPassword(input.password);
  let user;
  try {
    user = await prisma.user.create({
      data: { email, name: input.name, passwordHash, lastLoginAt: new Date(), ...(input.locale ? { locale: input.locale } : {}) },
    });
  } catch (err) {
    // Two registrations for the same e-mail at once: the unique index decides.
    if ((err as { code?: string }).code === "P2002") throw badRequest("EMAIL_TAKEN");
    throw err;
  }
  const tokens = await issueSession(user.id, meta);
  return { user, tokens };
}

/** E-mail and password. The same answer whether the e-mail is unknown or the password wrong. */
export async function login(rawEmail: string, password: string, meta: ClientMeta) {
  const email = normalizeEmail(rawEmail);
  const user = await prisma.user.findUnique({ where: { email } });
  // Always pay for one hash check, so the response time does not tell whether the account exists.
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !user.passwordHash || !ok) throw badRequest("INVALID_CREDENTIALS");
  if (user.deletedAt) throw badRequest("ACCOUNT_DELETED");

  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const tokens = await issueSession(user.id, meta);
  return { user: updated, tokens };
}

/** Signed-in user changes the password. Every session is ended; this device gets a fresh one. */
export async function changePassword(userId: string, currentPassword: string, newPassword: string, meta: ClientMeta) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (!user.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) throw badRequest("WRONG_PASSWORD");
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  return issueSession(userId, meta);
}
