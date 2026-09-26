"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminNext, login, logout, requireAdmin, requireAdminRole } from "@/lib/auth";
import {
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  updateAdminRole,
  clearAdminPassword,
  ADMIN_ROLES,
} from "@/lib/db/adminUsers";
import { shipmentBookable } from "@/lib/order-delivery";
import { returnView } from "@/lib/admin-list";
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
import { deleteCustomerAccount, findCustomerById, setCustomerBlocked } from "@/lib/db/customers";
import { setSigninCodeOn } from "@/lib/db/settings";
import { REVIEW_STATUSES, setReviewStatus, type ReviewStatus } from "@/lib/db/reviews";
import {
  applyTrackingUpdate,
  claimRefundRequest,
  clearOrderShipment,
  getOrderForAdmin,
  nextShipmentTry,
  orderProgress,
  listPendingRefunds,
  recordRefund,
  recordShipmentFailure,
  releaseRefundRequest,
  setOrderShipment,
  setOrderStatus,
} from "@/lib/db/orders";
import {
  notifyOrderCancelled,
} from "@/lib/order-notifications";
import { fetchRefundStatus, refundPayment } from "@/lib/razorpay";
import { refundBlock, refundBlockMessage } from "@/lib/refunds";
import { formatPaise } from "@/lib/pricing";
import { listProducts } from "@/lib/db/products";
import {
  bookShipment,
  cancelShipment,
  fetchTracking,
  isShiprocketConfigured,
} from "@/lib/shiprocket";
import { packParcel } from "@/lib/parcel";
import { deleteSubscriber } from "@/lib/db/subscribers";
import { upsertPageSeo } from "@/lib/db/pageSeo";
import { deleteAvatar, deleteProductImages, uploadProductImage } from "@/lib/storage";
import { CATEGORY_KEYS, PROTECTION_KEYS } from "@/content/taxonomy";
import { SEO_PAGES } from "@/lib/seo";
import { site } from "@/content/site";
import { parseVideoUrl } from "@/lib/video";
import type {
  AdminRole,
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
  /** Typed values echoed back so the form can pre-fill on error. */
  values?: Record<string, string>;
};

/**
 * Where an action on a paged list sends the admin afterwards: the same list,
 * with the outcome (`updated=1`) and the view the form was posted from — its
 * hidden `view` field, see `returnView` — so a change made on page 3 of a
 * search lands back on page 3 of that search (2026-09-19).
 */
function backTo(path: string, formData: FormData, outcome = "", anchor = ""): string {
  const qs = [outcome, returnView(formData.get("view"))].filter(Boolean).join("&");
  return `${path}${qs ? `?${qs}` : ""}${anchor ? `#${anchor}` : ""}`;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return {
      error: "Please enter your email address and password.",
      values: { email },
    };
  }

  const result = await login(email, password);

  if (!result.ok) {
    if (result.reason === "not-configured") {
      // Redirect so the error survives the page load (avoids storing sensitive
      // state in action return values that can be cached).
      redirect("/admin?error=auth-secret");
    }

    // Deliberately vague — do not distinguish "no such email" from "wrong
    // password" to prevent user enumeration.
    return {
      error: "Incorrect email or password.",
      values: { email },
    };
  }

  /* Back to the page that asked for a sign-in, when there was one (client,
     2026-09-25). Re-checked here: the form field is as forgeable as the URL
     it came from. */
  redirect(adminNext(formData.get("next")?.toString()) || "/admin/products");
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/admin");
}

export async function clearAdminPasswordAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  requireAdminRole(admin, ["super"]);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  if (id === admin.id) {
    redirect("/admin/users/access?error=self");
  }

  try {
    await clearAdminPassword(id);
  } catch (error) {
    console.error("[admin] password clear failed:", error);
    redirect("/admin/users/access?error=1");
  }

  redirect("/admin/users/access?cleared=1");
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
      /* Tags (client, 2026-09-22). `outOfStock` is a control, not a label:
         `createOrder` refuses a basket that contains one. */
      outOfStock: formData.get("outOfStock") === "on",
      bestSeller: formData.get("bestSeller") === "on",
      limitedDeal: formData.get("limitedDeal") === "on",
      seoTitle: String(formData.get("seoTitle") ?? "").trim().slice(0, 70),
      seoDescription: String(formData.get("seoDescription") ?? "").trim().slice(0, 200),
    },
  };
}

