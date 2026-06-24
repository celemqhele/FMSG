import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = "Find Me Some Jobs <noreply@findmesomejobs.co.za>";

let resend: Resend | null = null;

function getResend(): Resend | null {
  if (!RESEND_API_KEY) return null;
  if (!resend) resend = new Resend(RESEND_API_KEY);
  return resend;
}

function brandHTML(content: string) {
  return `
    <div style="background:#0a0a0a;color:#e4e4e4;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:40px 16px">
      <div style="max-width:480px;margin:0 auto;background:#1a1a1a;border-radius:12px;padding:32px;border:1px solid #2a2a2a">
        <p style="font-size:18px;font-weight:600;color:#fff;margin:0 0 24px">Find Me Some Jobs</p>
        ${content}
        <hr style="border-color:#2a2a2a;margin:24px 0" />
        <p style="font-size:12px;color:#666">Find Me Some Jobs &middot; South Africa<br />This is a transactional email related to your account.</p>
      </div>
    </div>`;
}

export async function sendWelcomeEmail(to: string, name?: string) {
  const r = getResend();
  if (!r) return;
  const greeting = name ? `Hi ${name.split(" ")[0]},` : "Hi,";
  await r.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Welcome to Find Me Some Jobs",
    html: brandHTML(`
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${greeting}</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Your account is all set up. Upload your CV and start finding jobs that match your skills.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">You get <strong>1 free search</strong> to try it out. Paid plans unlock more searches, CV generations, and Persistent Finder rounds.</p>
      <a href="https://findmesomejobs.co.za/dashboard" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:500">Go to Dashboard</a>
    `),
  });
}

export async function sendSubscriptionConfirmation(to: string, plan: string, billingCycle: string, amount: string) {
  const r = getResend();
  if (!r) return;
  const cycleLabel = billingCycle === "annual" ? "year" : "month";
  await r.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Your ${plan} plan is active`,
    html: brandHTML(`
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Thanks for subscribing to the <strong>${plan}</strong> plan.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">You're now billed <strong>${amount}</strong> per ${cycleLabel}. Access your new limits immediately.</p>
      <a href="https://findmesomejobs.co.za/dashboard" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:500">Start Searching</a>
      <p style="font-size:12px;color:#666;margin:16px 0 0">Reference will appear on your statement as "FMSG" or "Find Me Some Jobs".</p>
    `),
  });
}

export async function sendPaymentFailed(to: string, plan: string) {
  const r = getResend();
  if (!r) return;
  await r.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Your payment did not go through",
    html: brandHTML(`
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">We were unable to process your payment for the <strong>${plan}</strong> plan.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">This could be due to insufficient funds, an expired card, or your bank declining the transaction. Don't worry, we'll retry automatically.</p>
      <a href="https://findmesomejobs.co.za/upgrade" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:500">Update Payment Method</a>
      <p style="font-size:12px;color:#666;margin:16px 0 0">Your access continues until the end of your current billing period.</p>
    `),
  });
}

export async function sendSubscriptionRenewed(to: string, plan: string, amount: string) {
  const r = getResend();
  if (!r) return;
  await r.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Your ${plan} plan has been renewed`,
    html: brandHTML(`
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Your <strong>${plan}</strong> plan has been renewed for <strong>${amount}</strong>.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Your search and CV generation balances have been reset for the new billing period. No action is needed from you.</p>
      <a href="https://findmesomejobs.co.za/dashboard" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:500">Go to Dashboard</a>
    `),
  });
}

export async function sendSubscriptionCancelled(to: string, plan: string) {
  const r = getResend();
  if (!r) return;
  await r.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Your ${plan} subscription has been cancelled`,
    html: brandHTML(`
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Your <strong>${plan}</strong> subscription has been cancelled.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">You'll retain access to your current plan features until the end of the billing period. After that, your account will switch to the Free tier.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">You can resubscribe at any time. We'd love to know what we could do better — just reply to this email.</p>
    `),
  });
}

export async function sendPFReceipt(to: string, runs: number, amount: string) {
  const r = getResend();
  if (!r) return;
  await r.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Receipt: ${runs} Persistent Finder runs`,
    html: brandHTML(`
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Here's your receipt for your Persistent Finder credit purchase.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px 0;font-size:14px;color:#999">Item</td><td style="padding:8px 0;text-align:right;font-size:14px">${runs} Persistent Finder runs</td></tr>
        <tr style="border-top:1px solid #2a2a2a"><td style="padding:8px 0;font-size:14px;font-weight:600">Total</td><td style="padding:8px 0;text-align:right;font-size:14px;font-weight:600">${amount}</td></tr>
      </table>
      <p style="font-size:12px;color:#666;margin:16px 0 0">Charge will appear on your statement as "FMSG".</p>
    `),
  });
}

export async function sendAccountDeleted(to: string) {
  const r = getResend();
  if (!r) return;
  await r.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Your account has been deleted",
    html: brandHTML(`
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Your Find Me Some Jobs account and all associated data have been permanently deleted.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">If this was a mistake, you can create a new account at any time. We'll be here.</p>
    `),
  });
}
