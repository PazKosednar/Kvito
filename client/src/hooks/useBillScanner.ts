import { useCallback, useState } from "react";
import { decodeUpnBytes, parseUpnText, type ScannedBill } from "@/lib/upn";

type ScanState = "idle" | "scanning" | "found" | "notFound";

/**
 * Finds a UPN QR code on a bill (photo or PDF) in the browser – nothing is sent anywhere for this.
 * PDFs are rendered with pdf.js, loaded only when needed.
 */
export function useBillScanner() {
  const [state, setState] = useState<ScanState>("idle");

  const scan = useCallback(async (file: File): Promise<ScannedBill | null> => {
    setState("scanning");
    try {
      const canvases = file.type === "application/pdf" ? await renderPdf(file) : [await renderImage(file)];
      for (const canvas of canvases) {
        const bill = await findUpn(canvas);
        if (bill) {
          setState("found");
          return bill;
        }
      }
      setState("notFound");
      return null;
    } catch {
      setState("notFound");
      return null;
    }
  }, []);

  return { state, scan, reset: () => setState("idle") };
}

async function findUpn(canvas: HTMLCanvasElement): Promise<ScannedBill | null> {
  const { default: jsQR } = await import("jsqr");
  // Try the whole page first, then the lower half (where UPN slips usually are) at a higher zoom.
  const regions: [number, number, number, number][] = [
    [0, 0, canvas.width, canvas.height],
    [0, canvas.height / 2, canvas.width, canvas.height / 2],
    [canvas.width / 2, canvas.height / 2, canvas.width / 2, canvas.height / 2],
  ];
  for (const [x, y, w, h] of regions) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const data = ctx.getImageData(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
    const code = jsQR(data.data, data.width, data.height, { inversionAttempts: "attemptBoth" });
    if (code) {
      const bill = parseUpnText(decodeUpnBytes(code.binaryData));
      if (bill) return bill;
    }
  }
  return null;
}

async function renderImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function renderPdf(file: File): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: HTMLCanvasElement[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, 2); n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 3 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
    pages.push(canvas);
  }
  return pages;
}
