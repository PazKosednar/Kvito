import { Router, type CookieOptions, type Request, type RequestHandler } from "express";
import { env, isProd } from "../../config/env.js";
import { audit } from "../../lib/audit.js";
import { forbidden, unauthorized } from "../../lib/errors.js";
import type { z } from "zod";
import { authUserId, requireAuth } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { loginLimiter, registerLimiter } from "../../middleware/rateLimit.js";
import type { EmailSender } from "../../services/email/EmailSender.js";
import { toMeDto } from "../users/dto.js";
import { ChangePasswordBody, LoginBody, RegisterBody } from "./schemas.js";
import { changePassword, login, register } from "./service.js";
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

export function authRouter(_deps: { emailSender: EmailSender }): Router {
  const router = Router();

  router.post("/register", registerLimiter, validateBody(RegisterBody), async (req, res) => {
    const body = req.body as z.infer<typeof RegisterBody>;
    const { user, tokens } = await register(body, clientMeta(req));
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(tokens.refreshExpiresAt));
    await audit({ actorId: user.id, entityType: "User", entityId: user.id, action: "register", ip: req.ip });
    res.status(201).json({ accessToken: tokens.accessToken, user: toMeDto(user) });
  });

  router.post("/login", loginLimiter, validateBody(LoginBody), async (req, res) => {
    const body = req.body as z.infer<typeof LoginBody>;
    const { user, tokens } = await login(body.email, body.password, clientMeta(req));
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(tokens.refreshExpiresAt));
    await audit({ actorId: user.id, entityType: "User", entityId: user.id, action: "login", ip: req.ip });
    res.json({ accessToken: tokens.accessToken, user: toMeDto(user) });
  });

  router.post("/change-password", loginLimiter, requireAuth, validateBody(ChangePasswordBody), async (req, res) => {
    const userId = authUserId(req);
    const body = req.body as z.infer<typeof ChangePasswordBody>;
    const tokens = await changePassword(userId, body.currentPassword, body.newPassword, clientMeta(req));
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(tokens.refreshExpiresAt));
    await audit({ actorId: userId, entityType: "User", entityId: userId, action: "changePassword", ip: req.ip });
    res.json({ accessToken: tokens.accessToken });
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
