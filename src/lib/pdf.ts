export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const pdf = require("pdf-parse/lib/pdf-parse.js");
  const data = await pdf(buffer);
  return data.text;
}
