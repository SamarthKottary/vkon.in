# Payments — the plan

Written 2026-09-06 as a plan; **built on 2026-09-07, and this document now
describes shipped code.** The schema and data layer had been shaped for it a
day earlier, so it needed no migration — exactly as intended.

**Status: code complete and tested, not yet live.** It needs Razorpay KYC to
clear (an individual/freelancer account, in progress) and three environment
variables set. Until then the "Pay now" button does not render and orders
settle by phone, which is the behaviour that existed before payment. Account
setup is [SETUP-GUIDE.md §4](SETUP-GUIDE.md).

> **Two things deliberately left as they are** (client decision, 2026-09-07),
> both still open in ARCHITECTURE.md §11:
> - **GST** stays CGST 9% + SGST 9% on every order, which is only correct for a
>   delivery inside the seller's own state.
> - **Delivery is not priced** — checkout says "quoted on our call" and stores
>   `shipping = 0`, to be handled when a courier integration (India Post /
>   DTDC / Delhivery) is added. Note this stops working as soon as payment is
>   live, since there is then no call in which to agree the charge.

Read [ARCHITECTURE.md §7a](ARCHITECTURE.md#7a-customer-accounts) first — the
money rules there (integer paise, one calculation shared by browser and server,
the browser never sending a price) are the ones this builds on.

---

## 1. Where the flow stopped before this

```
cart  ─▶  /checkout  ─▶  placeOrderAction  ─▶  order row      ─▶  confirmation page
          sign-in         re-prices from       status=pending      + email
          gate            the live catalogue   payment=unpaid
```

An order is placed and the business rings the customer to settle payment and
the delivery charge. That is a working shop, and for a dealer buying a ₹40,000
control panel it is arguably the *right* shop — but it loses the impulse
purchase, and it means somebody has to make the call.

## 2. Where it stops now

```
… ─▶ placeOrderAction ─▶ order row ─▶ /account/orders/[id]
                                        └─▶ "Pay now"
                                              ├─▶ POST /api/payment/create   → Razorpay order id
                                              ├─▶ Razorpay Checkout (their JS, their UI)
                                              ├─▶ POST /api/payment/verify   → signature check → paid
                                              └─▶ POST /api/payment/webhook  → the same, independently
```

**The order exists before the payment does.** That ordering is deliberate and
is the single most important decision here: it means an abandoned payment
leaves a `pending`/`unpaid` order the business can still ring about, rather
than nothing at all. It also gives the gateway a stable reference of ours to
attach to.

---

## 3. Why Razorpay

Chosen on 2026-09-06. For an Indian manufacturer selling to farmers and rural
dealers the shortlist was Razorpay and Cashfree; Stripe was ruled out because
its UPI support in India is limited and RBI rules add friction for a
domestic-only seller.

| | Razorpay |
|---|---|
| Methods | UPI, cards, netbanking, wallets, EMI |
| Fees | ~2% + GST on cards/netbanking; UPI is often free or near it — **confirm the current rate on your own dashboard, not from here** |
| Settlement | T+2 to the current account by default |
| Integration | Two REST calls and one HMAC check. **No npm package** — their checkout is a `<script>` tag and their API is plain HTTPS |

That last row is why it fits: the dependency policy (§2) survives it intact,
exactly as Resend did for email.

**UPI matters more than card support for this audience.** Most of these buyers
will pay by UPI from a phone, and UPI is the cheapest method to accept. If the
fee schedule is the deciding factor between Razorpay and Cashfree, compare
their *UPI* rates, not their headline card rates.

---

## 4. What you need to do (the part that is not code)

None of this is something I can do for you — it needs the company's documents
and a person who can sign.

1. **Create a Razorpay account** at razorpay.com with the business email.
2. **Complete KYC.** They will want: PAN (company or proprietor), GSTIN, a
   cancelled cheque or bank statement for the settlement account, proof of
   business address, and the director's/proprietor's ID. Approval is usually
   1–3 working days; a mismatch between the PAN name and the bank account name
   is the usual cause of a rejection.
3. **Note your Key ID and Key Secret**, in Test mode first. Settings → API Keys.
4. **Set the webhook** — Settings → Webhooks:
   - URL: `https://vkon.in/api/payment/webhook`
   - Events: `payment.captured`, `payment.failed`
   - Set a **webhook secret** and keep it; it is separate from the API secret.
5. **Decide the two business questions in §7 below** before go-live, because
   both change what the customer is charged.

Then add to the server's `.env`:

```bash
RAZORPAY_KEY_ID=rzp_test_xxxxxxxx      # rzp_live_ when you go live
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

The Key **ID** is public — it goes to the browser, by design. The **secret**
and the **webhook secret** never leave the server. If a secret is ever pasted
into a chat, a commit or a screenshot, roll it in the dashboard; it is a
two-minute job and there is no other remedy.

---

## 5. What was built

All of the below exists. Kept in this shape because it doubles as the map of
where each piece lives.

### 5.1 `lib/razorpay.ts`

```ts
createRazorpayOrder({ amountPaise, receipt })  // POST /v1/orders, HTTP Basic
verifyCheckoutSignature({ orderId, paymentId, signature })
verifyWebhookSignature(rawBody, signature)
isRazorpayConfigured()
```

Both verifiers are `createHmac("sha256", secret)` plus `timingSafeEqual` — the
same shape as `lib/auth.ts` and `lib/account.ts` already use. **The signature
check is the whole security model**: without it, anyone can POST "payment
succeeded" to the verify endpoint for any order id.

`isRazorpayConfigured()` gates the button, the same way `isGoogleConfigured()`
gates the Google button — unconfigured must stay a supported state, so a
staging deploy and a fresh clone keep working.

### 5.2 Three route handlers under `app/api/payment/`

All three refuse with 503 when the keys are absent, so an unconfigured deploy
is a supported state rather than a crash.

| Path | Does |
|---|---|
| `create` | `requireCustomer()`, load the order **scoped to that customer**, refuse if already paid, create the Razorpay order for `order.total`, `attachPaymentOrder()`, return the id and the public key |
| `verify` | Called by the browser after Razorpay's widget succeeds. Check the signature, then `markOrderPaid()` |
| `webhook` | Called by Razorpay's servers. Check the signature against the **raw** body, then `markOrderPaid()` |

**`verify` and `webhook` do the same job on purpose.** The browser callback is
fast and tells the customer immediately; it is also unreliable — people close
the tab, phones drop the network mid-UPI-intent. The webhook is slow and
authoritative. You need both, and that is why `markOrderPaid` is already
written to be idempotent (`WHERE payment_status <> 'paid'`, returning whether
this call was the one that changed the row) — a gateway sends its webhook more
than once by design, and the confirmation email must go out exactly once.

**The amount is read from the order row, never from the request.** Same rule as
checkout: the browser has no say in what anything costs.

**The webhook needs the raw request body**, not `await request.json()` — the
signature is over the exact bytes, and re-serialising changes them. Read it
with `await request.text()` and parse afterwards.

### 5.3 `components/checkout/PayNowButton.tsx`

Loads `https://checkout.razorpay.com/v1/checkout.js`, calls `create`, opens
their widget, posts the result to `verify`, refreshes. Their script is the one
external dependency and it is loaded at the point of use, not site-wide — a
farmer browsing the catalogue should not be fetching a payment SDK.

### 5.4 The small edits, all done

- `orders/[id]/page.tsx` — the "Pay now" button when `payment_status` is
  `unpaid` and the gateway is configured.
- `lib/mail.ts` — a `sendPaymentReceivedMail`, alongside the three templates
  already there.
- `.env.example` and `docker-compose.yml` — the three new variables, following
  the pattern the Resend and Google ones already set.
- `docs/ARCHITECTURE.md` — §7a's "Payment / not implemented" paragraph, the
  route-handler table in §8a, §11's gap, and a change log entry.

**No schema change.** `payment_provider`, `payment_order_id`, `payment_id`,
`payment_signature`, `paid_at` and `payment_status` are already on `orders`,
with an index on `payment_order_id` for the webhook's lookup.

---

## 6. Testing it

### Already verified, without live keys

The signature verification does purely local HMAC work — no call to Razorpay —
so it was tested against fake secrets before any account existed. 25 checks,
all passing:

- A **forged signature** is rejected and the order stays unpaid.
- A **valid signature replayed from a different gateway order** is rejected.
  This is the subtle one: a signature proves "Razorpay saw this payment", not
  "this payment belongs to *this* order", so the `payment_order_id` recorded at
  create time is checked as well.
- A **correct signature** marks the order paid, advances it to `confirmed`,
  records the payment id and stamps `paid_at`.
- **Repeat verify** and **repeat webhook** are both idempotent — Razorpay
  redelivers by design, and the receipt sends exactly once.
- The webhook **rejects an unsigned request and the wrong secret** (401).
- An **amount mismatch** is refused rather than marked paid.
- An **unknown gateway order** is acknowledged with 200 so Razorpay stops
  retrying.
- `payment.failed` marks the order failed.
- **Another customer cannot pay somebody else's order** (404), and a
  **signed-out request** is refused (401).

Then the same flows with the keys removed: no button, no SDK fetched, orders
still placed and settled by phone.

**To re-run it:** set fake `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and
`RAZORPAY_WEBHOOK_SECRET` in `.env.local`, restart, and compute the signatures
yourself — `HMAC_SHA256(order_id|payment_id, KEY_SECRET)` for the browser path,
`HMAC_SHA256(raw_body, WEBHOOK_SECRET)` for the webhook.

### Still to do, once KYC clears

Razorpay's test mode gives you working instruments, and you should use all
three of these before going live:

- **Success** — test card `4111 1111 1111 1111`, any future expiry, any CVV.
- **Failure** — their documented failure card. Confirm the order stays
  `unpaid` and the customer can retry rather than being stuck.
- **Abandonment** — open the widget and close it. Confirm the order is still
  there as `pending`/`unpaid`, because this is the case that justifies creating
  the order first.

Then test the webhook independently of the browser: replay it from the
dashboard's webhook log with the browser closed, and confirm the order still
becomes `paid` and the email still goes out exactly once.

**Do not skip the last one.** The browser path working is not evidence the
webhook path works, and the webhook is the one that saves you when a customer's
phone drops the connection during a UPI intent — which, for this audience on
rural mobile data, is not an edge case.

Go live by swapping `rzp_test_` for `rzp_live_` and pointing the webhook at the
production URL. Put one real ₹1 order through it before announcing anything.

---

## 7. Two decisions — both made, both deferred

Both change what the customer is charged. Both were put to the client on
2026-09-07 and **both were consciously deferred**, which is different from
being unresolved: the code is as described below and will need revisiting.

**GST is currently always CGST 9% + SGST 9%.** That is correct for a delivery
inside Karnataka. An inter-state sale should be a single 18% IGST line instead,
and it is the *delivery* state that decides. Right now a customer in Tamil Nadu
is shown two 9% lines. The delivery state is stored on every order, so making
this conditional is a change in `lib/pricing.ts` and nothing else — but what it
should be is a question for your accountant, which is why it was not changed
unilaterally. **Settle this before taking money**, not after: correcting a tax
treatment retrospectively across real invoices is painful.

**Delivery is not priced.** Checkout says "Quoted on our call" and stores
`shipping = 0`. Once payment is automatic, that stops working — you cannot
collect a delivery charge agreed on a call the customer never receives. The
options, cheapest first:

1. **Flat rate by state**, or free above a threshold. One table, no
   integration, and by far the most common answer for a catalogue this size.
2. **Weight-banded**, which needs a weight on each product — a new column and
   an admin field.
3. **A courier API** for live rates. Real integration work, and probably not
   worth it until the volume justifies it.

Whichever you pick, `orders.shipping` already exists in paise and is already
included in `total`, so it is a pricing change rather than a structural one.

---

## 8. One thing still to be aware of

`/admin/orders` was built on 2026-09-07, so the operator can now see and
advance every order. What is still missing is the **notification**: nothing
emails you when an order arrives, so that page has to be looked at. The
confirmation goes to the customer only.

`lib/mail.ts` exists now, so closing this is a `sendMail` call in
`placeOrderAction`. Worth doing **before** payment goes live — while money is
settled on a call, a missed order is a missed sale; once a gateway takes it
automatically, a missed order is a customer who has paid and heard nothing.