export async function saveProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  requireAdminRole(admin, ["super", "admin"]);

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
  const admin = await requireAdmin();
  requireAdminRole(admin, ["super", "admin"]);

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
  const admin = await requireAdmin();
  requireAdminRole(admin, ["super", "admin"]);
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
  const admin = await requireAdmin();
  requireAdminRole(admin, ["super"]);

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
  const admin = await requireAdmin();
  requireAdminRole(admin, ["super", "admin"]);

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
  const admin = await requireAdmin();

  if (admin.role !== "super" && admin.role !== "admin") {
    redirect(backTo("/admin/subscribers", formData, "error=access"));
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  try {
    await deleteSubscriber(id);
  } catch (error) {
    console.error("[admin] subscriber delete failed:", error);
    redirect(backTo("/admin/subscribers", formData, "error=1"));
  }

  redirect(backTo("/admin/subscribers", formData, "removed=1"));
}

// ---------------------------------------------------------------------------
// Enquiries
//
// Read/mark/delete only. Enquiries are created by visitors through the
// unauthenticated action in `app/(site)/actions.ts`.
// ---------------------------------------------------------------------------

export async function setEnquiryHandledAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  if (admin.role !== "super" && admin.role !== "admin" && admin.role !== "support") {
    redirect(backTo("/admin/enquiries", formData, "error=access"));
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  try {
    await setEnquiryHandled(id, formData.get("handled") === "1");
  } catch (error) {
    console.error("[admin] enquiry update failed:", error);
    redirect(backTo("/admin/enquiries", formData, "error=1"));
  }

  redirect(backTo("/admin/enquiries", formData, "", `enquiry-${id}`));
}

export async function deleteEnquiryAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  if (admin.role !== "super" && admin.role !== "admin") {
    redirect(backTo("/admin/enquiries", formData, "error=access"));
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  try {
    await deleteEnquiry(id);
  } catch (error) {
    console.error("[admin] enquiry delete failed:", error);
    redirect(backTo("/admin/enquiries", formData, "error=1"));
  }

  redirect(backTo("/admin/enquiries", formData, "removed=1"));
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
  const admin = await requireAdmin();

  if (admin.role !== "super" && admin.role !== "admin" && admin.role !== "support") {
    redirect(backTo("/admin/orders", formData, "error=access"));
  }

  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  const failed = backTo("/admin/orders", formData, "error=1");
  if (!id || !(ORDER_STATUSES as readonly string[]).includes(status)) redirect(failed);

  let change: Awaited<ReturnType<typeof setOrderStatus>> = null;
  try {
    change = await setOrderStatus(id, status as OrderStatus);
  } catch (error) {
    console.error("[admin] order status failed:", error);
    redirect(failed);
  }
  if (!change) redirect(failed);

  /**
   * What the customer hears about it (client, 2026-09-17), decided from the
   * status the locked row actually had, not the one on the operator's screen.
   *
   * Cancelling emails them from `no-reply@`, and — if a shipment was booked and
   * has not been picked up — cancels it at Shiprocket too, so a courier does
   * not turn up for a parcel nobody is sending. After pickup Shiprocket cannot
   * cancel; the result says so, because the operator then has a return to
   * arrange. Shipped and delivered email only when the order moved *forward*
   * into them: correcting a mistaken "delivered" back to "shipped" is
   * housekeeping, not news.
   */
  let outcome = "";
  const { previousStatus } = change;
  if (previousStatus !== change.status) {
    if (change.status === "cancelled") {
      const order = await getOrderForAdmin(id);
      if (order?.shipmentOrderId && isShiprocketConfigured()) {
        if (orderProgress(previousStatus) >= orderProgress("shipped")) {
          outcome = "&shipment=picked";
        } else {
          outcome = (await cancelShipment(order.shipmentOrderId))
            ? "&shipment=cancelled"
            : "&shipment=failed";
        }
      }
      /* The one status change the customer is emailed about (client,
         2026-09-19): shipped and delivered come from Shiprocket. */
      await notifyOrderCancelled(id);
      outcome += "&mailed=1";
    }
  }

  revalidatePath("/admin/orders");
  /* The customer's own copy shows the same status, and both routes are
     `force-dynamic` — but the client-side router cache is not. */
  revalidatePath("/account/orders");
  redirect(backTo("/admin/orders", formData, `updated=1${outcome}`));
}

/**
 * Confirms a pending order (pending → confirmed).
 *
 * Dedicated action for the "Confirm" button that replaces the status select on
 * pending cards (2026-09-23). Confirmation is a deliberate operator decision,
 * so it gets its own button rather than being reachable via the select — the
 * select is hidden while the order is pending.
 *
 * No customer email: the customer already received their order-placed mail.
 * Shipped and delivered come from Shiprocket.
 */
