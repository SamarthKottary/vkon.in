"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdminConfigured, login, logout, requireAdmin } from "@/lib/auth";
import {
  createProduct,
  deleteProduct,
  getProductById,
  nextSortOrder,
  reorderProducts,
  slugExists,
  updateProduct,
} from "@/lib/db/products";
import { deleteEnquiry, setEnquiryHandled } from "@/lib/db/enquiries";
import { getOrderForAdmin, setOrderShipment, setOrderStatus } from "@/lib/db/orders";
import { listProducts } from "@/lib/db/products";
import { bookShipment, isShiprocketConfigured } from "@/lib/shiprocket";
import { packParcel } from "@/lib/parcel";
import { deleteSubscriber } from "@/lib/db/subscribers";
import { upsertPageSeo } from "@/lib/db/pageSeo";
import { deleteProductImages, uploadProductImage } from "@/lib/storage";
import { CATEGORY_KEYS, PROTECTION_KEYS } from "@/content/taxonomy";
import { SEO_PAGES } from "@/lib/seo";
import { site } from "@/content/site";
import { parseVideoUrl } from "@/lib/video";
import type {
  OrderStatus,
  ProductCategory,
  ProductImage,
  ProductInput,
  ProtectionKey,
  SpecRow,
} from "@/lib/types";

/**
 * Admin server actions.
 *
 * SECURITY: every mutating action calls `requireAdmin()` first. Server actions
 * are independently addressable POST endpoints — the fact that /admin pages
 * check auth before rendering does NOT protect them. This is the boundary.
 *
 * All input is re-validated here. Anything the browser sent is untrusted,
 * including select values and hidden fields.
 */

