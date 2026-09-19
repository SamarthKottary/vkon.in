import { createHmac, timingSafeEqual } from "node:crypto";
import { site } from "@/content/site";

/**
 * Razorpay, over `fetch`.
 *
 * No npm package, for the same §2 reason as `lib/mail.ts` and `lib/google.ts`:
 * their server API is plain HTTPS with Basic auth, and their checkout is a
 * `<script>` tag. The official SDK would add a dependency to wrap two REST
 * calls and an HMAC.
 *
 * **The signature checks below are the entire security model.** Without them
 * anyone can POST "payment succeeded" to `/api/payment/verify` for any order
 * id and have it marked paid. Read the note on each before changing either.
 *
 * Unconfigured is a supported state: no keys, no "Pay now" button, and the
 * routes refuse politely. Local development and a fresh clone work without a
 * Razorpay account, exactly as they do without Resend or Google.
 */

const API_BASE = "https://api.razorpay.com/v1";

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/**
 * The Key ID is public and is *meant* to reach the browser — Razorpay's
 * checkout widget takes it as a parameter. The secret never leaves this file.
 * Exposed through its own function so the distinction is explicit at every
 * call site rather than a matter of remembering which env var is which.
 */
export function razorpayPublicKey(): string {
  return process.env.RAZORPAY_KEY_ID ?? "";
}

function authHeader(): string {
  const pair = `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`;
  return `Basic ${Buffer.from(pair).toString("base64")}`;
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status: string;
};

/**
 * Creates the gateway's own order and returns its id.
 *
 * `amountPaise` comes from `orders.total`, read from the database by the
 * caller — never from the request. Same rule as checkout: the browser has no
 * say in what anything costs, and this is the second place that rule has to
 * hold.
 *
 * `receipt` is our human-facing order number, which is what makes a row in
 * Razorpay's dashboard traceable back to an order here without a lookup table.
 */
