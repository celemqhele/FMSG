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

function button(label: string, href: string) {
  return `
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:46px;v-text-anchor:middle;width:240px;" arcsize="12%" strokecolor="#0077ED" fill="t">
      <v:fill type="tile" color="#0071E3" />
      <w:anchorlock/>
      <center style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:600;">${label}</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-->
    <div style="margin:28px 0 8px">
      <a href="${href}" style="display:inline-block;background:#0071E3;background:linear-gradient(180deg,rgba(255,255,255,0.12) 0%,transparent 100%),#0071E3;color:#fff;text-decoration:none;padding:12px 32px;border-radius:10px;font-size:14px;font-weight:600;border:1px solid rgba(255,255,255,0.12);box-shadow:0 1px 0 rgba(255,255,255,0.06) inset,0 2px 8px rgba(0,113,227,0.25);">${label}</a>
    </div>
    <!--<![endif]-->`;
}

function subtleButton(label: string, href: string) {
  return `
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:46px;v-text-anchor:middle;width:240px;" arcsize="12%" strokecolor="rgba(255,255,255,0.12)" fill="t">
      <v:fill type="tile" color="#1C1C1E" />
      <w:anchorlock/>
      <center style="color:#F5F5F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:600;">${label}</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-->
    <div style="margin:28px 0 8px">
      <a href="${href}" style="display:inline-block;background:rgba(255,255,255,0.08);color:#F5F5F7;text-decoration:none;padding:12px 32px;border-radius:10px;font-size:14px;font-weight:600;border:1px solid rgba(255,255,255,0.10);box-shadow:0 1px 0 rgba(255,255,255,0.03) inset,0 2px 8px rgba(0,0,0,0.3);">${label}</a>
    </div>
    <!--<![endif]-->`;
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
      <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">${greeting}</p>
      <p style="font-size:15px;line-height:1.6;color:#E4E4E4;margin:0 0 16px">Your account is all set up. Upload your CV and start finding jobs that match your skills.</p>
      <p style="font-size:15px;line-height:1.6;color:#E4E4E4;margin:0 0 16px">You get <strong style="color:#F5F5F7">1 free search</strong> to try it out. Paid plans unlock more searches, CV generations, and Persistent Finder rounds.</p>
      ${button("Go to Dashboard", "https://findmesomejobs.co.za/dashboard")}
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
      <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Thanks for subscribing to the <strong style="color:#fff">${plan}</strong> plan.</p>
      <p style="font-size:15px;line-height:1.6;color:#E4E4E4;margin:0 0 16px">You're now billed <strong style="color:#F5F5F7">${amount}</strong> per ${cycleLabel}. Access your new limits immediately.</p>
      ${button("Start Searching", "https://findmesomejobs.co.za/dashboard")}
      <p style="font-size:12px;color:#8E8E93;margin:12px 0 0">Reference will appear on your statement as "FMSG" or "Find Me Some Jobs".</p>
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
      <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">We were unable to process your payment for the <strong style="color:#fff">${plan}</strong> plan.</p>
      <p style="font-size:15px;line-height:1.6;color:#E4E4E4;margin:0 0 16px">This could be due to insufficient funds, an expired card, or your bank declining the transaction. Don't worry &mdash; we'll retry automatically.</p>
      ${button("Update Payment Method", "https://findmesomejobs.co.za/upgrade")}
      <p style="font-size:12px;color:#8E8E93;margin:12px 0 0">Your access continues until the end of your current billing period.</p>
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
      <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Your <strong style="color:#fff">${plan}</strong> plan has been renewed for <strong style="color:#F5F5F7">${amount}</strong>.</p>
      <p style="font-size:15px;line-height:1.6;color:#E4E4E4;margin:0 0 16px">Your search and CV generation balances have been reset for the new billing period. No action is needed from you.</p>
      ${subtleButton("Go to Dashboard", "https://findmesomejobs.co.za/dashboard")}
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
      <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Your <strong style="color:#fff">${plan}</strong> subscription has been cancelled.</p>
      <p style="font-size:15px;line-height:1.6;color:#E4E4E4;margin:0 0 16px">You'll retain access to your current plan features until the end of the billing period. After that, your account will switch to the Free tier.</p>
      <p style="font-size:15px;line-height:1.6;color:#E4E4E4;margin:0 0 16px">You can resubscribe at any time. We'd love to know what we could do better &mdash; just reply to this email.</p>
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
      <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Here's your receipt for your Persistent Finder credit purchase.</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        <tr><td style="padding:10px 0;font-size:14px;color:#8E8E93">Item</td><td style="padding:10px 0;text-align:right;font-size:14px;color:#E4E4E4">${runs} Persistent Finder runs</td></tr>
        <tr style="border-top:1px solid rgba(255,255,255,0.06)"><td style="padding:12px 0;font-size:14px;font-weight:600;color:#F5F5F7">Total</td><td style="padding:12px 0;text-align:right;font-size:14px;font-weight:600;color:#F5F5F7">${amount}</td></tr>
      </table>
      <p style="font-size:12px;color:#8E8E93;margin:16px 0 0">Charge will appear on your statement as "FMSG".</p>
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
      <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Your Find Me Some Jobs account and all associated data have been permanently deleted.</p>
      <p style="font-size:15px;line-height:1.6;color:#E4E4E4;margin:0 0 16px">If this was a mistake, you can create a new account at any time. We'll be here.</p>
    `),
  });
}

export async function sendPlanUpgraded(to: string, fromPlan: string, toPlan: string, amount: string) {
  const r = getResend();
  if (!r) return;
  await r.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Plan upgraded to ${toPlan}`,
    html: brandHTML(`
      <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Your plan has been upgraded from <strong style="color:#fff">${fromPlan}</strong> to <strong style="color:#fff">${toPlan}</strong>.</p>
      <p style="font-size:15px;line-height:1.6;color:#E4E4E4;margin:0 0 16px">You were charged a prorated amount of <strong style="color:#F5F5F7">${amount}</strong>. Your new limits are available immediately.</p>
      ${button("Go to Dashboard", "https://findmesomejobs.co.za/dashboard")}
    `),
  });
}

export async function sendPlanDowngraded(to: string, fromPlan: string, toPlan: string, effectiveDate: string) {
  const r = getResend();
  if (!r) return;
  await r.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Plan change scheduled",
    html: brandHTML(`
      <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Your plan change from <strong style="color:#fff">${fromPlan}</strong> to <strong style="color:#fff">${toPlan}</strong> has been scheduled.</p>
      <p style="font-size:15px;line-height:1.6;color:#E4E4E4;margin:0 0 16px">It will take effect on <strong style="color:#F5F5F7">${effectiveDate}</strong>. You'll keep your current plan benefits until then.</p>
      ${subtleButton("Manage Plan", "https://findmesomejobs.co.za/upgrade")}
    `),
  });
}

export async function sendAccountDisabled(to: string, reason: string) {
  const r = getResend();
  if (!r) return;
  await r.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Your account has been disabled",
    html: brandHTML(`
      <p style="font-size:15px;line-height:1.6;color:#F5F5F7;margin:0 0 16px">Your Find Me Some Jobs account has been disabled.</p>
      <p style="font-size:15px;line-height:1.6;color:#E4E4E4;margin:0 0 16px">Reason: <strong style="color:#F5F5F7">${reason}</strong></p>
      <p style="font-size:15px;line-height:1.6;color:#E4E4E4;margin:0 0 16px">If you believe this is a mistake, you can submit an appeal from your dashboard.</p>
      ${button("Open Dashboard", "https://findmesomejobs.co.za/dashboard")}
    `),
  });
}
