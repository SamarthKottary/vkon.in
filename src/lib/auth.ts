import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Single-admin session, backed by an HMAC-signed cookie.
 *
 * No user table, no auth library: there is exactly one operator, and the
 * password lives in an environment variable. The cookie carries an expiry and a
 * signature over it, so it cannot be forged or extended without AUTH_SECRET.
 *
 * Deliberate properties:
 *  - Password comparison is timing-safe (`timingSafeEqual` over SHA-256
 *    digests, so unequal lengths do not throw and do not leak length).
 *  - The cookie is httpOnly + sameSite=lax + secure in production, so it is not
 *    readable from JavaScript and does not ride along on cross-site requests.
 *  - Missing configuration fails closed: if ADMIN_PASSWORD or AUTH_SECRET is
 *    unset, login always fails rather than allowing everyone in.
 */

const COOKIE_NAME = "vkon_admin";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  // A trivially short secret is treated as unset rather than quietly weak.
  return secret && secret.length >= 16 ? secret : null;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Compares two strings in constant time, without leaking their lengths. */
function safeEqual(a: string, b: string): boolean {
  const ha = createHmac("sha256", "cmp").update(a).digest();
  const hb = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: "not-configured" | "invalid" };

export async function login(password: string): Promise<LoginResult> {
  const expected = process.env.ADMIN_PASSWORD;
  const secret = getSecret();

  if (!expected || !secret) return { ok: false, reason: "not-configured" };
  if (!safeEqual(password, expected)) return { ok: false, reason: "invalid" };

  const expires = Date.now() + SESSION_DURATION_MS;
  // A nonce makes each session token distinct even within the same millisecond.
  const nonce = randomBytes(8).toString("hex");
  const payload = `${expires}.${nonce}`;
  const token = `${payload}.${sign(payload, secret)}`;

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expires),
  });

  return { ok: true };
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Verifies the session cookie. The single source of truth for "am I admin?". */
export async function isAuthenticated(): Promise<boolean> {
  const secret = getSecret();
  if (!secret) return false;

  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [expires, nonce, signature] = parts;
  const payload = `${expires}.${nonce}`;

  if (!safeEqual(signature, sign(payload, secret))) return false;

  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  return true;
}

/**
 * Guard for admin server actions.
 *
 * Layout-level checks protect *rendering*; server actions are separately
 * callable endpoints and must check for themselves. Every mutating action in
 * `app/admin/actions.ts` calls this first.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAuthenticated())) {
    throw new Error("Not authorised.");
  }
}

export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && getSecret());
}