export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");

  if (!isAdminConfigured()) {
    return {
      error:
        "Admin is not configured. Set ADMIN_PASSWORD and AUTH_SECRET in your environment, then restart.",
    };
  }

  const result = await login(password);

  if (!result.ok) {
    // Deliberately vague — do not reveal whether configuration or the password
    // was at fault beyond the not-configured case handled above.
    return { error: "Incorrect password." };
  }

  redirect("/admin/products");
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/admin");
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** One item per line, blanks dropped. How the admin edits every list field. */
function parseLines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** "Label: value" per line, or "Label | value". */
function parseSpec(value: FormDataEntryValue | null): SpecRow[] {
  return parseLines(value).flatMap((line) => {
    const separator = line.includes("|") ? "|" : ":";
    const index = line.indexOf(separator);
    if (index < 1) return [];
    const label = line.slice(0, index).trim();
    const v = line.slice(index + 1).trim();
    if (!label || !v) return [];
    return [{ label, value: v }];
  });
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseImages(formData: FormData): ProductImage[] {
  // Existing images come back as parallel arrays from the edit form.
  const urls = formData.getAll("imageUrl").map(String);
  const alts = formData.getAll("imageAlt").map(String);
  const pathnames = formData.getAll("imagePathname").map(String);

  return urls.flatMap((url, index) => {
    const trimmed = url.trim();
    if (!trimmed) return [];
    return [
      {
        url: trimmed,
        alt: (alts[index] ?? "").trim(),
        ...(pathnames[index] ? { pathname: pathnames[index] } : {}),
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Product create / update
// ---------------------------------------------------------------------------

async function buildInput(formData: FormData): Promise<{
  // `sortOrder` is set by the caller — see the comment on `saveProductAction`.
  input: Omit<ProductInput, "sortOrder">;
  fieldErrors: Record<string, string>;
}> {
  const fieldErrors: Record<string, string> = {};

  const name = String(formData.get("name") ?? "").trim();
  if (!name) fieldErrors.name = "A product name is required.";

  const rawSlug = String(formData.get("slug") ?? "").trim();
  const slug = slugify(rawSlug || name);
  if (!slug) fieldErrors.slug = "Could not build a URL from that name.";

  const rawCategory = String(formData.get("category") ?? "");
  const category = (CATEGORY_KEYS as string[]).includes(rawCategory)
    ? (rawCategory as ProductCategory)
    : "starter";

  const videoUrlRaw = String(formData.get("videoUrl") ?? "").trim();
  if (videoUrlRaw && !parseVideoUrl(videoUrlRaw)) {
    fieldErrors.videoUrl =
      "Paste a YouTube or Vimeo link. Other providers are not supported.";
  }

  const protections = formData
    .getAll("protections")
    .map(String)
    .filter((k): k is ProtectionKey =>
      (PROTECTION_KEYS as readonly string[]).includes(k),
    );

  const priceRaw = String(formData.get("price") ?? "").trim();
  const parsedPrice = priceRaw ? parseInt(priceRaw, 10) : null;
  const price =
    parsedPrice === null || Number.isNaN(parsedPrice) || parsedPrice < 0
      ? null
      : parsedPrice;

  /* Clamped to 0–99 here rather than trusted from the form: `min`/`max` on a
     number input are a hint to the browser, and this action is an
     independently addressable POST endpoint. 100 would price the product at
     zero, which is the one value that would render as a real offer while
     being certainly wrong.

     A discount with no price to take it off is dropped — `ProductPrice` has
     nothing to show in that case, and storing it would leave a number in the
     admin that never appears anywhere. */
  const discountRaw = String(formData.get("discountPercent") ?? "").trim();
  const parsedDiscount = discountRaw ? parseInt(discountRaw, 10) : null;
  const discountPercent =
    price === null || parsedDiscount === null || Number.isNaN(parsedDiscount)
      ? null
      : Math.min(99, Math.max(0, parsedDiscount));

  /* Grams, bounded here rather than trusted from the `number` input for the
     same reason the discount is: this action is an addressable POST endpoint
     and `min`/`max` are browser hints. The ceiling is 100 kg — past that it is
     a freight consignment, not something a courier aggregator will carry, and
     a mistyped `50000` would otherwise quote a customer for a tonne. Blank
     stays null, which is what makes the category estimate apply. */
  const weightRaw = String(formData.get("weightGrams") ?? "").trim();
  const parsedWeight = weightRaw ? parseInt(weightRaw, 10) : null;
  const weightGrams =
    parsedWeight === null || Number.isNaN(parsedWeight) || parsedWeight <= 0
      ? null
      : Math.min(100_000, parsedWeight);

  /* Whole centimetres, and **all three or none**. A measured length beside an
     estimated width describes a box nobody owns, and its volume would be
     wrong in a way that silently changes the freight quote — so a partial set
     is discarded and the category estimate used instead. 300 cm is the
     ceiling: past that no courier aggregator will carry it anyway. */
  const dim = (field: string): number | null => {
    const raw = String(formData.get(field) ?? "").trim();
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) || n <= 0 ? null : Math.min(300, n);
  };
  const rawLength = dim("lengthCm");
  const rawBreadth = dim("breadthCm");
  const rawHeight = dim("heightCm");
  const complete = rawLength !== null && rawBreadth !== null && rawHeight !== null;
  const lengthCm = complete ? rawLength : null;
  const breadthCm = complete ? rawBreadth : null;
  const heightCm = complete ? rawHeight : null;

  if (!complete && (rawLength || rawBreadth || rawHeight)) {
    fieldErrors.lengthCm =
      "Enter all three dimensions, or leave all three blank to use the category estimate.";
  }

  return {
    fieldErrors,
    input: {
      slug,
      name,
      category,
      weightGrams,
      lengthCm,
      breadthCm,
      heightCm,
      tagline: String(formData.get("tagline") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim(),
      images: parseImages(formData),
      videoUrl: videoUrlRaw || null,
      videoTitle: String(formData.get("videoTitle") ?? "").trim() || null,
      hpRanges: parseLines(formData.get("hpRanges")),
      features: parseLines(formData.get("features")),
      protections,
      spec: parseSpec(formData.get("spec")),
      price,
      discountPercent,
      published: formData.get("published") === "on",
      featured: formData.get("featured") === "on",
      seoTitle: String(formData.get("seoTitle") ?? "").trim().slice(0, 70),
      seoDescription: String(formData.get("seoDescription") ?? "").trim().slice(0, 200),
    },
  };
}

export async function saveProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim() || null;
  const { input: draft, fieldErrors } = await buildInput(formData);

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, error: "Please fix the highlighted fields." };
  }

  if (await slugExists(draft.slug, id ?? undefined)) {
    return {
      fieldErrors: { slug: "Another product already uses this URL." },
      error: "Please fix the highlighted fields.",
    };
  }

  try {
    if (id) {
      const existing = await getProductById(id);
      if (!existing) return { error: "That product no longer exists." };
      // Order is set from the admin list's drag handles, not this form —
      // carry the existing value through rather than reset it to 0.
      await updateProduct(id, { ...draft, sortOrder: existing.sortOrder });
    } else {
      await createProduct({ ...draft, sortOrder: await nextSortOrder() });
    }
  } catch (error) {
    console.error("[admin] save failed:", error);
    return { error: "Could not save. Check the database connection and retry." };
  }

  redirect("/admin/products?saved=1");
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const removed = await deleteProduct(id);

  if (removed) {
    // Delete the uploaded files too, so storage does not fill with orphans.
    const pathnames = removed.images
      .map((image) => image.pathname)
      .filter((p): p is string => Boolean(p));
    await deleteProductImages(pathnames);

  }

  redirect("/admin/products?deleted=1");
}

/**
 * Persists the order the admin list's drag handles left the products in.
 *
 * No redirect: this is called from a client component that already holds the
 * dragged-to order in state and has re-rendered with it, so a navigation here
 * would only interrupt that with a round trip. `revalidatePath` clears the
 * cached list instead, so the next real visit (or a manual refresh) reads the
 * order that was just written rather than a stale one.
 */
export async function reorderProductsAction(ids: string[]): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;
  await reorderProducts(ids);
  revalidatePath("/admin/products");
}

// ---------------------------------------------------------------------------
// Static-page SEO
// ---------------------------------------------------------------------------

/**
 * Saves the meta title and description overrides for the static routes.
 *
 * The form submits parallel `path` / `title` / `description` arrays, one entry
 * per editable page. Only paths in `SEO_PAGES` are written — the list is the
 * allowlist, so a forged `path` field cannot create arbitrary rows. Values are
 * trimmed and capped to the lengths search engines actually use.
 */
export async function savePageSeoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const paths = formData.getAll("path").map(String);
  const titles = formData.getAll("title").map(String);
  const descriptions = formData.getAll("description").map(String);
  const allowed = new Set<string>(SEO_PAGES.map((page) => page.path));

  try {
    for (let index = 0; index < paths.length; index += 1) {
      const path = paths[index];
      if (!allowed.has(path)) continue;
      await upsertPageSeo(
        path,
        (titles[index] ?? "").trim().slice(0, 70),
        (descriptions[index] ?? "").trim().slice(0, 200),
      );
    }
  } catch (error) {
    console.error("[admin] page SEO save failed:", error);
    return { error: "Could not save. Check the database connection and retry." };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Image upload
// ---------------------------------------------------------------------------

export type UploadState = {
  error?: string;
  uploaded?: { url: string; pathname: string; alt: string };
};

export async function uploadImageAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file received." };

  const result = await uploadProductImage(file);
  if (!result.ok) return { error: result.error };

  return {
    uploaded: {
      url: result.url,
      pathname: result.pathname,
      alt: "",
    },
  };
}

// ---------------------------------------------------------------------------
// Subscribers
//
// Read-only in the admin apart from removal. Addresses are *created* by
// visitors, through the unauthenticated action in `app/(site)/actions.ts` —
// this half is only ever taking one off the list.
// ---------------------------------------------------------------------------

export async function deleteSubscriberAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  try {
    await deleteSubscriber(id);
  } catch (error) {
    console.error("[admin] subscriber delete failed:", error);
    redirect("/admin/subscribers?error=1");
  }

  redirect("/admin/subscribers?removed=1");
}

// ---------------------------------------------------------------------------
// Enquiries
//
// Read/mark/delete only. Enquiries are created by visitors through the
// unauthenticated action in `app/(site)/actions.ts`.
// ---------------------------------------------------------------------------

export async function setEnquiryHandledAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  try {
    await setEnquiryHandled(id, formData.get("handled") === "1");
  } catch (error) {
    console.error("[admin] enquiry update failed:", error);
    redirect("/admin/enquiries?error=1");
  }

  redirect("/admin/enquiries");
}

