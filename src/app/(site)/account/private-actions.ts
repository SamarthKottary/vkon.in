"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { endAllSessions, requireCustomer, startSession } from "@/lib/account";
import {
  createAddress,
  deleteAddress,
  getAddress,
  setDefaultAddress,
  updateAddress,
  type AddressInput,
} from "@/lib/db/addresses";
import {
  getPasswordHash,
  setCustomerPassword,
  updateCustomerProfile,
} from "@/lib/db/customers";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { confirmationProblem } from "@/lib/password-policy";
import { trustThisDevice } from "@/lib/signin-challenge";
import { createOrder } from "@/lib/db/orders";
import { listProducts } from "@/lib/db/products";
import {
  isShiprocketConfigured,
  quoteDelivery,
  shortlistDeliveryOptions,
  type DeliveryOption,
} from "@/lib/shiprocket";
import { packParcel } from "@/lib/parcel";
import { sendOrderPlacedMail } from "@/lib/mail";
import { formatPaise, priceLines, totals } from "@/lib/pricing";
import { site } from "@/content/site";
import type { Address, ShipTo } from "@/lib/types";
import { getCustomerCart, saveCustomerCart, mergeCustomerCart } from "@/lib/db/cart";
import type { CartLine } from "@/lib/cart";

/**
 * Account actions that require a signed-in customer.
 *
 * **`requireCustomer()` is the first statement of every export here**, which
 * is the same rule ARCHITECTURE.md §9 states for `requireAdmin()` in
 * `app/admin/actions.ts`, for the same reason: a server action is an
 * independently addressable POST endpoint, and the fact that `/account` checks
 * before rendering does not protect it. A page guard protects a render; this
 * protects the write.
 *
 * **The customer id comes from the session, never from the form.** Every query
 * below is scoped by it. An address id or an order id can be typed into a
 * request by anybody; the owner cannot.
 *
 * Public actions — register, sign in, forgotten password — live in
 * `actions.ts` next door, under a different and much heavier set of guards.
 */

export type AccountState = {
  status: "idle" | "ok" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  /**
   * What was typed, echoed back so the form can restore it.
   *
   * React 19 resets an uncontrolled form once its action resolves, so a single
   * rejected PIN code would otherwise blank all eight address fields and make
   * the person type the lot again. See the fuller note on `AuthState.values`
   * in `actions.ts`, where this was first found.
   */
  values?: Record<string, string>;
};

const MAX = {
  name: 120,
  phone: 40,
  line: 200,
  city: 80,
  state: 80,
  postal: 12,
  gstin: 15,
  notes: 1000,
};

/** Indian PIN codes are six digits and never start with a zero. */
const PIN = /^[1-9][0-9]{5}$/;
/** Ten digits, optionally with +91 or 0 in front, optionally spaced. What a
 *  person actually types, rather than a shape they have to learn. */
const PHONE = /^(\+?91[-\s]?)?[0]?[6-9]\d{9}$/;

/**
 * A GSTIN's shape: two-digit state code, the ten-character PAN of the holder,
 * a one-character entity number, a literal `Z`, and a check character.
 */
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** The alphabet the check character is computed over: 0-9 then A-Z, so a
 *  character's value is its index. */
const GSTIN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * The GSTIN check character, per GSTN's published rule.
 *
 * Worth doing rather than stopping at the regex: the shape above accepts any
 * `29ABCDE1234F1Z5`-looking string, so a single mistyped digit sails through
 * it and ends up printed on a tax invoice, where it is the customer's problem
 * to unpick months later. The check character catches exactly that class of
 * mistake.
 *
 * Each of the first fourteen characters is weighted 1, 2, 1, 2 ... and the
 * *digits of the product in base 36* are summed -- not the product itself,
 * which is the step this is usually got wrong at.
 */
