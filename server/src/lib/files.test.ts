import { describe, expect, it } from "vitest";
import { cleanFileName, signedFileUrl, sniffMime, verifyFileSignature } from "./files.js";

describe("files", () => {
  it("detects types from magic bytes", () => {
    expect(sniffMime(Buffer.from("%PDF-1.7\n1 0 obj"))).toBe("application/pdf");
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/jpeg");
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe("image/png");
    expect(sniffMime(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffMime(Buffer.from("\0\0\0\x18ftypheic\0\0"))).toBe("image/heic");
    expect(sniffMime(Buffer.from("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffMime(Buffer.from("MZ\x90\0\x03\0\0\0\x04\0\0\0"))).toBeNull();
  });

  it("cleans file names", () => {
    expect(cleanFileName("..\\..\\etc/passwd", "application/pdf")).toBe("passwd");
    expect(cleanFileName('račun "okt".pdf', "application/pdf")).toBe("račun okt.pdf");
    expect(cleanFileName("", "image/jpeg")).toBe("datoteka.jpg");
  });

  it("signs and verifies URLs with expiry", () => {
    const now = Date.UTC(2026, 10, 1);
    const url = new URL(signedFileUrl("att1", 60, now), "http://x");
    const exp = url.searchParams.get("exp")!;
    const sig = url.searchParams.get("sig")!;
    expect(verifyFileSignature("att1", exp, sig, now)).toBe(true);
    expect(verifyFileSignature("att2", exp, sig, now)).toBe(false);
    expect(verifyFileSignature("att1", exp, sig, now + 61_000)).toBe(false);
    expect(verifyFileSignature("att1", String(Number(exp) + 100), sig, now)).toBe(false);
  });
});