export async function deleteEnquiryAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  try {
    await deleteEnquiry(id);
  } catch (error) {
    console.error("[admin] enquiry delete failed:", error);
    redirect("/admin/enquiries?error=1");
  }

  redirect("/admin/enquiries?removed=1");
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/**
 * Moves an order along: pending → confirmed → shipped → delivered, or
 * cancelled.
 *
 * `requireAdmin()` first, like everything else that writes here — `/admin` is
 * `force-dynamic` and checks before rendering, and that protects the *page*,
 * not this POST endpoint.
 *
 * **The status is validated against a fixed list, not trusted from the form.**
 * It arrives from a `<select>`, and §7 is explicit that a select's value is a
 * convenience and never a control.
 *
 * **Payment status is deliberately not editable here.** It is set by the
 * gateway. A human toggling "paid" would be recording that money arrived
 * without anything having checked that it did.
 */
const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export async function setOrderStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!id || !(ORDER_STATUSES as readonly string[]).includes(status)) {
    redirect("/admin/orders?error=1");
  }

  try {
    await setOrderStatus(id, status as OrderStatus);
  } catch (error) {
    console.error("[admin] order status failed:", error);
    redirect("/admin/orders?error=1");
  }

  revalidatePath("/admin/orders");
  /* The customer's own copy shows the same status, and both routes are
     `force-dynamic` — but the client-side router cache is not. */
  revalidatePath("/account/orders");
  redirect("/admin/orders?updated=1");
}

