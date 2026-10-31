import type { RequestHandler } from "express";
import { unauthorized } from "../lib/errors.js";
import { verifyAccessToken } from "../modules/auth/tokens.js";

/** Requires `Authorization: Bearer <access token>`. Works the same for web and native (Capacitor) clients. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return next(unauthorized("TOKEN_INVALID"));
  req.auth = { userId };
  next();
};

/** Narrows `req.auth` after `requireAuth`. */
export function authUserId(req: { auth?: { userId: string } }): string {
  if (!req.auth) throw unauthorized();
  return req.auth.userId;
}
