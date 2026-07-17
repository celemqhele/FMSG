import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { extractTextFromDOCX } from "./docx";

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const msg = String(args[0] ?? "");
    if (/^TT:/i.test(msg) || msg.includes("TT:")) return;
    origWarn(...args);
  };
  try {
    const data = await pdfParse(buffer);
    return data.text;
  } finally {
    console.warn = origWarn;
  }
}

export async function extractText(buffer: Buffer, filename?: string): Promise<string> {
  const isDocx = filename?.toLowerCase().endsWith(".docx");
  if (isDocx) {
    try {
      return await extractTextFromDOCX(buffer);
    } catch {
      return "";
    }
  }
  return extractTextFromPDF(buffer);
}