export async function confirmOrderAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  if (admin.role !== "super" && admin.role !== "admin" && admin.role !== "support") {
    redirect(backTo("/admin/orders", formData, "error=access"));
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect(backTo("/admin/orders", formData, "error=1"));

  try {
    const change = await setOrderStatus(id, "confirmed");
    if (!change) redirect(backTo("/admin/orders", formData, "error=1"));
  } catch (error) {
    console.error("[admin] confirm order failed:", error);
    redirect(backTo("/admin/orders", formData, "error=1"));
  }

  revalidatePath("/admin/orders");
  revalidatePath("/account/orders");
  redirect(backTo("/admin/orders", formData, "confirmed=1"));
}

/**
 * Cancels a pending order (pending → cancelled).
 *
 * Dedicated action for the "Cancel" button on pending cards (2026-09-23).
 * Shares the same post-cancel side-effects as `setOrderStatusAction`:
 *  - Cancels a Shiprocket shipment when one is already booked (rare for a
 *    pending order but handled for safety)
 *  - Emails the customer their cancellation notice
 *
 * An online-payment order lands in the Refund-cancelled tab and the Refund
 * button becomes available — the action itself does not initiate the refund.
 */
export async function cancelOrderAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  if (admin.role !== "super" && admin.role !== "admin" && admin.role !== "support") {
    redirect(backTo("/admin/orders", formData, "error=access"));
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect(backTo("/admin/orders", formData, "error=1"));

  let change: Awaited<ReturnType<typeof setOrderStatus>> = null;
  try {
    change = await setOrderStatus(id, "cancelled");
  } catch (error) {
    console.error("[admin] cancel order failed:", error);
    redirect(backTo("/admin/orders", formData, "error=1"));
  }
  if (!change) redirect(backTo("/admin/orders", formData, "error=1"));

  let outcome = "";
  if (change.previousStatus !== "cancelled") {
    const order = await getOrderForAdmin(id);
    if (order?.shipmentOrderId && isShiprocketConfigured()) {
      if (orderProgress(change.previousStatus) >= orderProgress("shipped")) {
        outcome = "&shipment=picked";
      } else {
        outcome = (await cancelShipment(order.shipmentOrderId))
          ? "&shipment=cancelled"
          : "&shipment=failed";
      }
    }
    await notifyOrderCancelled(id);
    outcome += "&mailed=1";
  }

  revalidatePath("/admin/orders");
  revalidatePath("/account/orders");
  redirect(backTo("/admin/orders", formData, `updated=1${outcome}`));
}

/**
 * Refunds an online payment from `/admin/orders` (client, 2026-09-17: "I want
 * to initiate refund from admin itself, no need to go to razorpay").
 *
 * **Everything is re-checked here, not trusted from the form.** The order is
 * re-read, the amount must be a positive rupee figure no larger than what is
 * still unrefunded, and the order must have a captured Razorpay payment. The
 * form's pre-filled amount is a convenience; this is the control.
 *
 * **One request at a time per order** (`claimRefundRequest`): a double click
 * or a second tab is refused instead of becoming a second refund.
 *
 * On success the refund is recorded and the customer emailed straight away,
 * keyed on Razorpay's refund id — so when Razorpay's `refund.processed`
 * webhook arrives for the same refund it finds it already recorded and sends
 * nothing. Whichever of the two gets there first does the recording.
 */