function gstinChecksumValid(gstin: string): boolean {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = GSTIN_ALPHABET.indexOf(gstin[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_ALPHABET[(36 - (sum % 36)) % 36] === gstin[14];
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function saveProfileAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const customer = await requireCustomer();

  const name = String(formData.get("name") ?? "").trim().slice(0, MAX.name);
  const phone = String(formData.get("phone") ?? "").trim().slice(0, MAX.phone);

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Please tell us your name.";
  if (phone && !PHONE.test(phone.replace(/\s+/g, ""))) {
    fieldErrors.phone = "That does not look like an Indian mobile number.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fieldErrors,
      values: { name, phone },
    };
  }

  try {
    await updateCustomerProfile(customer.id, { name, phone });
  } catch (error) {
    console.error("[account] profile save failed:", error);
    return {
      status: "error",
      message: "Could not save that just now. Please try again.",
      values: { name, phone },
    };
  }

  revalidatePath("/account");
  revalidatePath("/", "layout");
  return { status: "ok", message: "Saved." };
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

/**
 * Sets a password, or changes an existing one, from the account page.
 *
 * **This is the way in for a Google-only account.** Such a row has
 * `password_hash IS NULL`, so it cannot be signed into with a password at all
 * until this runs — until now the only route to one was the forgotten-password
 * email, which is a strange thing to ask of somebody who has never had a
 * password to forget (client, 2026-09-16).
 *
 * **An existing password must be retyped to change it; a first one must not.**
 * Requiring the current password is what stops a borrowed, still-signed-in
 * browser from being turned into a permanent way back in. There is nothing to
 * retype when the account has never had one, and demanding it would lock the
 * Google customer out of the feature entirely — their proof is the live
 * session, which Google itself issued minutes ago.
 */
export async function setPasswordAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const customer = await requireCustomer();

  const current = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");

  const issue = passwordProblem(password);
  if (issue) {
    return {
      status: "error",
      message: issue,
      fieldErrors: { password: issue },
    };
  }

  /* The same check the other two password forms make — see
     `confirmationProblem`. The browser's live hint is help, not the gate. */
  const mismatch = confirmationProblem(password, String(formData.get("confirmPassword") ?? ""));
  if (mismatch) {
    return {
      status: "error",
      message: mismatch,
      fieldErrors: { confirmPassword: mismatch },
    };
  }

  try {
    if (customer.hasPassword) {
      const hash = await getPasswordHash(customer.id);
      if (!(await verifyPassword(current, hash))) {
        const wrong = "That is not your current password.";
        return { status: "error", message: wrong, fieldErrors: { currentPassword: wrong } };
      }
    }

    await setCustomerPassword(customer.id, await hashPassword(password));

    /* Every other session goes, the same as a reset — a password change is
       often somebody shutting another person out, and leaving that person's
       session alive would make the change cosmetic. This browser is signed
       back in immediately, because the person doing it is right here. */
    await endAllSessions(customer.id);
    await startSession(customer.id);
    await trustThisDevice(customer.id);
  } catch (error) {
    console.error("[account] setting a password failed:", error);
    return { status: "error", message: "Could not save that just now. Please try again." };
  }

  revalidatePath("/account");
  revalidatePath("/", "layout");
  return {
    status: "ok",
    message: customer.hasPassword
      ? "Password changed. Any other device you were signed in on has been signed out."
      : "Password set. You can now sign in with your email address as well as Google.",
  };
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

/** Reads the address fields and validates them. Shared by create and update so
 *  the two cannot drift on what a valid address is. */
function readAddress(formData: FormData): {
  input: AddressInput;
  fieldErrors: Record<string, string>;
} {
  const input: AddressInput = {
    name: String(formData.get("name") ?? "").trim().slice(0, MAX.name),
    phone: String(formData.get("phone") ?? "").trim().slice(0, MAX.phone),
    line1: String(formData.get("line1") ?? "").trim().slice(0, MAX.line),
    line2: String(formData.get("line2") ?? "").trim().slice(0, MAX.line),
    city: String(formData.get("city") ?? "").trim().slice(0, MAX.city),
    state: String(formData.get("state") ?? "").trim().slice(0, MAX.state),
    postalCode: String(formData.get("postalCode") ?? "").trim().slice(0, MAX.postal),
    country: "India",
    /* Upper-cased and stripped of the spaces and dashes people put in when
       reading one off a certificate, so `29 aagcb 7383 j1z4` is the same
       address as `29AAGCB7383J1Z4` rather than a second one that fails to
       match. Empty is the normal case and is left alone. */
    gstin: String(formData.get("gstin") ?? "")
      .replace(/[\s-]/g, "")
      .toUpperCase()
      .slice(0, MAX.gstin),
  };

  const fieldErrors: Record<string, string> = {};
  if (!input.name) fieldErrors.name = "Who should we deliver to?";
  if (!input.phone) fieldErrors.phone = "We need a number to call on delivery.";
  else if (!PHONE.test(input.phone.replace(/\s+/g, "")))
    fieldErrors.phone = "That does not look like an Indian mobile number.";
  if (!input.line1) fieldErrors.line1 = "Please give a street or village address.";
  if (!input.city) fieldErrors.city = "Please give a town or city.";
  if (!input.state) fieldErrors.state = "Please pick a state.";
  if (!PIN.test(input.postalCode)) fieldErrors.postalCode = "That is not a valid PIN code.";
  /* Optional, so only an entered one is checked -- and both checks report the
     same field, because to the person filling it in there is one GSTIN box
     and it is either right or it is not. */
  if (input.gstin) {
    if (!GSTIN.test(input.gstin)) {
      fieldErrors.gstin = "A GSTIN is 15 characters, like 29AAGCB7383J1Z4.";
    } else if (!gstinChecksumValid(input.gstin)) {
      fieldErrors.gstin = "That GSTIN's last character does not check out. Please re-read it.";
    }
  }

  return { input, fieldErrors };
}

export async function saveAddressAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const customer = await requireCustomer();

  const id = String(formData.get("id") ?? "").trim();
  const makeDefault = formData.get("isDefault") === "on";
  const { input, fieldErrors } = readAddress(formData);

  /* Echoed back on every error return, so a single rejected field does not
     blank the other seven. `input` is already the trimmed, bounded version of
     what was typed, which is what should come back. */
  const typed: Record<string, string> = { ...input };

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fieldErrors,
      values: typed,
    };
  }

  try {
    if (id) {
      /* Scoped read before the write, so editing somebody else's address by
         id is a "not found" rather than a silent no-op that looks like it
         worked. The UPDATE is scoped too — this is belt and braces on the
         boundary that matters most in this file. */
      const existing = await getAddress(customer.id, id);
      if (!existing) {
        return {
          status: "error",
          message: "That address no longer exists.",
          values: typed,
        };
      }

      await updateAddress(customer.id, id, input);
      if (makeDefault && !existing.isDefault) {
        await setDefaultAddress(customer.id, id);
      }
    } else {
      await createAddress(customer.id, input, makeDefault);
    }
  } catch (error) {
    console.error("[account] address save failed:", error);
    return {
      status: "error",
      message: "Could not save that just now. Please try again.",
      values: typed,
    };
  }

  /* `/account` too: the address book moved onto that page and
     `/account/addresses` only redirects there now. */
  revalidatePath("/account");
  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
  return { status: "ok", message: id ? "Address updated." : "Address saved." };
}

