const VPN_API = process.env.VPN_API;

interface VPNCheckResult {
  security?: {
    vpn?: boolean;
    proxy?: boolean;
    tor?: boolean;
    relay?: boolean;
  };
}

const cache = new Map<string, { result: boolean; ttl: number }>();

export async function checkVPN(ip: string): Promise<{ isSuspicious: boolean }> {
  if (!VPN_API) {
    console.error("[VPN] VPN_API not set — allowing by default");
    return { isSuspicious: false };
  }

  const cached = cache.get(ip);
  if (cached && cached.ttl > Date.now()) {
    return { isSuspicious: cached.result };
  }

  try {
    const res = await fetch(`https://vpnapi.io/api/${ip}?key=${VPN_API}`, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.error("[VPN] API error:", res.status);
      return { isSuspicious: false };
    }

    const data: VPNCheckResult = await res.json();
    const sec = data.security ?? {};
    const isSuspicious = !!(sec.vpn || sec.proxy || sec.tor || sec.relay);

    cache.set(ip, { result: isSuspicious, ttl: Date.now() + 86_400_000 });

    return { isSuspicious };
  } catch (err) {
    console.error("[VPN] Error:", err);
    return { isSuspicious: false };
  }
}
