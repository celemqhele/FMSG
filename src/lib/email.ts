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

function subtleBtn(label: string, href: string) {
  return `<div style="margin:28px 0 8px"><a href="${href}" style="display:inline-block;background:rgba(255,255,255,0.08);color:#F5F5F7;text-decoration:none;padding:12px 32px;border-radius:10px;font-size:14px;font-weight:600;border:1px solid rgba(255,255,255,0.10);box-shadow:0 1px 0 rgba(255,255,255,0.03) inset,0 2px 8px rgba(0,0,0,0.3)">${label}</a></div>`;
}

function p(text: string) {
  return `<p style="font-size:15px;line-height:1.6;color:#E4E4E4;margin:0 0 16px">${text}</p>`;
}

// ── Public functions ─────────────────────────────────────────────

export async function sendWelcomeEmail(to: string, name?: string) {
  const greeting = name ? `Hi ${name.split(" ")[0]},` : "Hi,";
  const subject = "Welcome to Find Me Some Jobs";
  const html = wrap(`
    <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">${greeting}</p>
    ${p("Your account is all set up. Upload your CV and start finding jobs that match your skills.")}
    ${p("You get <strong style=\"color:#F5F5F7\">1 free search</strong> to try it out. Paid plans unlock more searches, CV generations, and Persistent Finder rounds.")}
    ${btn("Go to Dashboard", "https://findmesomejobs.co.za/dashboard")}
  `);
  await sendEmail(to, subject, html, "welcome");
}

export async function sendSubscriptionConfirmation(to: string, plan: string, billingCycle: string, amount: string) {
  const cycleLabel = billingCycle === "annual" ? "year" : "month";
  const subject = `Your ${plan} plan is active`;
  const html = wrap(`
    <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Thanks for subscribing to the <strong style="color:#fff">${plan}</strong> plan.</p>
    ${p(`You're now billed <strong style="color:#F5F5F7">${amount}</strong> per ${cycleLabel}. Access your new limits immediately.`)}
    ${btn("Start Searching", "https://findmesomejobs.co.za/dashboard")}
    <p style="font-size:12px;color:#8E8E93;margin:12px 0 0">Reference will appear on your statement as "FMSG" or "Find Me Some Jobs".</p>
  `);
  await sendEmail(to, subject, html, "subscription");
}

export async function sendPaymentFailed(to: string, plan: string) {
  const subject = "Your payment did not go through";
  const html = wrap(`
    <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">We were unable to process your payment for the <strong style="color:#fff">${plan}</strong> plan.</p>
    ${p("This could be due to insufficient funds, an expired card, or your bank declining the transaction. Don't worry — we'll retry automatically.")}
    ${btn("Update Payment Method", "https://findmesomejobs.co.za/upgrade")}
    <p style="font-size:12px;color:#8E8E93;margin:12px 0 0">Your access continues until the end of your current billing period.</p>
  `);
  await sendEmail(to, subject, html, "payment-failed");
}

export async function sendSubscriptionRenewed(to: string, plan: string, amount: string) {
  const subject = `Your ${plan} plan has been renewed`;
  const html = wrap(`
    <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Your <strong style="color:#fff">${plan}</strong> plan has been renewed for <strong style="color:#F5F5F7">${amount}</strong>.</p>
    ${p("Your search and CV generation balances have been reset for the new billing period. No action is needed from you.")}
    ${subtleBtn("Go to Dashboard", "https://findmesomejobs.co.za/dashboard")}
  `);
  await sendEmail(to, subject, html, "renewal");
}

export async function sendSubscriptionCancelled(to: string, plan: string) {
  const subject = `Your ${plan} subscription has been cancelled`;
  const html = wrap(`
    <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Your <strong style="color:#fff">${plan}</strong> subscription has been cancelled.</p>
    ${p("You'll retain access to your current plan features until the end of the billing period. After that, your account will switch to the Free tier.")}
    ${p("You can resubscribe at any time. We'd love to know what we could do better — just reply to this email.")}
  `);
  await sendEmail(to, subject, html, "cancellation");
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

export async function sendPlanUpgraded(to: string, fromPlan: string, toPlan: string, amount: string) {
  const subject = `Plan upgraded to ${toPlan}`;
  const html = wrap(`
    <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Your plan has been upgraded from <strong style="color:#fff">${fromPlan}</strong> to <strong style="color:#fff">${toPlan}</strong>.</p>
    ${p(`You were charged a prorated amount of <strong style="color:#F5F5F7">${amount}</strong>. Your new limits are available immediately.`)}
    ${btn("Go to Dashboard", "https://findmesomejobs.co.za/dashboard")}
  `);
  await sendEmail(to, subject, html, "plan-upgraded");
}

export async function sendPlanDowngraded(to: string, fromPlan: string, toPlan: string, effectiveDate: string) {
  const subject = "Plan change scheduled";
  const html = wrap(`
    <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Your plan change from <strong style="color:#fff">${fromPlan}</strong> to <strong style="color:#fff">${toPlan}</strong> has been scheduled.</p>
    ${p(`It will take effect on <strong style="color:#F5F5F7">${effectiveDate}</strong>. You'll keep your current plan benefits until then.`)}
    ${subtleBtn("Manage Plan", "https://findmesomejobs.co.za/upgrade")}
  `);
  await sendEmail(to, subject, html, "plan-downgraded");
}

export async function sendAccountDisabled(to: string, reason: string) {
  const subject = "Your account has been disabled";
  const html = wrap(`
    <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Your Find Me Some Jobs account has been disabled.</p>
    ${p(`Reason: <strong style="color:#F5F5F7">${reason}</strong>`)}
    ${p("If you believe this is a mistake, you can submit an appeal from your dashboard.")}
    ${btn("Open Dashboard", "https://findmesomejobs.co.za/dashboard")}
  `);
  await sendEmail(to, subject, html, "account-disabled");
}

export async function sendAccountDeleted(to: string) {
  const subject = "Your account has been deleted";
  const html = wrap(`
    <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Your Find Me Some Jobs account and all associated data have been permanently deleted.</p>
    ${p("If this was a mistake, you can create a new account at any time. We'll be here.")}
  `);
  await sendEmail(to, subject, html, "account-deleted");
}
