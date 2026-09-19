import { NextResponse, type NextRequest } from "next/server";
import { findCustomerById } from "@/lib/db/customers";
import {
  findOrderByPaymentOrderId,
  findOrderIdByPaymentId,
  getOrderForAdmin,
  markOrderPaid,
  markPaymentFailed,
  recordRefund,
} from "@/lib/db/orders";
import { sendOrderPlacedMail } from "@/lib/mail";
import { notifyNewOrder } from "@/lib/order-notifications";
import { formatPaise } from "@/lib/pricing";
import { isWebhookConfigured, verifyWebhookSignature } from "@/lib/razorpay";
import { site } from "@/content/site";

/**
 * Step two, server path: Razorpay's own servers tell us a payment landed.
 *
 * **This is the authoritative path and it is not optional.** The browser
 * callback in `verify/route.ts` is faster and tells the customer immediately,
 * but it only fires if the customer's browser survives to the end of the
 * payment. On rural mobile data, a phone dropping the connection during a UPI
 * intent is routine, not an edge case — without this route the money moves and
 * the order stays marked unpaid.
 *
 * **There is no session here, and there must not be.** Razorpay's servers are
 * the caller; there is no cookie and no signed-in customer.
 * `verifyWebhookSignature` *is* the authentication — an unsigned or wrongly
 * signed request is rejected outright. Adding `requireCustomer()` here would
 * simply break every webhook.
 *
 * **The signature is over the raw bytes**, so the body is read with
 * `request.text()` and parsed afterwards. `await request.json()` would parse
 * and re-serialise, changing whitespace and key order, and the signature would
 * then never match — a failure that looks like a wrong secret and is not.
 *
 * **Three events are acted on** (2026-09-17): `payment.captured` (paid, the
 * confirmation and receipt, and the new-order alert to the business),
 * `payment.failed` (the payment-failed email, first failure only) and
 * `refund.processed` (records the refund and emails the customer — whether the
 * refund was made in the Razorpay dashboard or anywhere else). Each must be
 * ticked on the webhook in Razorpay's dashboard; one that is not ticked is
 * simply never sent.
 */
export const dynamic = "force-dynamic";

type WebhookPayment = {
  id?: string;
  order_id?: string;
  amount?: number;
};

type WebhookRefund = {
  id?: string;
  payment_id?: string;
  amount?: number;
};

