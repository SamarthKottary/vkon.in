"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireAdminRole, requireOperator } from "@/lib/auth";
import { isGstin, isGstRate, setGstRates, setInvoiceGstin } from "@/lib/db/settings";
import {
  getAdminPasswordHash,
  setAdminAvatar,
  setAdminPassword,
  updateAdminProfile,
} from "@/lib/db/adminUsers";
import { deleteAvatar, saveAvatar } from "@/lib/storage";
import { hashPassword, verifyPassword } from "@/lib/password";
import { confirmationProblem, passwordProblem } from "@/lib/password-policy";

/**
 * Admin profile actions — updating name, password and avatar.
 *
 * Each action calls `requireAdmin()` first. The admin's own id comes from the
 * session, never from the form.
 */

export type ProfileState = {
  status: "idle" | "ok" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Profile name
// ---------------------------------------------------------------------------

export async function updateAdminProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const admin = await requireOperator();

  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 120) {
    return {
      status: "error",
      message: "Please enter a name (up to 120 characters).",
      fieldErrors: { name: "Name is required." },
    };
  }

  try {
    await updateAdminProfile(admin.id, { name });
  } catch (error) {
    console.error("[admin/profile] name update failed:", error);
    return { status: "error", message: "Could not save. Please try again." };
  }

  revalidatePath("/admin/profile");
  return { status: "ok", message: "Name updated." };
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

export async function setAdminPasswordAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const admin = await requireOperator();

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const fieldErrors: Record<string, string> = {};

  // If they already have a password, verify the current one.
  if (admin.hasPassword) {
    const hash = await getAdminPasswordHash(admin.id);
    const valid = await verifyPassword(currentPassword, hash);
    if (!valid) {
      fieldErrors.currentPassword = "That password is incorrect.";
    }
  }

  const passwordError = passwordProblem(password);
  if (passwordError) fieldErrors.password = passwordError;

  const confirmError = confirmationProblem(password, confirmPassword);
  if (confirmError) fieldErrors.confirmPassword = confirmError;

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors };
  }

  try {
    const hash = await hashPassword(password);
    await setAdminPassword(admin.id, hash);
  } catch (error) {
    console.error("[admin/profile] password set failed:", error);
    return { status: "error", message: "Could not save. Please try again." };
  }

  revalidatePath("/admin/profile");
  return { status: "ok", message: "Password updated." };
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

export async function uploadAdminAvatarAction(
  formData: FormData,
): Promise<{ status: "ok" } | { status: "error"; message: string }> {
  const admin = await requireOperator();

  const blob = formData.get("avatar");
  if (!(blob instanceof File) || blob.size === 0) {
    return { status: "error", message: "No image received." };
  }

  const bytes = Buffer.from(await blob.arrayBuffer());
  const result = await saveAvatar(bytes);
  if (!result.ok) return { status: "error", message: result.error };

  let previous: string | null = null;
  try {
    previous = await setAdminAvatar(admin.id, result.filename, "upload");
  } catch (error) {
    console.error("[admin/profile] avatar db update failed:", error);
    // Clean up the file we just saved — the row was not updated.
    await deleteAvatar(result.filename);
    return { status: "error", message: "Could not save. Please try again." };
  }

  // Delete the previous avatar (if any) — /media files are cached forever, so
  // a new upload must have a new URL; the old file is now unreachable anyway.
  if (previous) await deleteAvatar(previous);

  revalidatePath("/admin/profile");
  revalidatePath("/admin");
  return { status: "ok" };
}

export async function removeAdminAvatarAction(): Promise<
  { status: "ok" } | { status: "error"; message: string }
> {
  const admin = await requireOperator();

  let previous: string | null = null;
  try {
    previous = await setAdminAvatar(admin.id, null, "removed");
  } catch (error) {
    console.error("[admin/profile] avatar remove failed:", error);
    return { status: "error", message: "Could not remove. Please try again." };
  }

  if (previous) await deleteAvatar(previous);

  revalidatePath("/admin/profile");
  revalidatePath("/admin");
  return { status: "ok" };
}


/**
 * The GST number printed on customer invoices (client, 2026-09-25).
 *
 * **Super user only**, checked here rather than only in the page: this is one
 * number for the whole business, on a document the customer keeps, and a
 * server action is a POST anybody signed in could otherwise make. Saved
 * upper-cased and shape-checked (`isGstin`); clearing the field is allowed and
 * simply takes the line off the invoice.
 */
export async function saveInvoiceGstinAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const admin = await requireAdmin();
  requireAdminRole(admin, ["super"]);

  const gstin = String(formData.get("gstin") ?? "").trim().toUpperCase();
  if (gstin && !isGstin(gstin)) {
    return {
      status: "error",
      fieldErrors: { gstin: "That is not a GST number — 15 characters, like 29ABCDE1234F1Z5." },
      values: { gstin },
    };
  }

  try {
    await setInvoiceGstin(gstin);
  } catch (error) {
    console.error("[admin] saving the invoice GSTIN failed:", error);
    return { status: "error", message: "Could not save that. Try again.", values: { gstin } };
  }

  revalidatePath("/admin/profile");
  return {
    status: "ok",
    message: gstin ? "GST number saved." : "GST number cleared.",
    values: { gstin },
  };
}

/**
 * The CGST and SGST percentages charged from now on (client, 2026-09-25:
 * "when we change here it changes for all customers orders as well").
 *
 * **Super user only**, and it moves money: every price on the site is shown
 * with these on top, and every order priced after this is saved is charged
 * them. Orders already placed keep the amounts they were charged — those are
 * stored in paise on the row, and re-taxing a sale the customer already has an
 * invoice for would falsify it.
 */
export async function saveGstRatesAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const admin = await requireAdmin();
  requireAdminRole(admin, ["super"]);

  const cgst = String(formData.get("cgst") ?? "").trim();
  const sgst = String(formData.get("sgst") ?? "").trim();
  const fieldErrors: Record<string, string> = {};
  if (!isGstRate(cgst)) fieldErrors.cgst = "A percentage between 0 and 28, like 9 or 2.5.";
  if (!isGstRate(sgst)) fieldErrors.sgst = "A percentage between 0 and 28, like 9 or 2.5.";
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors, values: { cgst, sgst } };
  }

  try {
    await setGstRates({ cgst: Number(cgst), sgst: Number(sgst) });
  } catch (error) {
    console.error("[admin] saving the GST rates failed:", error);
    return { status: "error", message: "Could not save that. Try again.", values: { cgst, sgst } };
  }

  /* Every page that prices anything, which is most of them. */
  revalidatePath("/", "layout");
  return {
    status: "ok",
    message: `Now charging CGST ${cgst}% and SGST ${sgst}%.`,
    values: { cgst, sgst },
  };
}
