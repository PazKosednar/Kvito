import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("kvito-skrivnost");
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(hash).not.toContain("kvito-skrivnost");
    expect(await verifyPassword("kvito-skrivnost", hash)).toBe(true);
    expect(await verifyPassword("kvito-skrivnosT", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("enako-geslo")).not.toBe(await hashPassword("enako-geslo"));
  });

  it("treats composed and decomposed šumniki as the same password", async () => {
    const hash = await hashPassword("šumnik-č");
    expect(await verifyPassword("šumnik-č", hash)).toBe(true);
  });

  it("rejects malformed stored values", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$1$2")).toBe(false);
  });
});
