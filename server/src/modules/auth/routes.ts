import { Router, type CookieOptions, type Request, type RequestHandler } from "express";
import { env, isProd } from "../../config/env.js";
import { audit } from "../../lib/audit.js";
import { forbidden, unauthorized } from "../../lib/errors.js";
import { validateBody } from "../../middleware/validate.js";
import { requestCodeLimiter, verifyCodeLimiter } from "../../middleware/rateLimit.js";
import type { EmailSender } from "../../services/email/EmailSender.js";
import { toMeDto } from "../users/dto.js";
import { RequestCodeBody, VerifyCodeBody } from "./schemas.js";
import { requestLoginCode, verifyLoginCode } from "./service.js";
import { revokeSession, rotateSession, type ClientMeta } from "./sessions.js";

export const REFRESH_COOKIE = "kvita_rt";

const cookieOptions = (expires?: Date): CookieOptions => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE || isProd,
  sameSite: "lax",
  path: "/api/auth",
  ...(expires ? { expires } : {}),
});

const clientMeta = (req: Request): ClientMeta => ({ ip: req.ip, userAgent: req.get("user-agent") });

/**
 * Cookie-authenticated endpoints only accept requests from the web client origin (CSRF defence in depth;
 * the cookie is also SameSite=Lax and scoped to /api/auth).
 * TODO(capacitor): native clients will send the refresh token in the body instead of a cookie.
 */
const requireTrustedOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.get("origin");
  if (origin && origin !== env.CLIENT_ORIGIN) return next(forbidden("ORIGIN_NOT_ALLOWED"));
  next();
};

export function authRouter(deps: { emailSender: EmailSender }): Router {
  const router = Router();

  router.post("/request-code", requestCodeLimiter, validateBody(RequestCodeBody), async (req, res) => {
    await requestLoginCode(req.body.email, clientMeta(req), deps.emailSender);
    res.status(202).json({ ok: true });
  });

  router.post("/verify-code", verifyCodeLimiter, validateBody(VerifyCodeBody), async (req, res) => {
    const { user, tokens } = await verifyLoginCode(req.body.email, req.body.code, clientMeta(req));
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(tokens.refreshExpiresAt));
    await audit({ actorId: user.id, entityType: "User", entityId: user.id, action: "login", ip: req.ip });
    res.json({ accessToken: tokens.accessToken, user: toMeDto(user) });
  });

  router.post("/refresh", requireTrustedOrigin, async (req, res) => {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof token !== "string" || !token) throw unauthorized("REFRESH_MISSING");
    try {
      const tokens = await rotateSession(token, clientMeta(req));
      res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(tokens.refreshExpiresAt));
      res.json({ accessToken: tokens.accessToken });
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, cookieOptions());
      throw err;
    }
  });

  router.post("/logout", requireTrustedOrigin, async (req, res) => {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof token === "string" && token) await revokeSession(token);
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    res.status(204).end();
  });

  return router;
}
