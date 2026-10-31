import { describe, expect, it } from "vitest";
import { centsToInput, formatCents, parseAmountToCents } from "./money";

describe("money", () => {
  it("parses common ways of typing amounts", () => {
    expect(parseAmountToCents("650")).toBe(65000);
    expect(parseAmountToCents("650,5")).toBe(65050);
    expect(parseAmountToCents("650,05")).toBe(65005);
    expect(parseAmountToCents("1.234,56")).toBe(123456);
    expect(parseAmountToCents("1234.56")).toBe(123456);
    expect(parseAmountToCents("1,234.56")).toBe(123456);
    expect(parseAmountToCents(" 48,73 € ")).toBe(4873);
    expect(parseAmountToCents("0,29")).toBe(29);
  });

  it("rejects invalid input", () => {
    expect(parseAmountToCents("")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
    expect(parseAmountToCents("1,234")).toBe(123400); // thousands separator
    expect(parseAmountToCents("12,345,6")).toBeNull();
    expect(parseAmountToCents("-5")).toBeNull();
  });

  it("formats and round-trips", () => {
    expect(formatCents(65000).replace(/\s/g, " ")).toBe("650,00 €");
    expect(centsToInput(4873)).toBe("48,73");
    // CGP number format: thousands with a dot, decimals with a comma, € after the amount.
    expect(formatCents(125000).replace(/\s/g, " ")).toBe("1.250,00 €");
    expect(formatCents(134873).replace(/\s/g, " ")).toBe("1.348,73 €");
    expect(parseAmountToCents(centsToInput(123456))).toBe(123456);
  });
});
