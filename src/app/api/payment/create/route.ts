import { NextResponse, type NextRequest } from "next/server";
import { getCurrentCustomer } from "@/lib/account";
import { attachPaymentOrder, getOrderForCustomer } from "@/lib/db/orders";
import { priceChangeBody, priceOrderNow } from "@/lib/order-reprice";
import {
  checkoutConfig,
  createRazorpayOrder,
  isRazorpayConfigured,
} from "@/lib/razorpay";

/**
 * Step one of paying: create the gateway's order, hand the browser what its
 * widget needs.
 *
 * A route handler rather than a server action because the client component
 * calls it with `fetch` and wants JSON back, not a React payload.
 *
 * **Three things here are the security boundary, and all three matter:**
 *
 *  1. `getCurrentCustomer()` — this is a mutating, money-adjacent endpoint and
 *     is not reachable signed out.
 *  2. `getOrderForCustomer(customer.id, orderId)` — the order is fetched
 *     *scoped to its owner*, so somebody else's order id is a 404 rather than
 *     a payable order. §9's rule about the id coming from the session and
 *     never the request.
 *  3. **The amount comes from `order.total`**, read from the database — never
 *     from the request body. A client that could name its own amount could buy
 *     a ₹40,000 panel for ₹1, which is the same rule `placeOrderAction`
 *     already enforces at checkout and the reason this route takes an order
 *     id and nothing else.
 *
 * **Prices are rechecked here, every time** (client, 2026-09-17). An order
 * keeps the prices it was placed at, so one left unpaid while the catalogue —
 * or the courier's rate — moved would otherwise be paid at the old figure.
 * Before the gateway order is created, the order is priced again by
 * `priceOrderNow`:
 *
 *  - unchanged — pay as normal, nothing is written;
 *  - changed — **409 `price_changed`** with the whole bill then and now, and
 *    **nothing is charged or written.**
 *
 * **This route never reprices an order** (client, 2026-09-18). It used to,
 * when the request carried an `acceptTotal`; now the dialog's only button is
 * Update, which goes to `updateOrderPricesAction`, rewrites the order, and
 * leaves the customer looking at the new total before they press Pay now
 * again. So the amount charged here is always the row's own `total` — a
 * figure the order page is already showing.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isRazorpayConfigured()) {
    return NextResponse.json(
      { error: "Online payment is not available right now." },
      { status: 503 },
    );
  }

  const customer = await getCurrentCustomer();
  if (!customer) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let orderId: string;
  try {
    const body = (await request.json()) as { orderId?: unknown };
    orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!orderId) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const order = await getOrderForCustomer(customer.id, orderId);
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  /* Idempotence at the front door. Without this, opening an old confirmation
     page and pressing Pay again would create a second gateway order against
     an order already settled — and Razorpay would happily take the money. */
  if (order.paymentStatus === "paid") {
    return NextResponse.json({ error: "This order is already paid." }, { status: 409 });
  }
  if (order.status === "cancelled") {
    return NextResponse.json({ error: "This order was cancelled." }, { status: 409 });
  }
  if (order.total <= 0) {
    return NextResponse.json({ error: "This order has nothing to pay." }, { status: 409 });
  }

  /* Today's prices for this order's own lines and delivery. */
  try {
    const now = await priceOrderNow(order, null);
    if (now.money.total !== order.total) {
      return NextResponse.json(priceChangeBody(order, now), { status: 409 });
    }
  } catch (error) {
    /* A catalogue read that fails must not block a payment: the order's own
       total is what it was placed at, and charging that is never wrong. */
    console.error("[payment] price recheck failed:", error);
  }

  const amountPaise = order.total;

  const rzpOrder = await createRazorpayOrder({
    amountPaise,
    receipt: order.orderNumber,
    customerEmail: customer.email,
  });

  if (!rzpOrder) {
    return NextResponse.json(
      { error: "Could not start the payment. Please try again." },
      { status: 502 },
    );
  }

  try {
    /* Recorded before the customer pays, not after. The webhook arrives
       carrying only Razorpay's own order id, so without this row written
       first there is nothing to look the payment back up against — and the
       webhook is the path that has to work when the browser never comes
       back. */
    await attachPaymentOrder(order.id, "razorpay", rzpOrder.id);
  } catch (error) {
    console.error("[payment] could not attach gateway order:", error);
    return NextResponse.json(
      { error: "Could not start the payment. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    checkoutConfig({
      razorpayOrderId: rzpOrder.id,
      amountPaise,
      orderNumber: order.orderNumber,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: order.shipTo.phone || customer.phone,
    }),
    { headers: { "Cache-Control": "no-store" } },
  );
}
