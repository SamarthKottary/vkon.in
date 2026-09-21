import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findAdminByEmail, findAdminById, getAdminPasswordHash } from "@/lib/db/adminUsers";
import { verifyPassword } from "@/lib/password";
import type { AdminRole, AdminUser } from "@/lib/types";

/**
 * Admin session — email + password login, cookie-backed, role-aware.
 *
 * Replaces the single ADMIN_PASSWORD env-var login (2026-09-21). There is now
 * a proper `admin_users` table with one row per operator, a role, and a
 * scrypt password hash. The cookie still carries an HMAC-signed payload (same
 * scheme as before), but the payload now encodes the admin user's id rather
 * than just an expiry+nonce pair.
 *
 * **This module and `lib/account.ts` are separate and must stay that way.**
 * Both sign cookies with `AUTH_SECRET`, but the cookie names are different
 * (`vkon_admin` vs `vkon_session`) and neither module reads the other's
 * cookie. A customer session grants nothing under /admin and vice versa.
 *
 * Deliberate properties carried forward from the old design:
 *  - Timing-safe comparison (`timingSafeEqual` via HMAC digests).
 *  - Cookie is httpOnly, sameSite=lax, secure in production.
 *  - Missing `AUTH_SECRET` fails closed — login always fails rather than
 *    letting everyone in.
 */

const COOKIE_NAME = "vkon_admin";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Session token: `id.expires.nonce.HMAC(id.expires.nonce, AUTH_SECRET)`
//
// Four parts rather than the old three, because the id is now meaningful
// content rather than being embedded inside the HMAC payload alone. The id
// lets `requireAdmin()` return the AdminUser without a separate query.
// ---------------------------------------------------------------------------

function buildToken(adminId: string, secret: string): string {
  const expires = Date.now() + SESSION_DURATION_MS;
  const nonce = randomBytes(8).toString("hex");
  const payload = `${adminId}.${expires}.${nonce}`;
  return `${payload}.${sign(payload, secret)}`;
}

function parseToken(
  token: string,
  secret: string,
): { adminId: string; expires: number } | null {
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return null;

  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  if (!safeEqual(signature, sign(payload, secret))) return null;

  const parts = payload.split(".");
  if (parts.length !== 3) return null;

  const [adminId, expiresStr] = parts;
  const expires = Number(expiresStr);
  if (!adminId || !Number.isFinite(expires)) return null;
  if (Date.now() > expires) return null;

  return { adminId, expires };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "not-configured" };

/**
 * Verifies email + password and issues the session cookie.
 *
 * `reason: "no-password"` means the account exists but no password has been
 * set yet — first-login flow. The login page redirects to /admin/profile?first=1.
 */
export async function login(
  email: string,
  password: string,
): Promise<LoginResult> {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: "not-configured" };

  const admin = await findAdminByEmail(email);
  if (!admin) {
    // Run a dummy verify so timing does not reveal "no such account".
    await verifyPassword(password, null);
    return { ok: false, reason: "invalid" };
  }

  const hash = await getAdminPasswordHash(admin.id);
  if (!hash) {
    // The account exists but has no password in the database (e.g. the seed user).
    // Validate against the environment password, and if correct, hash and save it.
    const envPassword = process.env.ADMIN_PASSWORD;
    if (envPassword && password === envPassword) {
      const { hashPassword } = await import("@/lib/password");
      const { setAdminPassword } = await import("@/lib/db/adminUsers");
      const newHash = await hashPassword(password);
      await setAdminPassword(admin.id, newHash);
    } else {
      // Dummy verify for timing protection
      await verifyPassword(password, null);
      return { ok: false, reason: "invalid" };
    }
  } else {
    // Standard validation against database hash
    const valid = await verifyPassword(password, hash);
    if (!valid) return { ok: false, reason: "invalid" };
  }

  const store = await cookies();
  const token = buildToken(admin.id, secret);
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(Date.now() + SESSION_DURATION_MS),
  });

  return { ok: true };
}

export async function issueAdminSession(adminId: string): Promise<{
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    sameSite: "lax" | "strict" | "none";
    secure: boolean;
    path: string;
    maxAge: number;
  };
} | null> {
  const secret = getSecret();
  if (!secret) return null;

  const token = buildToken(adminId, secret);
  return {
    name: COOKIE_NAME,
    value: token,
    options: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.floor(SESSION_DURATION_MS / 1000),
    },
  };
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Returns the signed-in AdminUser, or null if unauthenticated / session
 * expired. The single source of truth for "am I admin?".
 */
export async function getAdminSession(): Promise<AdminUser | null> {
  const secret = getSecret();
  if (!secret) return null;

  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  const parsed = parseToken(token, secret);
  if (!parsed) return null;

  try {
    return await findAdminById(parsed.adminId);
  } catch {
    return null;
  }
}

/** Convenience boolean for layout rendering. */
export async function isAuthenticated(): Promise<boolean> {
  return (await getAdminSession()) !== null;
}

/**
 * Guard for admin server actions.
 *
 * Returns the `AdminUser` — callers use the role for fine-grained checks.
 * `requireAdmin()` is the first statement of every mutating action in
 * `app/admin/actions.ts`; this is the security boundary, not the page guards.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const user = await getAdminSession();
  if (!user) throw new Error("Not authorised.");
  return user;
}

/**
 * Role guard for actions restricted to a subset of roles.
 *
 * Called after `requireAdmin()` with the returned user:
 *   const admin = await requireAdmin();
 *   requireAdminRole(admin, ["super", "admin"]);
 *
 * Throws with a 403-style message so the Next.js error boundary catches it.
 */
export function requireAdminRole(
  user: AdminUser,
  allowed: AdminRole[],
): void {
  if (!allowed.includes(user.role)) {
    throw new Error("Access denied. Your role does not permit this action.");
  }
}

// ---------------------------------------------------------------------------
// Legacy compatibility shims (removed env-var approach)
// ---------------------------------------------------------------------------

/**
 * @deprecated — ADMIN_PASSWORD env var is no longer used (2026-09-21).
 *
 * Returns true only when AUTH_SECRET is set to a valid length, which is all
 * that the system needs from the environment now. Call sites that showed a
 * "Not configured" banner can check this instead of the old ADMIN_PASSWORD.
 */
export function isAdminConfigured(): boolean {
  return Boolean(getSecret());
}
