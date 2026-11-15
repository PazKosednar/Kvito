import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing with Node's built-in scrypt (memory-hard; no extra dependency).
 * Stored as "scrypt$N$r$p$salt$hash" (base64url), so parameters can be raised later without breaking old hashes.
 */

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
// N·r·128 bytes ≈ 32 MiB; Node's default maxmem (32 MiB) is just too small for that.
const MAX_MEM = 64 * 1024 * 1024;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, keylen: number): Promise<Buffer> {
  const options: ScryptOptions = { N: n, r, p, maxmem: MAX_MEM };
  return new Promise((resolve, reject) => scrypt(password.normalize("NFKC"), salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P, KEY_LENGTH);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await derive(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p), expected.length);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/**
 * Passwords that guessing tools try first (international and Slovenian). Rejected for new passwords only;
 * a longer breached-password check (e.g. k-anonymity lookup) can replace this later.
 */
const COMMON = new Set([
  "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "12341234", "11223344",
  "password", "password1", "password123", "passw0rd", "qwertyui", "qwerty123", "qwertz123", "iloveyou",
  "admin123", "administrator", "letmein1", "welcome1", "sunshine", "princess", "football", "baseball",
  "abc12345", "abcd1234", "zaq12wsx", "1q2w3e4r", "asdfghjk", "asdf1234", "superman", "trustno1",
  "geslo123", "geslo1234", "mojegeslo", "slovenija", "ljubljana", "maribor1", "najemnina", "kvito123",
]);
export const isCommonPassword = (password: string): boolean => COMMON.has(password.normalize("NFKC").toLowerCase());

/** A real hash of a random password: verifying against it costs as much as a real check (no user enumeration by timing). */
let dummy: Promise<string> | null = null;
export const dummyHash = (): Promise<string> => (dummy ??= hashPassword(randomBytes(16).toString("hex")));
