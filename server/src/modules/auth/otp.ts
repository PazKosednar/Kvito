import { env } from "../../config/env.js";
import { hmacSha256, randomDigits, safeEqualHex } from "../../lib/crypto.js";

export const OTP_LENGTH = 6;

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const generateOtp = (): string => randomDigits(OTP_LENGTH);

/** The code is bound to the e-mail so a hash cannot be reused for another account. */
export const hashOtp = (email: string, code: string, pepper = env.OTP_PEPPER): string =>
  hmacSha256(pepper, `${normalizeEmail(email)}:${code}`);

export const verifyOtp = (email: string, code: string, codeHash: string, pepper = env.OTP_PEPPER): boolean =>
  safeEqualHex(hashOtp(email, code, pepper), codeHash);
