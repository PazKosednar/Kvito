import { fileURLToPath } from "node:url";

/** CGP colors (Kamen) for print. */
export const C = { ink: "#121212", muted: "#55514a", faint: "#66625a", line: "#d6d2ca", accent: "#0a7a45", signal: "#38e08c", sunken: "#e4e1da" };
export const FONTS = fileURLToPath(new URL("../../assets/fonts/", import.meta.url));


/** The official mark + wordmark (assets/Logos), drawn as vectors so the PDF stays sharp. */
export function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, h: number) {
  const s = h / 48;
  doc.save().translate(x, y).scale(s);
  doc.path("M4 0 H34 L48 14 V44 A4 4 0 0 1 44 48 H4 A4 4 0 0 1 0 44 V4 A4 4 0 0 1 4 0 Z").fill(C.ink);
  // Open polyline (polygon() would close the path into a triangle).
  doc.moveTo(12, 25).lineTo(20, 33).lineTo(33, 18).lineWidth(7).lineCap("square").lineJoin("miter").stroke(C.signal);
  doc.translate(64, 4).fillColor(C.ink);
  doc.rect(0, 0, 8, 40).fill();
  doc.polygon([8, 13], [19, 0], [30, 0], [8, 25]).fill();
  doc.polygon([12, 19], [30, 40], [20, 40], [7, 25]).fill();
  doc.polygon([36, 0], [45, 0], [52, 28], [59, 0], [68, 0], [57, 40], [47, 40]).fill();
  doc.rect(74, 0, 8, 40).fill();
  doc.rect(88, 0, 30, 8).fill();
  doc.rect(99, 0, 8, 40).fill();
  // O: a square ring, like the I and T.
  doc.path("M124 0H156V40H124Z M132 8V32H148V8Z").fill("even-odd");
  doc.restore();
}

/** Registers the Geist fonts used in every Kvito PDF. */
export function registerFonts(doc: PDFKit.PDFDocument): void {
  doc.registerFont("sans", `${FONTS}Geist-Regular.ttf`);
  doc.registerFont("sans-semibold", `${FONTS}Geist-SemiBold.ttf`);
  doc.registerFont("mono", `${FONTS}GeistMono-Regular.ttf`);
  doc.registerFont("mono-medium", `${FONTS}GeistMono-Medium.ttf`);
}
