import { env } from "../config/env.js";
import { hmacSha256, safeEqualHex } from "./crypto.js";

/** Accepted uploads, detected from the file's first bytes (never trust the name or the client's Content-Type). */
export const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function sniffMime(buf: Buffer): AllowedMime | null {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buf.subarray(4, 8).toString("latin1") === "ftyp" && /^(heic|heix|mif1|msf1|hevc)$/.test(buf.subarray(8, 12).toString("latin1"))) {
    return "image/heic";
  }
  return null;
}

export const extensionFor = (mime: AllowedMime) =>
  ({ "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" })[mime];

/** Safe display name: no paths, no control characters, max 120 chars. */
export function cleanFileName(raw: string | undefined, mime: AllowedMime): string {
  const base = (raw ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "").trim().slice(0, 120);
  return cleaned || `datoteka.${extensionFor(mime)}`;
}

// ---------- Signed URLs ----------

const FILE_URL_TTL_S = 60 * 60;

const signature = (id: string, exp: number) => hmacSha256(env.JWT_ACCESS_SECRET, `file:${id}:${exp}`);

/** Short-lived URL usable in <img src> and downloads without an Authorization header. */
export function signedFileUrl(id: string, ttlSeconds = FILE_URL_TTL_S, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  return `/api/files/${id}?exp=${exp}&sig=${signature(id, exp)}`;
}

export function verifyFileSignature(id: string, exp: string | undefined, sig: string | undefined, now = Date.now()): boolean {
  const e = Number(exp);
  if (!Number.isInteger(e) || e * 1000 < now || !sig || !/^[0-9a-f]{64}$/.test(sig)) return false;
  return safeEqualHex(signature(id, e), sig);
}
