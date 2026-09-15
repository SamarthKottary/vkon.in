import { timingSafeEqual } from "node:crypto";

/**
 * Shiprocket, over `fetch`.
 *
 * No npm package, for the same §2 reason as `lib/razorpay.ts`, `lib/mail.ts`
 * and `lib/google.ts`: their API is plain HTTPS with a bearer token, and the
 * official SDK would be a dependency wrapping four REST calls.
 *
 * Shiprocket does two separate jobs here and they fail differently, which is
 * why they are separate functions with separate error handling:
 *
 *  1. **Quoting** (`quoteDelivery`) runs while a customer is standing at
 *     checkout. It must never throw and never hang: a courier API being slow
 *     is not a reason a customer cannot order. Every failure path returns
 *     `null`, and the caller falls back to the "Quoted on our call" wording
 *     the site used before this existed.
 *  2. **Booking** (`bookShipment`) runs when the operator presses a button in
 *     `/admin/orders`. That one *should* surface its error, because there is a
 *     person waiting to read it and act on it.
 *
 * **Unconfigured is a supported state.** No credentials, no live rates, no
 * "Book shipment" button — the site works exactly as it did before, which is
 * what makes a fresh clone and local development possible without a Shiprocket
 * account. Same contract as Resend, Google and Razorpay.
 */

const API_BASE = "https://apiv2.shiprocket.in/v1/external";

/**
 * How long a login is reused.
 *
 * Shiprocket's token is documented as valid for 10 days. Nine is used so a
 * token is never presented on the day it lapses — the clock that matters is
 * theirs, not ours, and an expiry race would surface as a failed quote at
 * checkout rather than anywhere convenient.
 */
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000;

/**
 * Every network call's ceiling.
 *
 * A customer is waiting on the quote path, and Shiprocket occasionally takes
 * many seconds to answer `serviceability`. Past this the quote is abandoned
 * and checkout shows the phone-call wording instead — a slow courier API must
 * degrade to the old behaviour, not to a spinner nobody can get past.
 */
const TIMEOUT_MS = 6000;

/** Sorts a courier with no delivery estimate after any that has one. */
const UNKNOWN_DAYS = 999;

export function isShiprocketConfigured(): boolean {
  return Boolean(
    process.env.SHIPROCKET_EMAIL &&
      process.env.SHIPROCKET_PASSWORD &&
      process.env.SHIPROCKET_PICKUP_PINCODE,
  );
}

/** The nickname of the pickup address registered in the Shiprocket dashboard.
 *  Their API matches on this string, and it has to be exactly what is on the
 *  "Pickup Addresses" screen — see docs/SHIPPING.md §3. */
function pickupLocation(): string {
  return process.env.SHIPROCKET_PICKUP_LOCATION || "Primary";
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * The cached login.
 *
 * A *promise* rather than a token, so that ten concurrent checkouts on a cold
 * process produce one login rather than ten. The second caller awaits the
 * first's request instead of starting its own; Shiprocket rate-limits logins
 * far more tightly than it does the rest of the API.
 *
 * Module-level, and therefore per-process. This deploys as a single container
 * (the same reasoning `lib/rate-limit.ts` records for its in-memory buckets),
 * so one process is one cache. On a restart the first request logs in again,
 * which costs one extra round trip and nothing else.
 */
let tokenCache: { promise: Promise<string | null>; expiresAt: number } | null = null;

async function login(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: process.env.SHIPROCKET_EMAIL,
        password: process.env.SHIPROCKET_PASSWORD,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      /* 403 here is nearly always the account itself — wrong password, or an
         API user that has not been given API access in the dashboard. Logged
         with the status because the body is often unhelpfully generic. */
      console.error("[shiprocket] login failed:", response.status, await safeText(response));
      return null;
    }

    const body = (await response.json()) as { token?: unknown };
    return typeof body.token === "string" && body.token ? body.token : null;
  } catch (error) {
    console.error("[shiprocket] login error:", error);
    return null;
  }
}

