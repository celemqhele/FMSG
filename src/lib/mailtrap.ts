const MAILTRAP_API = process.env.MAILTRAP_API;
const VERIFY_TEMPLATE_UUID = "04c4e962-fb93-467e-a3d2-cc17139f9b15";

export async function sendVerificationEmail(to: string, code: string) {
  if (!MAILTRAP_API) {
    console.error("[MAILTRAP] MAILTRAP_API not set");
    return { ok: false, error: "Email service not configured" };
  }

  try {
    // Try template-based email first
    const res = await fetch("https://send.api.mailtrap.io/api/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MAILTRAP_API}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { email: "hello@findmesomejobs.co.za", name: "FMSG" },
        to: [{ email: to }],
        template_uuid: VERIFY_TEMPLATE_UUID,
        template_variables: { code },
        category: "Verification",
      }),
    });

    if (res.ok) {
      console.log("[MAILTRAP] Sent template email to", to);
      return { ok: true };
    }

    console.warn("[MAILTRAP] Template failed (status", res.status, "), falling back to plain text");

    // Fallback: plain text email
    const fallbackRes = await fetch("https://send.api.mailtrap.io/api/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MAILTRAP_API}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { email: "hello@findmesomejobs.co.za", name: "FMSG" },
        to: [{ email: to }],
        subject: "Verify your email — FMSG",
        text: `Your verification code is: ${code}\n\nEnter this code on the FMSG dashboard to unlock job search.\n\nIf you didn't create an account, ignore this email.`,
        category: "Verification",
      }),
    });

    if (!fallbackRes.ok) {
      const text = await fallbackRes.text();
      console.error("[MAILTRAP] Plain text also failed:", fallbackRes.status, text);
      return { ok: false, error: "Failed to send email" };
    }

    console.log("[MAILTRAP] Sent plain text email to", to);
    return { ok: true };
  } catch (err) {
    console.error("[MAILTRAP] Error:", err);
    return { ok: false, error: "Email service error" };
  }
}

export async function sendAppealEmail(userEmail: string, userId: string, ip: string, reason: string) {
  const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (!MAILTRAP_API || !ADMIN_EMAIL) {
    console.error("[MAILTRAP] MAILTRAP_API or NEXT_PUBLIC_ADMIN_EMAIL not set");
    return { ok: false, error: "Email service not configured" };
  }

  try {
    const res = await fetch("https://send.api.mailtrap.io/api/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MAILTRAP_API}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { email: "appeals@fmsg.co.za", name: "FMSG Appeals" },
        to: [{ email: ADMIN_EMAIL }],
        subject: `Account Appeal — ${userEmail}`,
        text: [
          "Account Disabled Appeal",
          "",
          `User Email: ${userEmail}`,
          `User ID: ${userId}`,
          `IP: ${ip}`,
          "",
          `Reason for appeal:`,
          reason,
        ].join("\n"),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[MAILTRAP] Appeal send failed:", res.status, text);
      return { ok: false, error: "Failed to send appeal" };
    }

    return { ok: true };
  } catch (err) {
    console.error("[MAILTRAP] Appeal error:", err);
    return { ok: false, error: "Email service error" };
  }
}
