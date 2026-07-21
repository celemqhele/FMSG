import crypto from "node:crypto";

export function signContinuationToken(payload: any, secret: string): string {
  const data = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", secret).update(data).digest("base64");
  return Buffer.from(JSON.stringify({ data, signature })).toString("base64");
}

export function verifyAndDecodeContinuationToken(token: string, secret: string): any {
  try {
    const raw = Buffer.from(token, "base64").toString();
    const { data, signature } = JSON.parse(raw);
    const expectedSignature = crypto.createHmac("sha256", secret).update(data).digest("base64");
    if (signature !== expectedSignature) {
      throw new Error("Continuation token signature mismatch");
    }
    return JSON.parse(data);
  } catch (err) {
    throw new Error("Invalid or tampered continuation token");
  }
}
