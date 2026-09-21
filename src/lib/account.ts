import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import {
  createSession,
  customerForSession,
  deleteSession,
  deleteSessionsForCustomer,
  sweepExpiredSessions,
} from "@/lib/db/customers";
import type { Customer } from "@/lib/types";

/**
 * Customer sessions — the shop-visitor equivalent of `lib/auth.ts`.
 *
 * **These are two separate systems and must stay that way.** `lib/auth.ts` is
 * the single operator: no user table, password in an environment variable, a
 * self-contained signed cookie named `vkon_admin`. This is many people with
 * rows of their own, in a cookie named `vkon_session`. Neither module reads
 * the other's cookie, so a customer session grants nothing under `/admin` and
 * an admin session grants nothing here. ARCHITECTURE.md §7a.
 *
 * **The session is server-side, and the cookie is a signed pointer to it.**
 * The admin's cookie carries its own expiry and is valid on its signature
 * alone, which is fine for one operator who can restart the process. A shop
 * needs "Log out" on a shared phone to actually end the session, and only a
 * deletable row does that. The signature still earns its place: it rejects a
 * forged or truncated cookie without a database round trip, so a flood of junk
 * cookies costs no queries.
 *
 * Missing `AUTH_SECRET` fails closed, exactly as the admin does — no secret,
 * no sessions, rather than unsigned sessions everyone can mint.
 */

const COOKIE_NAME = "vkon_session";

/** 30 days. Long, deliberately: this is a catalogue for people on patchy rural
 *  connections, and being signed out weekly is a real cost to them. The
 *  session is a row, so anything abusive can be revoked centrally. */
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

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

/**
 * Cookie flags, in one place so the three call sites cannot drift.
 *
 * `secure` follows NODE_ENV rather than being unconditional, for the reason
 * HANDOFF.md §3 records against the admin: a `Secure` cookie is dropped by the
 * browser on plain HTTP to anything but localhost, so an unconditional flag
 * makes sign-in silently fail over the LAN address `next start` prints — the
 * password is accepted, the redirect fires, and you land back on the form.
 */
function cookieOptions(expires: Date, isHttps = false) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isHttps,
    path: "/",
    expires,
  };
}

export function isRequestHttps(h: Headers, url?: URL | string): boolean {
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
  if (proto === "https") return true;
  if (proto === "http") return false;

  const host = (h.get("host") || (url ? (typeof url === "string" ? new URL(url).host : url.host) : "")).toLowerCase();
  if (
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    host.startsWith("192.168.") ||
    host.startsWith("172.") ||
    host.startsWith("10.")
  ) {
    return false;
  }

  if (url) {
    const protocol = typeof url === "string" ? new URL(url).protocol : url.protocol;
    if (protocol === "http:") return false;
    if (protocol === "https:") return true;
  }

  return process.env.NODE_ENV === "production";
}

/**
 * Returns a safe base URL (e.g. "http://localhost:3000" or "https://vkon.in")
 * ensuring Next.js standalone internal '0.0.0.0' address is never leaked to redirects.
 */
export function getSafeRedirectBase(headersList: Headers, fallbackUrl?: URL | string): string {
  const forwardedHost = headersList.get("x-forwarded-host");
  const hostHeader = headersList.get("host");
  let host = forwardedHost || hostHeader;

  if (!host && fallbackUrl) {
    host = typeof fallbackUrl === "string" ? new URL(fallbackUrl).host : fallbackUrl.host;
  }
  if (!host || host.startsWith("0.0.0.0")) {
    host = host ? host.replace("0.0.0.0", "localhost") : "localhost:3000";
  }

  const isHttps = isRequestHttps(headersList, fallbackUrl);
  return `${isHttps ? "https" : "http"}://${host}`;
}

/** Signs a customer in by issuing a session row and setting the cookie. */
export async function startSession(customerId: string): Promise<void> {
  const secret = getSecret();
  if (!secret) throw new Error("AUTH_SECRET is not configured.");

  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const h = await headers();
  const userAgent = h.get("user-agent") ?? "";
  const isHttps = isRequestHttps(h);

  const id = await createSession({ customerId, userAgent, expiresAt });

  const store = await cookies();
  store.set(COOKIE_NAME, `${id}.${sign(id, secret)}`, cookieOptions(expiresAt, isHttps));
}