export async function refundOrderAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  requireAdminRole(admin, ["super", "admin"]);

  const id = String(formData.get("id") ?? "").trim();
  const back = (query: string) => backTo("/admin/orders", formData, query, `order-${id}`);
  if (!id) redirect(back("error=1"));

  const order = await getOrderForAdmin(id);
  if (!order) redirect(back("error=1"));

  const fail = (message: string) =>
    redirect(back(`refundError=${encodeURIComponent(message.slice(0, 200))}`));

  /* Cancelled, paid online, something left, never dispatched — the same rule
     the card uses to show the button, checked again because the page may be
     stale. */
  const block = refundBlock(order);
  if (block) fail(refundBlockMessage(block));
  const remaining = order.total - order.refundedAmount;

  /* Rupees as typed, to paise, without floating point: "1,424.04" → 142404. */
  const typed = String(formData.get("amount") ?? "").replace(/[,\s₹]/g, "");
  const match = typed.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) fail("Enter the amount to refund in rupees, for example 1424.04.");
  const amount = Number(match![1]) * 100 + Number((match![2] ?? "").padEnd(2, "0"));
  if (amount <= 0) fail("The refund amount must be more than zero.");
  if (amount > remaining) {
    fail(`That is more than is left to refund (${formatPaise(remaining)}).`);
  }

  if (!(await claimRefundRequest(order.id))) {
    fail("A refund for this order was requested moments ago. Wait a minute and check before trying again.");
  }

  let outcome: string;
  try {
    const result = await refundPayment({
      paymentId: order.paymentId!,
      amountPaise: amount,
      orderNumber: order.orderNumber,
      /* See `refundPayment`: unique per genuine refund, repeated by a
         duplicate of the same request. */
      receipt: `${order.orderNumber}-${order.refundedAmount}-${amount}`,
    });

    if (!result.ok) {
      outcome = `refundError=${encodeURIComponent(`Razorpay refused the refund: ${result.error}`.slice(0, 200))}`;
    } else {
      try {
        /* Recorded as Razorpay answered — nearly always `pending`, which the
           card shows as "Refund processing" until the `refund.processed`
           webhook (or Check with Razorpay) confirms it (client, 2026-09-19).
           Not emailed: Razorpay tells the customer. */
        const status = result.status === "processed" ? "processed" : "pending";
        const change = await recordRefund({
          orderId: order.id,
          refundId: result.refundId,
          amount: result.amount,
          status,
        });
        if (!change) console.info("[admin] refund already recorded:", result.refundId);
        outcome = `refunded=${result.amount}${status === "pending" ? "&refundPending=1" : ""}`;
      } catch (error) {
        /* The money has moved; only our record of it failed. The webhook will
           record it when it arrives, so say so rather than inviting a retry
           that would refund twice. */
        console.error("[admin] refund recorded at Razorpay but not here:", error);
        outcome = `refunded=${result.amount}&refundUnrecorded=1`;
      }
    }
  } finally {
    await releaseRefundRequest(order.id).catch(() => {});
  }

  revalidatePath("/admin/orders");
  revalidatePath("/account/orders");
  redirect(back(outcome));
}

/**
 * "Check with Razorpay" on a refund still processing (2026-09-19).
 *
 * The `refund.processed` webhook is what normally moves a refund from
 * processing to refunded; this asks Razorpay directly, for when it has not —
 * the webhook not set up, or delayed. Goes through the same `recordRefund`,
 * so it cannot move a refund backwards or record it twice.
 */
export async function checkRefundsAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const back = (query: string) => backTo("/admin/orders", formData, query, `order-${id}`);

  if (admin.role !== "super" && admin.role !== "admin") {
    redirect(back("error=access"));
  }
  if (!id) redirect(back("error=1"));
  const order = await getOrderForAdmin(id);
  if (!order?.paymentId) redirect(back("error=1"));

  let settled = 0;
  for (const refund of await listPendingRefunds(order.id)) {
    const status = await fetchRefundStatus(order.paymentId, refund.id);
    if (status === "processed" || status === "failed") {
      await recordRefund({ orderId: order.id, refundId: refund.id, amount: refund.amount, status });
      settled++;
    }
  }

  revalidatePath("/admin/orders");
  revalidatePath("/account/orders");
  redirect(back(`refundChecked=${settled ? "settled" : "pending"}`));
}

/**
 * Asks Shiprocket where one parcel is, now.
 *
 * The webhook is how tracking normally arrives; this is for when it has not —
 * the webhook not yet set up in their dashboard, a delivery that failed on
 * their side, or an operator who wants to know before ringing a customer back.
 * It goes through the same `applyTrackingUpdate` as the webhook. Nothing is
 * emailed: Shiprocket tells the customer (client, 2026-09-19).
 */
export async function refreshTrackingAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const back = (query: string) => backTo("/admin/orders", formData, query, `order-${id}`);

  if (admin.role !== "super" && admin.role !== "admin" && admin.role !== "support") {
    redirect(back("error=access"));
  }
  if (!id) redirect(back("error=1"));
  if (!isShiprocketConfigured()) redirect(back("shipError=unconfigured"));

  const order = await getOrderForAdmin(id);
  if (!order?.awb) redirect(back("error=1"));

  let result = "none";
  try {
    const update = await fetchTracking(order.awb);
    if (update) {
      const change = await applyTrackingUpdate(update);
      if (change) result = "1";
    }
  } catch (error) {
    console.error("[admin] tracking refresh failed:", error);
    result = "failed";
  }

  revalidatePath("/admin/orders");
  revalidatePath("/account/orders");
  redirect(back(`tracked=${result}`));
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
/**
 * One order, looked up from a barcode scanned off a parcel label (client,
 * 2026-09-24: "a scan button … which only scans bar code for order id and awb
 * number … show pop up of that order upon scanning").
 *
 * Not a form action: the Scan dialog calls it with whatever the camera read
 * and draws the answer itself. It returns only what that dialog shows — no
 * addresses, no payment ids — because the whole order would otherwise cross
 * to the browser for a summary card.
 *
 * `support` may use it: reading an order is what the role is for.
 */
