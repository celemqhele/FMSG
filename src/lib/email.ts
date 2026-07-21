import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAILTRAP_API = process.env.MAILTRAP_API;
const FROM_EMAIL = "Find Me Some Jobs <hello@findmesomejobs.co.za>";
const FROM_MAILTRAP = { email: "hello@findmesomejobs.co.za", name: "FMSG" };

let resend: Resend | null = null;

function getResend(): Resend | null {
  if (!RESEND_API_KEY) { console.warn("[EMAIL] RESEND_API_KEY not set — Resend unavailable"); return null; }
  if (!resend) resend = new Resend(RESEND_API_KEY);
  return resend;
}

async function sendViaMailtrap(to: string, subject: string, html: string, category: string) {
  if (!MAILTRAP_API) { console.warn("[EMAIL] MAILTRAP_API not set — skipping Mailtrap"); return false; }
  try {
    const res = await fetch("https://send.api.mailtrap.io/api/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${MAILTRAP_API}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_MAILTRAP,
        to: [{ email: to }],
        subject,
        html,
        category,
      }),
    });
    if (res.ok) {
      console.log(`[EMAIL] Mailtrap sent to ${to} — ${subject}`);
      return true;
    }
    console.warn(`[EMAIL] Mailtrap failed (${res.status}), falling back to Resend`);
    return false;
  } catch (err) {
    console.error("[EMAIL] Mailtrap error:", err);
    return false;
  }
}

async function sendEmail(to: string, subject: string, html: string, category: string) {
  if (await sendViaMailtrap(to, subject, html, category)) return;

  const r = getResend();
  if (!r) return;
  try {
    await r.emails.send({ from: FROM_EMAIL, to, subject, html });
    console.log(`[EMAIL] Resend sent to ${to} — ${subject}`);
  } catch (err) {
    console.error("[EMAIL] Resend failed:", err);
  }
}

// ── HTML helpers ──────────────────────────────────────────────────

