import { createWorker } from "tesseract.js";
import { createCanvas, DOMMatrix } from "@napi-rs/canvas";

// Polyfill DOMMatrix for pdfjs-dist in Node.js
if (typeof globalThis.DOMMatrix === "undefined") {
  (globalThis as any).DOMMatrix = DOMMatrix;
}

const pdfjsLib = await import("pdfjs-dist");

export async function ocrPdfBuffer(buffer: Buffer): Promise<string> {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const totalPages = Math.min(doc.numPages, 10);
  const worker = await createWorker("eng");
  const texts: string[] = [];

  try {
    for (let i = 1; i <= totalPages; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 2.0 });
      const canvas = createCanvas(vp.width, vp.height);
      const ctx = canvas.getContext("2d");

      await page.render({ canvasContext: ctx as any, viewport: vp, canvas: null as any }).promise;
      const pngBuf = canvas.toBuffer("image/png");

      const { data } = await worker.recognize(pngBuf);
      if (data.text.trim()) texts.push(data.text.trim());
    }
  } finally {
    await worker.terminate();
  }

  return texts.join("\n\n");
}
