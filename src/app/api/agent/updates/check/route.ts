import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_DEVICES_PER_IP = 5;

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "127.0.0.1"
  );
}

function hashIp(ip: string): string {
  return crypto
    .createHash("sha256")
    .update(`fmsg-dev-ip:${ip}`)
    .digest("hex")
    .slice(0, 24);
}

function verifyDeviceEd25519(
  challenge: string,
  signatureBase64: string,
  signPublicKeyPem: string
): boolean {
  try {
    return crypto.verify(
      null,
      Buffer.from(challenge, "utf8"),
      signPublicKeyPem,
      Buffer.from(signatureBase64, "base64")
    );
  } catch {
    return false;
  }
}

function semverToCode(version: string): number {
  const clean = (version || "0.0.0").replace(/^v/i, "").split("-")[0];
  const parts = clean.split(".").map((n) => parseInt(n, 10) || 0);
  return (parts[0] || 0) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
}

function isDeviceInRollout(
  deviceId: string,
  version: string,
  pct: number
): boolean {
  if (pct >= 100) return true;
  if (pct <= 0) return false;
  const hash = crypto
    .createHash("sha256")
    .update(`${deviceId}:${version}`)
    .digest();
  return hash.readUInt16BE(0) % 100 < pct;
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const ipHash = hashIp(ip);

    // 1. Rate-limit per IP
    const ipLimit = checkRateLimit(`agent-update-ip:${ipHash}`, "api");
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { available: false, error: "Too many requests" },
        { status: 429 }
      );
    }

    const body = await request.json();
    const {
      device_id,
      sign_public_key,
      encrypt_public_key,
      current_version,
      channel = "stable",
      challenge,
      signature,
    } = body as {
      device_id?: string;
      sign_public_key?: string;
      encrypt_public_key?: string;
      current_version?: string;
      channel?: "stable" | "beta";
      challenge?: string;
      signature?: string;
    };

    if (
      !device_id ||
      !sign_public_key ||
      !encrypt_public_key ||
      !challenge ||
      !signature
    ) {
      return NextResponse.json(
        { available: false, error: "Invalid request" },
        { status: 400 }
      );
    }

    // 2. Rate-limit per device key
    const devLimit = checkRateLimit(`agent-update-dev:${device_id}`, "api");
    if (!devLimit.allowed) {
      return NextResponse.json(
        { available: false, error: "Too many requests" },
        { status: 429 }
      );
    }

    // 3. Verify Ed25519 challenge signature proving device holds private key
    const sigValid = verifyDeviceEd25519(challenge, signature, sign_public_key);
    if (!sigValid) {
      return NextResponse.json(
        { available: false, error: "Invalid device signature" },
        { status: 401 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 4. Register or verify existing device in public.agent_devices (zero PII stored)
    const { data: existingDevice } = await supabase
      .from("agent_devices")
      .select("device_id, sign_public_key, encrypt_public_key, revoked")
      .eq("device_id", device_id)
      .maybeSingle();

    if (!existingDevice) {
      const { count } = await supabase
        .from("agent_devices")
        .select("device_id", { count: "exact", head: true })
        .eq("ip_hash", ipHash);

      if ((count ?? 0) >= MAX_DEVICES_PER_IP) {
        return NextResponse.json(
          {
            available: false,
            error: "Registration limit reached for this source",
          },
          { status: 429 }
        );
      }

      await supabase.from("agent_devices").insert({
        device_id,
        sign_public_key,
        encrypt_public_key,
        ip_hash: ipHash,
        revoked: false,
      });
    } else {
      if (existingDevice.revoked) {
        return NextResponse.json(
          { available: false, error: "Device revoked" },
          { status: 403 }
        );
      }
      if (existingDevice.sign_public_key.trim() !== sign_public_key.trim()) {
        return NextResponse.json(
          { available: false, error: "Device public key mismatch" },
          { status: 403 }
        );
      }
      await supabase
        .from("agent_devices")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("device_id", device_id);
    }

    // 5. Load signed manifest from Supabase Storage bucket 'agent-updates'
    const safeChannel = channel === "beta" ? "beta" : "stable";
    const { data: manifestBlob, error: manifestErr } = await supabase.storage
      .from("agent-updates")
      .download(`manifest.${safeChannel}.sig.json`);

    if (manifestErr || !manifestBlob) {
      return NextResponse.json({ available: false });
    }

    const manifest = JSON.parse(await manifestBlob.text());

    // 6. Check kill-switch / withdrawn status and rollout bucket
    if (manifest.withdrawn) {
      return NextResponse.json({ available: false });
    }

    if (
      !isDeviceInRollout(
        device_id,
        manifest.version,
        manifest.rollout_percentage ?? 100
      )
    ) {
      return NextResponse.json({ available: false });
    }

    const currentCode = semverToCode(current_version || "0.0.0");
    const targetCode = manifest.version_code || semverToCode(manifest.version);
    if (targetCode <= currentCode && !manifest.allow_downgrade) {
      return NextResponse.json({ available: false });
    }

    // 7. Fetch bundle files from storage and encrypt them specifically for this device's public key
    const filesMap: Record<string, string> = {};
    for (const fileEntry of manifest.files || []) {
      const storagePath = `v${manifest.version}/${fileEntry.path}`;
      const { data: fileBlob, error: fileErr } = await supabase.storage
        .from("agent-updates")
        .download(storagePath);
      if (fileErr || !fileBlob) {
        return NextResponse.json({ available: false });
      }
      const arrayBuf = await fileBlob.arrayBuffer();
      filesMap[fileEntry.path] = Buffer.from(arrayBuf).toString("base64");
    }

    const cek = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const aad = Buffer.from(
      `${device_id}|${manifest.version}|${manifest.signature_ed25519}`,
      "utf8"
    );
    const cipher = crypto.createCipheriv("aes-256-gcm", cek, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(filesMap), "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const wrappedCek = crypto.publicEncrypt(
      {
        key: encrypt_public_key,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      cek
    );

    return NextResponse.json({
      available: true,
      envelope: {
        device_id,
        manifest,
        wrapped_cek_base64: wrappedCek.toString("base64"),
        iv_base64: iv.toString("base64"),
        auth_tag_base64: authTag.toString("base64"),
        ciphertext_base64: ciphertext.toString("base64"),
      },
    });
  } catch {
    return NextResponse.json({ available: false }, { status: 500 });
  }
}
