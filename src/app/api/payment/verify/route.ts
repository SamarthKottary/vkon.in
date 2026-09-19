import { NextResponse, type NextRequest } from "next/server";
import { getCurrentCustomer } from "@/lib/account";
import {
  getOrderForCustomer,
  markOrderPaid,
  markPaymentFailed,
} from "@/lib/db/orders";
import { sendOrderPlacedMail } from "@/lib/mail";
import { notifyNewOrder } from "@/lib/order-notifications";
import { formatPaise } from "@/lib/pricing";
import { isRazorpayConfigured, verifyCheckoutSignature } from "@/lib/razorpay";
import { site } from "@/content/site";

/**
 * Step two, browser path: the widget succeeded and handed the page three
 * values, which it posts here.
 *
 * **The signature is the only thing that makes this trustworthy.** Everything
 * in the request body is client-supplied; a caller can name any order id and
 * any payment id. What they cannot do is produce
 * `HMAC_SHA256(order_id|payment_id, KEY_SECRET)` without the secret. Take that
 * check out and this endpoint marks arbitrary orders paid for free.
 *
 * **This is the fast path, not the authoritative one.** `webhook/route.ts`
 * does the same job from Razorpay's own servers and is what saves an order
 * when the customer's phone drops the connection mid-UPI — which, on rural
 * mobile data, is routine. Both call the same idempotent `markOrderPaid`, so
 * whichever arrives first wins and the second is a no-op.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isRazorpayConfigured()) {
    return NextResponse.json({ error: "Not available." }, { status: 503 });
  }

  const customer = await getCurrentCustomer();
  if (!customer) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let payload: {
    orderId?: unknown;
    razorpayOrderId?: unknown;
    razorpayPaymentId?: unknown;
    signature?: unknown;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const orderId = typeof payload.orderId === "string" ? payload.orderId.trim() : "";
  const razorpayOrderId =
    typeof payload.razorpayOrderId === "string" ? payload.razorpayOrderId.trim() : "";
  const razorpayPaymentId =
    typeof payload.razorpayPaymentId === "string" ? payload.razorpayPaymentId.trim() : "";
  const signature = typeof payload.signature === "string" ? payload.signature.trim() : "";

  if (!orderId || !razorpayOrderId || !razorpayPaymentId || !signature) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const order = await getOrderForCustomer(customer.id, orderId);
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  /* Already settled — most likely the webhook beat the browser here, which is
     normal and not an error worth showing anybody. */
  if (order.paymentStatus === "paid") {
    return NextResponse.json({ ok: true, alreadyPaid: true });
  }

  /* The gateway order id must be the one *we* recorded for this order in
     `create`. Without this, a valid signature from some other order of the
     attacker's own could be replayed against this one — the signature proves
     "Razorpay saw this payment", not "this payment belongs to this order". */
  if (order.paymentOrderId && order.paymentOrderId !== razorpayOrderId) {
    console.error(
      `[payment] gateway order mismatch on ${order.orderNumber}: ` +
        `expected ${order.paymentOrderId}, got ${razorpayOrderId}`,
    );
    return NextResponse.json({ error: "Payment could not be verified." }, { status: 400 });
  }

  if (!verifyCheckoutSignature({ razorpayOrderId, razorpayPaymentId, signature })) {
    console.error(`[payment] bad signature on ${order.orderNumber}`);
    try {
      await markPaymentFailed(order.id);
    } catch (error) {
      console.error("[payment] could not mark failed:", error);
    }
    return NextResponse.json({ error: "Payment could not be verified." }, { status: 400 });
  }

  let changed = false;
  try {
    changed = await markOrderPaid({
      orderId: order.id,
      paymentId: razorpayPaymentId,
      signature,
    });
  } catch (error) {
    console.error("[payment] could not mark paid:", error);
    return NextResponse.json(
      { error: "Payment taken, but we could not update the order. Please call us." },
      { status: 500 },
    );
  }

  /* `changed` is false when the webhook already did this. Gating the mail on
     it is what stops a customer getting two receipts for one payment — the
     whole reason `markOrderPaid` reports whether it was the call that moved
     the row. */
  if (changed) {
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
    /* The business hears about it once, from whichever path moved the row —
       this one or the webhook. */
    await notifyNewOrder(order.id);
  }

  return NextResponse.json({ ok: true });
}
