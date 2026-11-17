import type { RequestHandler } from "express";
import { unauthorized } from "../lib/errors.js";
import { verifySession } from "../modules/auth/sessions.js";

/** Requires `Authorization: Bearer <access token>`. Works the same for web and native (Capacitor) clients. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  // Signature + expiry, and that the account still exists and the token was not revoked by a password change.
  const claims = token ? await verifySession(token) : null;
  if (!claims) return next(unauthorized("TOKEN_INVALID"));
  req.auth = { userId: claims.userId };
  next();
};

/** Narrows `req.auth` after `requireAuth`. */
export function authUserId(req: { auth?: { userId: string } }): string {
  if (!req.auth) throw unauthorized();
  return req.auth.userId;
}
