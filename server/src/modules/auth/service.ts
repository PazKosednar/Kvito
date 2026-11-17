import { env } from "../../config/env.js";
import type { Locale, User } from "../../generated/prisma/client.js";
import { badRequest, tooManyRequests } from "../../lib/errors.js";
import { dummyHash, hashPassword, verifyPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import type { EmailSender } from "../../services/email/EmailSender.js";
import { assertCodeQuota, consumeCode, sendCode } from "./codes.js";
import { issueSession, sessionsCutoff, type ClientMeta } from "./sessions.js";

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Version of the terms of use / privacy policy a new account accepts. Bump when the texts change. */
export const TERMS_VERSION = "2026-11-osnutek";

/** Wrong passwords in a row before the account is locked; each further miss doubles the lock (1, 2, 4 … 60 min). */
const LOCK_AFTER = 5;
const MAX_LOCK_MIN = 60;

const lockMinutes = (failed: number) => Math.min(MAX_LOCK_MIN, 2 ** (failed - LOCK_AFTER));

function assertNotLocked(user: Pick<User, "loginLockedUntil">): void {
  if (user.loginLockedUntil && user.loginLockedUntil > new Date()) throw tooManyRequests("ACCOUNT_LOCKED");
}

async function recordFailure(user: Pick<User, "id" | "failedLogins">): Promise<void> {
  const failed = user.failedLogins + 1;
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: failed, ...(failed >= LOCK_AFTER ? { loginLockedUntil: new Date(Date.now() + lockMinutes(failed) * 60_000) } : {}) },
  });
}

const clearFailures = { failedLogins: 0, loginLockedUntil: null };

/**
 * New account. It cannot be used until the e-mail is confirmed with the code we send; signing up again with an
 * unconfirmed e-mail replaces the earlier attempt, so nobody can hold on to somebody else's address.
 */
export async function register(input: { name: string; email: string; password: string; locale?: Locale | undefined }, emailSender: EmailSender, ip?: string, meta?: ClientMeta) {
  const email = normalizeEmail(input.email);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, deletedAt: true, emailVerifiedAt: true, lastLoginAt: true } });
  if (existing?.deletedAt) throw badRequest("ACCOUNT_DELETED");
  if (existing?.emailVerifiedAt) throw badRequest("EMAIL_TAKEN");
  // An unconfirmed account that has already been signed in to (created with SKIP_EMAIL_VERIFICATION) holds data
  // and sessions: a new sign-up must never replace its password. Its owner confirms it by logging in instead.
  if (existing?.lastLoginAt) throw badRequest("EMAIL_TAKEN");

  if (env.SKIP_EMAIL_VERIFICATION) {
    // Without the code an unconfirmed account is usable, so it must never be replaced by a second sign-up.
    if (existing) throw badRequest("EMAIL_TAKEN");
    try {
      const user = await prisma.user.create({
        data: {
          email,
          name: input.name,
          passwordHash: await hashPassword(input.password),
          termsVersion: TERMS_VERSION,
          termsAcceptedAt: new Date(),
          lastLoginAt: new Date(),
          ...(input.locale ? { locale: input.locale } : {}),
        },
      });
      return { user, tokens: await issueSession(user.id, meta ?? {}) };
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") throw badRequest("EMAIL_TAKEN");
      throw err;
    }
  }
  // Check the code quota before changing anything.
  await assertCodeQuota(email, "VERIFY_EMAIL");

  const data = {
    name: input.name,
    passwordHash: await hashPassword(input.password),
    termsVersion: TERMS_VERSION,
    termsAcceptedAt: new Date(),
    ...clearFailures,
    ...(input.locale ? { locale: input.locale } : {}),
  };
  let locale: Locale;
  try {
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data })
      : await prisma.user.create({ data: { email, ...data } });
    locale = user.locale;
  } catch (err) {
    // Two sign-ups for the same e-mail at once: the unique index decides.
    if ((err as { code?: string }).code === "P2002") throw badRequest("EMAIL_TAKEN");
    throw err;
  }
  await sendCode(email, "VERIFY_EMAIL", emailSender, locale, ip);
  return null;
}

