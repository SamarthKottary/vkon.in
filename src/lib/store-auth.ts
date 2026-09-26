import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createStoreSession,
  deleteStoreSession,
  findStoreForSignIn,
  storeForSession,
} from "@/lib/db/stores";
import { verifyPassword } from "@/lib/password";
import type { Store } from "@/lib/types";

/**
 * A store signs in as itself (client, 2026-09-26).
 *
 * The third and last of the site's sessions, and deliberately its own module:
 * `lib/auth.ts` is the admin's, `lib/account.ts` is the customer's, and this is
 * a store's. They share `AUTH_SECRET` and nothing else — three cookie names,
 * three tables, and no module reading another's. A store session grants nothing
 * under `/admin` and an admin session grants nothing here.
 *
 * **Who the account is comes from Shiprocket.** The pickup address a store was
 * fetched from names the person in charge of it, and their email is the login.
 * Nobody hands out a password: `password_hash` is NULL until somebody follows
 * the emailed link, so the first sign-in is always "Forgotten password?".
 *
 * Unlike the admin's, the session **is** stored — one row per browser, so a
 * password reset can end every session at once. A shop-floor login sits open on
 * a shared machine, and being able to cut them all is worth the table.
 */

const COOKIE = "vkon_store";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

function secret(): string | null {
  const value = process.env.AUTH_SECRET;
  return value && value.length >= 16 ? value : null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("hex");
}

function sameSignature(a: string, b: string): boolean {
  const ha = createHmac("sha256", "cmp").update(a).digest();
  const hb = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** The value in the emailed link is never stored; this is. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type StoreSignIn =
  | { ok: true }
  | { ok: false; reason: "invalid" | "blocked" | "no-password" | "not-configured" };

/**
 * Verifies one store's email and password and issues the cookie.
 *
 * `no-password` is its own answer rather than being folded into `invalid`: an
 * account that has never had a password is the normal first visit, and telling
 * somebody to use the link is the whole point of saying so. It is only reached
 * once the email has matched a store on that page, so it reveals nothing that
 * the page's own existence does not.
 */
export async function signInStore(
  slug: string,
  email: string,
  password: string,
): Promise<StoreSignIn> {
  const key = secret();
  if (!key) return { ok: false, reason: "not-configured" };

  const store = await findStoreForSignIn(slug, email);
  if (!store) {
    /* Same work either way, so a wrong email and a wrong password take the
       same time. */
    await verifyPassword(password, null);
    return { ok: false, reason: "invalid" };
  }
  if (store.blocked) return { ok: false, reason: "blocked" };
  if (!store.hash) return { ok: false, reason: "no-password" };
  if (!(await verifyPassword(password, store.hash))) return { ok: false, reason: "invalid" };

  await issueStoreSession(store.id);
  return { ok: true };
}

/** The cookie, and the row behind it. Used by sign-in and by a reset. */
export async function issueStoreSession(storeId: string): Promise<void> {
  const key = secret();
  if (!key) return;

  const sessionId = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await createStoreSession({
    id: sessionId,
    storeId,
    userAgent: (await headers()).get("user-agent") ?? "",
    expiresAt,
  });

  (await cookies()).set(COOKIE, `${sessionId}.${sign(sessionId, key)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function signOutStore(): Promise<void> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  const id = raw ? readCookie(raw) : null;
  if (id) await deleteStoreSession(id);
  store.delete(COOKIE);
}

function readCookie(raw: string): string | null {
  const key = secret();
  if (!key) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return null;
  const id = raw.slice(0, dot);
  return sameSignature(raw.slice(dot + 1), sign(id, key)) ? id : null;
}

/** The signed-in store, or null. Fails soft: a bad cookie is no session. */
export async function currentStore(): Promise<Store | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  const id = raw ? readCookie(raw) : null;
  if (!id) return null;
  try {
    return await storeForSession(id);
  } catch {
    return null;
  }
}

/**
 * The store whose page this is, signed in.
 *
 * A session for *another* store is not a session for this one — two locations
 * on one machine must not see each other's shelves — so it is sent back to
 * this page's sign-in rather than quietly showing the wrong store.
 */
export async function requireStore(slug: string): Promise<Store> {
  const store = await currentStore();
  if (!store || store.slug !== slug || store.blockedAt) redirect(`/${slug}`);
  return store;
}

/** The guard for a store's own server actions. Throws rather than redirects. */
export async function requireStoreAction(): Promise<Store> {
  const store = await currentStore();
  if (!store || store.blockedAt) throw new Error("Not signed in.");
  return store;
}
