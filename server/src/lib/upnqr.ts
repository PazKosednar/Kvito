/**
 * UPN QR payload + QR symbol, per the official ZBS documents (see docs/UPN-QR.md):
 *  - 20 fields, each followed by LF; field 20 = sum of strlen(field + "\n") for fields 1–19, 3 digits;
 *  - QR version 15, byte mode, ECC M, ECI ISO-8859-2; max 411 characters.
 * The app never receives or forwards money – this only describes a payment for the payer's own bank.
 */
import { createRequire } from "node:module";
import QRCode from "qrcode";
import { formatUpnDate } from "./dates.js";
import { isValidIban, normalizeIban } from "./iban.js";

export interface UpnFields {
  payerIban?: string;
  deposit?: boolean;
  withdrawal?: boolean;
  payerReference?: string;
  payerName: string;
  payerStreet: string;
  payerCity: string;
  amountCents: number;
  paymentDate?: Date | null;
  urgent?: boolean;
  purposeCode: string;
  purpose: string;
  dueDate?: Date | null;
  payeeIban: string;
  payeeReference?: string | null;
  payeeName: string;
  payeeStreet: string;
  payeeCity: string;
}

export class UpnError extends Error {
  constructor(public readonly field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = "UpnError";
  }
}

const MAX_LENGTH = 411;
const MAX_AMOUNT_CENTS = 99_999_999_999; // 999.999.999,99 €

// ---------- ISO-8859-2 ----------

/** Unicode → ISO-8859-2 byte, built from the platform decoder instead of a hand-written table. */
const LATIN2: Map<string, number> = (() => {
  const map = new Map<string, number>();
  const decoder = new TextDecoder("iso-8859-2");
  for (let b = 0x20; b <= 0xff; b++) {
    if (b >= 0x7f && b < 0xa0) continue;
    map.set(decoder.decode(new Uint8Array([b])), b);
  }
  return map;
})();

const REPLACEMENTS: Record<string, string> = {
  "€": "EUR",
  "‘": "'",
  "’": "'",
  "‚": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "«": '"',
  "»": '"',
  "–": "-",
  "—": "-",
  "…": "...",
  " ": " ",
};

/** Makes free text representable in ISO-8859-2 (keeps č, š, ž, ć, đ …; transliterates the rest). */
export function toLatin2Text(input: string): string {
  let out = "";
  for (const ch of input.normalize("NFC").replace(/[\r\n\t]+/g, " ")) {
    if (LATIN2.has(ch)) out += ch;
    else if (REPLACEMENTS[ch]) out += REPLACEMENTS[ch];
    else {
      const base = ch.normalize("NFD").replace(/\p{M}/gu, "");
      out += base && [...base].every((c) => LATIN2.has(c)) ? base : "?";
    }
  }
  return out.replace(/ {2,}/g, " ").trim();
}

export function encodeLatin2(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of text) {
    if (ch === "\n") {
      bytes.push(0x0a);
      continue;
    }
    const b = LATIN2.get(ch);
    if (b === undefined) throw new UpnError("text", `character not in ISO-8859-2: ${ch}`);
    bytes.push(b);
  }
  return Uint8Array.from(bytes);
}

// ---------- Payload ----------

/** Free text: ISO-8859-2, no leading/trailing spaces, cut to the field length. */
const freeText = (value: string | undefined | null, max: number) => toLatin2Text(value ?? "").slice(0, max).trim();

/** Builds the 20-field UPN QR text (with the trailing LF after field 20). Throws UpnError on invalid structured fields. */
export function buildUpnQrText(f: UpnFields): string {
  const payerIban = f.payerIban ? normalizeIban(f.payerIban) : "";
  if (payerIban && !(payerIban.length === 19 && isValidIban(payerIban))) throw new UpnError("payerIban", "invalid");

  const payeeIban = normalizeIban(f.payeeIban);
  if (!isValidIban(payeeIban) || payeeIban.length > 34) throw new UpnError("payeeIban", "invalid");

  if (!Number.isInteger(f.amountCents) || f.amountCents < 0 || f.amountCents > MAX_AMOUNT_CENTS) {
    throw new UpnError("amount", "out of range");
  }
  const purposeCode = f.purposeCode.toUpperCase();
  if (!/^[A-Z]{4}$/.test(purposeCode)) throw new UpnError("purposeCode", "must be 4 letters A-Z");

  const checkRef = (field: string, ref: string | null | undefined) => {
    const r = (ref ?? "").replace(/\s+/g, "").toUpperCase();
    if (r && !/^(SI|RF)\d{2}[A-Z0-9-]{1,22}$/.test(r)) throw new UpnError(field, "must be SI/RF model + reference");
    return r;
  };

  const required = (field: string, value: string) => {
    if (!value) throw new UpnError(field, "required");
    return value;
  };

  const fields: string[] = [
    "UPNQR",
    payerIban,
    f.deposit ? "X" : "",
    f.withdrawal ? "X" : "",
    checkRef("payerReference", f.payerReference),
    required("payerName", freeText(f.payerName, 33)),
    required("payerStreet", freeText(f.payerStreet, 33)),
    required("payerCity", freeText(f.payerCity, 33)),
    String(f.amountCents).padStart(11, "0"),
    f.paymentDate ? formatUpnDate(f.paymentDate) : "",
    f.urgent ? "X" : "",
    purposeCode,
    required("purpose", freeText(f.purpose, 42)),
    f.dueDate ? formatUpnDate(f.dueDate) : "",
    payeeIban,
    checkRef("payeeReference", f.payeeReference),
    required("payeeName", freeText(f.payeeName, 33)),
    required("payeeStreet", freeText(f.payeeStreet, 33)),
    required("payeeCity", freeText(f.payeeCity, 33)),
  ];

  const checksum = fields.reduce((sum, v) => sum + v.length + 1, 0);
  const text = [...fields, String(checksum).padStart(3, "0")].map((v) => `${v}\n`).join("");
  if (text.length > MAX_LENGTH) throw new UpnError("payload", `too long (${text.length} > ${MAX_LENGTH})`);
  return text;
}

