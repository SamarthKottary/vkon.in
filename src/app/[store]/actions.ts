"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  addStoreProducts,
  adjustStoreProductStock,
  consumeStoreToken,
  createStoreToken,
  findStoreBySlugWithEmail,
  listStoreProducts,
  reorderStoreProducts,
  setStorePassword,
} from "@/lib/db/stores";
import { emailLink } from "@/lib/links";
import { revalidateStore } from "@/lib/store-paths";
import { sendPasswordResetMail } from "@/lib/mail";
import { hashPassword, passwordProblem } from "@/lib/password";
import { confirmationProblem } from "@/lib/password-policy";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import {
  hashToken,
  issueStoreSession,
  requireStoreAction,
  signInStore,
  signOutStore,
} from "@/lib/store-auth";

/**
 * What a store can do on its own pages (client, 2026-09-26).
 *
 * `requireStoreAction()` is the boundary, and it returns *the* store — every
 * write below takes its id from the session rather than the form, so a row id
 * from one shelf cannot be used to edit another's.
 */

export type StoreFormState = { error?: string; hint?: string; ok?: boolean; email?: string };

const SIGNIN_LIMIT = { limit: 8, windowMs: 15 * 60 * 1000 };
const LINK_LIMIT = { limit: 4, windowMs: 30 * 60 * 1000 };

async function tooMany(bucket: string, limit: { limit: number; windowMs: number }) {
  return !rateLimit(`${bucket}:${clientKey(await headers())}`, limit).ok;
}

export async function storeSignInAction(
  _prev: StoreFormState,
  formData: FormData,
): Promise<StoreFormState> {
  const slug = String(formData.get("slug") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!slug) return { error: "Something went wrong. Reload the page and try again." };
  if (!email || !password) return { error: "Enter your email address and password.", email };
  if (await tooMany("store-signin", SIGNIN_LIMIT)) {
    return { error: "Too many attempts. Wait a few minutes and try again.", email };
  }

  const result = await signInStore(slug, email, password);
  if (!result.ok) {
    if (result.reason === "blocked") {
      return { error: "This store is blocked. Ask the office to unblock it.", email };
    }
    if (result.reason === "no-password") {
      /* The normal first visit, not a failure — say what to press. */
      return {
        error: "",
        hint: "This is the first sign-in for this store. Press “Set or reset password” and we will email a link to this address.",
        email,
      };
    }
    if (result.reason === "not-configured") {
      return { error: "Sign-in is not configured on this site.", email };
    }
    return { error: "Incorrect email or password.", email };
  }

  redirect(`/${slug}`);
}

export async function storeSignOutAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  await signOutStore();
  redirect(`/${slug}`);
}

/**
 * The emailed link — the only way to a first password, and the way back from a
 * forgotten one.
 *
 * The address is not asked for: it is the pickup in-charge's, already on the
 * store, so there is nothing to type wrong and nothing to learn by trying.
 */
export async function storeSendLinkAction(
  _prev: StoreFormState,
  formData: FormData,
): Promise<StoreFormState> {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return { error: "Something went wrong. Reload the page and try again." };
  if (await tooMany("store-link", LINK_LIMIT)) {
    return { error: "Too many requests. Wait a few minutes and try again." };
  }

  try {
    const store = await findStoreBySlugWithEmail(slug);
    if (store) {
      const token = randomUUID();
      await createStoreToken({
        hashedId: hashToken(token),
        storeId: store.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      await sendPasswordResetMail({
        to: store.email,
        name: store.contactName || store.nickname,
        resetUrl: await emailLink(`/${slug}/reset?token=${token}`),
      });
    }
  } catch (error) {
    console.error("[store] password link failed:", error);
  }

  /* The same answer whether or not the store has an address on it, so the page
     cannot be used to find out which stores exist or who runs them. */
  return {
    ok: true,
    hint: "If this store has a pickup in-charge at Shiprocket, we have emailed them a link. It lasts an hour.",
  };
}

export async function storeSetPasswordAction(
  _prev: StoreFormState,
  formData: FormData,
): Promise<StoreFormState> {
  const slug = String(formData.get("slug") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim().slice(0, 200);
  const password = String(formData.get("password") ?? "");

  if (!token) return { error: "That link is not valid. Ask for a new one." };

  const weak = passwordProblem(password);
  if (weak) return { error: weak };
  const mismatch = confirmationProblem(password, String(formData.get("confirmPassword") ?? ""));
  if (mismatch) return { error: mismatch };

  const storeId = await consumeStoreToken(hashToken(token));
  if (!storeId) return { error: "That link has expired or has already been used. Ask for a new one." };

  await setStorePassword(storeId, await hashPassword(password));
  /* Straight in: they have just proved they hold the mailbox on the account. */
  await issueStoreSession(storeId);
  redirect(`/${slug}`);
}

// ---------------------------------------------------------------------------
// The shelves
// ---------------------------------------------------------------------------

/** `+`, `−`, or a number typed into the box. Never below zero. */
export async function setStockAction(formData: FormData): Promise<void> {
  const store = await requireStoreAction();
  const rowId = String(formData.get("id") ?? "").trim();
  const by = formData.get("by");
  const to = formData.get("to");

  if (rowId) {
    await adjustStoreProductStock(store.id, rowId, {
      ...(by == null ? {} : { by: Number(String(by)) || 0 }),
      ...(to == null ? {} : { to: Math.max(0, Math.floor(Number(String(to).replace(/[^\d]/g, "")) || 0)) }),
    });
  }

  revalidateStore(store.slug);
}

export async function storeReorderAction(ids: string[]): Promise<void> {
  const store = await requireStoreAction();
  const held = new Set((await listStoreProducts(store.id)).map((row) => row.id));
  await reorderStoreProducts(store.id, ids.filter((id) => held.has(id)));
  revalidateStore(store.slug);
}

/** The store adds what it stocks; it cannot remove or edit the catalogue. */
export async function storeAddProductsAction(formData: FormData): Promise<void> {
  const store = await requireStoreAction();
  const ids = String(formData.get("productIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length) await addStoreProducts(store.id, ids);

  revalidateStore(store.slug);
  redirect(`/${store.slug}/profile`);
}
