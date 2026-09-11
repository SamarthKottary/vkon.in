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
    /* Prefilled so somebody on a phone is not retyping what we already hold.
       Razorpay uses these only to populate its own form fields. */
    prefill: {
      name: input.customerName,
      email: input.customerEmail,
      contact: input.customerPhone,
    },
  };
}
