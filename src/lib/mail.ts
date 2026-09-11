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
};

function isConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
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
        from: fromAddress(),
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
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

export async function sendOrderPlacedMail(input: {
  to: string;
  name: string;
  orderNumber: string;
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

  const html = shell(
    `Order ${input.orderNumber} received`,
    paragraph(hello(input.name)) +
      paragraph(
        "We have your order. Our team will call you to confirm the details and arrange delivery.",
      ) +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">${rows}
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

export async function sendPaymentReceivedMail(input: {
  to: string;
  name: string;
  orderNumber: string;
  total: string;
  paymentId: string;
  orderUrl: string;
}): Promise<MailResult> {
  const html = shell(
    `Payment received for order ${input.orderNumber}`,
    paragraph(hello(input.name)) +
      paragraph(`We have received your payment of ${input.total} for order ${input.orderNumber} (Payment ID: ${input.paymentId}).`) +
      button(input.orderUrl, "View this order"),
  );

  const text = [
    hello(input.name).replace(/<[^>]+>/g, ""),
    "",
    `We have received your payment of ${input.total} for order ${input.orderNumber} (Payment ID: ${input.paymentId}).`,
    "",
    input.orderUrl,
    "",
    `${site.legalName} · ${site.phone.display}`,
  ].join("\n");

  return sendMail({
    to: input.to,
    subject: `Payment received for Order ${input.orderNumber} — ${site.legalName}`,
    html,
    text,
  });
}

