import dns from "node:dns/promises";

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/,
  /^fd00:/,
  /^fe80:/,
];

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".internal") || h.endsWith(".local")) return true;
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(h)) return true;
  }
  return false;
}

export function validateScrapeUrl(urlString: string): { ok: boolean; reason?: string } {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return { ok: false, reason: `Blocked protocol: ${url.protocol}` };
  }

  if (isPrivateHost(url.hostname)) {
    return { ok: false, reason: `Blocked private/internal host: ${url.hostname}` };
  }

  return { ok: true };
}

export async function validateScrapeUrlWithDns(urlString: string): Promise<{ ok: boolean; reason?: string }> {
  const basic = validateScrapeUrl(urlString);
  if (!basic.ok) return basic;

  const hostname = new URL(urlString).hostname;
  try {
    const addresses = await dns.resolve4(hostname);
    for (const addr of addresses) {
      if (isPrivateHost(addr)) {
        return { ok: false, reason: `Hostname ${hostname} resolves to private IP ${addr}` };
      }
    }
  } catch {
    return { ok: false, reason: "DNS resolution failed" };
  }

  return { ok: true };
}
