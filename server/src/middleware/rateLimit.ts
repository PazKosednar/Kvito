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

/** New accounts per IP. */
export const registerLimiter = rateLimit({ ...common, windowMs: 60 * 60_000, limit: 10 });

/** Password attempts per IP (sign-in and password change): slows down guessing. */
export const loginLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 20 });
