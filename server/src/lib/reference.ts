import { lettersToDigits, mod97 } from "./iban.js";

/**
 * Payment references per "Pravila za oblikovanje in uporabo standardiziranih referenc SI in RF" (ZBS, dec. 2016).
 * See docs/UPN-QR.md.
 */

/** RF (ISO 11649): check digits = 98 − (body + "RF00" as digits) mod 97. Body: 1–21 alphanumerics. */
export function rfCheckDigits(body: string): string {
  const b = body.toUpperCase();
  if (!/^[A-Z0-9]{1,21}$/.test(b)) throw new Error(`Invalid RF body: ${body}`);
  const check = 98 - mod97(lettersToDigits(`${b}RF00`));
  return String(check).padStart(2, "0");
}

export const rfReference = (body: string): string => `RF${rfCheckDigits(body)}${body.toUpperCase()}`;

export function isValidRfReference(ref: string): boolean {
  const r = ref.replace(/\s+/g, "").toUpperCase();
  if (!/^RF\d{2}[A-Z0-9]{1,21}$/.test(r)) return false;
  return mod97(lettersToDigits(r.slice(4) + r.slice(0, 4))) === 1;
}

/** Kvito's reference for a charge share: RF + check + share number (8 digits) – lets us match bank statements later. */
export const shareReference = (refNo: number): string => rfReference(String(refNo).padStart(8, "0"));

/** Recovers the share number from a Kvito reference (for future statement matching). */
export function refNoFromReference(ref: string): number | null {
  const r = ref.replace(/\s+/g, "").toUpperCase();
  if (!isValidRfReference(r) || !/^RF\d{2}\d{8}$/.test(r)) return null;
  return Number(r.slice(4));
}

/** Mod 11 check digit used by SI models (e.g. SI12). Weights 2,3,4,… from the right. 10 → 0, 11 → 0. */
export function mod11CheckDigit(digits: string): number {
  if (!/^\d+$/.test(digits)) throw new Error("mod11 expects digits");
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += Number(digits[i]) * weight;
    weight++;
  }
  const k = 11 - (sum % 11);
  return k >= 10 ? 0 : k;
}

/**
 * Accepts a payee reference typed by a person or read from a bill: "SI00 225268-32526-222", "RF18 5390 0754 7034".
 * Returns the UPN QR form (model + reference without spaces) or null if it does not look like SI/RF.
 */
export function normalizeReference(raw: string): string | null {
  const r = raw.replace(/\s+/g, "").toUpperCase();
  if (!r) return null;
  if (/^RF\d{2}[A-Z0-9]{1,21}$/.test(r)) return isValidRfReference(r) ? r : null;
  if (/^SI\d{2}[0-9-]{0,22}$/.test(r) && r.length <= 26) return r;
  return null;
}
