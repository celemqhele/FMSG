export function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function hashCode(code: string, email: string): Promise<string> {
  const input = `${code}:${email.toLowerCase().trim()}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyCode(input: string, email: string, storedHash: string): Promise<boolean> {
  if (!input || input.length !== 6 || !/^\d{6}$/.test(input)) return false;
  const hash = await hashCode(input, email);
  return hash === storedHash;
}