/** A bearer token, from cache when one is still good. */
async function getToken(force = false): Promise<string | null> {
  if (!isShiprocketConfigured()) return null;

  if (force || !tokenCache || Date.now() > tokenCache.expiresAt) {
    tokenCache = { promise: login(), expiresAt: Date.now() + TOKEN_TTL_MS };
  }

  const token = await tokenCache.promise;
  /* A failed login is not cached: leaving a null in the cache would keep the
     integration down for nine days after one bad minute. */
  if (!token) tokenCache = null;
  return token;
}

/**
 * One authenticated request, retried once on a 401.
 *
 * The retry is the whole reason this wrapper exists. A cached token can be
 * invalidated at Shiprocket's end — a password change, a session revoked in
 * their dashboard — long before our nine-day clock runs out, and the only way
 * to find out is a 401. Retrying once with a fresh login turns that from an
 * outage lasting until the next deploy into a single slow request.
 */
async function api(
  path: string,
  init: RequestInit & { retryOn401?: boolean } = {},
): Promise<Response | null> {
  const { retryOn401 = true, ...rest } = init;
  const token = await getToken();
  if (!token) return null;

  const send = (bearer: string) =>
    fetch(`${API_BASE}${path}`, {
      ...rest,
      headers: {
        ...rest.headers,
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  try {
    const response = await send(token);
    if (response.status !== 401 || !retryOn401) return response;

    const fresh = await getToken(true);
    return fresh ? await send(fresh) : response;
  } catch (error) {
    console.error("[shiprocket] request failed:", path, error);
    return null;
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return "<unreadable>";
  }
}

// ---------------------------------------------------------------------------
// Quoting
// ---------------------------------------------------------------------------

export type DeliveryOption = {
  /** Shiprocket's `courier_company_id`. The id the browser sends back, and the
   *  one the server re-validates against a fresh quote. */
  courierId: number;
  courierName: string;
  /** Paise, so it drops straight into `lib/pricing`'s `totals()`. */
  ratePaise: number;
  /** Working days, as Shiprocket estimates them. Null when they do not say. */
  estimatedDays: number | null;
  /** Road or air, as Shiprocket reports it. **Not** what checkout calls the
   *  service: air is not reliably the faster one — within Karnataka a Blue Dart
   *  van beats an Xpressbees flight — so "Standard" and "Express" come from
   *  position in the shortlist instead (`serviceName` in `CheckoutForm`). */
  mode: "surface" | "air";
};

type CourierRow = {
  courier_company_id?: unknown;
  courier_name?: unknown;
  rate?: unknown;
  estimated_delivery_days?: unknown;
  is_surface?: unknown;
};

/**
 * Every courier that will carry this parcel to this PIN code, cheapest first.
 *
 * **Returns `[]` for every failure, including "nobody delivers there".** The
 * caller cannot tell an unserviceable PIN code from a timeout, and that is
 * deliberate: both mean "we cannot put a number on screen", and both fall back
 * to settling delivery on the phone, which is what the business did for every
 * order before this existed.
 *
 * **Dimensions are sent, and that is not optional.** Couriers bill on the
 * greater of actual and volumetric weight, and size also decides which of them
 * will take the parcel at all — measured on 2026-09-12, one 2 kg parcel went
 * from ₹128 across six couriers to ₹1,443 across one as the declared box grew
 * from 15 cm to 60 cm. Quoting without them quotes the first number and gets
 * billed the second. See `lib/parcel.ts`.
 */
export async function quoteDelivery(input: {
  deliveryPincode: string;
  parcel: { weightGrams: number; lengthCm: number; breadthCm: number; heightCm: number };
  /** Paise. Shiprocket calls it `declared_value` and uses it for insurance
   *  banding, so it changes the rate on higher-value parcels. */
  declaredValuePaise: number;
  isCOD?: boolean;
}): Promise<DeliveryOption[]> {
  if (!isShiprocketConfigured()) return [];

  const pickup = process.env.SHIPROCKET_PICKUP_PINCODE ?? "";
  /* Their API takes kilograms as a decimal and centimetres as whole numbers;
     this module's unit is grams. One conversion, here, at the boundary. */
  const weightKg = Math.max(0.05, input.parcel.weightGrams / 1000);

  const query = new URLSearchParams({
    pickup_postcode: pickup,
    delivery_postcode: input.deliveryPincode,
    weight: weightKg.toFixed(2),
    length: String(Math.max(1, Math.round(input.parcel.lengthCm))),
    breadth: String(Math.max(1, Math.round(input.parcel.breadthCm))),
    height: String(Math.max(1, Math.round(input.parcel.heightCm))),
    /* COD rates are typically different, so pass 1 if the user chose Cash on Delivery */
    cod: input.isCOD ? "1" : "0",
    declared_value: Math.round(input.declaredValuePaise / 100).toString(),
  });

  const response = await api(`/courier/serviceability/?${query.toString()}`, { method: "GET" });
  if (!response) return [];

  if (!response.ok) {
    /* 404 is Shiprocket's answer for "no courier serves this route", which is
       an ordinary outcome rather than a fault — not logged as an error, or the
       log fills with rural PIN codes. */
    if (response.status !== 404) {
      console.error("[shiprocket] serviceability failed:", response.status, await safeText(response));
    }
    return [];
  }

  try {
    const body = (await response.json()) as {
      data?: { available_courier_companies?: unknown };
    };
    const rows = body.data?.available_courier_companies;
    if (!Array.isArray(rows)) return [];

    const options: DeliveryOption[] = [];
    for (const row of rows as CourierRow[]) {
      const rate = Number(row.rate);
      const courierId = Number(row.courier_company_id);
      if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(courierId)) continue;

      const days = Number(row.estimated_delivery_days);
      options.push({
        courierId,
        courierName: typeof row.courier_name === "string" ? row.courier_name : "Courier",
        ratePaise: Math.round(rate * 100),
        estimatedDays: Number.isFinite(days) && days > 0 ? Math.round(days) : null,
        /* `is_surface` is a real boolean in their payload; anything else is
           treated as surface. */
        mode: row.is_surface === false ? "air" : "surface",
      });
    }

    /* Equal prices happen — Xpressbees quoted air and surface at the same
       ₹49.72 within Mangaluru — and the quicker of the two is then simply the
       better service, so it sorts first and becomes "the cheapest". */
    options.sort(
      (a, b) =>
        a.ratePaise - b.ratePaise ||
        (a.estimatedDays ?? UNKNOWN_DAYS) - (b.estimatedDays ?? UNKNOWN_DAYS),
    );
    return options;
  } catch (error) {
    console.error("[shiprocket] serviceability parse failed:", error);
    return [];
  }
}

/**
 * The handful of options worth showing a customer.
 *
 * Shiprocket returns everything it brokers — six couriers for one Bengaluru
 * parcel, and they are mostly the same service at slightly different prices.
 * A list like that is a decision nobody wants to make, so this reduces it to
 * at most three meaningfully different ones:
 *
 *  - the **cheapest**, always;
 *  - the **fastest**, if it actually arrives sooner;
 *  - one **middle** option, only when it is both cheaper than the fastest and
 *    quicker than the cheapest.
 *
 * **The result is ordered two ways at once: cheapest first, and each option
 * strictly quicker than the one before.** Checkout names the services by that
 * position, so it is a guarantee, not a coincidence. It holds because every
 * option after the first is quicker than the cheapest, the fastest is the
 * *cheapest* of the quickest (the scan runs in price order), and the middle is
 * cheaper than the fastest — so it cannot be as quick, or it would have been
 * the fastest.
 *
 * Often this is one option, and that is correct rather than a failure. A 25 kg
 * order from Mangaluru to Mangaluru came back as three road services at ~2 days
 * for ₹637–697 and Delhivery Air at ₹2,408 for ~4 days: nothing is quicker than
 * the cheapest, so there is nothing to offer beside it.
 */
export function shortlistDeliveryOptions(options: DeliveryOption[]): DeliveryOption[] {
  if (options.length <= 1) return options;

  const cheapest = options[0];
  /* Without an estimate for the cheapest there is nothing to be quicker than,
     and calling another service "Express" would be a guess. */
  if (cheapest.estimatedDays === null) return [cheapest];
  const cheapestDays = cheapest.estimatedDays;

  const quicker = options.filter(
    (o): o is DeliveryOption & { estimatedDays: number } =>
      o.estimatedDays !== null && o.estimatedDays < cheapestDays,
  );
  if (quicker.length === 0) return [cheapest];

  /* Strict `<` keeps the first of equally quick services, which — in price
     order — is the cheapest of them. */
  const fastest = quicker.reduce((best, o) =>
    o.estimatedDays < best.estimatedDays ? o : best,
  );

  const middle = quicker.find((o) => o.ratePaise < fastest.ratePaise);

  return middle ? [cheapest, middle, fastest] : [cheapest, fastest];
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export type BookingInput = {
  orderNumber: string;
  createdAt: string;
  shipTo: {
    name: string;
    phone: string;
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  billTo: BookingInput["shipTo"];
  email: string;
  items: { name: string; slug: string; qty: number; unitPrice: number }[];
  /** Paise. */
  subtotal: number;
  parcel: { weightGrams: number; lengthCm: number; breadthCm: number; heightCm: number };
  /** The service the customer chose and paid for, if any. */
  courierId?: number | null;
  isCOD?: boolean;
};

export type Booking = {
  shipmentOrderId: string;
  shipmentId: string;
  awb: string | null;
  courierName: string | null;
};

/** `Ravi Kumar` → `["Ravi", "Kumar"]`; Shiprocket wants the two separately and
 *  rejects an empty last name. A single-word name repeats itself rather than
 *  sending a blank. */
function splitName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ["Customer", "Customer"];
  if (parts.length === 1) return [parts[0], parts[0]];
  return [parts[0], parts.slice(1).join(" ")];
}

/**
 * Creates the order in Shiprocket and asks for an AWB.
 *
 * **Two calls, and the first one succeeding is what matters.** Creating the
 * order is the step that cannot be repeated safely — Shiprocket rejects a
 * duplicate `order_id`, which is our own order number — whereas assigning an
 * AWB can be retried from their dashboard at any time. So a failure to assign
 * is returned as a booking *with a null AWB* rather than as an error: the
 * shipment exists, the operator can see it, and pressing the button again
 * would otherwise try to re-create an order that is already there.
 *
 * Throws on a failure to create, because a person is waiting on the button and
 * the message is the useful part.
 */
export async function bookShipment(input: BookingInput): Promise<Booking> {
  if (!isShiprocketConfigured()) {
    throw new Error("Shiprocket is not configured.");
  }

  const [shipFirst, shipLast] = splitName(input.shipTo.name);
  const [billFirst, billLast] = splitName(input.billTo.name);
  const sameAddress =
    input.billTo.line1 === input.shipTo.line1 &&
    input.billTo.postalCode === input.shipTo.postalCode &&
    input.billTo.name === input.shipTo.name;

  const payload = {
    order_id: input.orderNumber,
    order_date: input.createdAt.slice(0, 10),
    pickup_location: pickupLocation(),

    billing_customer_name: billFirst,
    billing_last_name: billLast,
    billing_address: input.billTo.line1,
    billing_address_2: input.billTo.line2,
    billing_city: input.billTo.city,
    billing_pincode: input.billTo.postalCode,
    billing_state: input.billTo.state,
    billing_country: input.billTo.country || "India",
    billing_email: input.email,
    billing_phone: input.billTo.phone.replace(/\D/g, "").slice(-10),

    shipping_is_billing: sameAddress,
    shipping_customer_name: shipFirst,
    shipping_last_name: shipLast,
    shipping_address: input.shipTo.line1,
    shipping_address_2: input.shipTo.line2,
    shipping_city: input.shipTo.city,
    shipping_pincode: input.shipTo.postalCode,
    shipping_state: input.shipTo.state,
    shipping_country: input.shipTo.country || "India",
    shipping_email: input.email,
    shipping_phone: input.shipTo.phone.replace(/\D/g, "").slice(-10),

    order_items: input.items.map((item) => ({
      name: item.name,
      sku: item.slug,
      units: item.qty,
      /* Rupees, not paise: Shiprocket's field is a rupee amount and sending
         paise would declare a hundredfold value and price the insurance on
         it. The one place in this file that leaves the paise unit. */
      selling_price: Math.round(item.unitPrice / 100),
    })),

    payment_method: input.isCOD ? "COD" : "Prepaid",
    sub_total: Math.round(input.subtotal / 100),

    /* The same box the rate was quoted on — `lib/parcel.ts` computes it once
       and both calls use it. Declaring a different size here than at quoting
       is how a customer gets charged for one parcel and the business billed
       for another. */
    length: Math.max(1, Math.round(input.parcel.lengthCm)),
    breadth: Math.max(1, Math.round(input.parcel.breadthCm)),
    height: Math.max(1, Math.round(input.parcel.heightCm)),
    weight: Math.max(0.05, input.parcel.weightGrams / 1000),
  };

  const created = await api("/orders/create/adhoc", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!created) throw new Error("Could not reach Shiprocket.");
  if (!created.ok) {
    throw new Error(`Shiprocket refused the order (${created.status}): ${await safeText(created)}`);
  }

  const body = (await created.json()) as { order_id?: unknown; shipment_id?: unknown };
  const shipmentOrderId = String(body.order_id ?? "");
  const shipmentId = String(body.shipment_id ?? "");
  if (!shipmentId) throw new Error("Shiprocket created the order but returned no shipment id.");

  /* Best effort from here. See the note above: the order exists now, and a
     failed AWB is recoverable from their dashboard, so it must not be raised
     as an error that invites pressing the button again. */
  let awb: string | null = null;
  let courierName: string | null = null;
  try {
    /* Pinned to the courier the customer chose, where there is one. Letting
       Shiprocket pick would quietly ship a slower service against an Express
       charge —
       the one way this feature can take money for something not delivered. */
    const assigned = await api("/courier/assign/awb", {
      method: "POST",
      body: JSON.stringify(
        input.courierId
          ? { shipment_id: Number(shipmentId), courier_id: input.courierId }
          : { shipment_id: Number(shipmentId) },
      ),
    });

    if (assigned?.ok) {
      const data = (await assigned.json()) as {
        response?: { data?: { awb_code?: unknown; courier_name?: unknown } };
      };
      const code = data.response?.data?.awb_code;
      const courier = data.response?.data?.courier_name;
      if (code) awb = String(code);
      if (typeof courier === "string") courierName = courier;
    } else if (assigned) {
      console.error("[shiprocket] AWB assign failed:", assigned.status, await safeText(assigned));
    }
  } catch (error) {
    console.error("[shiprocket] AWB assign error:", error);
  }

  return { shipmentOrderId, shipmentId, awb, courierName };
}

/** Where a customer goes to watch the parcel. Shiprocket's own public page,
 *  which needs no login and works for every courier they broker. */
export function trackingUrl(awb: string): string {
  return `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

/**
 * Whether a webhook request really came from Shiprocket.
 *
 * Their webhook carries a shared secret in `x-api-key` — the string you type
 * into their dashboard — rather than signing the body the way Razorpay does.
 * That is weaker: it is a bearer secret, so it is only as good as HTTPS and
 * the fact that it never appears in a URL. It is what they offer.
 *
 * Compared in constant time, and length-guarded first because `timingSafeEqual`
 * throws on a length mismatch rather than returning false — which would itself
 * leak the secret's length through an exception.
 */
export function verifyShippingWebhook(header: string | null): boolean {
  const expected = process.env.SHIPROCKET_WEBHOOK_TOKEN;
  if (!expected || !header) return false;

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Shiprocket's status vocabulary, mapped onto this site's four order states.
 *
 * Their `current_status` is free text and they add to it, so anything not
 * listed returns `null` and leaves the order's status alone rather than
 * guessing. Matching is lower-cased and substring-based because the same state
 * arrives as "DELIVERED", "Delivered" and "Delivered to consignee" depending
 * on the courier behind the shipment.
 */
export function mapShipmentStatus(current: string): "shipped" | "delivered" | "cancelled" | null {
  const s = current.toLowerCase();
  if (s.includes("cancel") || s.includes("rto")) return "cancelled";
  if (s.includes("delivered")) return "delivered";
  if (
    s.includes("shipped") ||
    s.includes("in transit") ||
    s.includes("out for delivery") ||
    s.includes("picked up") ||
    s.includes("dispatched")
  ) {
    return "shipped";
  }
  return null;
}
