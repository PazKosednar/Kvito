import { env } from "../../config/env.js";
import type { Locale } from "../../i18n/format.js";
import { badRequest, tooManyRequests } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { EmailSender } from "../../services/email/EmailSender.js";
import { loginCodeEmail } from "../../services/email/templates.js";
import { generateOtp, hashOtp, normalizeEmail, verifyOtp } from "./otp.js";
import { issueSession, type ClientMeta } from "./sessions.js";

/**
 * Creates and e-mails a one-time code. Responds identically whether or not the account exists
 * (accounts are created on first successful verification).
 */
export async function requestLoginCode(rawEmail: string, meta: ClientMeta, emailSender: EmailSender, screenLocale?: Locale): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.loginCode.count({ where: { email, createdAt: { gte: hourAgo } } });
  if (recent >= env.OTP_MAX_PER_HOUR) throw tooManyRequests("OTP_RATE_LIMITED");

  const code = generateOtp();
  // Only the newest code is valid: invalidate earlier unused ones.
  await prisma.$transaction([
    prisma.loginCode.updateMany({ where: { email, consumedAt: null }, data: { consumedAt: new Date() } }),
    prisma.loginCode.create({
      data: {
        email,
        codeHash: hashOtp(email, code),
        expiresAt: new Date(Date.now() + env.OTP_TTL_MIN * 60 * 1000),
        ip: meta.ip ?? null,
      },
    }),
  ]);

  // An existing account keeps its own language; otherwise the language of the sign-in screen.
  const existing = await prisma.user.findUnique({ where: { email }, select: { locale: true } });
  // In development the ConsoleEmailSender prints the code to the server console.
  await emailSender.send(loginCodeEmail(email, code, env.OTP_TTL_MIN, existing?.locale ?? screenLocale ?? "sl"));
}

export async function verifyLoginCode(rawEmail: string, code: string, meta: ClientMeta, screenLocale?: Locale) {
  const email = normalizeEmail(rawEmail);
  const loginCode = await prisma.loginCode.findFirst({
    where: { email, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!loginCode) throw badRequest("OTP_INVALID");
  if (loginCode.attempts >= env.OTP_MAX_ATTEMPTS) throw tooManyRequests("OTP_TOO_MANY_ATTEMPTS");

  if (!verifyOtp(email, code, loginCode.codeHash)) {
    const updated = await prisma.loginCode.update({
      where: { id: loginCode.id },
      data: { attempts: { increment: 1 } },
    });
    if (updated.attempts >= env.OTP_MAX_ATTEMPTS) {
      await prisma.loginCode.update({ where: { id: loginCode.id }, data: { consumedAt: new Date() } });
      throw tooManyRequests("OTP_TOO_MANY_ATTEMPTS");
    }
    throw badRequest("OTP_INVALID");
  }

  // Single use, also under concurrent requests.
  const { count } = await prisma.loginCode.updateMany({
    where: { id: loginCode.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (count === 0) throw badRequest("OTP_INVALID");

  const user = await prisma.user.upsert({
    where: { email },
    update: { lastLoginAt: new Date() },
    create: { email, lastLoginAt: new Date(), ...(screenLocale ? { locale: screenLocale } : {}) },
  });
  if (user.deletedAt) throw badRequest("ACCOUNT_DELETED");

  const tokens = await issueSession(user.id, meta);
  return { user, tokens };
}
