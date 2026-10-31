import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { signAccessToken, verifyAccessToken } from "./tokens.js";

describe("access tokens", () => {
  it("round-trips the user id", async () => {
    const token = await signAccessToken("user_123");
    expect(await verifyAccessToken(token)).toBe("user_123");
  });

  it("rejects tampered tokens", async () => {
    const token = await signAccessToken("user_123");
    const [h, p, s] = token.split(".");
    expect(await verifyAccessToken(`${h}.${p}.${s?.slice(0, -2)}xx`)).toBeNull();
  });

  it("rejects tokens signed with another secret", async () => {
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user_123")
      .setIssuer("kvita")
      .setAudience("kvita-api")
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("another-secret-another-secret-another"));
    expect(await verifyAccessToken(forged)).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user_123")
      .setIssuer("kvita")
      .setAudience("kvita-api")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env["JWT_ACCESS_SECRET"]!));
    expect(await verifyAccessToken(expired)).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifyAccessToken("not-a-jwt")).toBeNull();
  });
});