/** Sends a new confirmation code. Answers the same whether or not such an unconfirmed account exists. */
export async function resendVerification(rawEmail: string, emailSender: EmailSender, ip?: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const user = await prisma.user.findUnique({ where: { email }, select: { locale: true, deletedAt: true, emailVerifiedAt: true } });
  if (!user || user.deletedAt || user.emailVerifiedAt) return;
  await sendCode(email, "VERIFY_EMAIL", emailSender, user.locale, ip);
}

/**
 * Confirms the e-mail with the code and signs in. The password is required too: if someone else signed up again
 * with this unconfirmed e-mail and their own password, the code in the owner's mailbox cannot activate it for them.
 */
export async function verifyEmail(rawEmail: string, code: string, password: string, meta: ClientMeta) {
  const email = normalizeEmail(rawEmail);
  const found = await prisma.user.findUnique({ where: { email } });
  const user = found && !found.deletedAt && !found.emailVerifiedAt ? found : null;
  if (user) assertNotLocked(user);
  // One password check and one answer in every case, so this does not tell which unconfirmed accounts exist.
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !ok) {
    if (user) await recordFailure(user);
    throw badRequest("CODE_INVALID");
  }
  await consumeCode(email, "VERIFY_EMAIL", code);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date(), lastLoginAt: new Date(), ...clearFailures } });
  const tokens = await issueSession(user.id, meta);
  return { user: updated, tokens };
}

/** E-mail and password. The same answer whether the e-mail is unknown or the password wrong. */
export async function login(rawEmail: string, password: string, meta: ClientMeta) {
  const email = normalizeEmail(rawEmail);
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) assertNotLocked(user);
  // Always pay for one hash check, so the response time does not tell whether the account exists.
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !user.passwordHash || !ok) {
    if (user) await recordFailure(user);
    throw badRequest("INVALID_CREDENTIALS");
  }
  if (user.deletedAt) throw badRequest("ACCOUNT_DELETED");
  // Only someone who knows the password learns that the e-mail still needs confirming.
  if (!user.emailVerifiedAt && !env.SKIP_EMAIL_VERIFICATION) throw badRequest("EMAIL_NOT_VERIFIED");

  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), ...clearFailures } });
  const tokens = await issueSession(user.id, meta);
  return { user: updated, tokens };
}

/** Forgotten password: a code goes to the e-mail. Answers the same whether or not the account exists. */
export async function forgotPassword(rawEmail: string, emailSender: EmailSender, ip?: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const user = await prisma.user.findUnique({ where: { email }, select: { locale: true, deletedAt: true } });
  if (!user || user.deletedAt) return;
  await sendCode(email, "RESET_PASSWORD", emailSender, user.locale, ip);
}

/** New password with the e-mailed code. Proves the e-mail too, ends every session and signs in here. */
export async function resetPassword(rawEmail: string, code: string, newPassword: string, meta: ClientMeta) {
  const email = normalizeEmail(rawEmail);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) throw badRequest("CODE_INVALID");
  await consumeCode(email, "RESET_PASSWORD", code);
  const passwordHash = await hashPassword(newPassword);
  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date(), lastLoginAt: new Date(), sessionsValidFrom: sessionsCutoff(), ...clearFailures } }),
    prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  const tokens = await issueSession(user.id, meta);
  return { user: updated, tokens };
}

/** Signed-in user changes the password. Every session is ended; this device gets a fresh one. */
export async function changePassword(userId: string, currentPassword: string, newPassword: string, meta: ClientMeta) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assertNotLocked(user);
  if (!user.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
    await recordFailure(user);
    throw badRequest("WRONG_PASSWORD");
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash, sessionsValidFrom: sessionsCutoff(), ...clearFailures } }),
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  return issueSession(userId, meta);
}