export async function deleteAddressAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  try {
    await deleteAddress(customer.id, id);
  } catch (error) {
    console.error("[account] address delete failed:", error);
  }

  /* `/account` too: the address book moved onto that page and
     `/account/addresses` only redirects there now. */
  revalidatePath("/account");
  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
}

export async function setDefaultAddressAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  try {
    await setDefaultAddress(customer.id, id);
  } catch (error) {
    console.error("[account] default address failed:", error);
  }

  /* `/account` too: the address book moved onto that page and
     `/account/addresses` only redirects there now. */
  revalidatePath("/account");
  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

export type DeliveryQuoteState =
  /** No quote possible — checkout shows the phone-call wording. */
  | { status: "unavailable" }
  | { status: "quoted"; options: DeliveryOption[] };

/**
 * Prices delivery to one of the customer's saved addresses.
 *
 * **The single implementation, called from two places**, and that is the whole
 * point of it being a separate function: checkout calls it to put figures on
 * screen, and `placeOrderAction` calls it again to decide what is actually
 * charged. If those were two pieces of code they would eventually disagree,
 * which is the same failure `lib/pricing.ts` exists to prevent for the goods.
 *
 * Everything that can go wrong returns `unavailable` rather than throwing: an
 * unserviceable PIN code, a slow courier API, no Shiprocket account at all.
 * All three mean the same thing to a customer, and all three fall back to
 * settling delivery on the phone.
 */
