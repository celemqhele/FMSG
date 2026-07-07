import { createClient } from "@supabase/supabase-js";

const VPN_API = process.env.VPN_API;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface VPNCheckResult {
  security?: {
    vpn?: boolean;
    proxy?: boolean;
    tor?: boolean;
    relay?: boolean;
  };
}

const cache = new Map<string, { result: boolean; ttl: number }>();

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

async function readCache(ip: string): Promise<boolean | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data } = await supabase
    .from("vpn_cache")
    .select("is_suspicious, checked_at")
    .eq("ip", ip)
    .maybeSingle();

  if (!data) return null;

  const age = Date.now() - new Date(data.checked_at).getTime();
  if (age > 86_400_000) return null; // stale

  return data.is_suspicious;
}

async function writeCache(ip: string, isSuspicious: boolean): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  supabase
    .from("vpn_cache")
    .upsert({ ip, is_suspicious: isSuspicious, checked_at: new Date().toISOString() })
    .then(({ error }) => {
      if (error) console.error("[VPN] Supabase cache write failed:", error.message);
    });
}

export async function checkVPN(ip: string): Promise<{ isSuspicious: boolean }> {
  if (!VPN_API) {
    console.error("[VPN] VPN_API not set — allowing by default");
    return { isSuspicious: false };
  }

  const cached = cache.get(ip);
  if (cached && cached.ttl > Date.now()) {
    return { isSuspicious: cached.result };
  }

  const dbResult = await readCache(ip);
  if (dbResult !== null) {
    cache.set(ip, { result: dbResult, ttl: Date.now() + 86_400_000 });
    return { isSuspicious: dbResult };
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
    writeCache(ip, isSuspicious);

    return { isSuspicious };
  } catch (err) {
    console.error("[VPN] Error:", err);
    return { isSuspicious: false };
  }
}
