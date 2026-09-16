import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { isRequestHttps } from "@/lib/account";
import {
  sweepExpiredTrustedDevices,
  touchTrustedDevice,
  trustDevice,
} from "@/lib/db/customers";

/**
 * The second step of signing in: a six-digit code, but only on a browser this
 * account has not been seen on before.
 *
 * **Why not every time.** This is a catalogue for people on patchy rural
 * connections, and the same reasoning that makes the session last 30 days
 * (`lib/account.ts`) applies here: a code on every visit turns a slow inbox
 * into a locked account. A browser that has passed the code once is recorded
 * and skipped for 30 days; a new one is challenged. Client's choice,
 * 2026-09-16.
 *
 * **Two cookies, and neither is a session.**
 *
 *  - `vkon_signin` is the *pending* challenge — it names the account waiting
 *    for a code and where to go afterwards, and it is worthless without the
 *    code itself, which only exists in the email. Ten minutes.
 *  - `vkon_device` marks this browser as already proved. It is only half of
 *    the answer: the matching row in `customer_trusted_devices` is the other
 *    half, so trust can be revoked centrally, which is the same reason
 *    customer sessions are rows rather than self-contained tokens.
 *
 * Both are signed with `AUTH_SECRET` and fail closed without it, exactly as
 * `lib/auth.ts` and `lib/account.ts` do. The three crypto helpers below are
 * duplicated from those two modules rather than shared, which is the existing
 * shape: each cookie system owns its own signing and neither reads another's.
 */

const PENDING_COOKIE = "vkon_signin";
const DEVICE_COOKIE = "vkon_device";

/** Long enough to find the mail on a slow connection, short enough that a
 *  cookie left on a shared machine is not a standing invitation. */
export const CHALLENGE_TTL_MS = 10 * 60 * 1000;

/** Matches the session's own 30 days: being asked for a code more often than
 *  being asked to sign in again would be a step with nothing behind it. */
const DEVICE_TRUST_MS = 30 * 24 * 60 * 60 * 1000;

function getSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  return secret && secret.length >= 16 ? secret : null;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHmac("sha256", "cmp").update(a).digest();
  const hb = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Splits `payload.signature` and returns the payload only if it verifies. */
function verified(value: string | undefined): string | null {
  const secret = getSecret();
  if (!secret || !value) return null;

  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!payload || !signature) return null;
  if (!safeEqual(signature, sign(payload, secret))) return null;

  return payload;
}

function cookieOptions(expires: Date, isHttps: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isHttps,
    path: "/",
    expires,
  };
}

/** A cookie built rather than set, so a route handler can put it on the
 *  redirect it is returning — see the note on `issueSession`. */
export type PreparedCookie = {
  name: string;
  value: string;
  options: ReturnType<typeof cookieOptions>;
};

// ---------------------------------------------------------------------------
// The pending challenge
// ---------------------------------------------------------------------------

export type Challenge = { customerId: string; next: string };

export function buildChallengeCookie(
  customerId: string,
  next: string,
  isHttps: boolean,
): PreparedCookie {
  const secret = getSecret();
  if (!secret) throw new Error("AUTH_SECRET is not configured.");

  const expires = new Date(Date.now() + CHALLENGE_TTL_MS);
  /* The nonce keeps two challenges for the same account in the same
     millisecond from producing the same cookie. */
  const payload = Buffer.from(
    JSON.stringify({ c: customerId, n: next, e: expires.getTime(), r: randomBytes(6).toString("hex") }),
  ).toString("base64url");

  return {
    name: PENDING_COOKIE,
    value: `${payload}.${sign(payload, secret)}`,
    options: cookieOptions(expires, isHttps),
  };
}

/** Sets the pending cookie from a server action or server component. */
export async function startChallenge(customerId: string, next: string): Promise<void> {
  const isHttps = isRequestHttps(await headers());
  const cookie = buildChallengeCookie(customerId, next, isHttps);
  (await cookies()).set(cookie.name, cookie.value, cookie.options);
}

/** The account waiting on a code, or null. Never returns a session and never
 *  touches the database — it only says who the code should be checked against. */
export async function readChallenge(): Promise<Challenge | null> {
  const payload = verified((await cookies()).get(PENDING_COOKIE)?.value);
  if (!payload) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      c?: unknown;
      n?: unknown;
      e?: unknown;
    };

    /* The expiry is inside the signed payload, not just on the cookie: a
       browser can keep sending a cookie past the date it was given. */
    if (typeof parsed.e !== "number" || Date.now() > parsed.e) return null;
    if (typeof parsed.c !== "string" || !parsed.c) return null;

    return { customerId: parsed.c, next: typeof parsed.n === "string" ? parsed.n : "/account" };
  } catch {
    return null;
  }
}

export async function clearChallenge(): Promise<void> {
  (await cookies()).delete(PENDING_COOKIE);
}

// ---------------------------------------------------------------------------
// Trusted devices
// ---------------------------------------------------------------------------

/** The device token this browser is carrying, if the signature holds. */
function deviceToken(raw: string | undefined): string | null {
  return verified(raw);
}

/**
 * Whether this browser may skip the code for this account.
 *
 * Fails *closed* on a database error, unlike the reads in `getCurrentCustomer`:
 * the cost of being wrong here is skipping a security step, so an unreachable
 * database means "ask for the code", not "let them through".
 */
export async function isTrustedDevice(customerId: string, raw?: string): Promise<boolean> {
  const token = deviceToken(raw ?? (await cookies()).get(DEVICE_COOKIE)?.value);
  if (!token) return false;

  try {
    const trusted = await touchTrustedDevice(customerId, token);

    /* Swept here rather than by a cron, matching `sweepExpiredSessions`. */
    if (Math.random() < 0.02) void sweepExpiredTrustedDevices().catch(() => {});

    return trusted;
  } catch (error) {
    console.error("[signin] trusted-device check failed:", error);
    return false;
  }
}

/** Reads the device cookie straight off a request, for the Google callback. */
export function deviceCookieFrom(raw: string | undefined): string | undefined {
  return raw;
}

/**
 * Records this browser against the account and returns the cookie to set.
 *
 * The same token is reused when the browser already carries one, so a person
 * with two accounts on one machine keeps both trusted — the row is keyed by
 * account and token together (`hashDevice`).
 */
export async function buildTrustCookie(
  customerId: string,
  isHttps: boolean,
  raw: string | undefined,
  userAgent: string,
): Promise<PreparedCookie> {
  const secret = getSecret();
  if (!secret) throw new Error("AUTH_SECRET is not configured.");

  const token = deviceToken(raw) ?? randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + DEVICE_TRUST_MS);

  await trustDevice({ customerId, token, userAgent, expiresAt: expires });

  return {
    name: DEVICE_COOKIE,
    value: `${token}.${sign(token, secret)}`,
    options: cookieOptions(expires, isHttps),
  };
}

/** Trusts this browser from a server action. */
export async function trustThisDevice(customerId: string): Promise<void> {
  const store = await cookies();
  const h = await headers();
  const cookie = await buildTrustCookie(
    customerId,
    isRequestHttps(h),
    store.get(DEVICE_COOKIE)?.value,
    h.get("user-agent") ?? "",
  );
  store.set(cookie.name, cookie.value, cookie.options);
}

export { DEVICE_COOKIE, PENDING_COOKIE };
