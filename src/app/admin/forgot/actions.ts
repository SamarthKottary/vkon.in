"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isDatabaseConfigured } from "@/lib/db/client";
import {
  findAdminByEmail,
  createAdminToken,
  invalidateAdminTokens,
  consumeAdminToken,
  setAdminPassword,
} from "@/lib/db/adminUsers";
import {
  isMailConfigured,
  sendPasswordResetMail,
} from "@/lib/mail";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { confirmationProblem } from "@/lib/password-policy";
import { emailLink } from "@/lib/links";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import type { ActionState } from "../actions";

const FORGOT_LIMIT = { limit: 4, windowMs: 30 * 60 * 1000 };
const RESET_LIMIT = { limit: 10, windowMs: 30 * 60 * 1000 };
const RESET_TTL_MS = 60 * 60 * 1000;

const DONE = "If that email address belongs to an account here, we've sent a link for setting a new password.";

/** See `lib/links.ts`: the live site's address, or this one in development. */
const absoluteUrl = emailLink;

async function limited(
  bucket: string,
  limit: { limit: number; windowMs: number },
): Promise<boolean> {
  const requestHeaders = await headers();
  return !rateLimit(`${bucket}:${clientKey(requestHeaders)}`, limit).ok;
}

export async function forgotAdminPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  const typed = { email };

  if (!email) {
    return {
      error: "That does not look like an email address.",
      values: typed,
    };
  }

  if (await limited("admin-forgot", FORGOT_LIMIT)) {
    return {
      error: "Too many reset attempts. Please wait a few minutes and try again.",
      values: typed,
    };
  }

  try {
    const admin = await findAdminByEmail(email);
    /* **Every operator, not only super users** (client, 2026-09-26). The link
       on the sign-in form is the same one for everybody, and one that cannot
       work for the person reading it is worse than no link: an inventory user
       pressed it and was told the page was for somebody else.

       The token is the same signed, single-use, one-hour token either way, and
       it goes to the address already on the account — so this gives nobody
       access they could not already get by asking a super user to set one. */
    if (admin) {
      await invalidateAdminTokens(admin.id, "reset");
      const rawToken = await createAdminToken({
        adminId: admin.id,
        kind: "reset",
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      });
      await sendPasswordResetMail({
        to: admin.email,
        name: admin.name || "Admin",
        resetUrl: await absoluteUrl(`/admin/reset?token=${rawToken}`),
      });
    }
  } catch (error) {
    console.error("[admin-auth] forgot-password failed:", error);
  }

  // Use error field to display the message so we don't have to alter ActionState, but ok flag distinguishes it.
  return { ok: true, error: DONE }; 
}

export async function resetAdminPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = String(formData.get("token") ?? "").trim().slice(0, 200);
  const password = String(formData.get("password") ?? "");

  if (!token) {
    return {
      error: "That reset link is not valid. Please request a new one.",
    };
  }

  const issue = passwordProblem(password);
  if (issue) {
    return {
      error: issue,
      fieldErrors: { password: issue },
    };
  }

  const mismatch = confirmationProblem(password, String(formData.get("confirmPassword") ?? ""));
  if (mismatch) {
    return {
      error: mismatch,
      fieldErrors: { confirmPassword: mismatch },
    };
  }

  if (!isDatabaseConfigured()) return { error: "Database not configured." };
  if (await limited("admin-reset", RESET_LIMIT)) {
    return {
      error: "Too many attempts. Please wait a few minutes and try again.",
    };
  }

  const home = "/admin";
  try {
    const admin = await consumeAdminToken(token, "reset");

    if (!admin) {
      return {
        error: "That link is invalid or has expired. Please request a new one.",
      };
    }

    await setAdminPassword(admin.id, await hashPassword(password));
  } catch (error) {
    console.error("[admin-auth] password reset failed:", error);
    return { error: "An error occurred." };
  }

  revalidatePath("/admin", "layout");
  redirect(`${home}?reset=1`);
}
