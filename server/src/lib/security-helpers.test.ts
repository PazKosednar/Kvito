import { describe, expect, it } from "vitest";
import { parseStatement } from "./bank-statement.js";
import { csvCell } from "./csv.js";
import { isPushEndpoint } from "./push-endpoint.js";

describe("csvCell", () => {
  it("defuses formulas but keeps numbers", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell("+386 40 000")).toBe("'+386 40 000");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-12,50")).toBe("-12,50");
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell("Ana; Luka")).toBe('"Ana; Luka"');
    expect(csvCell("Najemnina")).toBe("Najemnina");
  });
});

describe("isPushEndpoint", () => {
  it("allows only the browsers' push services over https", () => {
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isPushEndpoint("https://wns2-db5p.notify.windows.com/w/?token=abc")).toBe(true);
    expect(isPushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com.evil.test/x")).toBe(false);
    expect(isPushEndpoint("https://169.254.169.254/latest")).toBe(false);
    expect(isPushEndpoint("https://postgres.railway.internal/x")).toBe(false);
    expect(isPushEndpoint("not a url")).toBe(false);
  });
});

describe("bank statement XML", () => {
  it("refuses a DTD (entity expansion)", () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE d [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;">]><Document><BkToCstmrStmt><Stmt>&b;</Stmt></BkToCstmrStmt></Document>`;
    expect(() => parseStatement(Buffer.from(xml))).toThrow();
  });
});
