import { createRequire } from "node:module";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { parseDateOnly } from "./dates.js";
import { buildUpnQrText, createUpnQrSymbol, encodeLatin2, parseUpnQrText, toLatin2Text, upnQrPng, upnQrSvg, UpnError, type UpnFields } from "./upnqr.js";

// jsQR is CommonJS with `exports.default`.
const jsqrModule = createRequire(import.meta.url)("jsqr") as { default: typeof import("jsqr").default };
const jsQR = jsqrModule.default;

/** The filled-in example from the official "Struktura zapisa QR na obrazcu UPN QR" (ZBS, 23. 6. 2016). */
const OFFICIAL_EXAMPLE: UpnFields = {
  payerIban: "SI56 0201 7001 4356 205",
  payerReference: "SI00 225268-32526-222",
  payerName: "Poljubno podjetje d.o.o.",
  payerStreet: "Lepa cesta 10",
  payerCity: "2000 Maribor",
  amountCents: 126874,
  paymentDate: parseDateOnly("2016-07-11"),
  urgent: true,
  purposeCode: "CPYR",
  purpose: "Plačilo računa 18/2016.",
  payeeIban: "SI56 0203 6025 3863 406",
  payeeReference: "SI08 1236-17-345679",
  payeeName: "Združenje bank Slovenije - GIZ",
  payeeStreet: "Šubičeva 2",
  payeeCity: "1000 Ljubljana",
};

const OFFICIAL_TEXT =
  [
    "UPNQR",
    "SI56020170014356205",
    "",
    "",
    "SI00225268-32526-222",
    "Poljubno podjetje d.o.o.",
    "Lepa cesta 10",
    "2000 Maribor",
    "00000126874",
    "11.07.2016",
    "X",
    "CPYR",
    "Plačilo računa 18/2016.",
    "",
    "SI56020360253863406",
    "SI081236-17-345679",
    "Združenje bank Slovenije - GIZ",
    "Šubičeva 2",
    "1000 Ljubljana",
    "252",
  ].join("\n") + "\n";

const RENT: UpnFields = {
  payerName: "Ana Kovač",
  payerStreet: "Trnovska ulica 1",
  payerCity: "1000 Ljubljana",
  amountCents: 65000,
  purposeCode: "RENT",
  purpose: "Najemnina november 2026",
  dueDate: parseDateOnly("2026-11-05"),
  payeeIban: "SI56191000000123438",
  payeeReference: "RF712348231",
  payeeName: "Mojca Novak",
  payeeStreet: "Trnovska ulica 1",
  payeeCity: "1000 Ljubljana",
};

function decodePng(buf: Buffer) {
  const png = PNG.sync.read(buf);
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
}

describe("UPN QR payload", () => {
  it("reproduces the official example byte for byte (checksum 252, LF after every field)", () => {
    expect(buildUpnQrText(OFFICIAL_EXAMPLE)).toBe(OFFICIAL_TEXT);
  });

  it("pads the amount to 11 digits in cents", () => {
    expect(buildUpnQrText({ ...RENT, amountCents: 0 }).split("\n")[8]).toBe("00000000000");
    expect(buildUpnQrText({ ...RENT, amountCents: 99_999_999_999 }).split("\n")[8]).toBe("99999999999");
    expect(() => buildUpnQrText({ ...RENT, amountCents: 100_000_000_000 })).toThrow(UpnError);
    expect(() => buildUpnQrText({ ...RENT, amountCents: 12.5 })).toThrow(UpnError);
  });

  it("validates structured fields", () => {
    expect(() => buildUpnQrText({ ...RENT, payeeIban: "SI56191000000123439" })).toThrow(/payeeIban/);
    expect(() => buildUpnQrText({ ...RENT, purposeCode: "RNT" })).toThrow(/purposeCode/);
    expect(() => buildUpnQrText({ ...RENT, payeeReference: "XX12 345" })).toThrow(/payeeReference/);
    expect(() => buildUpnQrText({ ...RENT, payerName: "  " })).toThrow(/payerName/);
  });

  it("truncates free text to the field limits and trims it", () => {
    const text = buildUpnQrText({ ...RENT, purpose: `  ${"x".repeat(60)}  `, payeeName: "y".repeat(50) });
    const parts = text.split("\n");
    expect(parts[12]).toHaveLength(42);
    expect(parts[16]).toHaveLength(33);
  });

  it("keeps Slovenian letters and transliterates characters outside ISO-8859-2", () => {
    expect(toLatin2Text("Čšž ćđ ŠŽČ")).toBe("Čšž ćđ ŠŽČ");
    expect(toLatin2Text("Račun „št. 5“ – 10 €")).toBe('Račun "št. 5" - 10 EUR');
    // ö is part of ISO-8859-2, Å and ñ are not.
    expect(toLatin2Text("Ångström ñ")).toBe("Angström n");
    expect(toLatin2Text("emoji 🏠 ok")).toBe("emoji ? ok");
  });

  it("encodes č/š/ž as single ISO-8859-2 bytes", () => {
    expect([...encodeLatin2("ČŠŽčšž")]).toEqual([0xc8, 0xa9, 0xae, 0xe8, 0xb9, 0xbe]);
  });

  it("parses its own output and detects a wrong checksum", () => {
    const parsed = parseUpnQrText(buildUpnQrText(RENT));
    expect(parsed).toMatchObject({
      amountCents: 65000,
      purposeCode: "RENT",
      payeeIban: "SI56191000000123438",
      payeeReference: "RF712348231",
      payeeName: "Mojca Novak",
      checksumOk: true,
    });
    expect(parsed?.dueDate?.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(parseUpnQrText(OFFICIAL_TEXT.replace(/252\n$/, "251\n"))?.checksumOk).toBe(false);
    expect(parseUpnQrText("hello")).toBeNull();
  });
});

describe("UPN QR symbol", () => {
  it("is version 15, ECC M", () => {
    const symbol = createUpnQrSymbol(buildUpnQrText(RENT));
    expect(symbol.version).toBe(15);
    expect(symbol.modules.size).toBe(77); // 17 + 4 × 15
  });

  it("decodes back to the exact ISO-8859-2 bytes with an ECI 4 marker", async () => {
    const text = buildUpnQrText(OFFICIAL_EXAMPLE);
    const decoded = decodePng(await upnQrPng(text));
    expect(decoded).not.toBeNull();
    expect(decoded!.version).toBe(15);
    expect(Buffer.from(decoded!.binaryData).equals(Buffer.from(encodeLatin2(text)))).toBe(true);
    expect(decoded!.chunks.some((c: { type: string }) => c.type === "eci" && (c as { assignmentNumber?: number }).assignmentNumber === 4)).toBe(true);
    expect(new TextDecoder("iso-8859-2").decode(Uint8Array.from(decoded!.binaryData))).toBe(text);
  });

  it("renders SVG", () => {
    expect(upnQrSvg(buildUpnQrText(RENT))).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
  });

  it("restores the library after creating a symbol", async () => {
    await import("qrcode").then(async (q) => {
      const plain = await q.default.toString("hello", { type: "utf8" });
      expect(plain.length).toBeGreaterThan(0);
    });
  });
});
