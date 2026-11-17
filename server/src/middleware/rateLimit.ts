import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";

const common = {
  standardHeaders: "draft-8" as const,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  message: { error: { code: "TOO_MANY_REQUESTS" } },
};

/** General API limit per IP. */
export const apiLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 300 });

/** File uploads per IP (each up to 10 MB): keeps one client from filling the storage. */
export const uploadLimiter = rateLimit({ ...common, windowMs: 10 * 60_000, limit: 60 });

/** New accounts per IP. */
export const registerLimiter = rateLimit({ ...common, windowMs: 60 * 60_000, limit: 10 });

/** E-mailed codes (confirmation, forgotten password) per IP; per-e-mail limits are in the auth service. */
export const codeLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 10 });

/** Password and code attempts per IP (per-account lockout is in the auth service) (sign-in and password change): slows down guessing. */
export const loginLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 20 });
