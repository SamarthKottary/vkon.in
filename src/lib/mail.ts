import { site } from "@/content/site";

/**
 * Outbound email.
 *
 * **This is the first thing in the codebase that sends mail.** ARCHITECTURE.md
 * §11 and ADMIN.md §7.6–7.7 both record the absence as a real gap with real
 * consequences, and both name the obligations that arrive with a sender: an
 * unsubscribe link in anything bulk, and a confirmation step before an address
 * is trusted. Only the second applies to what is sent here — every message
 * below is transactional, addressed to somebody who just did something on the
 * site, so none of them is bulk and none needs an unsubscribe footer. The
 * mailing list still sends nothing.
 *
 * **Resend, over `fetch`, because SMTP cannot be spoken with `fetch`.** That
 * is the whole reason for the choice: SMTP is a socket protocol and would mean
 * `nodemailer`, the first runtime dependency added to this project since `pg`.
 * Resend's API is one POST with a bearer token, so the dependency policy in
 * §2 stays intact. Any other provider with an HTTP API (Brevo, Postmark,
 * SendGrid) drops into `deliver()` below in about ten lines.
 *
 * **Unconfigured is a supported state, not an error.** With no
 * `RESEND_API_KEY` the message is logged to the server console and reported as
 * sent. Local development therefore needs no account, and a production box
 * that has lost its key keeps taking registrations instead of refusing them —
 * which matters, because *nothing in this file is allowed to fail a user's
 * action*. See the note on `sendMail`'s return type.
 */

const API_URL = "https://api.resend.com/emails";

export type MailResult = { ok: boolean; skipped?: boolean; error?: string };

type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Where a reply goes, for the alerts sent to the business: replying to a new
   * order or enquiry reaches the customer, not `no-reply@`. Customer mail sets
   * none, and stays no-reply as the client asked.
   */
  replyTo?: string;
  /** Overrides `MAIL_FROM` — the new-order alert's own sender. */
  from?: string;
};

function isConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** Whether mail can actually go out. Exported because the sign-in code is the
 *  one message the site cannot carry on without: with no provider there is no
 *  way to deliver a code, so `loginAction` skips the challenge rather than
 *  locking every customer out of an otherwise working shop. */
export function isMailConfigured(): boolean {
  return isConfigured();
}

/**
 * The From address.
 *
 * Must be on a domain verified in the Resend dashboard. Resend's shared
 * `onboarding@resend.dev` sender works without any DNS setup but can only
 * deliver to the account owner's own address, so it is useful for a smoke test
 * and useless in production — the default here is the real domain, and a
 * bounce is a louder, more diagnosable failure than mail that silently only
 * reaches one inbox.
 */
function fromAddress(): string {
  return process.env.MAIL_FROM || `${site.legalName} <no-reply@${site.domain}>`;
}

/**
 * The sender of the new-order alert to the business (client, 2026-09-18):
 * `ORDER_ALERT_FROM`, e.g. `Vkon Automation <nivixsa@vkon.in>`, so the
 * business's own mail rules (a Microsoft 365 rule forwarding orders@ to Teams)
 * can tell it from customer mail, which stays on `MAIL_FROM` (no-reply@).
 * Falls back to `MAIL_FROM` when unset. Must be on the Resend-verified domain.
 */
function orderAlertFromAddress(): string {
  return process.env.ORDER_ALERT_FROM || fromAddress();
}

/**
 * Sends, and never throws.
 *
 * Every caller is in the middle of something that matters more than the mail:
 * a registration, a password reset, an order. A provider outage must not roll
 * back an account that has already been created, so the result is returned for
 * logging and the caller carries on either way. The one place this rule bends
 * is "forgot password", where a mail that did not go out leaves the person
 * stuck — and even there the page says the same thing regardless, so that it
 * cannot be used to test which addresses have accounts.
 */