/**
 * **Not ready** — undoes a booking and puts the order back in Confirmed
 * (client, 2026-09-23).
 *
 * The parcel is cancelled at Shiprocket first; only if that works are our own
 * shipment fields cleared, because an order that still exists at their end
 * must stay findable from the card. After pickup nothing can be undone — the
 * courier has the box — and the card says to arrange a return instead.
 */
export async function unbookShipmentAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const back = (query: string) =>
    backTo(
      "/admin/orders",
      formData,
      id ? `${query}&shipOrder=${encodeURIComponent(id)}` : query,
      id ? `order-${id}` : "",
    );

  if (admin.role !== "super" && admin.role !== "admin") redirect(back("error=access"));
  if (!id) redirect(back("error=1"));

  const order = await getOrderForAdmin(id);
  if (!order) redirect(back("error=1"));
  if (orderProgress(order.status) >= orderProgress("shipped")) redirect(back("unbooked=picked"));
  if (!order.shipmentOrderId) redirect(back("error=1"));

  const cancelled = await cancelShipment(order.shipmentOrderId);
  if (!cancelled) redirect(back("unbooked=failed"));

  await clearOrderShipment(order.id);
  revalidatePath("/admin/orders");
  revalidatePath("/account/orders");
  redirect(back("unbooked=1"));
}

/** What is recorded when Shiprocket assigned no courier and said nothing. */
const NO_COURIER = "No courier was assigned.";

