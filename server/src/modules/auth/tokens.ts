import { SignJWT, jwtVerify } from "jose";
import { env } from "../../config/env.js";

const ISSUER = "kvita";
const AUDIENCE = "kvita-api";
const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export async function signAccessToken(userId: string, ttlMinutes = env.ACCESS_TOKEN_TTL_MIN): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlMinutes}m`)
    .sign(secret);
}

export interface AccessClaims {
  userId: string;
  /** Issued at / expires at, seconds since the epoch. */
  iat: number;
  exp: number;
}

/** Signature, issuer, audience and expiry only (no database). Null when the token is invalid or expired. */
export async function verifyAccessClaims(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.iat !== "number" || typeof payload.exp !== "number") return null;
    return { userId: payload.sub, iat: payload.iat, exp: payload.exp };
  } catch {
    return null;
  }
}

/** Returns the user id, or null when the token is invalid or expired. */
export async function verifyAccessToken(token: string): Promise<string | null> {
  return (await verifyAccessClaims(token))?.userId ?? null;
}
