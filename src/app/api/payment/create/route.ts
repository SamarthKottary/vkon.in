import { NextResponse, type NextRequest } from "next/server";
import { getCurrentCustomer } from "@/lib/account";
import { attachPaymentOrder, getOrderForCustomer, repriceOrder } from "@/lib/db/orders";
import { listProducts } from "@/lib/db/products";
import { formatPaise, repriceOrderItems, totals } from "@/lib/pricing";
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
 * keeps the prices it was placed at, so one left unpaid while the catalogue
 * moved would otherwise be paid at the old figure. Before the gateway order is
 * created, the lines are re-priced against today's catalogue:
 *
 *  - unchanged — pay as normal, nothing is written;
 *  - changed, and the request did not accept it — **409 `price_changed`** with
 *    what moved and the new total, for the customer to accept or cancel;
 *  - changed, and `acceptTotal` equals what this route just computed — the
 *    order is rewritten to today's prices and paid at that.
 *
 * **`acceptTotal` is not a price the browser sets.** It is only compared for
 * equality with the figure computed here; anything else is refused with a
 * fresh 409. That is what stops a customer being charged a total they were
 * never shown — including when the price moves again between the dialog and
 * the button.
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
  let acceptTotal: number | null = null;
  try {
    const body = (await request.json()) as { orderId?: unknown; acceptTotal?: unknown };
    orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    acceptTotal = typeof body.acceptTotal === "number" ? Math.round(body.acceptTotal) : null;
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

  /* Today's prices for this order's own lines. */
  let amountPaise = order.total;
  try {
    /* Every line, not only the ones that moved: the dialog shows the whole
       bill, and an unchanged line is part of it. */
    const { lines } = repriceOrderItems(order.items, await listProducts());
    const money = totals(lines, order.shipping);

    if (money.total !== order.total) {
      if (acceptTotal !== money.total) {
        /* The whole bill, then and now — the customer is about to be asked to
           pay a different figure, and "the total is now X" without the tax and
           delivery it is made of is not enough to check it against. */
        return NextResponse.json(
          {
            error: "price_changed",
            message: `Prices have changed since this order was placed. The total is now ${formatPaise(money.total)}.`,
            orderNumber: order.orderNumber,
            previousTotal: order.total,
            newTotal: money.total,
            previous: {
              subtotal: order.subtotal,
              cgst: order.cgst,
              sgst: order.sgst,
              shipping: order.shipping,
              total: order.total,
            },
            next: {
              subtotal: money.subtotal,
              cgst: money.cgst,
              sgst: money.sgst,
              shipping: money.shipping,
              total: money.total,
            },
            lines: lines.map((line) => ({
              name: line.name,
              qty: line.qty,
              wasUnitPrice: line.wasUnitPrice,
              unitPrice: line.unitPrice,
              wasLineTotal: line.wasUnitPrice * line.qty,
              lineTotal: line.lineTotal,
              unavailable: line.unavailable,
            })),
          },
          { status: 409 },
        );
      }

      /* Accepted. False means the order was paid or cancelled in the meantime,
         in which case the row's own total is the one to charge — the guards
         above have already refused the paid and cancelled cases, so this is
         the narrow race between them and here. */
      if (await repriceOrder({ orderId: order.id, lines, money })) {
        amountPaise = money.total;
      }
    }
  } catch (error) {
    /* A catalogue read that fails must not block a payment: the order's own
       total is what it was placed at, and charging that is never wrong. */
    console.error("[payment] price recheck failed:", error);
  }

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