export async function bookShipmentAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  /* Back to the order itself, not the top of the list (client, 2026-09-23:
     "the page moves to the top and i need to scroll down and find the order
     again"). `shipOrder` is which card says what happened — the outcome is
     shown on the order, not in a banner above the page. */
  const back = (query: string) =>
    backTo(
      "/admin/orders",
      formData,
      id ? `${query}&shipOrder=${encodeURIComponent(id)}` : query,
      id ? `order-${id}` : "",
    );

  if (admin.role !== "super" && admin.role !== "admin") {
    redirect(back("error=access"));
  }
  if (!id) redirect(back("error=1"));

  if (!isShiprocketConfigured()) redirect(back("shipError=unconfigured"));

  const order = await getOrderForAdmin(id);
  if (!order) redirect(back("error=1"));
  if (order.shipmentId) redirect(back("shipError=already"));
  /* No limit on how many times this may be pressed (client, 2026-09-23:
     "Even after 3 attempts show the book shipment button, it should work,
     just display contact support message"). `shipment_attempts` is counted
     and shown, and past `SHIPMENT_ATTEMPT_LIMIT` the card says to write to
     support — but it never refuses the press. Each failure is undone at
     Shiprocket, so trying again costs nothing but their patience. */
  /* The customer may still change the delivery address until 11 am the day
     after the order was confirmed (client, 2026-09-18). The page greys the
     button out until then; this is the check that holds when the page is
     stale or the form is posted by hand. */
  if (!shipmentBookable(order).bookable) redirect(back("shipError=window"));

  let outcome = "1";
  /* Shiprocket's own words. A failure keeps them on the order row itself
     (`shipment_error`), so they survive a refresh; this carries the one case
     that is not a failure — booked, but no pickup taken. */
  let reason = "";
  try {
    const products = await listProducts();
    /* Taken before the call, and never reset, so this press cannot send an id
       Shiprocket already holds — see `nextShipmentTry`. */
    const attemptNumber = await nextShipmentTry(order.id);
    const booking = await bookShipment({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      shipTo: order.shipTo,
      billTo: order.billTo,
      /* **The customer's own email** (client, 2026-09-19). Shiprocket now
         sends the shipped / out-for-delivery / delivered / failed-attempt /
         return emails in place of the site's, and sends them to this
         address — so it has to be the customer's. It used to be ours
         (`SHIPROCKET_NOTIFY_EMAIL`, else support@), which is now only the
         fallback for an account with no email. */
      email:
        (await findCustomerById(order.customerId))?.email ||
        process.env.SHIPROCKET_NOTIFY_EMAIL ||
        site.email,
      items: order.items.map((item) => ({
        name: item.name,
        slug: item.slug,
        qty: item.qty,
        unitPrice: item.unitPrice,
      })),
      subtotal: order.subtotal,
      /* Both halves: Shiprocket is told one tax-inclusive figure, and what
         the courier collects on a COD order depends on it. */
      tax: order.cgst + order.sgst,
      shipping: order.shipping,
      parcel: packParcel(
        order.items.map((item) => ({ slug: item.slug, qty: item.qty })),
        products,
      ),
      courierId: order.courierId,
      isCOD: order.paymentProvider === "cod",
      /* A retry sends a fresh order id: Shiprocket hands back the order it
         already has for one it has seen, and assigning a courier to the
         cancelled one fails with "order is in cancelled state". */
      attemptNumber,
    });

    reason = booking.reason ?? "";

    if (booking.awb) {
      await setOrderShipment(order.id, {
        provider: "shiprocket",
        shipmentOrderId: booking.shipmentOrderId,
        shipmentId: booking.shipmentId,
        awb: booking.awb,
        courierName: booking.courierName,
      });
      /* The one thing that may still need doing by hand: no pickup means the
         parcel is booked but nobody has been asked to collect it. */
      outcome = booking.pickupScheduled ? "1" : "nopickup";
    } else if (await cancelShipment(booking.shipmentOrderId)) {
      /* **No courier, so nothing is booked** (client, 2026-09-23: "cancel the
         order in shiprocket if it dosent book"). Their create succeeded and
         the AWB did not, which leaves an order in their dashboard that no
         courier will ever collect; cancelling it is tidying up, and the card
         says nothing about it — only that no courier was assigned, why, and
         how many attempts are left. Nothing is written to the order's
         shipment fields, because there is no shipment. */
      console.info(
        "[admin] no AWB for",
        order.orderNumber,
        "— cancelled Shiprocket order",
        booking.shipmentOrderId,
      );
      await recordShipmentFailure(order.id, reason || NO_COURIER);
      outcome = "noawb";
    } else {
      /* Their order is live and would not cancel. Recording it is the only
         way the operator can find it again, and it also stops this button
         creating a duplicate — the card says to deal with it in their
         dashboard, as it did before any of this. */
      await setOrderShipment(order.id, {
        provider: "shiprocket",
        shipmentOrderId: booking.shipmentOrderId,
        shipmentId: booking.shipmentId,
        awb: null,
        courierName: booking.courierName,
      });
      outcome = "stray";
    }
  } catch (error) {
    console.error("[admin] shipment booking failed:", error);
    /* The create call throws with Shiprocket's response in the message.
       Nothing was created, so there is nothing to cancel — only the press to
       count. */
    const said = error instanceof Error ? error.message : "";
    await recordShipmentFailure(order.id, said || "Shiprocket refused the booking.");
    redirect(back("shipError=failed"));
  }

  revalidatePath("/admin/orders");
  revalidatePath("/account/orders");
  /* A booking that did not happen is an error, not a shipment: the card puts
     the button back, with Shiprocket's reason and what is left of the three
     presses — both read off the order, so a refresh still shows them. */
  if (outcome === "noawb") redirect(back("shipError=noawb"));
  if (outcome === "stray") redirect(back("shipError=stray"));
  redirect(back(`shipped=${outcome}${reason ? `&reason=${encodeURIComponent(reason)}` : ""}`));
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * Turns the emailed sign-in code off or on for one account.
 *
 * **One switch for every customer** (client, 2026-09-21), replacing the
 * per-account exemption this used to be. Off is for a review — the login
 * Razorpay's website verification asks for, used by reviewers who cannot read
 * the account's inbox — and while it is off, nobody is asked for the code, so
 * the page says so in amber and it is meant to go back on straight after.
 *
 * Super users and admins only: it is the customers' second factor.
 */
export async function setSigninCodeAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const back = String(formData.get("q") ?? "").trim();
  const search = back ? `&q=${encodeURIComponent(back)}` : "";

  if (admin.role !== "super" && admin.role !== "admin") {
    redirect(`/admin/users?error=access${search}`);
  }

  const on = formData.get("on") === "1";

  try {
    await setSigninCodeOn(on);
    console.info(`[admin] ${admin.email} turned the sign-in code ${on ? "on" : "off"}`);
  } catch (error) {
    console.error("[admin] sign-in code setting failed:", error);
    redirect(`/admin/users?error=1${search}`);
  }

  revalidatePath("/admin/users");
  /* No `updated=`: the switch itself is the confirmation (client,
     2026-09-21). `search` keeps the list filtered to whatever was typed. */
  redirect(`/admin/users${search ? `?${search.slice(1)}` : ""}`);
}

