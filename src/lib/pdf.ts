export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const pdf = require("pdf-parse/lib/pdf-parse.js");
  const data = await pdf(buffer);
  return data.text;
}
