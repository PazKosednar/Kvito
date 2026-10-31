/** Money is always integer cents (EUR) – never floats in state or API. */

const formatters = new Map<string, Intl.NumberFormat>();

export function formatCents(cents: number, locale = "sl-SI"): string {
  let f = formatters.get(locale);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });
    formatters.set(locale, f);
  }
  return f.format(cents / 100);
}

/**
 * Parses what people type ("650", "650,5", "1.234,56", "1234.56", "650 €") into cents.
 * Returns null for anything ambiguous or invalid.
 */
export function parseAmountToCents(input: string): number | null {
  const s = input.replace(/[€\s]/g, "");
  if (!s) return null;
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) normalized = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) normalized = s.replace(/,/g, "");
  else if (/^\d+([.,]\d{1,2})?$/.test(s)) normalized = s.replace(",", ".");
  else return null;
  const [whole, frac = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Value for an amount input field: 65000 → "650,00". */
export const centsToInput = (cents: number | null | undefined): string =>
  cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");
