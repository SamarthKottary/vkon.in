"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInventory } from "@/lib/auth";
import { revalidateStore } from "@/lib/store-paths";
import type { StorePickup } from "@/lib/types";
import {
  addStoreProducts,
  asStorePickup,
  createStore,
  deleteStore,
  getStoreById,
  listStoreProducts,
  removeStoreProduct,
  reorderStoreProducts,
  setStoreBlocked,
  setStoreProductStock,
  syncStoreProducts,
  updateStore,
  type StoreInput,
} from "@/lib/db/stores";
import { findPickupAddress, isShiprocketConfigured, type PickupAddress } from "@/lib/shiprocket";
import { issueStoreSession } from "@/lib/store-auth";

/**
 * The store pages' server actions (client, 2026-09-26).
 *
 * **`requireInventory()` is the boundary**, exactly as `requireAdmin()` is for
 * the rest of the admin: every one of these is an addressable POST, and an
 * inventory user must reach these and nothing else while support and viewer
 * reach none of them.
 *
 * **A blocked store refuses writes.** Blocking is not a label — it is what
 * "this store is frozen" means, so it is enforced here rather than by hiding
 * buttons, which only stops the people who use the buttons.
 */

export type StoreFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

export type PickupState = {
  status: "idle" | "found" | "missing" | "unreachable" | "off";
  address?: PickupAddress;
  message?: string;
};

/**
 * **Fetch** beside the nickname: the address Shiprocket already holds for it.
 *
 * Read-only, and it says which of "no such nickname" and "Shiprocket could not
 * be reached" happened — they need different things done about them, and one
 * message for both sends somebody to check the wrong thing.
 */
export async function fetchPickupAction(
  _prev: PickupState,
  formData: FormData,
): Promise<PickupState> {
  await requireInventory();

  const nickname = String(formData.get("nickname") ?? "").trim();
  if (!nickname) {
    return { status: "missing", message: "Enter the address name first." };
  }
  if (!isShiprocketConfigured()) {
    return {
      status: "off",
      message: "Shiprocket is not configured on this site, so there is nothing to fetch. Type the address in below.",
    };
  }

  try {
    const address = await findPickupAddress(nickname);
    if (address) return { status: "found", address };
    return {
      status: "missing",
      message: `Shiprocket has no pickup address called “${nickname}”. Check the name on their Pickup Addresses screen, or type this one in below.`,
    };
  } catch (error) {
    console.error("[inventory] pickup fetch failed:", error);
    return {
      status: "unreachable",
      message: "Shiprocket could not be reached just now. Try again, or type the address in below.",
    };
  }
}

function readStore(formData: FormData): StoreInput {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    nickname: text("nickname"),
    contactName: text("contactName"),
    contactRole: text("contactRole"),
    phone: text("phone"),
    email: text("email"),
    line1: text("line1"),
    line2: text("line2"),
    city: text("city"),
    state: text("state"),
    postalCode: text("postalCode"),
    country: text("country") || "India",
    pickupId: text("pickupId") || null,
    fetched: formData.get("fetched") === "1",
    /* What Fetch found, as the form carried it back. `asStorePickup` is the
       whitelist — this arrives in a hidden field like anything else. */
    pickup: readPickup(text("pickup")),
    notes: text("notes"),
  };
}

function readPickup(raw: string): StorePickup {
  if (!raw) return {};
  try {
    return asStorePickup(JSON.parse(raw));
  } catch {
    return {};
  }
}

function validate(input: StoreInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.nickname) errors.nickname = "Give this store a name.";
  if (!input.contactName) errors.contactName = "Contact name is required.";
  if (!input.phone) errors.phone = "Phone is required.";
  if (!input.email) errors.email = "Email is required.";
  if (!input.line1) errors.line1 = "The street address is needed.";
  if (!input.city) errors.city = "Which town or city?";
  if (!input.state) errors.state = "Which state?";
  if (!/^\d{6}$/.test(input.postalCode)) errors.postalCode = "A six-digit PIN code.";
  if (input.phone && !/^[\d+\s-]{8,15}$/.test(input.phone)) errors.phone = "That phone number does not look right.";
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) errors.email = "That email address does not look right.";
  return errors;
}

/**
 * Creates a store, with whatever products were picked before saving, and opens
 * it (client, 2026-09-26: "after saving he will be directed to
 * vkon.in/admin/inventory/storename").
 */
