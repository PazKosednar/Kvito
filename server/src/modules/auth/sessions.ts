import { env } from "../../config/env.js";
import { randomToken, sha256 } from "../../lib/crypto.js";
import { unauthorized } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { signAccessToken } from "./tokens.js";

export interface ClientMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const refreshExpiry = () => new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

async function createRefreshToken(userId: string, familyId: string | null, meta: ClientMeta) {
  const token = randomToken();
  const record = await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(token),
      familyId: familyId ?? randomToken(16),
      expiresAt: refreshExpiry(),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
  });
  return { token, record };
}

/** Starts a new session (new token family). */
export async function issueSession(userId: string, meta: ClientMeta): Promise<IssuedTokens> {
  const { token, record } = await createRefreshToken(userId, null, meta);
  return { accessToken: await signAccessToken(userId), refreshToken: token, refreshExpiresAt: record.expiresAt };
}

/**
 * Rotates a refresh token. Presenting an already-rotated token is treated as theft:
 * the whole family is revoked and the user must log in again.
 */
export async function rotateSession(refreshToken: string, meta: ClientMeta): Promise<IssuedTokens & { userId: string }> {
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(refreshToken) },
    include: { user: { select: { deletedAt: true } } },
  });
  if (!existing) throw unauthorized("REFRESH_INVALID");

  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw unauthorized("REFRESH_REUSED");
  }
  if (existing.expiresAt <= new Date() || existing.user.deletedAt) throw unauthorized("REFRESH_INVALID");

  const { token, record } = await createRefreshToken(existing.userId, existing.familyId, meta);
  // Conditional update guards against two concurrent refreshes with the same token.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: existing.id, revokedAt: null },
    data: { revokedAt: new Date(), replacedById: record.id },
  });
  if (count === 0) {
    await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
    throw unauthorized("REFRESH_REUSED");
  }

  return {
    userId: existing.userId,
    accessToken: await signAccessToken(existing.userId),
    refreshToken: token,
    refreshExpiresAt: record.expiresAt,
  };
}

export async function revokeSession(refreshToken: string): Promise<void> {
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
  if (!existing) return;
  await prisma.refreshToken.updateMany({
    where: { familyId: existing.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