export async function createRazorpayOrder(input: {
  amountPaise: number;
  receipt: string;
  customerEmail: string;
}): Promise<RazorpayOrder | null> {
  if (!isRazorpayConfigured()) return null;

  try {
    const response = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: "INR",
        receipt: input.receipt,
        /* Shown in the Razorpay dashboard beside the payment. Useful when
           somebody rings about an order and the operator has the dashboard
           open rather than /admin/orders. */
        notes: { order_number: input.receipt, email: input.customerEmail },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[razorpay] create order ${response.status}: ${detail}`);
      return null;
    }

    const body = (await response.json()) as RazorpayOrder;
    if (!body?.id) {
      console.error("[razorpay] create order returned no id");
      return null;
    }
    return body;
  } catch (error) {
    console.error("[razorpay] create order failed:", error);
    return null;
  }
}

export type RefundResult =
  | { ok: true; refundId: string; amount: number; status: string }
  | { ok: false; error: string };

/**
 * A refund's state at Razorpay right now — `pending`, `processed` or `failed`
 * — for the admin's "Check with Razorpay" (2026-09-19), when the
 * `refund.processed` webhook has not arrived. Null when Razorpay cannot be
 * asked; the caller leaves the refund as it was.
 */
export async function fetchRefundStatus(paymentId: string, refundId: string): Promise<string | null> {
  if (!isRazorpayConfigured()) return null;
  try {
    const response = await fetch(
      `${API_BASE}/payments/${encodeURIComponent(paymentId)}/refunds/${encodeURIComponent(refundId)}`,
      { headers: { Authorization: authHeader() }, signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) {
      console.error(`[razorpay] refund status ${response.status} for ${refundId}`);
      return null;
    }
    const body = (await response.json().catch(() => null)) as { status?: string } | null;
    return typeof body?.status === "string" ? body.status : null;
  } catch (error) {
    console.error("[razorpay] refund status failed:", error);
    return null;
  }
}

/**
 * Refunds a captured payment, from the admin's Refund button (client,
 * 2026-09-17: "I want to initiate refund from admin itself").
 *
 * `amountPaise` is always sent, even for a full refund, so what Razorpay does
 * is exactly what the operator confirmed. `speed: "normal"` — the 5–7 days the
 * Terms and the refund email promise; "optimum" can cost extra per refund.
 *
 * **Returns Razorpay's own error text on failure** rather than a generic one:
 * the likely failures are ones the operator has to act on in person — not
 * enough balance in the Razorpay account to cover the refund, or more asked
 * for than is left to refund — and "refund failed" would send them to the
 * server log to find out which. Never throws.
 *
 * **`receipt` must differ between refunds on one payment** — Razorpay refuses
 * a repeated one with "Duplicate receipt found". The caller builds it from the
 * order number, what was already refunded and this amount, which makes the
 * rule work for us: a genuine second refund has a new receipt, while the same
 * request sent twice (a retry after a timeout that Razorpay had in fact
 * processed) repeats its receipt and is refused instead of refunding twice.
 * Found by testing a partial refund followed by the rest, 2026-09-17.
 */
export async function refundPayment(input: {
  paymentId: string;
  amountPaise: number;
  orderNumber: string;
  receipt: string;
}): Promise<RefundResult> {
  if (!isRazorpayConfigured()) return { ok: false, error: "Razorpay is not configured." };

  try {
    const response = await fetch(
      `${API_BASE}/payments/${encodeURIComponent(input.paymentId)}/refund`,
      {
        method: "POST",
        headers: { Authorization: authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: input.amountPaise,
          speed: "normal",
          receipt: input.receipt.slice(0, 40),
          notes: { order_number: input.orderNumber, source: "vkon.in admin" },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );

    const body = (await response.json().catch(() => null)) as
      | { id?: string; amount?: number; status?: string; error?: { description?: string } }
      | null;

    if (!response.ok || !body?.id) {
      const raw = body?.error?.description || `Razorpay answered ${response.status}.`;
      const description = /duplicate receipt/i.test(raw)
        ? "Razorpay has already received this exact refund request, so it was not sent again. Reload the page to see the order's refunds before trying anything else."
        : raw;
      console.error(`[razorpay] refund ${response.status} for ${input.orderNumber}: ${description}`);
      return { ok: false, error: description };
    }

    return {
      ok: true,
      refundId: body.id,
      amount: typeof body.amount === "number" ? body.amount : input.amountPaise,
      status: body.status ?? "processed",
    };
  } catch (error) {
    console.error("[razorpay] refund failed:", error);
    return { ok: false, error: "Could not reach Razorpay. Nothing was refunded — try again." };
  }
}

/** Constant-time compare of two hex digests. Returns false rather than
 *  throwing on a length mismatch, which is what a forged signature usually
 *  is. */
function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies the signature Razorpay's browser widget hands back.
 *
 * The formula is fixed by Razorpay:
 *
 *     HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, KEY_SECRET)
 *
 * **Note which secret this uses: the API key secret, not the webhook secret.**
 * The two are different values and signing with the wrong one fails every
 * payment with no useful error — it is the single easiest thing to get wrong
 * here, which is why the webhook's verifier below is a separate function
 * rather than a shared one with a parameter.
 */
export function verifyCheckoutSignature(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !input.signature) return false;

  const expected = createHmac("sha256", secret)
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest("hex");

  return safeEqualHex(input.signature, expected);
}

/**
 * Verifies a webhook, which is signed differently.
 *
 *     HMAC_SHA256(<the exact raw request body>, WEBHOOK_SECRET)
 *
 * **`rawBody` must be the bytes as received.** Parsing the JSON and
 * re-serialising it changes key order and whitespace, and the signature then
 * never matches — the route handler reads `await request.text()` and parses
 * afterwards for exactly this reason.
 *
 * Uses `RAZORPAY_WEBHOOK_SECRET`, which you invent yourself when creating the
 * webhook in the dashboard. It is unrelated to the API key secret above.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(signature, expected);
}

/** Whether webhooks can be verified at all. Separate from
 *  `isRazorpayConfigured` because the webhook secret is its own value and can
 *  be missing while payments otherwise work — in which case the webhook must
 *  refuse everything rather than trust it. */
export function isWebhookConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);
}

/** What the browser widget needs. The secret is deliberately absent. */
export type CheckoutConfig = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  orderId: string;
  /** Ours, e.g. VK-0917-4F7A — for checkout's redirect, not for Razorpay. */
  orderNumber: string;
  prefill: { name: string; email: string; contact: string };
};

export function checkoutConfig(input: {
  razorpayOrderId: string;
  amountPaise: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}): CheckoutConfig {
  return {
    key: razorpayPublicKey(),
    amount: input.amountPaise,
    currency: "INR",
    name: site.legalName,
    description: `Order ${input.orderNumber}`,
    orderId: input.razorpayOrderId,
    /* Checkout redirects with it (`?placed=` on success, `?unpaid=` when the
       window closes unpaid), and the order page compares it before emptying
       the cart. It was missing until 2026-09-17, so both redirects carried
       "undefined": after a successful online payment the cart was never
       emptied and the thank-you note never showed. Not secret — it is the
       customer's own order number. */
    orderNumber: input.orderNumber,
    /* Prefilled so somebody on a phone is not retyping what we already hold.
       Razorpay uses these only to populate its own form fields. */
    prefill: {
      name: input.customerName,
      email: input.customerEmail,
      contact: input.customerPhone,
    },
  };
}
