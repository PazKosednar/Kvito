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
    const [h, p, s = ""] = token.split(".");
    // Change a character in the middle of the signature: the last base64url character only
    // carries padding bits, so altering it is not guaranteed to change the decoded bytes.
    const mid = Math.floor(s.length / 2);
    const tampered = `${s.slice(0, mid)}${s[mid] === "A" ? "B" : "A"}${s.slice(mid + 1)}`;
    expect(await verifyAccessToken(`${h}.${p}.${tampered}`)).toBeNull();
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
