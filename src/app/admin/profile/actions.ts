"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
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
  const admin = await requireAdmin();

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
  const admin = await requireAdmin();

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
  const admin = await requireAdmin();

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
  const admin = await requireAdmin();

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