// ---------------------------------------------------------------------------
// Customer blocking
// ---------------------------------------------------------------------------

/**
 * Blocks or unblocks a customer account.
 *
 * Super users and admins only — enforced here, not just in the UI. Blocking
 * deletes all the customer's active sessions immediately, signing them out of
 * every device. The session lookup query also checks `blocked_at IS NULL`, so
 * a stale cookie cannot resurrect the session.
 *
 * The button is visible to support and viewer but disabled on the server for
 * them — a direct POST returns an error so the UI cannot be bypassed.
 */
export async function blockCustomerAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const back = String(formData.get("q") ?? "").trim();
  const filter = String(formData.get("filter") ?? "").trim();
  const qs = [back ? `q=${encodeURIComponent(back)}` : "", filter ? `filter=${encodeURIComponent(filter)}` : ""]
    .filter(Boolean).join("&");

  // Enforce role — but redirect gracefully rather than throwing so the
  // user sees the inline error banner, not a 500 page.
  if (admin.role !== "super" && admin.role !== "admin") {
    redirect(`/admin/users?error=access${qs ? `&${qs}` : ""}`);
  }

  const id = String(formData.get("id") ?? "").trim();
  const block = formData.get("block") === "1";

  if (!id) redirect(`/admin/users${qs ? `?${qs}` : ""}`);

  try {
    await setCustomerBlocked(id, block);
    console.info(`[admin] ${admin.email} ${block ? "blocked" : "unblocked"} customer ${id}`);
  } catch (error) {
    console.error("[admin] block customer failed:", error);
    redirect(`/admin/users?error=block${qs ? `&${qs}` : ""}`);
  }

  revalidatePath("/admin/users");
  redirect(`/admin/users${qs ? `?${qs}` : ""}`);
}


/**
 * Deletes a customer account and everything it owns (client, 2026-09-26: a
 * delete button beside Login and Block).
 *
 * **Super users only** — one click past the confirmation and an account, its
 * addresses, its saved cart and its sign-in history are gone, with nothing to
 * undo it with. Blocking is the reversible half of this pair and stays open to
 * admins.
 *
 * **An account with orders is refused**, with the count, on the card the admin
 * pressed rather than in a banner at the top of the page: the answer belongs
 * where the question was asked.
 */
export async function deleteCustomerAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const back = String(formData.get("q") ?? "").trim();
  const filter = String(formData.get("filter") ?? "").trim();
  const id = String(formData.get("id") ?? "").trim();
  const to = (params: Record<string, string>) => {
    const qs = new URLSearchParams();
    if (back) qs.set("q", back);
    if (filter) qs.set("filter", filter);
    for (const [key, value] of Object.entries(params)) qs.set(key, value);
    const query = qs.toString();
    /* Back to the card it was pressed on, so a refusal is read in place. */
    return `/admin/users${query ? `?${query}` : ""}${params.user ? `#user-${params.user}` : ""}`;
  };

  if (admin.role !== "super") redirect(to(id ? { error: "delete-access", user: id } : {}));
  if (!id) redirect(to({}));

  let result;
  try {
    result = await deleteCustomerAccount(id);
  } catch (error) {
    /* Includes the foreign key itself: an order placed between the count and
       the delete lands here rather than taking the record with it. */
    console.error("[admin] delete customer failed:", error);
    redirect(to({ error: "delete", user: id }));
  }

  if (!result.ok) {
    if (result.reason === "orders") {
      redirect(to({ error: "delete-orders", orders: String(result.orders), user: id }));
    }
    redirect(to({ error: "delete", user: id }));
  }

  await deleteAvatar(result.avatar);
  console.info(`[admin] ${admin.email} deleted customer ${id} (${result.email})`);

  revalidatePath("/admin/users");
  redirect(to({ deleted: "1" }));
}

// ---------------------------------------------------------------------------
// Admin User Access Levels
// ---------------------------------------------------------------------------

/**
 * Creates a new admin user with no password set.
 *
 * Super users can create any role. Admins can create Admin, Support and Viewer
 * — not Super. This is enforced here, not just in the UI.
 */
