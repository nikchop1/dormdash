import "server-only";
import { dbMode, env } from "@/lib/env";
import { q } from "@/lib/db";

// Branded, table-free email layout. Colors mirror DESIGN.md tokens (email clients
// can't read CSS variables, so they're repeated here on purpose).
const C = { paper: "#F4EFE6", ink: "#1B1A17", ink2: "#57524A", line: "#D9D0C1", accent: "#EFB21C" };

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function layout(opts: { heading: string; body: string[]; cta?: { label: string; url: string }; footnote?: string }) {
  const paras = opts.body.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:24px;color:${C.ink}">${esc(p)}</p>`).join("");
  const cta = opts.cta
    ? `<p style="margin:24px 0"><a href="${esc(opts.cta.url)}" style="display:inline-block;background:${C.accent};color:${C.ink};font-weight:700;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:16px">${esc(opts.cta.label)}</a></p>
       <p style="margin:0 0 14px;font-size:13px;line-height:20px;color:${C.ink2}">Button not working? Paste this into your browser:<br><span style="word-break:break-all">${esc(opts.cta.url)}</span></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:${C.paper};font-family:'IBM Plex Sans',Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
  <div style="font-weight:800;font-size:20px;letter-spacing:.02em;color:${C.ink};border-bottom:2px solid ${C.ink};padding-bottom:12px;margin-bottom:24px">DORMDASH<span style="color:${C.ink2};font-weight:400"> · NYU</span></div>
  <h1 style="margin:0 0 16px;font-size:26px;line-height:30px;color:${C.ink}">${esc(opts.heading)}</h1>
  ${paras}${cta}
  <p style="margin:32px 0 0;padding-top:16px;border-top:1px solid ${C.line};font-size:12px;line-height:18px;color:${C.ink2}">${esc(opts.footnote ?? "You're getting this because you have a Dormdash account. Questions? Just reply.")}</p>
</div></body></html>`;
  const text = [opts.heading, "", ...opts.body, ...(opts.cta ? ["", `${opts.cta.label}: ${opts.cta.url}`] : [])].join("\n");
  return { html, text };
}

export const templates = {
  verify: (url: string) => ({
    subject: "Confirm your Dormdash email",
    ...layout({
      heading: "One tap and you're in.",
      body: ["Confirm this is your NYU email so you can start ordering (or running)."],
      cta: { label: "Confirm email", url },
      footnote: "Didn't sign up for Dormdash? Ignore this and nothing happens. The link expires in 24 hours.",
    }),
  }),
  reset: (url: string) => ({
    subject: "Reset your Dormdash password",
    ...layout({
      heading: "Forgot it? Happens.",
      body: ["Tap below to pick a new password. The link works once and expires in 1 hour."],
      cta: { label: "Set a new password", url },
      footnote: "Didn't ask for this? Your password hasn't changed. You can ignore this email.",
    }),
  }),
  emailChange: (url: string, newEmail: string) => ({
    subject: "Confirm your new Dormdash email",
    ...layout({
      heading: "New email, who dis?",
      body: [`Confirm ${newEmail} as the email on your Dormdash account.`],
      cta: { label: "Confirm new email", url },
      footnote: "If you didn't request this, ignore it. Your email stays the same.",
    }),
  }),
  runnerDecision: (approved: boolean, note: string | null) => ({
    subject: approved ? "You're a Dormdash runner" : "About your Dormdash runner application",
    ...layout({
      heading: approved ? "You're in. Grab a shift." : "Not this time.",
      body: approved
        ? [
            "Your runner application was approved.",
            "Add your PayPal email for payouts, pick a few shifts, then flip on-shift when you're ready to run.",
            ...(note ? [`Note from the team: ${note}`] : []),
          ]
        : [
            "We couldn't approve your runner application right now.",
            ...(note ? [`Why: ${note}`] : []),
            "You can still order like normal. Reply to this email if you think we got it wrong.",
          ],
      cta: { label: approved ? "Open the runner tab" : "Open Dormdash", url: `${env.siteUrl}/run` },
    }),
  }),
  disputeOutcome: (opts: { code: string; outcome: string; note: string; forRunner: boolean }) => ({
    subject: `Problem report for order ${opts.code}: resolved`,
    ...layout({
      heading: "We looked into it.",
      body: [
        opts.forRunner
          ? `A customer reported a problem with order ${opts.code}. Here's what we decided.`
          : `Thanks for reporting the problem with order ${opts.code}. Here's what we decided.`,
        `Outcome: ${opts.outcome}`,
        ...(opts.note ? [`Note: ${opts.note}`] : []),
      ],
      cta: { label: "View order", url: `${env.siteUrl}/${opts.forRunner ? "run/jobs" : "orders"}` },
    }),
  }),
  notification: (title: string, body: string, url: string | null) => ({
    subject: title,
    ...layout({ heading: title, body: [body], cta: url ? { label: "Open Dormdash", url: env.siteUrl + url } : undefined }),
  }),
};

export type Email = { to: string; subject: string; html: string; text: string };

/**
 * Send via Resend when RESEND_API_KEY is set. Otherwise log to the console and, in
 * local mode, store in the dev outbox (visible at /dev/outbox) so links can be clicked.
 */
export async function sendEmail(mail: Email): Promise<void> {
  if (env.resendApiKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
    });
    if (!res.ok) console.error(`[email] Resend failed (${res.status}): ${await res.text()}`);
    return;
  }
  console.info(`\n[email] to=${mail.to} subject="${mail.subject}"\n${mail.text}\n`);
  if (dbMode === "pglite") {
    await q("insert into local.outbox (to_email, subject, html, text) values ($1, $2, $3, $4)", [
      mail.to,
      mail.subject,
      mail.html,
      mail.text,
    ]);
  }
}
