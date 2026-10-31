import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

export const hmacSha256 = (secret: string, value: string): string =>
  createHmac("sha256", secret).update(value).digest("hex");

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

/** Uniformly random numeric code, zero-padded (e.g. "042917"). */
export const randomDigits = (length: number): string =>
  randomInt(0, 10 ** length).toString().padStart(length, "0");

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