export async function createAdminUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  if (admin.role !== "super" && admin.role !== "admin") {
    return { error: "You don't have permission to create users. Only Super Users and Admins can." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "").trim();

  const errors: Record<string, string> = {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "A valid email address is required.";
  }
  if (!name) errors.name = "A name is required.";
  if (!ADMIN_ROLES.includes(roleRaw as AdminRole)) {
    errors.role = "Please choose a valid role.";
  }
  if (Object.keys(errors).length > 0) {
    return { fieldErrors: errors, error: "Please fix the highlighted fields." };
  }

  const role = roleRaw as AdminRole;

  // An Admin can only create Support or Viewer users.
  if (admin.role !== "super" && (role === "super" || role === "admin")) {
    return { error: "Only a Super User can create an Admin or Super User." };
  }

  const created = await createAdminUser({ email, name, role });
  if (!created) {
    return {
      fieldErrors: { email: "That email address is already taken." },
      error: "Please fix the highlighted fields.",
    };
  }

  revalidatePath("/admin/users/access");
  return { ok: true };
}

/**
 * Changes an existing admin user's role.
 *
 * Same constraints: Admin cannot set someone to Super; nobody can change their
 * own role (that would let someone self-escalate).
 */
export async function updateAdminRoleAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  if (admin.role !== "super" && admin.role !== "admin") {
    redirect("/admin/users/access?error=access");
  }

  const id = String(formData.get("id") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "").trim();

  if (!id || !ADMIN_ROLES.includes(roleRaw as AdminRole)) {
    redirect("/admin/users/access?error=invalid");
  }

  // Cannot change your own role.
  if (id === admin.id) redirect("/admin/users/access?error=self");

  // Admin cannot promote to Super or Admin.
  if (admin.role !== "super" && (roleRaw === "super" || roleRaw === "admin")) {
    redirect("/admin/users/access?error=privilege");
  }

  try {
    await updateAdminRole(id, roleRaw as AdminRole);
  } catch (error) {
    console.error("[admin] role update failed:", error);
    redirect("/admin/users/access?error=1");
  }

  revalidatePath("/admin/users/access");
  redirect("/admin/users/access?updated=1");
}

/**
 * Deletes an admin user. Cannot delete yourself.
 *
 * Also cannot delete the last Super User — would lock everyone out.
 */
export async function deleteAdminUserAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  if (admin.role !== "super" && admin.role !== "admin") {
    redirect("/admin/users/access?error=access");
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/admin/users/access?error=invalid");

  if (id === admin.id) redirect("/admin/users/access?error=self");

  // Prevent deleting the last super user.
  if (admin.role === "super") {
    const all = await listAdminUsers();
    const supers = all.filter((u) => u.role === "super");
    const target = all.find((u) => u.id === id);
    if (target?.role === "super" && supers.length <= 1) {
      redirect("/admin/users/access?error=last-super");
    }
  }

  try {
    await deleteAdminUser(id);
  } catch (error) {
    console.error("[admin] admin user delete failed:", error);
    redirect("/admin/users/access?error=1");
  }

  revalidatePath("/admin/users/access");
  redirect("/admin/users/access?deleted=1");
}

// ---------------------------------------------------------------------------
// Product reviews (client, 2026-09-22)
// ---------------------------------------------------------------------------

/**
 * Approves or rejects one review, or moves it back — any status can become any
 * other ("in approved and rejected section we can at any time move the reviews
 * to approved/rejected").
 *
 * Only an approved review is ever read by the site, so this is what decides
 * what the public sees; the status is re-validated here against the fixed
 * list, never trusted from the form. The product's own page is revalidated
 * because its star line and review list have just changed.
 */
export async function setReviewStatusAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const failed = backTo("/admin/reviews", formData, "error=1");

  if (admin.role !== "super" && admin.role !== "admin") {
    redirect(backTo("/admin/reviews", formData, "error=access"));
  }

  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!id || !(REVIEW_STATUSES as readonly string[]).includes(status)) redirect(failed);

  let changed: Awaited<ReturnType<typeof setReviewStatus>> = null;
  try {
    changed = await setReviewStatus(id, status as ReviewStatus, admin.email);
  } catch (error) {
    console.error("[admin] review moderation failed:", error);
    redirect(failed);
  }
  if (!changed) redirect(failed);

  revalidatePath("/admin/reviews");
  revalidatePath(`/products/${changed.slug}`);
  /* The customer's order page says whether their review was published. */
  revalidatePath("/account/orders/[id]", "page");
  redirect(backTo("/admin/reviews", formData, "", `review-${id}`));
}
