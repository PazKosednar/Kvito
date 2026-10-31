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

/** Returns the user id, or null when the token is invalid or expired. */
export async function verifyAccessToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
