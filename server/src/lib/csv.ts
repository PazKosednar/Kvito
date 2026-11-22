/**
 * One CSV cell (separator ";", as Slovenian Excel expects). Quotes when needed and defuses formulas: text that
 * starts with = + - @ (or a tab/CR) would run as a formula in Excel or Sheets, e.g. a tenant named
 * `=HYPERLINK(...)`. Such text gets a leading apostrophe; plain numbers such as "-12,50" stay numbers.
 */
export function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(?:[.,]\d+)?$/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
