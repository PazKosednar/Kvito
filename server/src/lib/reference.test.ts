import { describe, expect, it } from "vitest";
import {
  isValidRfReference,
  mod11CheckDigit,
  normalizeReference,
  refNoFromReference,
  rfReference,
  shareReference,
} from "./reference.js";

describe("RF reference (ISO 11649)", () => {
  it("matches the examples in the ZBS reference rules", () => {
    expect(rfReference("2348231")).toBe("RF712348231");
    expect(rfReference("SBO2010")).toBe("RF45SBO2010");
    expect(isValidRfReference("RF71 2348 231")).toBe(true);
    expect(isValidRfReference("RF45SBO2010")).toBe(true);
  });

  it("detects wrong check digits", () => {
    expect(isValidRfReference("RF722348231")).toBe(false);
    expect(isValidRfReference("RF712348232")).toBe(false);
  });

  it("builds and parses Kvito share references", () => {
    const ref = shareReference(42);
    expect(ref).toMatch(/^RF\d{2}00000042$/);
    expect(isValidRfReference(ref)).toBe(true);
    expect(refNoFromReference(ref)).toBe(42);
    expect(refNoFromReference("RF712348231")).toBeNull();
  });

  it("rejects bodies that are too long or not alphanumeric", () => {
    expect(() => rfReference("1234567890123456789012")).toThrow();
    expect(() => rfReference("12-34")).toThrow();
  });
});

describe("SI mod 11", () => {
  // Examples from Priloga 1 of the ZBS reference rules.
  it("computes check digits", () => {
    expect(mod11CheckDigit("102674")).toBe(7);
    expect(mod11CheckDigit("14")).toBe(0); // 11 − 0 = 11 → 0
    expect(mod11CheckDigit("54")).toBe(0); // 11 − 1 = 10 → 0
  });
});

describe("normalizeReference", () => {
  it("accepts SI and RF references as typed on bills", () => {
    expect(normalizeReference("SI00 225268-32526-222")).toBe("SI00225268-32526-222");
    expect(normalizeReference("si08 1236-17-345679")).toBe("SI081236-17-345679");
    expect(normalizeReference("RF71 2348 231")).toBe("RF712348231");
  });
  it("rejects garbage and invalid RF", () => {
    expect(normalizeReference("")).toBeNull();
    expect(normalizeReference("hello")).toBeNull();
    expect(normalizeReference("RF00 2348 231")).toBeNull();
  });
});
