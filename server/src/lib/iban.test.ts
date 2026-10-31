import { describe, expect, it } from "vitest";
import { formatIban, isValidIban, normalizeIban } from "./iban.js";

describe("iban", () => {
  it("accepts valid Slovenian IBANs with or without spaces", () => {
    expect(isValidIban("SI56191000000123438")).toBe(true);
    expect(isValidIban("si56 1910 0000 0123 438")).toBe(true);
    // Examples from the official UPN QR field description.
    expect(isValidIban("SI56020170014356205")).toBe(true);
    expect(isValidIban("SI56020360253863406")).toBe(true);
  });

  it("accepts other SEPA IBANs", () => {
    expect(isValidIban("DE89370400440532013000")).toBe(true);
    expect(isValidIban("AT611904300234573201")).toBe(true);
  });

  it("rejects wrong check digits, lengths and characters", () => {
    expect(isValidIban("SI56191000000123439")).toBe(false);
    expect(isValidIban("SI5619100000012343")).toBe(false);
    expect(isValidIban("SI56-1910-0000-0123-438")).toBe(false);
    expect(isValidIban("")).toBe(false);
  });

  it("normalizes and formats", () => {
    expect(normalizeIban(" si56 1910 0000 0123 438 ")).toBe("SI56191000000123438");
    expect(formatIban("SI56191000000123438")).toBe("SI56 1910 0000 0123 438");
  });
});
