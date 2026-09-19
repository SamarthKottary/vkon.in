import { site } from "@/content/site";
import { findCustomerById } from "@/lib/db/customers";
import { getOrderForAdmin } from "@/lib/db/orders";
import { sendNewOrderAlert, sendOrderCancelledMail } from "@/lib/mail";
import { formatPaise } from "@/lib/pricing";
import type { ShipTo } from "@/lib/types";

/**
 * Emails a customer that their order has been cancelled (EMAILS.md 14).
 *
 * **The only order-status email the site sends** (client, 2026-09-19:
 * shipped, out for delivery, failed attempts, returns and delivered "not
 * needed as shiprocket sends it"). Courier updates are still recorded on the
 * order by the webhook and Refresh tracking; they just do not email.
 *
 * **Called only on a real transition**, established from the locked row by
 * `setOrderStatus`, so a double-click does not send it twice. **Never
 * throws**: the cancellation is already committed.
 */
export async function notifyOrderCancelled(orderId: string): Promise<void> {
  try {
    const order = await getOrderForAdmin(orderId);
    if (!order) return;
    const customer = await findCustomerById(order.customerId);
    if (!customer?.email) return;
    const result = await sendOrderCancelledMail({
      to: customer.email,
      name: customer.name,
      orderNumber: order.orderNumber,
      orderUrl: orderUrl(order.id),
      paid: order.paymentStatus === "paid",
    });
    if (!result.ok) console.error("[orders] cancellation mail not sent:", order.orderNumber);
  } catch (error) {
    console.error("[orders] cancellation mail failed:", orderId, error);
  }
}

function orderUrl(orderId: string): string {
  return `${site.url.replace(/\/$/, "")}/account/orders/${orderId}`;
}

/**
 * Tells the business a new order is in (EMAILS.md A). Called once per order,
 * from the same places the customer's confirmation goes out: placement for
 * cash on delivery, the first successful payment for an online order. Never
 * throws.
 *
 * **The only email the business gets about an order** (client, 2026-09-18:
 * "only new order mail is enough"). Alerts for every later event were built
 * the same day and removed on request; the operator follows an order in
 * `/admin/orders`.
 */
export async function notifyNewOrder(orderId: string): Promise<void> {
  try {
    const order = await getOrderForAdmin(orderId);
    if (!order) return;
    const customer = await findCustomerById(order.customerId);
    const address = (a: ShipTo) => ({
      name: a.name,
      lines: [a.line1, a.line2, `${a.city}, ${a.state} ${a.postalCode}`],
      phone: a.phone,
      gstin: a.gstin,
    });
    const result = await sendNewOrderAlert({
      orderNumber: order.orderNumber,
      placed: formatMoment(order.createdAt),
      payment:
        order.paymentStatus === "paid"
          ? "Paid online"
          : order.paymentProvider === "cod"
            ? "Cash on delivery"
            : "Not yet paid",
      /* The account's own details — the profile — and each address's own
         phone below: they are often different people. */
      customer: {
        name: customer?.name || order.billTo.name,
        phone: customer?.phone ?? "",
        email: customer?.email ?? "",
      },
      deliverTo: address(order.shipTo),
      billTo: address(order.billTo),
      lines: order.items.map((item) => ({
        name: item.name,
        qty: item.qty,
        amount: formatPaise(item.lineTotal),
      })),
      subtotal: formatPaise(order.subtotal),
      cgst: formatPaise(order.cgst),
      sgst: formatPaise(order.sgst),
      deliveryLabel: ["Delivery", order.deliveryService, order.courierName].filter(Boolean).join(" · "),
      delivery: order.shipping > 0 ? formatPaise(order.shipping) : "Not quoted — call to agree it",
      total: formatPaise(order.total),
      adminUrl: `${site.url.replace(/\/$/, "")}/admin/orders#order-${order.id}`,
    });
    if (!result.ok) console.error("[orders] new-order alert not sent:", order.orderNumber);
  } catch (error) {
    console.error("[orders] new-order alert failed:", orderId, error);
  }
}

/* Fixed locale and zone: this runs on a server whose clock may be anywhere. */
function formatMoment(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}