export async function POST(request: NextRequest) {
  if (!isWebhookConfigured()) {
    /* Refuse rather than trust. A webhook that cannot be verified is an
       unauthenticated request to mark orders paid. */
    console.error("[webhook] RAZORPAY_WEBHOOK_SECRET is not set; refusing.");
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error("[webhook] signature rejected");
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: string;
  let payment: WebhookPayment;
  let refund: WebhookRefund;
  try {
    const parsed = JSON.parse(rawBody) as {
      event?: string;
      payload?: {
        payment?: { entity?: WebhookPayment };
        refund?: { entity?: WebhookRefund };
      };
    };
    event = String(parsed.event ?? "");
    payment = parsed.payload?.payment?.entity ?? {};
    refund = parsed.payload?.refund?.entity ?? {};
  } catch {
    return NextResponse.json({ error: "Bad payload." }, { status: 400 });
  }

  if (event === "refund.processed") {
    return handleRefund(refund, payment);
  }

  const gatewayOrderId = String(payment.order_id ?? "");
  const paymentId = String(payment.id ?? "");

  if (!gatewayOrderId) {
    /* Not every Razorpay event carries an order — acknowledge and ignore
       rather than 4xx, or Razorpay will retry something we will never
       process. */
    return NextResponse.json({ ok: true, ignored: event });
  }

  const order = await findOrderByPaymentOrderId(gatewayOrderId);
  if (!order) {
    console.error(`[webhook] no order for gateway id ${gatewayOrderId}`);
    /* 200, deliberately. A 404 makes Razorpay retry for hours over something
       that will never resolve — most likely a webhook from a different
       environment sharing the same account. */
    return NextResponse.json({ ok: true, unknownOrder: true });
  }

  if (event === "payment.failed") {
    let firstFailure = false;
    try {
      firstFailure = await markPaymentFailed(order.id);
    } catch (error) {
      console.error("[webhook] could not mark failed:", error);
    }
    /* Recorded, not emailed (client, 2026-09-19): Razorpay tells the customer
       their payment failed, and the order history shows "Payment failed"
       with Pay now. `firstFailure` is kept for the log. */
    if (firstFailure) console.info("[webhook] payment failed:", order.orderNumber);
    return NextResponse.json({ ok: true });
  }

  if (event !== "payment.captured") {
    return NextResponse.json({ ok: true, ignored: event });
  }

  /**
   * The amount is checked, not assumed.
   *
   * Razorpay reports what was actually captured. If that is not what the order
   * says it costs, something is wrong — a tampered create call, a partial
   * capture, a mismatched environment — and the right move is to record the
   * payment id for a human to look at rather than silently mark an order paid
   * for the wrong amount.
   */
  if (typeof payment.amount === "number" && payment.amount !== order.total) {
    console.error(
      `[webhook] amount mismatch on ${order.orderNumber}: ` +
        `captured ${payment.amount}, order total ${order.total}. Payment ${paymentId}.`,
    );
    return NextResponse.json({ ok: true, amountMismatch: true });
  }

  let changed = false;
  try {
    changed = await markOrderPaid({
      orderId: order.id,
      paymentId,
      /* The webhook proves itself with its own body signature, which is not a
         per-payment value worth storing. The browser path stores Razorpay's
         checkout signature; this records how the row was settled instead. */
      signature: "webhook",
    });
  } catch (error) {
    console.error("[webhook] could not mark paid:", error);
    /* 500 here is right: this one *should* be retried, because the payment is
       real and the row is genuinely not updated yet. */
    return NextResponse.json({ error: "Could not record payment." }, { status: 500 });
  }

  /* Only the call that actually moved the row sends the receipt. Razorpay
     delivers a webhook more than once by design, and the browser may have got
     here first — without this gate a customer gets a receipt per delivery. */
  if (changed) {
    try {
      const customer = await findCustomerById(order.customerId);
      if (customer) {
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
      }
    } catch (error) {
      /* The payment is recorded; a failed receipt must not make Razorpay
         retry and re-run everything above. */
      console.error("[webhook] receipt mail failed:", error);
    }
    await notifyNewOrder(order.id);
  }

  return NextResponse.json({ ok: true });
}

/**
 * `refund.processed`: record it and tell the customer.
 *
 * The payment entity normally rides along with the refund and carries the
 * order id; the refund's own `payment_id` is the fallback. Everything that
 * cannot be matched answers 200, for the same reason as above — a retry will
 * not make an unknown payment known.
 */
async function handleRefund(refund: WebhookRefund, payment: WebhookPayment) {
  const refundId = String(refund.id ?? "");
  const amount = typeof refund.amount === "number" ? refund.amount : 0;
  if (!refundId || amount <= 0) {
    return NextResponse.json({ ok: true, ignored: "refund without id or amount" });
  }

  let orderId: string | null = null;
  if (payment.order_id) {
    orderId = (await findOrderByPaymentOrderId(String(payment.order_id)))?.id ?? null;
  }
  if (!orderId && refund.payment_id) {
    orderId = await findOrderIdByPaymentId(String(refund.payment_id));
  }
  if (!orderId || !(await getOrderForAdmin(orderId))) {
    console.error(`[webhook] no order for refund ${refundId}`);
    return NextResponse.json({ ok: true, unknownOrder: true });
  }

  let change: Awaited<ReturnType<typeof recordRefund>> = null;
  try {
    change = await recordRefund({ orderId, refundId, amount });
  } catch (error) {
    console.error("[webhook] could not record refund:", error);
    /* Retry: the refund is real and not yet on the order. */
    return NextResponse.json({ error: "Could not record refund." }, { status: 500 });
  }

  /* Recorded on the order, not emailed (client, 2026-09-19): Razorpay tells
     the customer about the refund. Null means a redelivery of one already
     recorded. */
  if (change) console.info("[webhook] refund recorded:", refundId);
  return NextResponse.json({ ok: true });
}
