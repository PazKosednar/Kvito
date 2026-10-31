/**
 * Reads a UPN QR text (scanned from a paper or PDF bill) into form values.
 * Structure per the official ZBS "Struktura zapisa QR na obrazcu UPN QR" – see docs/UPN-QR.md.
 */

export interface ScannedBill {
  amountCents: number;
  purposeCode: string;
  purpose: string;
  /** "YYYY-MM-DD" */
  dueDate: string | null;
  payeeIban: string;
  payeeReference: string;
  payeeName: string;
  payeeStreet: string;
  payeeCity: string;
  checksumOk: boolean;
}

export function parseUpnText(text: string): ScannedBill | null {
  const parts = text.replace(/\r/g, "").split("\n");
  if (parts[0]?.trim() !== "UPNQR" || parts.length < 20) return null;
  const v = (i: number) => (parts[i] ?? "").trim();
  const amount = Number(v(8));
  if (!/^\d{11}$/.test(v(8)) || !Number.isFinite(amount)) return null;
  const date = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(v(13));
  const checksum = parts.slice(0, 19).reduce((s, p) => s + p.length + 1, 0);
  return {
    amountCents: amount,
    purposeCode: v(11),
    purpose: v(12),
    dueDate: date ? `${date[3]}-${date[2]}-${date[1]}` : null,
    payeeIban: v(14),
    payeeReference: v(15),
    payeeName: v(16),
    payeeStreet: v(17),
    payeeCity: v(18),
    checksumOk: Number(v(19)) === checksum,
  };
}

/** Bytes from a QR code (ISO-8859-2 per the standard) → text. Falls back to UTF-8 for non-conforming codes. */
export function decodeUpnBytes(bytes: number[] | Uint8Array): string {
  const arr = Uint8Array.from(bytes);
  try {
    return new TextDecoder("iso-8859-2").decode(arr);
  } catch {
    return new TextDecoder().decode(arr);
  }
}

/** "SI56191000000123438" → "SI56 1910 0000 0123 438"; references get a space after the model. */
export const formatIban = (iban: string) => iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
export const formatReference = (ref: string) => ref.replace(/\s+/g, "").replace(/^(SI\d{2}|RF\d{2})/, "$1 ");