async function resolveDeliveryQuote(
  customerId: string,
  addressId: string,
  lines: { slug: string; qty: number }[],
  isCOD: boolean = false,
): Promise<DeliveryQuoteState> {
  if (!isShiprocketConfigured() || !addressId || lines.length === 0) {
    return { status: "unavailable" };
  }

  /* Scoped to the signed-in customer, like every other read in this file: a
     PIN code is not sensitive, but an address id arrives from a form and
     quoting against somebody else's row would confirm it exists. */
  const address = await getAddress(customerId, addressId);
  if (!address || !PIN.test(address.postalCode)) return { status: "unavailable" };

  const products = await listProducts();
  const priced = priceLines(lines, products);
  if (priced.length === 0) return { status: "unavailable" };

  const options = await quoteDelivery({
    deliveryPincode: address.postalCode,
    /* Weight *and* dimensions — see `lib/parcel.ts` on why quoting without the
       box is quoting the wrong parcel. */
    parcel: packParcel(lines, products),
    declaredValuePaise: priced.reduce((sum, line) => sum + line.lineTotal, 0),
    isCOD,
  });

  const shortlist = shortlistDeliveryOptions(options);
  return shortlist.length > 0
    ? { status: "quoted", options: shortlist }
    : { status: "unavailable" };
}

/**
 * What checkout calls to show delivery options before the order is placed.
 *
 * **Display only.** Nothing here decides what is charged — `placeOrderAction`
 * re-quotes on the server and stores its own answer, for exactly the reason
 * the browser may not post prices. A tampered response to this call changes
 * numbers on screen and nothing on the invoice.
 */
export async function quoteDeliveryAction(input: {
  addressId: string;
  paymentMode?: string;
  lines: { slug: string; qty: number }[];
}): Promise<DeliveryQuoteState> {
  const customer = await requireCustomer();
  const lines = Array.isArray(input?.lines) ? input.lines.slice(0, 50) : [];
  return resolveDeliveryQuote(customer.id, String(input?.addressId ?? ""), lines, input?.paymentMode === "cod");
}

/**
 * The delivery the order is actually charged for.
 *
 * **The browser sends a courier id, never a price.** That id is looked up in a
 * quote this function fetches itself; the rate charged is the one that came
 * back just now, not the one the browser remembers. So a tampered `courierId`
 * can at worst pick a *different real service at its real price*, which is a
 * choice the customer could have made anyway — it cannot invent a cheaper one.
 *
 * A courier that has vanished between quoting and ordering falls back to the
 * cheapest currently available rather than failing the order: the customer has
 * already decided to buy, and the difference is a few rupees on a figure they
 * are about to see on the confirmation page either way.
 */
async function resolveChargedDelivery(
  customerId: string,
  addressId: string,
  lines: { slug: string; qty: number }[],
  courierId: number | null,
  isCOD: boolean = false,
): Promise<DeliveryOption | null> {
  const quote = await resolveDeliveryQuote(customerId, addressId, lines, isCOD);
  if (quote.status !== "quoted") return null;

  const chosen =
    courierId !== null ? quote.options.find((o) => o.courierId === courierId) : undefined;
  return chosen ?? quote.options[0] ?? null;
}

// ---------------------------------------------------------------------------
// Placing an order
// ---------------------------------------------------------------------------

export type CheckoutState = {
  status: "idle" | "error" | "requires_payment";
  message?: string;
  orderId?: string;
};

/**
 * Turns a cart into an order.
 *
 * **The browser sends slugs and quantities. It does not send prices.** Every
 * amount on the order is computed here, on the server, from the live catalogue
 * through `lib/pricing.ts` — the same function the cart page calls to draw the
 * total, so the two agree by construction rather than by review. A form that
 * posted its own subtotal would let anyone buy a ₹40,000 panel for ₹1, and it
 * is the single most common way a checkout gets this wrong.
 *
 * The cart itself lives in `localStorage` (see `lib/cart.ts`) and the server
 * cannot read it, which is why the lines arrive as a form field at all. They
 * are re-resolved and re-priced regardless of what was sent.
 */
