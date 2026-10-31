/**
 * Meter values are stored as integer thousandths of the unit (kWh, m³) – exact, no floating point.
 * People type "12345", "12345,6", "12.345,678" or "12345.678".
 */

export function parseMeterValue(input: string): bigint | null {
  const s = input.replace(/\s/g, "");
  if (!s) return null;
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,3})?$/.test(s)) normalized = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+([.,]\d{1,3})?$/.test(s)) normalized = s.replace(",", ".");
  else return null;
  const [whole, frac = ""] = normalized.split(".");
  return BigInt(whole!) * 1000n + BigInt(frac.padEnd(3, "0"));
}

/** 12345678n → "12345,678" (trailing zeros trimmed, at least the integer part). */
export function formatMeterValue(milli: bigint): string {
  const whole = milli / 1000n;
  const frac = (milli % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return frac ? `${whole},${frac}` : `${whole}`;
}

export const METER_UNITS = { ELECTRICITY: "kWh", WATER: "m³", GAS: "m³", HEAT: "kWh" } as const;
