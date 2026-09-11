import { NextResponse, type NextRequest } from "next/server";
import { findCustomerById } from "@/lib/db/customers";
import {
  findOrderByPaymentOrderId,
  markOrderPaid,
  markPaymentFailed,
} from "@/lib/db/orders";
import { sendPaymentReceivedMail } from "@/lib/mail";
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
 */
export const dynamic = "force-dynamic";

type WebhookPayment = {
  id?: string;
  order_id?: string;
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
  try {
    const parsed = JSON.parse(rawBody) as {
      event?: string;
      payload?: { payment?: { entity?: WebhookPayment } };
    };
    event = String(parsed.event ?? "");
    payment = parsed.payload?.payment?.entity ?? {};
  } catch {
    return NextResponse.json({ error: "Bad payload." }, { status: 400 });
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
    try {
      await markPaymentFailed(order.id);
    } catch (error) {
      console.error("[webhook] could not mark failed:", error);
    }
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
        await sendPaymentReceivedMail({
          to: customer.email,
          name: customer.name,
          orderNumber: order.orderNumber,
          total: formatPaise(order.total),
          paymentId,
          orderUrl: `${site.url.replace(/\/$/, "")}/account/orders/${order.id}`,
        });

      }
    } catch (error) {
      /* The payment is recorded; a failed receipt must not make Razorpay
         retry and re-run everything above. */
      console.error("[webhook] receipt mail failed:", error);
    }
  }

  return NextResponse.json({ ok: true });
}