export async function createStoreAction(
  _prev: StoreFormState,
  formData: FormData,
): Promise<StoreFormState> {
  await requireInventory();

  const input = readStore(formData);
  const values = Object.fromEntries(
    [...formData.entries()].filter(([, v]) => typeof v === "string"),
  ) as Record<string, string>;
  const fieldErrors = validate(input);
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const picked = String(formData.get("productIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!picked.length) {
    return {
      fieldErrors: { products: "Select at least one product before saving." },
      values,
    };
  }

  const result = await createStore(input);
  if (!result.ok) {
    return {
      error:
        result.reason === "duplicate"
          ? `There is already a store called “${input.nickname}”.`
          : "That store could not be saved. Try again.",
      values,
    };
  }

  if (picked.length) await addStoreProducts(result.store.id, picked);

  revalidatePath("/admin/inventory");
  redirect(`/admin/inventory/${result.store.slug}`);
}

export async function updateStoreAction(
  _prev: StoreFormState,
  formData: FormData,
): Promise<StoreFormState> {
  await requireInventory();

  const id = String(formData.get("id") ?? "").trim();
  const store = id ? await getStoreById(id) : null;
  if (!store) return { error: "That store no longer exists." };
  if (store.blockedAt) return { error: "This store is blocked. Unblock it before changing it." };

  const input = readStore(formData);
  const values = Object.fromEntries(
    [...formData.entries()].filter(([, v]) => typeof v === "string"),
  ) as Record<string, string>;
  const fieldErrors = validate(input);
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const picked = String(formData.get("productIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!picked.length) {
    return {
      fieldErrors: { products: "Select at least one product before saving." },
      values,
    };
  }

  const result = await updateStore(id, input);
  if (!result.ok) {
    return {
      error:
        result.reason === "duplicate"
          ? `There is already a store called “${input.nickname}”.`
          : "That change could not be saved. Try again.",
      values,
    };
  }

  await syncStoreProducts(result.store.id, picked);

  revalidateStore(result.store.slug);
  redirect(`/admin/inventory/${result.store.slug}`);
}

/** Freezes a store, or lets it go again. The stock it holds is untouched. */
export async function blockStoreAction(formData: FormData): Promise<void> {
  await requireInventory();

  const id = String(formData.get("id") ?? "").trim();
  const block = formData.get("block") === "1";
  const store = id ? await getStoreById(id) : null;
  if (store) await setStoreBlocked(store.id, block);

  /* The store's own pages too: blocking is what shuts its people out, and a
     cached copy of yesterday's page is not the answer they should get. */
  if (store) revalidateStore(store.slug);
  revalidatePath("/admin/inventory");
  redirect(`/admin/inventory${formData.get("from") === "store" && !block ? `/${formData.get("slug")}` : ""}`);
}

/** The store and its stock rows. The products themselves stay in the catalogue. */
export async function deleteStoreAction(formData: FormData): Promise<void> {
  const admin = await requireInventory();

  const id = String(formData.get("id") ?? "").trim();
  if (id) {
    const store = await getStoreById(id);
    if (store) {
      await deleteStore(id);
      console.info(`[inventory] ${admin.email} deleted store ${store.nickname}`);
      revalidateStore(store.slug);
    }
  }

  revalidatePath("/admin/inventory");
  redirect("/admin/inventory");
}

async function writableStore(id: string) {
  const store = id ? await getStoreById(id) : null;
  if (!store || store.blockedAt) return null;
  return store;
}

/** **Save products**: what the picker chose, appended to what is already held. */
export async function addStoreProductsAction(formData: FormData): Promise<void> {
  await requireInventory();

  const store = await writableStore(String(formData.get("storeId") ?? "").trim());
  if (!store) redirect("/admin/inventory");

  const ids = String(formData.get("productIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length) await addStoreProducts(store.id, ids);

  revalidateStore(store.slug);
  redirect(`/admin/inventory/${store.slug}`);
}

/** **Edit** on a row: how many of it this store holds, and a note about it. */
export async function setStoreStockAction(formData: FormData): Promise<void> {
  await requireInventory();

  const store = await writableStore(String(formData.get("storeId") ?? "").trim());
  if (!store) redirect("/admin/inventory");

  const id = String(formData.get("id") ?? "").trim();
  const qty = Number(String(formData.get("qty") ?? "0").replace(/[^\d]/g, "")) || 0;
  const note = String(formData.get("note") ?? "").trim();
  if (id) await setStoreProductStock(id, qty, note);

  revalidateStore(store.slug);
  redirect(`/admin/inventory/${store.slug}#row-${id}`);
}

/** **Delete** on a row: this store stops holding it. */
export async function removeStoreProductAction(formData: FormData): Promise<void> {
  await requireInventory();

  const store = await writableStore(String(formData.get("storeId") ?? "").trim());
  if (!store) redirect("/admin/inventory");

  const id = String(formData.get("id") ?? "").trim();
  if (id) await removeStoreProduct(id);

  revalidateStore(store.slug);
  redirect(`/admin/inventory/${store.slug}`);
}

/** The order the rows were dragged or stepped into. */
export async function reorderStoreProductsAction(storeId: string, ids: string[]): Promise<void> {
  await requireInventory();

  const store = await writableStore(storeId);
  if (!store) return;

  /* Only rows this store actually holds, whatever the browser sent. */
  const held = new Set((await listStoreProducts(store.id)).map((row) => row.id));
  await reorderStoreProducts(store.id, ids.filter((id) => held.has(id)));
  revalidateStore(store.slug);
}

export async function impersonateStoreAction(formData: FormData): Promise<void> {
  await requireInventory();
  
  const id = String(formData.get("id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  
  const store = await getStoreById(id);
  if (!store || store.blockedAt) {
    redirect("/admin/inventory");
  }

  const { issueStoreSession } = await import("@/lib/store-auth");
  await issueStoreSession(id);
  redirect(`/${slug}`);
}
