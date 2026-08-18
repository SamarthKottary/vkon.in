"use server";

import { headers } from "next/headers";
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
