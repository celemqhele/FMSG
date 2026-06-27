const MAILTRAP_API = process.env.MAILTRAP_API;
const DEFAULT_FROM = { email: "hello@findmesomejobs.co.za", name: "FMSG" };

async function mailtrapSend(body: Record<string, unknown>) {
  if (!MAILTRAP_API) {
    console.warn("[MAILTRAP] MAILTRAP_API not set — email sending unavailable");
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

function verificationHTML(code: string) {
  return `
    <div style="background:#0A0A0A;padding:48px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
      <div style="max-width:480px;margin:0 auto">
        <div style="background:linear-gradient(135deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 40%,rgba(255,255,255,0.04) 70%,transparent 100%);padding:1px;border-radius:14px">
          <div style="background:#1C1C1E;border-radius:13px;padding:36px 32px;border:1px solid rgba(255,255,255,0.06);box-shadow:inset 0 1px 0 rgba(255,255,255,0.04),0 4px 24px rgba(0,0,0,0.3)">
            <p style="font-size:18px;font-weight:600;color:#F5F5F7;margin:0 0 28px;letter-spacing:-0.01em">Find Me Some Jobs</p>
            <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 8px">Verify your email</p>
            <p style="font-size:15px;line-height:1.6;color:#E4E4E4;margin:0 0 28px">Use the code below to verify your email and unlock job search on FMSG.</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="background-color:#2C2C2E;border-radius:12px;padding:20px 16px;">
                  <span style="font-family:'SF Mono','Cascadia Code','Consolas',monospace;font-size:32px;font-weight:700;color:#0071E3;letter-spacing:8px;">${code}</span>
                </td>
              </tr>
            </table>
            <p style="font-size:12px;color:#8E8E93;text-align:center;margin:16px 0 0">This code expires in 15 minutes. If you didn't create an account on FMSG, ignore this email.</p>
            <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.06)">
              <p style="font-size:12px;color:#8E8E93;line-height:1.6;margin:0">Find Me Some Jobs &middot; South Africa</p>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function deletionHTML(code: string) {
  return `
    <div style="background:#0A0A0A;padding:48px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
      <div style="max-width:480px;margin:0 auto">
        <div style="background:linear-gradient(135deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 40%,rgba(255,255,255,0.04) 70%,transparent 100%);padding:1px;border-radius:14px">
          <div style="background:#1C1C1E;border-radius:13px;padding:36px 32px;border:1px solid rgba(255,255,255,0.06);box-shadow:inset 0 1px 0 rgba(255,255,255,0.04),0 4px 24px rgba(0,0,0,0.3)">
            <p style="font-size:18px;font-weight:600;color:#FF3B30;margin:0 0 28px;letter-spacing:-0.01em">Account Deletion Requested</p>
            <p style="font-size:15px;line-height:1.6;color:#E4E4E4;margin:0 0 28px">A request to permanently delete your FMSG account has been made. Use the code below to confirm. <strong style="color:#F5F5F7">This cannot be undone.</strong></p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="background-color:#2C2C2E;border-radius:12px;border:1px solid #FF3B30;padding:20px 16px;">
                  <span style="font-family:'SF Mono','Cascadia Code','Consolas',monospace;font-size:32px;font-weight:700;color:#FF3B30;letter-spacing:8px;">${code}</span>
                </td>
              </tr>
            </table>
            <p style="font-size:12px;color:#8E8E93;text-align:center;margin:16px 0 0">This code expires in 15 minutes. If you did not request this, your account may be compromised &mdash; change your password immediately.</p>
            <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.06)">
              <p style="font-size:12px;color:#8E8E93;line-height:1.6;margin:0">Find Me Some Jobs &middot; South Africa</p>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

export async function sendVerificationEmail(to: string, code: string) {
  const res = await mailtrapSend({
    from: DEFAULT_FROM,
    to: [{ email: to }],
    subject: "Verify your email — FMSG",
    html: verificationHTML(code),
    category: "Verification",
  });

  if (res.ok) console.log("[MAILTRAP] Sent verification to", to);
  return res;
}

export async function sendDeletionCodeEmail(to: string, code: string) {
  const res = await mailtrapSend({
    from: DEFAULT_FROM,
    to: [{ email: to }],
    subject: "Account Deletion Request — FMSG",
    html: deletionHTML(code),
    category: "Account Deletion",
  });

  if (res.ok) console.log("[MAILTRAP] Sent deletion code to", to);
  return res;
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
    html: [
      "<div style='font-family:sans-serif;padding:16px'>",
      "<h2 style='color:#FF3B30'>Account Disabled Appeal</h2>",
      `<p><strong>User Email:</strong> ${userEmail}</p>`,
      `<p><strong>User ID:</strong> ${userId}</p>`,
      `<p><strong>IP:</strong> ${ip}</p>`,
      `<p><strong>Reason:</strong></p>`,
      `<p style='white-space:pre-wrap'>${reason}</p>`,
      "</div>",
    ].join("\n"),
  });
}