/** Ends this one session and clears the cookie. Unguarded on purpose —
 *  clearing your own session is not a privileged operation. */
export async function endSession(): Promise<void> {
  const store = await cookies();
  const id = readCookieSessionId(store.get(COOKIE_NAME)?.value);
  if (id) {
    try {
      await deleteSession(id);
    } catch (error) {
      /* The cookie still gets cleared below. A failed DELETE must not leave
         somebody looking signed in on a shared device. */
      console.error("[account] session delete failed:", error);
    }
  }
  store.delete(COOKIE_NAME);
}

/** Every session, everywhere. Used after a password reset. */
export async function endAllSessions(customerId: string): Promise<void> {
  await deleteSessionsForCustomer(customerId);
  (await cookies()).delete(COOKIE_NAME);
}

/** Verifies the signature and returns the session id, without touching the
 *  database. Separated out so a junk cookie costs nothing. */
function readCookieSessionId(value: string | undefined): string | null {
  const secret = getSecret();
  if (!secret || !value) return null;

  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const id = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!id || !signature) return null;
  if (!safeEqual(signature, sign(id, secret))) return null;

  return id;
}

/**
 * The signed-in customer, or null. The single source of truth for "who is
 * this?" — everything else in the app calls this rather than reading cookies.
 *
 * **Reads fail soft, and that is safe here in a way it would not be in the
 * sign-in path**: an unreachable database renders the header signed-out rather
 * than throwing a 500 over the whole site, and the worst case is a customer
 * being asked to sign in again. It never grants access it should not, because
 * the failure direction is "nobody".
 */
export async function getCurrentCustomer(): Promise<Customer | null> {
  const store = await cookies();
  const id = readCookieSessionId(store.get(COOKIE_NAME)?.value);
  if (!id) return null;

  try {
    const customer = await customerForSession(id);

    /* Expired rows are swept here rather than by a cron, which this
       deployment does not have. One in fifty lookups keeps the table from
       growing without bound while adding a write to 2% of renders instead of
       all of them. Failure is ignored: tidying is not the caller's business. */
    if (Math.random() < 0.02) {
      void sweepExpiredSessions().catch(() => {});
    }

    return customer;
  } catch (error) {
    console.error("[account] session lookup failed:", error);
    return null;
  }
}

/**
 * Guard for customer server actions.
 *
 * The same rule §9 states for `requireAdmin()`, for the same reason: a server
 * action is an independently addressable POST endpoint, and a page that checks
 * before rendering does not protect it. Every action that reads or writes one
 * customer's data — addresses, profile, orders — calls this first and uses the
 * id it returns rather than any id from the form.
 */
export async function requireCustomer(): Promise<Customer> {
  const customer = await getCurrentCustomer();
  if (!customer) throw new Error("Not signed in.");
  return customer;
}

import { redirect } from "next/navigation";

export type SessionCookie = {
  name: string;
  value: string;
  options: ReturnType<typeof cookieOptions>;
};

export async function issueSession(
  customerId: string,
  isHttpsOverride?: boolean,
  /** What to record against the session instead of the browser's own string.
   *  `/admin/users/[id]/signin` passes the admin who opened it, so a session
   *  one person started for another can be told apart afterwards. */
  userAgentOverride?: string,
): Promise<SessionCookie> {
  const secret = getSecret();
  if (!secret) throw new Error("AUTH_SECRET is not configured.");

  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const h = await headers();
  const userAgent = userAgentOverride ?? h.get("user-agent") ?? "";
  const isHttps = isHttpsOverride !== undefined ? isHttpsOverride : isRequestHttps(h);
  const id = await createSession({ customerId, userAgent, expiresAt });

  return {
    name: COOKIE_NAME,
    value: `${id}.${sign(id, secret)}`,
    options: cookieOptions(expiresAt, isHttps),
  };
}

export async function requireSignIn(next?: string): Promise<Customer> {
  const customer = await getCurrentCustomer();
  if (!customer) {
    const target = next ? `?next=${encodeURIComponent(next)}` : "";
    redirect(`/account/login${target}`);
  }
  return customer;
}