function wrap(content: string) {
  return `
    <div style="background:#0A0A0A;padding:48px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
      <div style="max-width:480px;margin:0 auto">
        <div style="background:linear-gradient(135deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 40%,rgba(255,255,255,0.04) 70%,transparent 100%);padding:1px;border-radius:14px">
          <div style="background:#1C1C1E;border-radius:13px;padding:36px 32px;border:1px solid rgba(255,255,255,0.06);box-shadow:inset 0 1px 0 rgba(255,255,255,0.04),0 4px 24px rgba(0,0,0,0.3)">
            <p style="font-size:18px;font-weight:600;color:#F5F5F7;margin:0 0 28px;letter-spacing:-0.01em">Find Me Some Jobs</p>
            ${content}
            <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.06)">
              <p style="font-size:12px;color:#8E8E93;line-height:1.6;margin:0">Find Me Some Jobs &middot; South Africa<br />This is a transactional email related to your account.</p>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function btn(label: string, href: string) {
  return `<div style="margin:28px 0 8px"><a href="${href}" style="display:inline-block;background:#0071E3;background:linear-gradient(180deg,rgba(255,255,255,0.12) 0%,transparent 100%),#0071E3;color:#fff;text-decoration:none;padding:12px 32px;border-radius:10px;font-size:14px;font-weight:600;border:1px solid rgba(255,255,255,0.12);box-shadow:0 1px 0 rgba(255,255,255,0.06) inset,0 2px 8px rgba(0,113,227,0.25)">${label}</a></div>`;
}

function p(text: string) {
  return `<p style="font-size:15px;line-height:1.6;color:#E4E4E4;margin:0 0 16px">${text}</p>`;
}

// ── Public functions ─────────────────────────────────────────────

export async function sendSubscriptionConfirmation(to: string, plan: string, billingCycle: string, amount: string) {
  const expiryDays = billingCycle === "annual" ? 365 : 30;
  const expiryDate = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
    .toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
  const subject = `Your ${plan} package is ready`;
  const html = wrap(`
    <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Thanks for choosing the <strong style="color:#fff">${plan}</strong> package.</p>
    ${p(`You paid <strong style="color:#F5F5F7">${amount}</strong> once-off, no auto-renewal, no surprises. Your package is active until <strong style="color:#F5F5F7">${expiryDate}</strong>.`)}
    ${p("Come back and top up whenever you need more credits. You only pay when you're actually job hunting.")}
    ${btn("Start Searching", "https://findmesomejobs.co.za/dashboard")}
    <p style="font-size:12px;color:#8E8E93;margin:12px 0 0">Reference will appear on your statement as "FMSG" or "Find Me Some Jobs".</p>
  `);
  await sendEmail(to, subject, html, "subscription");
}

export async function sendPFReceipt(to: string, runs: number, amount: string) {
  const subject = `Receipt: ${runs} Persistent Finder runs`;
  const html = wrap(`
    <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Here's your receipt for your Persistent Finder credit purchase.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0">
      <tr><td style="padding:10px 0;font-size:14px;color:#8E8E93">Item</td><td style="padding:10px 0;text-align:right;font-size:14px;color:#E4E4E4">${runs} Persistent Finder run${runs > 1 ? "s" : ""}</td></tr>
      <tr style="border-top:1px solid rgba(255,255,255,0.06)"><td style="padding:12px 0;font-size:14px;font-weight:600;color:#F5F5F7">Total</td><td style="padding:12px 0;text-align:right;font-size:14px;font-weight:600;color:#F5F5F7">${amount}</td></tr>
    </table>
    <p style="font-size:12px;color:#8E8E93;margin:16px 0 0">Charge will appear on your statement as "FMSG".</p>
  `);
  await sendEmail(to, subject, html, "pf-receipt");
}

export async function sendSearchReceipt(to: string, count: number, amount: string) {
  const subject = `Receipt: ${count} extra search${count > 1 ? "es" : ""}`;
  const html = wrap(`
    <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Here's your receipt for your search credit purchase.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0">
      <tr><td style="padding:10px 0;font-size:14px;color:#8E8E93">Item</td><td style="padding:10px 0;text-align:right;font-size:14px;color:#E4E4E4">${count} search${count > 1 ? "es" : ""}</td></tr>
      <tr style="border-top:1px solid rgba(255,255,255,0.06)"><td style="padding:12px 0;font-size:14px;font-weight:600;color:#F5F5F7">Total</td><td style="padding:12px 0;text-align:right;font-size:14px;font-weight:600;color:#F5F5F7">${amount}</td></tr>
    </table>
    <p style="font-size:12px;color:#8E8E93;margin:16px 0 0">Charge will appear on your statement as "FMSG".</p>
  `);
  await sendEmail(to, subject, html, "search-receipt");
}

export async function sendCVReceipt(to: string, count: number, amount: string) {
  const subject = `Receipt: ${count} CV generation${count > 1 ? "s" : ""}`;
  const html = wrap(`
    <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Here's your receipt for your CV generation credit purchase.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0">
      <tr><td style="padding:10px 0;font-size:14px;color:#8E8E93">Item</td><td style="padding:10px 0;text-align:right;font-size:14px;color:#E4E4E4">${count} CV generation${count > 1 ? "s" : ""}</td></tr>
      <tr style="border-top:1px solid rgba(255,255,255,0.06)"><td style="padding:12px 0;font-size:14px;font-weight:600;color:#F5F5F7">Total</td><td style="padding:12px 0;text-align:right;font-size:14px;font-weight:600;color:#F5F5F7">${amount}</td></tr>
    </table>
    <p style="font-size:12px;color:#8E8E93;margin:16px 0 0">Charge will appear on your statement as "FMSG".</p>
  `);
  await sendEmail(to, subject, html, "cv-receipt");
}

export async function sendPlanUpgraded(to: string, fromPlan: string, toPlan: string, amount: string) {
  const subject = `Package purchased: ${toPlan}`;
  const html = wrap(`
    <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">You've purchased the <strong style="color:#fff">${toPlan}</strong> package.</p>
    ${p(`You were charged <strong style="color:#F5F5F7">${amount}</strong>. Your new credits have been added to your existing balances, nothing is lost.`)}
    ${btn("Go to Dashboard", "https://findmesomejobs.co.za/dashboard")}
  `);
  await sendEmail(to, subject, html, "plan-upgraded");
}

export async function sendPlanExpired(to: string, plan: string) {
  const subject = `Your ${plan} package has expired`;
  const html = wrap(`
    <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Your <strong style="color:#fff">${plan}</strong> package has expired.</p>
    ${p("You're now on the Free tier. Your paid credits have been used up.")}
    ${p("Purchase again whenever you need, only pay when you're actually job hunting. No subscriptions, no surprises.")}
    ${btn("Top Up Now", "https://findmesomejobs.co.za/upgrade")}
  `);
  await sendEmail(to, subject, html, "plan-expired");
}

export async function sendAccountDeleted(to: string) {
  const subject = "Your account has been deleted";
  const html = wrap(`
    <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Your Find Me Some Jobs account and all associated data have been permanently deleted.</p>
    ${p("If this was a mistake, you can create a new account at any time. We'll be here.")}
  `);
  await sendEmail(to, subject, html, "account-deleted");
}
