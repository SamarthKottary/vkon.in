import type { OrderStatus, TrackingEvent } from "@/lib/types";

/**
 * The courier's tracking vocabulary: what its words mean for an order, how to
 * say them to a customer, and how to read the dates they come with.
 *
 * **No server-only imports, on purpose.** `OrderHistoryTable` is a client
 * component and shows the same labels, so nothing here may pull in `crypto`
 * or a database client. The network side — fetching, the webhook's secret —
 * stays in `lib/shiprocket.ts`.
 *
 * Shiprocket's status words are free text, vary with the courier behind the
 * shipment ("DELIVERED", "Delivered", "Delivered to consignee") and grow over
 * time, so everything matches lower-cased substrings and falls back to the
 * courier's own words rather than to a guess.
 */

/** Where a customer goes to watch the parcel. Shiprocket's own public page,
 *  which needs no login and works for every courier they broker. */
export function trackingUrl(awb: string): string {
  return `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;
}

function words(raw: string): string {
  return raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Return-to-origin: the parcel is coming back to us, not going forward. */
export function isReturnStatus(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const s = words(raw);
  return /\brto\b/.test(s) || s.includes("return");
}

/** A delivery attempt that failed — "UNDELIVERED", or a non-delivery report
 *  (NDR). Not a return: that is `isReturnStatus`. */
export function isUndelivered(raw: string | null | undefined): boolean {
  if (!raw || isReturnStatus(raw)) return false;
  const s = words(raw);
  return s.includes("undelivered") || s.includes("not delivered") || /\bndr\b/.test(s);
}

export function isOutForDelivery(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return !isReturnStatus(raw) && words(raw).includes("out for delivery");
}

/**
 * What a courier status means for the order's own status — forward progress
 * only, and never "cancelled".
 *
 * **Never "cancelled"** (changed 2026-09-17). This used to map any "cancel" or
 * "RTO" to a cancelled order. Once a cancellation started emailing the
 * customer, that became dangerous: Shiprocket reports "CANCELED" when a
 * *shipment* is cancelled — which is also what the operator does to re-book an
 * order with another courier — and an RTO can still be turned around with a
 * phone call. Neither means the customer's order is off. The courier's words
 * are recorded and shown in `/admin/orders`; cancelling the order is the
 * operator's decision, and theirs alone.
 *
 * **"Undelivered" is checked before "delivered"**, because it contains it. The
 * first version of this function marked a failed delivery attempt as
 * delivered.
 */
export function mapShipmentStatus(raw: string): Extract<OrderStatus, "shipped" | "delivered"> | null {
  const s = words(raw);
  if (!s || isReturnStatus(raw)) return null;
  if (s.includes("cancel") || s.includes("lost") || s.includes("destroyed")) return null;
  if (s.includes("undelivered") || s.includes("not delivered")) return "shipped";
  if (s.includes("delivered")) return "delivered";
  if (
    s.includes("shipped") ||
    s.includes("in transit") ||
    s.includes("out for delivery") ||
    s.includes("picked up") ||
    s.includes("dispatched") ||
    s.includes("reached at destination") ||
    s.includes("destination hub")
  ) {
    return "shipped";
  }
  return null;
}

/**
 * The courier's status in words a customer understands.
 *
 * Shiprocket's labels are written for sellers — "MANIFEST GENERATED", "PICKUP
 * QUEUED", "RTO INITIATED" — and several of them mean the same thing to
 * somebody waiting for a parcel. Anything not recognised is shown in the
 * courier's own words, sentence-cased, rather than hidden.
 */
export function trackingLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = words(raw);
  if (!s) return null;

  if (isReturnStatus(raw)) return s.includes("delivered") ? "Returned to us" : "Being returned to us";
  if (s.includes("cancel")) return "Shipment cancelled";
  if (s.includes("undelivered") || s.includes("not delivered")) return "Delivery attempted";
  if (s.includes("out for delivery")) return "Out for delivery";
  if (s.includes("delivered")) return "Delivered";
  if (s.includes("reached at destination") || s.includes("destination hub")) return "At the delivery hub";
  if (s.includes("in transit") || s.includes("shipped") || s.includes("dispatched")) return "In transit";
  if (s.includes("picked up")) return "Picked up by the courier";
  if (s.includes("pickup exception") || s.includes("pickup rescheduled")) return "Pickup delayed";
  if (
    s.includes("pickup") ||
    s.includes("awb assigned") ||
    s.includes("label generated") ||
    s.includes("manifest") ||
    s.includes("ready to ship")
  ) {
    return "Packed, waiting for pickup";
  }
  if (s.includes("lost")) return "Lost in transit";
  if (s.includes("damage")) return "Damaged in transit";
  if (s.includes("delay")) return "Delayed";

  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * A courier timestamp as an ISO string.
 *
 * Shiprocket sends local Indian time with no zone, in two shapes:
 * `2023-05-19 11:59:16` (scans, ETAs) and `23 05 2023 11:43:52` (the
 * webhook's `current_timestamp`). Both are read as IST. Anything else is
 * `null` — a wrong date on a tracking line is worse than none.
 */
export function parseCourierDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();

  let y: string, mo: string, d: string, h = "00", mi = "00", sec = "00";
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    [, y, mo, d] = m;
    if (m[4]) [h, mi, sec] = [m[4], m[5], m[6] ?? "00"];
  } else {
    m = v.match(/^(\d{2})[ /-](\d{2})[ /-](\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    [, d, mo, y] = m;
    if (m[4]) [h, mi, sec] = [m[4], m[5], m[6] ?? "00"];
  }

  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${sec}+05:30`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** `2023-05-23 15:40:19` → `2023-05-23`, for a delivery estimate. */
export function parseCourierDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const iso = parseCourierDate(value);
  if (!iso) return null;
  /* The day in India, not in UTC: 11pm IST on the 23rd is still the 23rd. */
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
}

/**
 * One scan from either of Shiprocket's shapes — the webhook's `scans` and the
 * tracking API's `shipment_track_activities` are the same object.
 */
export function parseScan(scan: unknown): TrackingEvent | null {
  if (!scan || typeof scan !== "object") return null;
  const s = scan as Record<string, unknown>;
  const text = (key: string) => (typeof s[key] === "string" ? (s[key] as string).trim() : "");
  const activity = text("activity") || text("sr-status-label") || text("status");
  if (!activity) return null;
  return {
    at: parseCourierDate(s.date),
    activity,
    location: text("location"),
    status: text("sr-status-label"),
  };
}

/**
 * Stored history plus what just arrived: de-duplicated, newest first, capped.
 *
 * Couriers resend their whole scan list with every update, so most of an
 * incoming list is already stored; the key is time, activity and place.
 */
export function mergeTrackingEvents(
  stored: TrackingEvent[],
  incoming: TrackingEvent[],
  limit = 50,
): TrackingEvent[] {
  const seen = new Set<string>();
  const all: TrackingEvent[] = [];
  for (const event of [...incoming, ...stored]) {
    const key = `${event.at ?? ""}|${event.activity.toLowerCase()}|${event.location.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(event);
  }
  all.sort((a, b) => (b.at ? Date.parse(b.at) : 0) - (a.at ? Date.parse(a.at) : 0));
  return all.slice(0, limit);
}