export async function placeOrderAction(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const customer = await requireCustomer();

  const notes = String(formData.get("notes") ?? "").trim().slice(0, MAX.notes);
  const paymentMode = String(formData.get("paymentMode") ?? "online");

  /* Billing first, shipping second -- the order the form asks in, and the
     order these are read in, so a half-filled submission fails on the field
     the customer is looking at rather than the one below it. */
  const billingId = String(formData.get("billingAddressId") ?? "").trim();
  const sameAsBilling = formData.get("sameAsBilling") === "on";
  const shippingId = sameAsBilling
    ? billingId
    : String(formData.get("shippingAddressId") ?? "").trim();

  /* The customer's chosen delivery service, as Shiprocket's own courier id.
     Validated by `resolveChargedDelivery` against a fresh quote — the only
     thing this number can do is select among services that really exist at
     the prices they really cost. */
  const rawCourier = String(formData.get("courierId") ?? "").trim();
  const parsedCourier = rawCourier ? Number(rawCourier) : NaN;
  const courierId = Number.isFinite(parsedCourier) ? parsedCourier : null;

  const billing = billingId ? await getAddress(customer.id, billingId) : null;
  if (!billing) {
    return { status: "error", message: "Please choose a billing address." };
  }

  /* Re-fetched rather than reusing `billing` when the ids match, so there is
     one code path and no chance of the two snapshots diverging by accident.
     `getAddress` is scoped to the session's customer, so a shipping id typed
     into the request that belongs to somebody else is a null here, not a
     delivery to a stranger's address. */
  const shipping =
    shippingId === billingId ? billing : shippingId ? await getAddress(customer.id, shippingId) : null;
  if (!shipping) {
    return { status: "error", message: "Please choose a delivery address." };
  }

  const lines = parseLines(String(formData.get("lines") ?? ""));
  if (lines.length === 0) {
    return { status: "error", message: "Your cart is empty." };
  }

  let orderId: string;
  let orderNumber: string;

  try {
    const products = await listProducts();
    const priced = priceLines(lines, products);

    /* Everything in the cart could have been unpublished since it was added.
       The cart page drops those silently, which is right for a list you are
       still building; at the point of paying, saying so is better than
       quietly charging for less than was on screen. */
    if (priced.length === 0) {
      return {
        status: "error",
        message: "Nothing in your cart is available any more. Please check the catalogue.",
      };
    }
    if (priced.length !== lines.length) {
      return {
        status: "error",
        message:
          "Something in your cart is no longer available. Please review it and try again.",
      };
    }

    /* A cart of unpriced products would otherwise become a ₹0 order. Prices
       are optional on a product (the column is nullable — some of the range is
       quote-only), so this is a real state and not a defensive check. */
    if (priced.some((line) => line.unitPrice <= 0)) {
      return {
        status: "error",
        message: `Some of these are quoted rather than priced online. Please call us on ${site.phone.display} and we will price them for you.`,
      };
    }

    /* **Re-quoted here, on the server, exactly like the prices above.** The
       figure checkout showed came from `quoteDeliveryAction`, which is a
       display call the browser could have tampered with or simply have stale
       — the address can be edited between quoting and pressing the button.
       This answer is the one that is stored and charged.

       `shipping` stays 0 when no quote is possible, which is the behaviour the
       site had before Shiprocket existed: delivery is settled on the call. */
    const delivery = await resolveChargedDelivery(
      customer.id,
      shippingId,
      lines,
      courierId,
      paymentMode === "cod"
    );
    const money = totals(priced, delivery?.ratePaise ?? 0);
    const bySlug = new Map(products.map((p) => [p.slug, p]));

    const order = await createOrder({
      customerId: customer.id,
      shipTo: snapshot(shipping),
      billTo: snapshot(billing),
      notes,
      ...money,
      /* Recorded so booking assigns the AWB to the service that was quoted and
         paid for. Booking the cheapest when the customer paid for next-day is
         the one way this feature can take money for something not delivered. */
      courierId: delivery?.courierId ?? null,
      courierName: delivery?.courierName ?? null,
      paymentProvider: paymentMode === "cod" ? "cod" : null,
      items: priced.map((line) => {
        const product = bySlug.get(line.slug);
        return {
          productId: product?.id ?? "",
          slug: line.slug,
          name: line.name,
          imageUrl: product?.images[0]?.url ?? "",
          unitPrice: line.unitPrice,
          qty: line.qty,
          lineTotal: line.lineTotal,
        };
      }),
    });

    orderId = order.id;
    orderNumber = order.orderNumber;

    if (paymentMode === "online") {
      return { status: "requires_payment", orderId };
    }

    await sendOrderPlacedMail({
      to: customer.email,
      name: customer.name,
      orderNumber: order.orderNumber,
      subtotal: formatPaise(order.subtotal),
      cgst: formatPaise(order.cgst),
      sgst: formatPaise(order.sgst),
      shipping: order.shipping ? formatPaise(order.shipping) : null,
      total: formatPaise(order.total),
      lines: order.items.map((item) => ({
        name: item.name,
        qty: item.qty,
        amount: formatPaise(item.lineTotal),
      })),
      orderUrl: `${site.url.replace(/\/$/, "")}/account/orders/${order.id}`,
    });
  } catch (error) {
    console.error("[account] order failed:", error);
    return {
      status: "error",
      message: `Could not place that order just now. Please try again, or call us on ${site.phone.display}.`,
    };
  }

  revalidatePath("/account/orders");
  /* `?placed=` carries the number so the confirmation can greet by it without
     a second query, and so a refresh of the order page does not re-announce
     it. */
  redirect(`/account/orders/${orderId}?placed=${encodeURIComponent(orderNumber)}`);
}


