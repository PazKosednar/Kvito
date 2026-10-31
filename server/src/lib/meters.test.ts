import { describe, expect, it } from "vitest";
import { formatMeterValue, parseMeterValue } from "./meters.js";

describe("meter values", () => {
  it("parses the usual ways of typing a reading", () => {
    expect(parseMeterValue("12345")).toBe(12345000n);
    expect(parseMeterValue("12345,6")).toBe(12345600n);
    expect(parseMeterValue("12345.678")).toBe(12345678n);
    expect(parseMeterValue("12.345,678")).toBe(12345678n);
    expect(parseMeterValue(" 0,001 ")).toBe(1n);
  });

  it("rejects invalid input", () => {
    expect(parseMeterValue("")).toBeNull();
    expect(parseMeterValue("-5")).toBeNull();
    expect(parseMeterValue("12,3456")).toBeNull();
    expect(parseMeterValue("abc")).toBeNull();
  });

  it("formats without trailing zeros", () => {
    expect(formatMeterValue(12345000n)).toBe("12345");
    expect(formatMeterValue(12345600n)).toBe("12345,6");
    expect(formatMeterValue(1n)).toBe("0,001");
  });
});