/**
 * Books the shipment for one order with the courier.
 *
 * **Guarded against being pressed twice**, which is the failure that matters
 * here: Shiprocket rejects a duplicate `order_id`, so a second press would
 * produce an error message rather than a second parcel — but it would also
 * overwrite a perfectly good AWB with nothing. An order that already has a
 * shipment id is left alone and says so.
 *
 * The weight sent is the one checkout quoted on, computed from the same
 * function (`packParcel`) over the order's own lines — so the box the customer
 * was charged for and the box the courier is told about are the same one.
 * The order's saved item names are used rather than the live catalogue,
 * because an order is a snapshot and a product renamed since must not change
 * what is written on the parcel.
 */
export async function bookShipmentAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/admin/orders?error=1");

  if (!isShiprocketConfigured()) redirect("/admin/orders?shipError=unconfigured");

  const order = await getOrderForAdmin(id);
  if (!order) redirect("/admin/orders?error=1");
  if (order.shipmentId) redirect("/admin/orders?shipError=already");

  try {
    const products = await listProducts();
    const booking = await bookShipment({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      shipTo: order.shipTo,
      billTo: order.billTo,
      /* The address snapshot carries no email — it is the account's, and the
         courier uses it only for their own delivery notifications. */
      email: process.env.SHIPROCKET_NOTIFY_EMAIL || site.email,
      items: order.items.map((item) => ({
        name: item.name,
        slug: item.slug,
        qty: item.qty,
        unitPrice: item.unitPrice,
      })),
      subtotal: order.subtotal,
      parcel: packParcel(
        order.items.map((item) => ({ slug: item.slug, qty: item.qty })),
        products,
      ),
      courierId: order.courierId,
    });

    await setOrderShipment(order.id, {
      provider: "shiprocket",
      shipmentOrderId: booking.shipmentOrderId,
      shipmentId: booking.shipmentId,
      awb: booking.awb,
      courierName: booking.courierName,
    });
  } catch (error) {
    console.error("[admin] shipment booking failed:", error);
    redirect("/admin/orders?shipError=failed");
  }

  revalidatePath("/admin/orders");
  revalidatePath("/account/orders");
  redirect("/admin/orders?shipped=1");
}
