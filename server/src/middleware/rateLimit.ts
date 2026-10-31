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

/** Requesting login codes per IP (per-e-mail limits are enforced in the auth service). */
export const requestCodeLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 10 });

/** Verifying login codes per IP (per-code attempt limits are enforced in the auth service). */
export const verifyCodeLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 30 });
