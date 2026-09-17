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
        from: fromAddress(),
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


/**
 * An order moved: shipped, out for delivery, delivered, or cancelled
 * (client, 2026-09-17).
 *
 * One template for the four, because they are one message — "here is where
 * your order stands" — and four copies of the same table would drift. What
 * changes is the heading, the opening sentence, and whether there is a parcel
 * to track.
 *
 * **It says plainly that replies go nowhere.** Every message here is sent from
 * `no-reply@` (see `fromAddress`), and a customer whose parcel is late will hit
 * Reply anyway. So these carry the phone number as the way to reach a person,
 * where the other templates leave it to the footer.
 *
 * The courier's status is shown in customer words (`trackingLabel`), with the
 * latest scan beneath it, so the email is useful on its own for somebody who
 * never opens the tracking page.
 */
export type OrderUpdateKind =
  | "shipped"
  | "out_for_delivery"
  | "delivery_failed"
  | "returning"
  | "delivered"
  | "cancelled";

export async function sendOrderUpdateMail(input: {
  to: string;
  name: string;
  kind: OrderUpdateKind;
  orderNumber: string;
  orderUrl: string;
  /** Customer wording, e.g. "Out for delivery". */
  trackingStatus: string | null;
  courierName: string | null;
  awb: string | null;
  trackingUrl: string | null;
  /** Already formatted for display. */
  eta: string | null;
  latest: { activity: string; location: string; at: string | null } | null;
  /** For a cancellation: whether money has been taken and needs returning. */
  paid: boolean;
}): Promise<MailResult> {
  const copy: Record<OrderUpdateKind, { subject: string; heading: string; lead: string }> = {
    shipped: {
      subject: `Order ${input.orderNumber} has shipped`,
      heading: "Your order is on its way",
      lead: `Order ${input.orderNumber} has been handed to the courier. You can follow it with the tracking link below.`,
    },
    out_for_delivery: {
      subject: `Order ${input.orderNumber} is out for delivery`,
      heading: "Out for delivery",
      lead: `Order ${input.orderNumber} is out for delivery and should reach you today. Please keep your phone with you — the courier may call.`,
    },
    /* Written not to alarm: most failed attempts are "nobody home" and the
       courier simply comes back. The courier's own reason is in the details
       table ("Latest update"), not paraphrased here. */
    delivery_failed: {
      subject: `Order ${input.orderNumber} could not be delivered today`,
      heading: "We couldn't deliver today",
      lead: `The courier tried to deliver order ${input.orderNumber} but couldn't. They usually try again on the next working day, so please keep your phone with you. If your address or phone number needs correcting, call us on ${site.phone.display}.`,
    },
    /* A return to origin can often still be turned around by a phone call,
       so this asks for one rather than announcing the order is over. */
    returning: {
      subject: `Order ${input.orderNumber} is being returned to us`,
      heading: "Your order is on its way back to us",
      lead: `The courier couldn't deliver order ${input.orderNumber} and has started returning it to us. If you still want it, please call us on ${site.phone.display} as soon as you can and we will try to arrange delivery again.`,
    },
    delivered: {
      subject: `Order ${input.orderNumber} has been delivered`,
      heading: "Delivered",
      lead: `Order ${input.orderNumber} has been delivered. Thank you for buying from ${site.legalName}.`,
    },
    cancelled: {
      subject: `Order ${input.orderNumber} has been cancelled`,
      heading: "Your order has been cancelled",
      lead: `Order ${input.orderNumber} has been cancelled and will not be delivered.`,
    },
  };
  const { subject, heading, lead } = copy[input.kind];
  const cancelled = input.kind === "cancelled";

  const refund = cancelled
    ? input.paid
      ? "You paid for this order online, so the full amount will be refunded to the payment method you used. A refund takes 5–7 days to reach your account."
      : "No payment was taken for this order."
    : null;

  const latestLine = input.latest
    ? [input.latest.activity, input.latest.location, input.latest.at].filter(Boolean).join(" · ")
    : null;

  const details: [string, string][] = cancelled
    ? []
    : ([
        ["Status", input.trackingStatus],
        ["Latest update", latestLine],
        /* Not once it is out for delivery — that mail already says "today",
           and the courier's estimate from pickup may by then be in the past. */
        ["Expected by", input.kind === "shipped" ? input.eta : null],
        ["Courier", input.courierName],
        ["Tracking number", input.awb],
      ].filter((row): row is [string, string] => Boolean(row[1])));

  const detailRows = details
    .map(
      ([label, value]) =>
        `<tr><td style="padding:9px 12px 9px 0;border-bottom:1px solid ${LINE};font:400 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#5a636c;white-space:nowrap;vertical-align:top;">${esc(label)}</td>
<td style="padding:9px 0;border-bottom:1px solid ${LINE};font:500 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};">${esc(value)}</td></tr>`,
    )
    .join("");

  const noReply = noReplyNotice("this order");

  const html = shell(
    heading,
    paragraph(hello(input.name)) +
      paragraph(esc(lead)) +
      (refund ? paragraph(esc(refund)) : "") +
      (detailRows
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">${detailRows}</table>`
        : "") +
      (input.trackingUrl && !cancelled
        ? button(input.trackingUrl, "Track your parcel")
        : button(input.orderUrl, "View your order")) +
      (input.trackingUrl && !cancelled
        ? paragraph(
            `<a href="${input.orderUrl}" style="color:${ACCENT};text-decoration:none;">View your order on ${esc(site.domain)}</a>`,
          )
        : "") +
      `<p style="margin:18px 0 0 0;font:400 13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#5a636c;">${esc(noReply)}</p>`,
  );

  const text = [
    hello(input.name).replace(/<[^>]+>/g, ""),
    "",
    lead,
    ...(refund ? ["", refund] : []),
    ...(details.length ? ["", ...details.map(([label, value]) => `  ${label}: ${value}`)] : []),
    "",
    ...(input.trackingUrl && !cancelled ? [`Track your parcel: ${input.trackingUrl}`] : []),
    `Your order: ${input.orderUrl}`,
    "",
    noReply,
    "",
    `${site.legalName} · ${site.phone.display}`,
  ].join("\n");

  return sendMail({
    to: input.to,
    subject: `${subject} — ${site.legalName}`,
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
// Payments (EMAILS.md B and D)
// ---------------------------------------------------------------------------

/**
 * An online payment failed (EMAILS.md B, 2026-09-17). Sent from Razorpay's
 * `payment.failed` webhook, once per order — the first failure only, so a
 * customer retrying three times is not sent three of these.
 *
 * The order is still there and can be paid from its page, which is the point
 * of the mail: without it the customer may believe they ordered.
 */
export async function sendPaymentFailedMail(input: {
  to: string;
  name: string;
  orderNumber: string;
  total: string;
  orderUrl: string;
}): Promise<MailResult> {
  const lead = `We couldn't take the payment of ${input.total} for order ${input.orderNumber}. Your order is saved, and you can pay for it again from your order page by UPI, card or netbanking.`;
  const debited = "If money left your account for the attempt that failed, your bank returns it automatically.";
  const notice = noReplyNotice("this order");

  const html = shell(
    "Your payment didn't go through",
    paragraph(hello(input.name)) +
      paragraph(esc(lead)) +
      button(input.orderUrl, "Pay for this order") +
      paragraph(esc(debited)) +
      smallPrint(notice),
  );
  const text = [
    hello(input.name).replace(/<[^>]+>/g, ""),
    "",
    lead,
    "",
    `Pay for this order: ${input.orderUrl}`,
    "",
    debited,
    "",
    notice,
    "",
    `${site.legalName} · ${site.phone.display}`,
  ].join("\n");

  return sendMail({
    to: input.to,
    subject: `Payment for order ${input.orderNumber} didn't go through — ${site.legalName}`,
    html,
    text,
  });
}

/**
 * A refund went through (EMAILS.md D, 2026-09-17). Sent from Razorpay's
 * `refund.processed` webhook, so it fires whether the refund was made in the
 * Razorpay dashboard or, later, from the admin — once per Razorpay refund id.
 *
 * The 5–7 days is the Terms' wording (/terms, "Refunds"); change them together.
 */
export async function sendRefundMail(input: {
  to: string;
  name: string;
  orderNumber: string;
  orderUrl: string;
  /** This refund. */
  amount: string;
  /** Every refund on the order so far, and the order total — for a partial. */
  refundedTotal: string;
  orderTotal: string;
  full: boolean;
  refundId: string;
}): Promise<MailResult> {
  const lead = `We've refunded ${input.amount} for order ${input.orderNumber} to the payment method you used. A refund takes 5–7 days to reach your account.`;
  const partial = input.full
    ? null
    : `This is a partial refund: ${input.refundedTotal} of the ${input.orderTotal} you paid has now been refunded.`;
  const details = detailTable([
    ["Refund", input.amount],
    ["Order", input.orderNumber],
    ["Refund reference", input.refundId],
  ]);
  const help = "If it hasn't arrived after 7 days, your bank can trace it with the refund reference above.";
  const notice = noReplyNotice("this refund");

  const html = shell(
    "Your refund is on its way",
    paragraph(hello(input.name)) +
      paragraph(esc(lead)) +
      (partial ? paragraph(esc(partial)) : "") +
      details.html +
      paragraph(esc(help)) +
      button(input.orderUrl, "View your order") +
      smallPrint(notice),
  );
  const text = [
    hello(input.name).replace(/<[^>]+>/g, ""),
    "",
    lead,
    ...(partial ? ["", partial] : []),
    "",
    ...details.text,
    "",
    help,
    "",
    `Your order: ${input.orderUrl}`,
    "",
    notice,
    "",
    `${site.legalName} · ${site.phone.display}`,
  ].join("\n");

  return sendMail({
    to: input.to,
    subject: `Refund for order ${input.orderNumber} — ${site.legalName}`,
    html,
    text,
  });
}

// ---------------------------------------------------------------------------
// Account security (EMAILS.md C)
// ---------------------------------------------------------------------------

/**
 * A password was set, changed or reset (EMAILS.md C, 2026-09-17).
 *
 * The one way somebody learns that another person changed their password, so
 * it says what happened, when, and what to do if it was not them — and it
 * contains no link that signs anybody in, only one to reset.
 */
export async function sendPasswordChangedMail(input: {
  to: string;
  name: string;
  kind: "changed" | "set" | "reset";
  /** Already formatted, Indian time. */
  when: string;
}): Promise<MailResult> {
  const heading =
    input.kind === "set" ? "A password was added to your account" : "Your password was changed";
  const lead =
    input.kind === "set"
      ? `A password was added to your ${site.legalName} account on ${input.when}. You can now sign in with your email address and this password, as well as with Google.`
      : input.kind === "reset"
        ? `The password for your ${site.legalName} account was reset on ${input.when}, using the link we emailed you. You have been signed out everywhere.`
        : `The password for your ${site.legalName} account was changed on ${input.when}. Any other device you were signed in on has been signed out.`;
  const warning = `If this wasn't you, reset your password straight away and call us on ${site.phone.display}.`;
  const resetUrl = `${site.url.replace(/\/$/, "")}/account/forgot`;
  const notice = noReplyNotice("your account");

  const html = shell(
    heading,
    paragraph(hello(input.name)) +
      paragraph(esc(lead)) +
      paragraph(`<strong style="color:${INK};">${esc(warning)}</strong>`) +
      button(resetUrl, "Reset my password") +
      smallPrint(notice),
  );
  const text = [
    hello(input.name).replace(/<[^>]+>/g, ""),
    "",
    lead,
    "",
    warning,
    `Reset your password: ${resetUrl}`,
    "",
    notice,
    "",
    `${site.legalName} · ${site.phone.display}`,
  ].join("\n");

  return sendMail({
    to: input.to,
    subject: `${heading} — ${site.legalName}`,
    html,
    text,
  });
}

// ---------------------------------------------------------------------------
// Alerts to the business (EMAILS.md A and G)
// ---------------------------------------------------------------------------

/**
 * A new order, to the business inbox (`site.email`) — EMAILS.md A, 2026-09-17.
 *
 * Sent when an order is real: at placement for cash on delivery, and on
 * payment for an online order (an unpaid, abandoned one is not news). Reply-To
 * is the customer, so answering it reaches them.
 */
export async function sendNewOrderAlert(input: {
  orderNumber: string;
  total: string;
  payment: string;
  customerName: string;
  customerEmail: string;
  phone: string;
  deliverTo: string;
  delivery: string;
  lines: { name: string; qty: number; amount: string }[];
  adminUrl: string;
}): Promise<MailResult> {
  const details = detailTable([
    ["Total", input.total],
    ["Payment", input.payment],
    ["Customer", input.customerName],
    ["Email", input.customerEmail],
    ["Phone", input.phone],
    ["Deliver to", input.deliverTo],
    ["Delivery", input.delivery],
  ]);
  const items = detailTable(input.lines.map((line) => [`${line.qty} ×`, `${line.name} — ${line.amount}`]));

  const html = shell(
    `New order ${input.orderNumber}`,
    details.html +
      paragraph(`<strong style="color:${INK};">Items</strong>`) +
      items.html +
      button(input.adminUrl, "Open in admin") +
      smallPrint("Reply to this email to write to the customer."),
  );
  const text = [
    `New order ${input.orderNumber}`,
    "",
    ...details.text,
    "",
    "Items:",
    ...items.text,
    "",
    `Open in admin: ${input.adminUrl}`,
  ].join("\n");

  return sendMail({
    to: site.email,
    subject: `New order ${input.orderNumber} — ${input.total} — ${input.payment}`,
    html,
    text,
    replyTo: input.customerEmail,
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