/** Parses a UPN QR text (e.g. scanned from a bill). Returns null when it is not a valid UPN QR. */
export function parseUpnQrText(text: string): (UpnFields & { checksumOk: boolean }) | null {
  const parts = text.replace(/\r/g, "").split("\n");
  if (parts[0]?.trim() !== "UPNQR" || parts.length < 20) return null;
  const v = (i: number) => (parts[i] ?? "").trim();
  const checksum = parts.slice(0, 19).reduce((s, p) => s + p.length + 1, 0);
  const amount = Number(v(8));
  const date = (s: string) => {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
    return m ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))) : null;
  };
  return {
    payerIban: v(1),
    deposit: v(2) === "X",
    withdrawal: v(3) === "X",
    payerReference: v(4),
    payerName: v(5),
    payerStreet: v(6),
    payerCity: v(7),
    amountCents: Number.isFinite(amount) ? amount : 0,
    paymentDate: date(v(9)),
    urgent: v(10) === "X",
    purposeCode: v(11),
    purpose: v(12),
    dueDate: date(v(13)),
    payeeIban: v(14),
    payeeReference: v(15),
    payeeName: v(16),
    payeeStreet: v(17),
    payeeCity: v(18),
    checksumOk: Number(v(19)) === checksum,
  };
}

// ---------- QR symbol (V15, byte mode, ECC M, ECI 4 = ISO-8859-2) ----------

const require = createRequire(import.meta.url);
// qrcode builds segments internally and has no ECI support; we provide [ECI, BYTE] segments for one synchronous
// create() call. Everything else (Reed–Solomon, masking, version info) is the library's.
const Segments = require("qrcode/lib/core/segments") as { fromArray: (data: unknown) => unknown[] };
const ByteData = require("qrcode/lib/core/byte-data") as new (data: Uint8Array) => unknown;
const svgRenderer = require("qrcode/lib/renderer/svg-tag") as { render: (qr: unknown, opts: object) => string };
const pngRenderer = require("qrcode/lib/renderer/png") as {
  renderToBuffer: (qr: unknown, opts: object, cb: (err: Error | null, buf: Buffer) => void) => void;
};

/** ECI designator segment: mode indicator 0111 + 8-bit assignment number (4 = ISO-8859-2). */
const eciSegment = {
  mode: { id: "ECI", bit: 0b0111, ccBits: [0, 0, 0] },
  getLength: () => 0,
  getBitsLength: () => 8,
  write: (buffer: { put: (num: number, length: number) => void }) => buffer.put(4, 8),
};

export type UpnQrSymbol = ReturnType<typeof QRCode.create>;

export function createUpnQrSymbol(text: string): UpnQrSymbol {
  const bytes = encodeLatin2(text);
  const original = Segments.fromArray;
  Segments.fromArray = () => [eciSegment, new ByteData(bytes)];
  try {
    // The placeholder segment is replaced by the patched fromArray above.
    return QRCode.create([{ data: Uint8Array.of(0x78), mode: "byte" }], { version: 15, errorCorrectionLevel: "M" });
  } finally {
    Segments.fromArray = original;
  }
}

const RENDER = { margin: 4, color: { dark: "#000000", light: "#ffffff" } };

export function upnQrSvg(text: string): string {
  return svgRenderer.render(createUpnQrSymbol(text), { ...RENDER, type: "svg" });
}

export function upnQrPng(text: string, width = 600): Promise<Buffer> {
  const symbol = createUpnQrSymbol(text);
  return new Promise((resolve, reject) =>
    pngRenderer.renderToBuffer(symbol, { ...RENDER, width, type: "png" }, (err, buf) => (err ? reject(err) : resolve(buf))),
  );
}
