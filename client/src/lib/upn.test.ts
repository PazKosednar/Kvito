import { describe, expect, it } from "vitest";
import { decodeUpnBytes, formatIban, formatReference, parseUpnText } from "./upn";

// Official example from the ZBS structure document (checksum 252).
const OFFICIAL =
  "UPNQR\nSI56020170014356205\n\n\nSI00225268-32526-222\nPoljubno podjetje d.o.o.\nLepa cesta 10\n2000 Maribor\n00000126874\n11.07.2016\nX\nCPYR\nPlačilo računa 18/2016.\n\nSI56020360253863406\nSI081236-17-345679\nZdruženje bank Slovenije - GIZ\nŠubičeva 2\n1000 Ljubljana\n252\n";

describe("parseUpnText", () => {
  it("reads the payee and payment fields of a bill", () => {
    expect(parseUpnText(OFFICIAL)).toEqual({
      amountCents: 126874,
      purposeCode: "CPYR",
      purpose: "Plačilo računa 18/2016.",
      dueDate: null,
      payeeIban: "SI56020360253863406",
      payeeReference: "SI081236-17-345679",
      payeeName: "Združenje bank Slovenije - GIZ",
      payeeStreet: "Šubičeva 2",
      payeeCity: "1000 Ljubljana",
      checksumOk: true,
    });
  });

  it("reads the due date and tolerates CRLF", () => {
    const withDue = OFFICIAL.replace("Plačilo računa 18/2016.\n\n", "Plačilo računa 18/2016.\n15.08.2016\n").replace("252\n", "262\n");
    expect(parseUpnText(withDue.replace(/\n/g, "\r\n"))?.dueDate).toBe("2016-08-15");
  });

  it("rejects other QR codes", () => {
    expect(parseUpnText("https://kvita.si")).toBeNull();
    expect(parseUpnText("UPNQR\nonly a few\nlines")).toBeNull();
  });
});

describe("helpers", () => {
  it("decodes ISO-8859-2 bytes", () => {
    expect(decodeUpnBytes([0xc8, 0xa9, 0xae, 0xe8, 0xb9, 0xbe])).toBe("ČŠŽčšž");
  });
  it("formats IBAN and references", () => {
    expect(formatIban("SI56191000000123438")).toBe("SI56 1910 0000 0123 438");
    expect(formatReference("RF4500000042")).toBe("RF45 00000042");
    expect(formatReference("SI00225268-32526-222")).toBe("SI00 225268-32526-222");
  });
});
