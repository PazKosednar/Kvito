import type { CodePurpose, Locale } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { hmacSha256, randomDigits, safeEqualHex } from "../../lib/crypto.js";
import { badRequest, tooManyRequests } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { EmailSender } from "../../services/email/EmailSender.js";
import { codeEmail } from "../../services/email/templates.js";

/**
 * One-time 6-digit e-mail codes: confirming a new account's e-mail and setting a new password.
 * Only an HMAC (bound to e-mail and purpose) is stored; a code is single use, short-lived and locks after a few wrong tries.
 */

export const CODE_LENGTH = 6;
export const CODE_TTL_MIN = 15;
const MAX_ATTEMPTS = 5;
const MAX_PER_HOUR = 5;

type Purpose = Extract<CodePurpose, "VERIFY_EMAIL" | "RESET_PASSWORD">;

// Domain-separated from the JWT use of the same secret.
export const hashCode = (email: string, purpose: Purpose, code: string, secret = env.JWT_ACCESS_SECRET): string =>
  hmacSha256(secret, `email-code:${purpose}:${email}:${code}`);

/** Throws CODE_RATE_LIMITED when this e-mail already got too many codes of this kind in the last hour. */
export async function assertCodeQuota(email: string, purpose: Purpose): Promise<void> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.loginCode.count({ where: { email, purpose, createdAt: { gte: hourAgo } } });
  if (recent >= MAX_PER_HOUR) throw tooManyRequests("CODE_RATE_LIMITED");
}

/** Creates a code (earlier unused ones of the same purpose stop working) and e-mails it. */
export async function sendCode(email: string, purpose: Purpose, emailSender: EmailSender, locale: Locale, ip?: string): Promise<void> {
  await assertCodeQuota(email, purpose);
  const code = randomDigits(CODE_LENGTH);
  await prisma.$transaction([
    prisma.loginCode.updateMany({ where: { email, purpose, consumedAt: null }, data: { consumedAt: new Date() } }),
    prisma.loginCode.create({ data: { email, purpose, codeHash: hashCode(email, purpose, code), expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000), ip: ip ?? null } }),
  ]);
  // In development the ConsoleEmailSender prints the code to the server console.
  await emailSender.send(codeEmail(email, purpose, code, CODE_TTL_MIN, locale));
}

/** Checks and uses up the newest code. Throws CODE_INVALID / CODE_TOO_MANY_ATTEMPTS. */
export async function consumeCode(email: string, purpose: Purpose, code: string): Promise<void> {
  const row = await prisma.loginCode.findFirst({
    where: { email, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) throw badRequest("CODE_INVALID");
  // Reserve one attempt atomically before comparing, so parallel guesses cannot exceed the limit.
  const reserved = await prisma.loginCode.updateMany({
    where: { id: row.id, consumedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (reserved.count === 0) throw tooManyRequests("CODE_TOO_MANY_ATTEMPTS");
  if (!safeEqualHex(hashCode(email, purpose, code), row.codeHash)) {
    const after = await prisma.loginCode.findUniqueOrThrow({ where: { id: row.id }, select: { attempts: true } });
    if (after.attempts >= MAX_ATTEMPTS) {
      await prisma.loginCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
      throw tooManyRequests("CODE_TOO_MANY_ATTEMPTS");
    }
    throw badRequest("CODE_INVALID");
  }
  // Single use, also under concurrent requests.
  const { count } = await prisma.loginCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (count === 0) throw badRequest("CODE_INVALID");
}
