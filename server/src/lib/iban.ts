/** IBAN helpers (ISO 13616, mod 97). */

export const normalizeIban = (raw: string): string => raw.replace(/\s+/g, "").toUpperCase();

/** Converts letters to numbers (A=10 … Z=35) as used by ISO 7064 MOD 97-10. */
export const lettersToDigits = (s: string): string =>
  s.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));

/** Remainder of a long decimal string divided by 97, without BigInt. */
export function mod97(digits: string): number {
  let rem = 0;
  for (let i = 0; i < digits.length; i += 7) {
    rem = Number(`${rem}${digits.slice(i, i + 7)}`) % 97;
  }
  return rem;
}

export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  // Slovenian IBANs are exactly 19 characters.
  if (iban.startsWith("SI") && iban.length !== 19) return false;
  return mod97(lettersToDigits(iban.slice(4) + iban.slice(0, 4))) === 1;
}

/** "SI56191000000123438" → "SI56 1910 0000 0123 438" */
export const formatIban = (raw: string): string => normalizeIban(raw).replace(/(.{4})/g, "$1 ").trim();