/**
 * Copies a saved address onto an order.
 *
 * Field by field rather than by spread: `Address` carries `id` and `isDefault`
 * and neither belongs on a snapshot -- the id would read as a foreign key that
 * the whole point of snapshotting says it is not, and "is this the default"
 * is a fact about an address book today, not about an order last March.
 */
function snapshot(address: Address): ShipTo {
  return {
    name: address.name,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
    gstin: address.gstin,
  };
}

/**
 * Parses the cart the browser posted.
 *
 * Deliberately paranoid about shape and bounded in length — this is a string
 * from a form field, and the same caps `lib/cart.ts` applies in the browser
 * are re-applied here because the browser's copy of them protects nobody.
 */
function parseLines(raw: string): { slug: string; qty: number }[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const lines: { slug: string; qty: number }[] = [];

    for (const entry of parsed.slice(0, 50)) {
      if (typeof entry !== "object" || entry === null) continue;
      const { slug, qty } = entry as { slug?: unknown; qty?: unknown };
      if (typeof slug !== "string" || !slug || slug.length > 200 || seen.has(slug)) continue;

      const n = typeof qty === "number" && Number.isFinite(qty) ? Math.floor(qty) : 1;
      if (n < 1) continue;

      seen.add(slug);
      lines.push({ slug, qty: Math.min(n, 99) });
    }

    return lines;
  } catch {
    return [];
  }
}

/**
 * Synchronises unauthenticated guest cart lines into the authenticated customer's cart:
 * - Reads existing DB cart for the session customer
 * - Merges guest lines
 * - Writes merged cart to Postgres
 * - Returns merged lines so client can update its local store
 */
export async function syncCartAction(guestLines: CartLine[]): Promise<CartLine[]> {
  const customer = await requireCustomer();
  return mergeCustomerCart(customer.id, guestLines);
}

/**
 * Saves authenticated customer's cart directly to Postgres.
 */
export async function saveAccountCartAction(lines: CartLine[]): Promise<{ status: "ok" }> {
  const customer = await requireCustomer();
  await saveCustomerCart(customer.id, lines);
  return { status: "ok" };
}

/**
 * Loads the authenticated customer's cart from Postgres.
 */
export async function getAccountCartAction(): Promise<CartLine[]> {
  const customer = await requireCustomer();
  return getCustomerCart(customer.id);
}

