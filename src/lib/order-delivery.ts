import type { Order } from "@/lib/types";
import { isCod, isConfirmedOrder } from "@/lib/order-payment";

/**
 * Delivery rules for an order after it is placed (client, 2026-09-18): what
 * its delivery service is called, until when the customer may change the
 * address, and from when the courier may be booked.
 *
 * **One module, because those last two are the same moment.** The address can
 * be changed until the cutoff the next day and the admin can book from that
 * same cutoff; written in two places they would drift, and a booking made
 * while the customer can still move the parcel is a label with the wrong
 * address on it.
 *
 * No server-only imports: `DeliveryPicker` and the order page's editor are
 * client components, and `lib/db/orders.ts` re-checks the window under its row
 * lock with the same function.
 */

export type DeliveryServiceName = "Standard" | "Faster" | "Express";

/**
 * What a delivery service is called: by its place in the shortlist, never by
 * whether it flies. `shortlistDeliveryOptions` returns them cheapest first and
 * each strictly quicker than the one before, so position *is* speed.
 *
 * Shiprocket's air/surface flag is not. Labelled from it, a Mangaluru order
 * offered "Express, ~2 days" for ₹49.72 above "Standard, ~1 day" for ₹73.44 —
 * Xpressbees by air against Blue Dart by road — and a Delhi one showed two
 * different services both called "Standard".
 *
 * Moved here from `DeliveryPicker` so the name can be stored on the order
 * (`orders.delivery_service`) as well as shown.
 */
export function serviceName(index: number, count: number): DeliveryServiceName {
  if (index === 0) return "Standard";
  return index === count - 1 ? "Express" : "Faster";
}

/**
 * Where the same service sits in a new shortlist of `count` — for a paid order
 * moving address, which keeps the service it paid for.
 *
 * A shorter list can lack the tier: "Faster" exists only in a list of three.
 * It then takes the next quicker one rather than a slower one, because the
 * customer paid for speed and a free upgrade costs less goodwill than a
 * silent downgrade. -1 for an empty list.
 */
export function sameServiceIndex(service: string | null, count: number): number {
  if (count <= 0) return -1;
  if (service === "Express") return count - 1;
  if (service === "Faster") return Math.min(1, count - 1);
  return 0;
}

// ---------------------------------------------------------------------------
// The address window
// ---------------------------------------------------------------------------

/** India has one time zone and no daylight saving, so a fixed offset is exact. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * The hour, Indian time, at which the day-after window closes — **11 am**
 * (client, 2026-09-24; it was 12 pm until then).
 *
 * The one place it is written. Every "until 11 am" on the site and in the
 * admin is this number formatted, so moving it again is one edit.
 */
export const CUTOFF_HOUR_IST = 11;

/** The cutoff hour, Indian time, on the calendar day after `iso`. */
export function nextDayCutoffIST(iso: string): Date {
  /* Shifted so the UTC fields read as Indian wall-clock time — then "the next
     day at the cutoff" is plain date arithmetic, and shifted back. */
  const local = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  return new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + 1,
      CUTOFF_HOUR_IST,
      0,
      0,
    ) - IST_OFFSET_MS,
  );
}

type WindowFields = Pick<
  Order,
  | "status"
  | "paymentStatus"
  | "paymentProvider"
  | "refundedAmount"
  | "paidAt"
  | "createdAt"
  | "shipmentId"
  | "awb"
>;

/**
 * The moment an order became one the business acts on — the start of the
 * next-day cutoff clock. Cash on delivery counts from placing it; an online
 * order from its payment, because until then there is nothing to ship.
 *
 * `createdAt` stands in for a missing `paidAt` only on orders from before
 * online payment, which the operator confirmed by phone.
 */
function confirmedAt(order: WindowFields): string | null {
  if (!isConfirmedOrder(order)) return null;
  if (isCod(order)) return order.createdAt;
  return order.paidAt ?? order.createdAt;
}

/**
 * When the address stops being changeable and the courier may be booked, or
 * null for an order still waiting to be paid (no clock is running yet).
 */
export function addressDeadline(order: WindowFields): Date | null {
  const from = confirmedAt(order);
  return from ? nextDayCutoffIST(from) : null;
}

export type AddressEditWindow =
  | { editable: false }
  /** `until` is an ISO time, or null while the order is unpaid: the address
   *  can be changed for as long as it stays unpaid. */
  | { editable: true; until: string | null };

/**
 * Whether the customer may change the delivery address, and until when.
 *
 * Never once the parcel exists: a booked shipment has the old address on its
 * label and AWB, and changing the order would only make the two disagree.
 * Never on a cancelled or fully refunded order, which is not being delivered.
 */
export function addressEditWindow(order: WindowFields, now: Date = new Date()): AddressEditWindow {
  if (
    order.status === "cancelled" ||
    order.status === "shipped" ||
    order.status === "delivered" ||
    order.paymentStatus === "refunded" ||
    order.shipmentId ||
    order.awb
  ) {
    return { editable: false };
  }

  const deadline = addressDeadline(order);
  if (!deadline) return { editable: true, until: null };
  return now < deadline ? { editable: true, until: deadline.toISOString() } : { editable: false };
}

/**
 * Whether `/admin/orders` may book the courier yet, and if not, from when.
 *
 * The other side of `addressEditWindow`: booking waits until the customer can
 * no longer move the parcel (client, 2026-09-18).
 */
export function shipmentBookable(
  order: WindowFields,
  now: Date = new Date(),
): { bookable: true } | { bookable: false; from: string } {
  const deadline = addressDeadline(order);
  if (deadline && now < deadline) return { bookable: false, from: deadline.toISOString() };
  return { bookable: true };
}

/** "11 am on Sat, 19 Sep", in Indian time wherever the server is. */
export function formatCutoff(iso: string): string {
  const day = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
  const hour = CUTOFF_HOUR_IST % 12 || 12;
  return `${hour} ${CUTOFF_HOUR_IST < 12 ? "am" : "pm"} on ${day}`;
}