export async function sendMail(mail: Mail): Promise<MailResult> {
  if (!isConfigured()) {
    console.info(
      `[mail] not configured; would have sent to ${mail.to}: ${mail.subject}\n` +
        `[mail] from: ${mail.from ?? fromAddress()}\n` +
        (mail.replyTo ? `[mail] reply-to: ${mail.replyTo}\n` : "") +
        `[mail] ${mail.text.replace(/\n/g, "\n[mail] ")}`,
    );
    return { ok: true, skipped: true };
  }

  try {
    /* A timeout, because there is no queue behind this: the request the
       customer is waiting on is the one making this call, and a provider that
       hangs would hang the registration with it. */
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: mail.from ?? fromAddress(),
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[mail] ${response.status} sending to ${mail.to}: ${detail}`);
      return { ok: false, error: `${response.status}` };
    }

    return { ok: true };
  } catch (error) {
    console.error("[mail] send failed:", error);
    return { ok: false, error: (error as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Templates
//
// Plain inline-styled HTML with a text alternative for every message. No
// template engine and no external CSS: mail clients strip <style> blocks
// unpredictably, Gmail among them, so inline attributes are the only thing
// that reliably survives. Kept deliberately plain — the recipient is often on
// a mid-range Android phone on a weak connection, and a 40 KB HTML email with
// remote images is worse than a 3 KB one that renders instantly.
// ---------------------------------------------------------------------------

/** Escapes anything interpolated into the HTML bodies below. A customer's own
 *  name reaches these templates, and it is not to be trusted with markup. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const INK = "#14171a";
const BODY = "#454d55";
const ACCENT = "#23703d";
const LINE = "#dde1e5";

function shell(heading: string, inner: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7faf8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7faf8;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};">
<tr><td style="padding:28px 32px 0 32px;">
<p style="margin:0;font:600 20px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};letter-spacing:-0.02em;">${esc(site.name)}<span style="color:${ACCENT};">.</span></p>
<p style="margin:4px 0 0 0;font:500 11px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#5a636c;text-transform:uppercase;letter-spacing:0.08em;">${esc(site.legalName)}</p>
</td></tr>
<tr><td style="padding:24px 32px 32px 32px;">
<h1 style="margin:0 0 16px 0;font:600 22px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};letter-spacing:-0.02em;">${esc(heading)}</h1>
${inner}
</td></tr>
<tr><td style="padding:20px 32px 28px 32px;border-top:1px solid ${LINE};">
<p style="margin:0;font:400 13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#5a636c;">
${esc(site.legalName)} &middot; ${esc(site.phone.display)}<br>
<a href="${site.url}" style="color:${ACCENT};text-decoration:none;">${esc(site.domain)}</a>
</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 14px 0;font:400 15px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${BODY};">${text}</p>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr>
<td style="background:${INK};"><a href="${href}" style="display:inline-block;padding:13px 26px;font:500 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#ffffff;text-decoration:none;">${esc(label)}</a></td>
</tr></table>`;
}

/** The greeting, when a name may or may not have been given. */
function hello(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first ? `Hello ${esc(first)},` : "Hello,";
}

// ---------------------------------------------------------------------------

/**
 * Welcome, with the address-confirmation link.
 *
 * The two are one message rather than two on purpose: a farmer or dealer who
 * has just made an account gets one email, not a welcome followed by a
 * "confirm your email" that reads like a duplicate. Nothing on the site is
 * gated on the confirmation today, so the link is an invitation rather than a
 * wall — which is also why the copy does not threaten to delete the account.
 */
export async function sendWelcomeMail(input: {
  to: string;
  name: string;
  verifyUrl: string | null;
}): Promise<MailResult> {
  const verifyBlock = input.verifyUrl
    ? paragraph("Please confirm this is your address so we can send you order updates:") +
      button(input.verifyUrl, "Confirm my email") +
      paragraph(
        `<span style="color:#5a636c;font-size:13px;">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all;">${esc(input.verifyUrl)}</span><br>The link is good for 48 hours.</span>`,
      )
    : "";

  const html = shell(
    "Your account is ready",
    paragraph(hello(input.name)) +
      paragraph(
        `Thank you for registering with ${esc(site.legalName)}. You can now save delivery addresses and see all your orders in one place.`,
      ) +
      verifyBlock +
      paragraph(
        `Any questions about a panel or a rating, call us on ${esc(site.phone.display)} — we would rather you asked than guessed.`,
      ),
    );

  const text = [
    hello(input.name).replace(/<[^>]+>/g, ""),
    "",
    `Thank you for registering with ${site.legalName}. You can now save delivery addresses and see all your orders in one place.`,
    ...(input.verifyUrl
      ? ["", "Confirm your email address:", input.verifyUrl, "", "The link is good for 48 hours."]
      : []),
    "",
    `Any questions about a panel or a rating, call us on ${site.phone.display}.`,
    "",
    `${site.legalName} · ${site.url}`,
  ].join("\n");

  return sendMail({
    to: input.to,
    subject: `Welcome to ${site.legalName}`,
    html,
    text,
  });
}

export async function sendPasswordResetMail(input: {
  to: string;
  name: string;
  resetUrl: string;
}): Promise<MailResult> {
  const html = shell(
    "Reset your password",
    paragraph(hello(input.name)) +
      paragraph(
        "Somebody asked to reset the password on this account. If that was you, use the button below.",
      ) +
      button(input.resetUrl, "Choose a new password") +
      paragraph(
        `<span style="color:#5a636c;font-size:13px;">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all;">${esc(input.resetUrl)}</span><br>The link is good for one hour and can be used once.</span>`,
      ) +
      paragraph(
        "If this was not you, nothing has changed and you can ignore this email.",
      ),
  );

  const text = [
    hello(input.name).replace(/<[^>]+>/g, ""),
    "",
    "Somebody asked to reset the password on this account. If that was you, open this link:",
    input.resetUrl,
    "",
    "The link is good for one hour and can be used once.",
    "If this was not you, nothing has changed and you can ignore this email.",
    "",
    `${site.legalName} · ${site.url}`,
  ].join("\n");

  return sendMail({
    to: input.to,
    subject: `Reset your ${site.legalName} password`,
    html,
    text,
  });
}

/**
 * The six-digit code that finishes a sign-in on a browser we have not seen
 * this account on before.
 *
 * No link and no button, deliberately: a sign-in code is the one mail where a
 * clickable action would train exactly the habit that phishing depends on. The
 * code is the whole message, big enough to read off a phone at arm's length.
 */
export async function sendSignInCodeMail(input: {
  to: string;
  name: string;
  code: string;
  minutes: number;
}): Promise<MailResult> {
  const html = shell(
    "Your sign-in code",
    paragraph(hello(input.name)) +
      paragraph("Use this code to finish signing in:") +
      `<p style="margin:24px 0;text-align:center;"><span style="display:inline-block;padding:14px 26px;border:1px solid ${LINE};background:#f6f8f9;font:700 32px/1.1 'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;letter-spacing:8px;color:${INK};">${esc(input.code)}</span></p>` +
      paragraph(
        `<span style="color:#5a636c;font-size:13px;">The code is good for ${input.minutes} minutes and can be used once. We will never ask you for it on the phone or by email.</span>`,
      ) +
      paragraph(
        "If you did not just try to sign in, somebody has your password. Change it from your account page, or reply to this email and we will help.",
      ),
  );

  const text = [
    hello(input.name).replace(/<[^>]+>/g, ""),
    "",
    "Use this code to finish signing in:",
    "",
    `    ${input.code}`,
    "",
    `The code is good for ${input.minutes} minutes and can be used once.`,
    "We will never ask you for it on the phone or by email.",
    "",
    "If you did not just try to sign in, somebody has your password.",
    "",
    `${site.legalName} \u00b7 ${site.url}`,
  ].join("\n");

  return sendMail({
    to: input.to,
    subject: `${input.code} is your ${site.legalName} sign-in code`,
    html,
    text,
  });
}

export async function sendOrderPlacedMail(input: {
  to: string;
  name: string;
  orderNumber: string;
  subtotal: string;
  cgst: string;
  sgst: string;
  shipping: string | null;
  total: string;
  lines: { name: string; qty: number; amount: string }[];
  orderUrl: string;
}): Promise<MailResult> {
  const rows = input.lines
    .map(
      (line) =>
        `<tr><td style="padding:9px 0;border-bottom:1px solid ${LINE};font:400 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${BODY};">${esc(line.name)} <span style="color:#5a636c;">&times; ${line.qty}</span></td>
<td align="right" style="padding:9px 0;border-bottom:1px solid ${LINE};font:500 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};white-space:nowrap;">${esc(line.amount)}</td></tr>`,
    )
    .join("");

  const subtotalRow = `<tr><td style="padding:9px 0;border-bottom:1px solid ${LINE};font:400 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${BODY};">Subtotal</td>
<td align="right" style="padding:9px 0;border-bottom:1px solid ${LINE};font:500 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};white-space:nowrap;">${esc(input.subtotal)}</td></tr>`;
  const cgstRow = `<tr><td style="padding:9px 0;border-bottom:1px solid ${LINE};font:400 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${BODY};">CGST 9%</td>
<td align="right" style="padding:9px 0;border-bottom:1px solid ${LINE};font:500 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};white-space:nowrap;">${esc(input.cgst)}</td></tr>`;
  const sgstRow = `<tr><td style="padding:9px 0;border-bottom:1px solid ${LINE};font:400 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${BODY};">SGST 9%</td>
<td align="right" style="padding:9px 0;border-bottom:1px solid ${LINE};font:500 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};white-space:nowrap;">${esc(input.sgst)}</td></tr>`;
  
  const shippingRow = input.shipping
    ? `<tr><td style="padding:9px 0;border-bottom:1px solid ${LINE};font:400 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${BODY};">Delivery</td>
<td align="right" style="padding:9px 0;border-bottom:1px solid ${LINE};font:500 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};white-space:nowrap;">${esc(input.shipping)}</td></tr>`
    : `<tr><td style="padding:9px 0;border-bottom:1px solid ${LINE};font:400 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${BODY};">Delivery</td>
<td align="right" style="padding:9px 0;border-bottom:1px solid ${LINE};font:500 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};white-space:nowrap;">Quoted on our call</td></tr>`;

  const html = shell(
    `Order ${input.orderNumber} received`,
    paragraph(hello(input.name)) +
      paragraph(
        "We have your order. Our team will call you to confirm the details and arrange delivery.",
      ) +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">${rows}${subtotalRow}${cgstRow}${sgstRow}${shippingRow}
<tr><td style="padding:12px 0;font:600 15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};">Total</td>
<td align="right" style="padding:12px 0;font:600 16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${ACCENT};white-space:nowrap;">${esc(input.total)}</td></tr></table>` +
      button(input.orderUrl, "View this order"),
  );

  const text = [
    hello(input.name).replace(/<[^>]+>/g, ""),
    "",
    `We have your order ${input.orderNumber}. Our team will call you to confirm the details and arrange delivery.`,
    "",
    ...input.lines.map((line) => `  ${line.name} x ${line.qty}   ${line.amount}`),
    `  Subtotal: ${input.subtotal}`,
    `  CGST 9%: ${input.cgst}`,
    `  SGST 9%: ${input.sgst}`,
    `  Delivery: ${input.shipping || "Quoted on our call"}`,
    `  Total: ${input.total}`,
    "",
    input.orderUrl,
    "",
    `${site.legalName} · ${site.phone.display}`,
  ].join("\n");

  return sendMail({
    to: input.to,
    subject: `Order ${input.orderNumber} — ${site.legalName}`,
    html,
    text,
  });
}

/**
 * An order has been cancelled (EMAILS.md 14).
 *
 * **The one order-status email the site still sends** (client, 2026-09-19).
 * Shipped, out for delivery, failed attempts, returns and delivery come from
 * Shiprocket, which has the customer's email and phone from the booking
 * (`bookShipment`); payment receipts and refunds come from Razorpay. A
 * cancellation is ours alone — no courier or payment event tells the customer
 * — so it stays, with what happens to their money.
 */
export async function sendOrderCancelledMail(input: {
  to: string;
  name: string;
  orderNumber: string;
  orderUrl: string;
  /** Whether money was taken and so has to go back. */
  paid: boolean;
}): Promise<MailResult> {
  const heading = "Your order has been cancelled";
  const lead = `Order ${input.orderNumber} has been cancelled and will not be delivered.`;
  const refund = input.paid
    ? "You paid for this order online, so the full amount will be refunded to the payment method you used. A refund takes 5–7 days to reach your account."
    : "No payment was taken for this order.";
  const noReply = noReplyNotice("this order");

  const html = shell(
    heading,
    paragraph(hello(input.name)) +
      paragraph(esc(lead)) +
      paragraph(esc(refund)) +
      button(input.orderUrl, "View your order") +
      `<p style="margin:18px 0 0 0;font:400 13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#5a636c;">${esc(noReply)}</p>`,
  );
  const text = [
    hello(input.name).replace(/<[^>]+>/g, ""),
    "",
    lead,
    "",
    refund,
    "",
    `Your order: ${input.orderUrl}`,
    "",
    noReply,
    "",
    `${site.legalName} · ${site.phone.display}`,
  ].join("\n");

  return sendMail({
    to: input.to,
    subject: `Order ${input.orderNumber} has been cancelled — ${site.legalName}`,
    html,
    text,
  });
}

/** The line every customer notice ends with: `no-reply@` is not read, so say
 *  where a person is. */
function noReplyNotice(about: string): string {
  return `This email comes from an address that does not receive replies. For anything about ${about}, email ${site.email} or call or WhatsApp us on ${site.phone.display}.`;
}

function smallPrint(text: string): string {
  return `<p style="margin:18px 0 0 0;font:400 13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#5a636c;">${esc(text)}</p>`;
}

/** Label/value rows, for the details block several notices share. Rows with
 *  no value are dropped rather than shown empty. */
function detailTable(rows: [string, string | null | undefined][]): { html: string; text: string[] } {
  const kept = rows.filter((row): row is [string, string] => Boolean(row[1]));
  if (kept.length === 0) return { html: "", text: [] };
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">${kept
    .map(
      ([label, value]) =>
        `<tr><td style="padding:9px 12px 9px 0;border-bottom:1px solid ${LINE};font:400 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#5a636c;white-space:nowrap;vertical-align:top;">${esc(label)}</td>
<td style="padding:9px 0;border-bottom:1px solid ${LINE};font:500 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};white-space:pre-wrap;">${esc(value)}</td></tr>`,
    )
    .join("")}</table>`;
  return { html, text: kept.map(([label, value]) => `  ${label}: ${value}`) };
}

// ---------------------------------------------------------------------------
// Alerts to the business (EMAILS.md A and G)
// ---------------------------------------------------------------------------

/**
 * The business's alert layout: small, plain HTML, nothing the customer sees
 * (2026-09-18).
 *
 * **Why it is not `shell()`.** The client forwards orders@ to a Microsoft
 * Teams channel, and Teams silently skipped the new-order alert while posting
 * the shorter delivered one. Real test sends, one change at a time: a plain
 * email posted, the real subject posted, and every HTML body posted or not by
 * *size* — 5.2 KB posted, 5.8 KB and 6.2 KB did not. `shell()` and
 * `detailTable()` repeat a full inline style on every cell (~430 bytes a
 * row), so an order with a few lines went over. This layout sets the font
 * once and gives the cells no styles, which keeps an order with ten lines far
 * below that.
 *
 * **No colours.** Teams draws emails in its own theme; `shell()`'s dark text
 * on Teams' dark table cells was nearly unreadable. Left unset, text takes
 * each app's own colours — black in Outlook, light in Teams' dark mode.
 */
/** Contact details: the title in the left column, its lines in the right. */
type AlertBlock = { title: string; lines: string[] };
/** One line of the bill: what, and how much, right-aligned. */
type AlertBillLine = { label: string; amount: string; strong?: boolean };

/**
 * The layout, in **only the markup Teams is known to post** (2026-09-18):
 * `div`, `p`, `b`, `br`, `a`, and tables of `tr`/`td` with `cellpadding`,
 * `valign`, `align` and `nowrap`. The client forwards this inbox to a Teams
 * channel, and Teams skips an email it cannot convert — silently, while the
 * Outlook copy arrives as normal. It skipped this alert twice: once for size
 * (over ~5.5 KB), and once, at 2.8 KB, when it used `th`, `col`, `colspan`
 * and a width/style on the table to line columns up. Keep to this list.
 *
 * **Two tables, two columns each, no empty cells** — Teams draws a border
 * round every cell, so an empty one shows as an empty box:
 *  - contact details: Customer / Deliver to / Billed to on the left, and on
 *    the right the name, the address, then "Email:", "Phone:", "GSTIN:";
 *  - the order: each line on the left, its amount right-aligned.
 */
function leanAlert(
  heading: string,
  intro: string,
  blocks: AlertBlock[],
  bill: AlertBillLine[],
  adminUrl: string,
): string {
  const contact = blocks
    .map(
      (block) =>
        `<tr><td valign="top" nowrap><b>${esc(block.title)}</b></td><td valign="top">${block.lines
          .filter(Boolean)
          .map(esc)
          .join("<br>")}</td></tr>`,
    )
    .join("");
  const order = bill
    .filter((line) => line.amount)
    .map((line) => {
      const b = (text: string) => (line.strong ? `<b>${text}</b>` : text);
      return `<tr><td valign="top">${b(esc(line.label))}</td><td valign="top" align="right" nowrap>${b(esc(line.amount))}</td></tr>`;
    })
    .join("");
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5"><p style="font-size:17px;margin:0 0 2px"><b>${esc(heading)}</b></p><p style="margin:0 0 10px">${esc(intro)}</p><table cellpadding="4" cellspacing="0">${contact}</table><p style="margin:14px 0 4px"><b>Order</b></p><table cellpadding="4" cellspacing="0">${order}</table><p style="margin:14px 0 0"><a href="${esc(adminUrl)}">Open in admin</a></p><p style="margin:8px 0 0;font-size:12px">Reply to this email to write to the customer.</p></div>`;
}

/** The same, as text, for the plain part. */
function leanAlertText(
  heading: string,
  intro: string,
  blocks: AlertBlock[],
  bill: AlertBillLine[],
  adminUrl: string,
): string {
  const out = [heading, intro];
  for (const block of blocks) {
    out.push("", block.title.toUpperCase(), ...block.lines.filter(Boolean).map((line) => `  ${line}`));
  }
  out.push("", "ORDER", ...bill.filter((l) => l.amount).map((l) => `  ${l.label}: ${l.amount}`));
  out.push("", `Open in admin: ${adminUrl}`);
  return out.join("\n");
}

export type AlertAddress = {
  name: string;
  /** Street, area, town — one per line. */
  lines: string[];
  /** The number typed on this address. */
  phone: string;
  gstin?: string;
};

export async function sendNewOrderAlert(input: {
  orderNumber: string;
  /** When it was placed, already formatted in Indian time. */
  placed: string;
  payment: string;
  /** The account: its profile name, phone and email. */
  customer: { name: string; phone: string; email: string };
  deliverTo: AlertAddress;
  billTo: AlertAddress;
  lines: { name: string; qty: number; amount: string }[];
  /** All formatted: "₹1,124.00". */
  subtotal: string;
  cgst: string;
  sgst: string;
  /** "Delivery · Standard · Xpressbees Air" */
  deliveryLabel: string;
  /** "₹97.72", or words when no charge was quoted. */
  delivery: string;
  total: string;
  adminUrl: string;
}): Promise<MailResult> {
  /* Sections in the order the operator works through them (client,
     2026-09-18): who ordered and how to reach them, where it goes, who it is
     invoiced to, then the bill — items, tax and delivery adding up to the
     total, rather than a total with nothing under it. Each address carries
     the phone typed on that address, which is the number the courier (or the
     accounts office) will actually ring; the profile's own number is under
     Customer. */
  const blocks: AlertBlock[] = [
    {
      title: "Customer",
      lines: [
        input.customer.name,
        `Email: ${input.customer.email}`,
        /* The phone saved in My account → Your details, under the email
           (client, 2026-09-18). Said when there is none, so the absence is
           explained rather than looking like a bug. */
        `Phone: ${input.customer.phone || "Not in profile"}`,
      ],
    },
    {
      title: "Deliver to",
      lines: [input.deliverTo.name, ...input.deliverTo.lines, `Phone: ${input.deliverTo.phone}`],
    },
    {
      title: "Billed to",
      lines: [
        input.billTo.name,
        ...input.billTo.lines,
        `Phone: ${input.billTo.phone}`,
        input.billTo.gstin ? `GSTIN: ${input.billTo.gstin}` : "",
      ],
    },
  ];
  const bill: AlertBillLine[] = [
    ...input.lines.map((line) => ({ label: `${line.qty} x ${line.name}`, amount: line.amount })),
    { label: "Subtotal", amount: input.subtotal },
    { label: "CGST 9%", amount: input.cgst },
    { label: "SGST 9%", amount: input.sgst },
    { label: input.deliveryLabel, amount: input.delivery },
    { label: "Total", amount: input.total, strong: true },
    { label: "Payment", amount: input.payment },
  ];
  const heading = `${input.orderNumber} — New order`;
  const intro = `${input.payment} · placed ${input.placed}`;

  const html = leanAlert(heading, intro, blocks, bill, input.adminUrl);
  const text = leanAlertText(heading, intro, blocks, bill, input.adminUrl);

  return sendMail({
    to: site.ordersEmail,
    /* Order number first, the same shape as every activity alert
       (`VK-… — Shipped`), so a rule or flow that picks order mail out by its
       subject — the client's Teams integration, 2026-09-18 — catches new
       orders too. It used to start "New order VK-…", and was the one alert
       that did not reach Teams. */
    subject: `${input.orderNumber} — New order — ${input.total} — ${input.payment}`,
    html,
    text,
    replyTo: input.customer.email,
    from: orderAlertFromAddress(),
  });
}

/**
 * A contact-form enquiry, to the business inbox — EMAILS.md G, 2026-09-17.
 * Until this, an enquiry sat unseen until somebody opened /admin/enquiries
 * (ADMIN.md §7.7). Reply-To is the visitor.
 */
export async function sendEnquiryAlert(input: {
  name: string;
  email: string;
  phone: string;
  message: string;
  page: string;
  adminUrl: string;
}): Promise<MailResult> {
  const details = detailTable([
    ["Name", input.name],
    ["Email", input.email],
    ["Phone", input.phone],
    ["Sent from", input.page],
  ]);

  const html = shell(
    `New enquiry from ${input.name}`,
    details.html +
      `<p style="margin:0 0 14px 0;padding:14px 16px;background:#f7faf8;border-left:2px solid ${ACCENT};font:400 15px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${BODY};white-space:pre-wrap;">${esc(input.message)}</p>` +
      button(input.adminUrl, "Open enquiries") +
      smallPrint("Reply to this email to answer them directly."),
  );
  const text = [
    `New enquiry from ${input.name}`,
    "",
    ...details.text,
    "",
    input.message,
    "",
    `Open enquiries: ${input.adminUrl}`,
  ].join("\n");

  return sendMail({
    to: site.email,
    subject: `New enquiry from ${input.name} — ${site.domain}`,
    html,
    text,
    replyTo: input.email,
  });
}
