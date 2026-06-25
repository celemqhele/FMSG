const MAILTRAP_API = process.env.MAILTRAP_API;
const VERIFY_TEMPLATE_UUID = "04c4e962-fb93-467e-a3d2-cc17139f9b15";
const DEFAULT_FROM = { email: "hello@findmesomejobs.co.za", name: "FMSG" };

async function mailtrapSend(body: Record<string, unknown>) {
  if (!MAILTRAP_API) {
    console.error("[MAILTRAP] MAILTRAP_API not set");
    return { ok: false, error: "Email service not configured" };
  }
  try {
    const res = await fetch("https://send.api.mailtrap.io/api/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${MAILTRAP_API}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[MAILTRAP] Send failed:", res.status, text);
      return { ok: false, error: "Failed to send email" };
    }
    return { ok: true };
  } catch (err) {
    console.error("[MAILTRAP] Error:", err);
    return { ok: false, error: "Email service error" };
  }
}

export async function sendVerificationEmail(to: string, code: string) {
  // Try template first
  const tplRes = await mailtrapSend({
    from: DEFAULT_FROM,
    to: [{ email: to }],
    template_uuid: VERIFY_TEMPLATE_UUID,
    template_variables: { code },
    category: "Verification",
  });

  if (tplRes.ok) {
    console.log("[MAILTRAP] Sent verification template to", to);
    return tplRes;
  }

  console.warn("[MAILTRAP] Verification template failed, falling back to plain text");

  return mailtrapSend({
    from: DEFAULT_FROM,
    to: [{ email: to }],
    subject: "Verify your email — FMSG",
    text: `Your verification code is: ${code}\n\nEnter this code on the FMSG dashboard to unlock job search.\n\nIf you didn't create an account, ignore this email.`,
    category: "Verification",
  });
}

export async function sendAppealEmail(userEmail: string, userId: string, ip: string, reason: string) {
  const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (!ADMIN_EMAIL) {
    console.error("[MAILTRAP] NEXT_PUBLIC_ADMIN_EMAIL not set");
    return { ok: false, error: "Admin email not configured" };
  }

  return mailtrapSend({
    from: { email: "appeals@fmsg.co.za", name: "FMSG Appeals" },
    to: [{ email: ADMIN_EMAIL }],
    subject: `Account Appeal — ${userEmail}`,
    text: [
      "Account Disabled Appeal",
      "",
      `User Email: ${userEmail}`,
      `User ID:   ${userId}`,
      `IP:        ${ip}`,
      "",
      "Reason:",
      reason,
    ].join("\n"),
  });
}
