import { describe, expect, it } from "vitest";
import { OTP_LENGTH, generateOtp, hashOtp, normalizeEmail, verifyOtp } from "./otp.js";

const PEPPER = "unit-test-pepper-unit-test-pepper-123";

describe("otp", () => {
  it("generates zero-padded numeric codes of fixed length", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateOtp()).toMatch(new RegExp(`^\\d{${OTP_LENGTH}}$`));
    }
  });

  it("verifies the right code and rejects a wrong one", () => {
    const hash = hashOtp("ana@kvita.test", "123456", PEPPER);
    expect(verifyOtp("ana@kvita.test", "123456", hash, PEPPER)).toBe(true);
    expect(verifyOtp("ana@kvita.test", "123457", hash, PEPPER)).toBe(false);
  });

  it("binds the code to the e-mail (case-insensitive)", () => {
    const hash = hashOtp("Ana@Kvita.test ", "123456", PEPPER);
    expect(verifyOtp("ana@kvita.test", "123456", hash, PEPPER)).toBe(true);
    expect(verifyOtp("luka@kvita.test", "123456", hash, PEPPER)).toBe(false);
  });

  it("depends on the pepper", () => {
    const hash = hashOtp("ana@kvita.test", "123456", PEPPER);
    expect(verifyOtp("ana@kvita.test", "123456", hash, `${PEPPER}x`)).toBe(false);
  });

  it("does not store the code in clear text", () => {
    expect(hashOtp("ana@kvita.test", "123456", PEPPER)).not.toContain("123456");
  });

  it("normalizes e-mails", () => {
    expect(normalizeEmail("  Mojca.Novak@Example.SI ")).toBe("mojca.novak@example.si");
  });
});
