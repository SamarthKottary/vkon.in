"use server";

import { headers } from "next/headers";
import { createEnquiry } from "@/lib/db/enquiries";
import { addSubscriber, normaliseEmail } from "@/lib/db/subscribers";
import { isDatabaseConfigured } from "@/lib/db/client";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/**
 * Public server actions — the only writes on the site that are not behind
 * `requireAdmin()`.
 *
 * That makes this file the site's one unauthenticated write path, so it is
 * worth stating what guards it:
 *
 *  1. **A honeypot.** A field no human sees and no human fills. Filled means a
 *     bot, and the action returns the ordinary success message without writing
 *     anything, so the bot has no signal that it was caught.
 *  2. **A rate limit**, five submissions per address per ten minutes. See
 *     `lib/rate-limit.ts` for why an in-memory limiter is sound for this
 *     deployment and would not be on serverless.
 *  3. **One column, one type.** The only visitor-supplied value that reaches
 *     the database is an email that passed `normaliseEmail`, through a
 *     parameterised query. `source` is taken from the request, not the form.
 *
 * There is no confirmation step. A double opt-in — mail the address, only add
 * it when the link is clicked — is the right shape once anything actually
 * sends mail, because without it anyone can put anyone else's address on the
 * list. Nothing sends mail today, so nothing is delivered to a forged address;
 * this becomes a real obligation the day a sender is wired up.
 */

export type SubscribeState = {
  status: "idle" | "ok" | "error";
  message?: string;
};

const LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };

export async function subscribeAction(
  _prev: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  // Named to look worth filling in to a bot and marked as such to everyone
  // else. See the field in SubscribePanel for the several ways it is hidden.
  if (String(formData.get("company") ?? "").trim()) {
    return { status: "ok", message: "You're on the list." };
  }

  const email = normaliseEmail(String(formData.get("email") ?? ""));

  if (!email) {
    return {
      status: "error",
      message: "That does not look like an email address.",
    };
  }

  if (!isDatabaseConfigured()) {
    return {
      status: "error",
      message: "Sign-up is unavailable right now. Please call or email us.",
    };
  }

  const requestHeaders = await headers();
  const limited = rateLimit(`subscribe:${clientKey(requestHeaders)}`, LIMIT);

  if (!limited.ok) {
    return {
      status: "error",
      message: "Too many attempts. Try again in a few minutes.",
    };
  }

  try {
    // The page the address came from, for knowing which page earns sign-ups.
    // Read from the request rather than a form field so it cannot be spoofed
    // into something misleading.
    const source = requestHeaders.get("referer") ?? "";
    await addSubscriber(email, safePath(source));
  } catch (error) {
    console.error("[subscribe] failed:", error);
    return {
      status: "error",
      message: "Could not save that just now. Please try again.",
    };
  }

  /* The same message whether the row was created or already existed. "You are
     already subscribed" would answer, for any address a stranger types,
     whether that person is on the list. */
  return { status: "ok", message: "You're on the list." };
}

/** Path only — never the full referer, which can carry query strings. */
function safePath(referer: string): string {
  try {
    return new URL(referer).pathname;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Contact enquiries
// ---------------------------------------------------------------------------

export type EnquiryState = {
  status: "idle" | "ok" | "error";
  message?: string;
  /** Per-field messages, so the form can point at what is wrong. */
  fieldErrors?: Record<string, string>;
};

/* Tighter than the sign-up: an enquiry is a bigger write and there is no
   legitimate reason to send three in ten minutes. */
const ENQUIRY_LIMIT = { limit: 3, windowMs: 10 * 60 * 1000 };

/** Bounds, enforced here rather than in the schema so an over-long message is
 *  a sentence the visitor can act on instead of a database error. */
const MAX = { name: 120, phone: 40, message: 4000 };

export async function sendEnquiryAction(
  _prev: EnquiryState,
  formData: FormData,
): Promise<EnquiryState> {
  // Same honeypot as the sign-up: filled means a bot, and it gets the ordinary
  // success message so it learns nothing.
  if (String(formData.get("company") ?? "").trim()) {
    return { status: "ok", message: "Thanks — we have your enquiry." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = normaliseEmail(String(formData.get("email") ?? ""));
  const phone = String(formData.get("phone") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Please tell us your name.";
  else if (name.length > MAX.name) fieldErrors.name = "That name is too long.";
  if (!email) fieldErrors.email = "That does not look like an email address.";
  if (phone.length > MAX.phone) fieldErrors.phone = "That number is too long.";
  if (!message) fieldErrors.message = "Please tell us what you need.";
  else if (message.length > MAX.message)
    fieldErrors.message = `Please keep it under ${MAX.message} characters.`;

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fieldErrors,
    };
  }

  if (!isDatabaseConfigured()) {
    return {
      status: "error",
      message: "The form is unavailable right now — please call or WhatsApp us.",
    };
  }

  const requestHeaders = await headers();
  const limited = rateLimit(
    `enquiry:${clientKey(requestHeaders)}`,
    ENQUIRY_LIMIT,
  );

  if (!limited.ok) {
    return {
      status: "error",
      message: "Too many enquiries just now. Please call us instead.",
    };
  }

  try {
    await createEnquiry({
      name,
      email: email as string,
      phone,
      message,
      source: safePath(requestHeaders.get("referer") ?? ""),
    });
  } catch (error) {
    console.error("[enquiry] failed:", error);
    return {
      status: "error",
      message: "Could not send that just now — please call or WhatsApp us.",
    };
  }

  return {
    status: "ok",
    message: "Thanks — we have your enquiry.",
  };
}
