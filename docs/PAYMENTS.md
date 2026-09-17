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
   - Events: `payment.captured`, `payment.failed`, `refund.processed`
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

### 5.5 Refunds from `/admin/orders` (2026-09-17)

Every order paid online has a **Payment** block with an amount (pre-filled with
what is left to refund) and a **Refund** button. There is no need to open the
Razorpay dashboard.

- **`refundOrderAction`** (`app/admin/actions.ts`) re-reads the order and
  checks everything itself. The order must have a captured Razorpay payment,
  and the amount must be a positive rupee figure no larger than what is left.
  It then calls **`refundPayment`** (`lib/razorpay.ts`,
  `POST /payments/:id/refund`, `speed: "normal"`). On success it records the
  refund (`recordRefund`, keyed on Razorpay's refund id) and emails the
  customer. When `refund.processed` arrives for the same refund, it finds the
  id already stored and does nothing.
- **Partial refunds** are the same form with a smaller amount, for example the
  delivery charge alone. The order becomes `refunded` once the refunds add up
  to its total. After a partial refund the amount field shows the remainder.
- **One request at a time per order.** `refund_requested_at` is claimed
  atomically for 60 seconds, so a double click or a second tab is refused.
- **Razorpay's `receipt` is `{order number}-{already refunded}-{amount}`.**
  Razorpay refuses a receipt it has seen before on that payment. The first
  version used the order number alone, which blocked every second refund. The
  current form still gives a new receipt to a genuine second refund, while a
  repeat of the same request is refused instead of refunding twice. ARCHITECTURE.md §9.
- **Refusals show Razorpay's own reason**, for example "The total refund amount
  is greater than the refund payment amount", or not enough balance in the
  Razorpay account to cover it. Refunds come out of the Razorpay balance, so a
  new account with little settled balance can be refused.
- **No refund once a shipment is booked or the order is dispatched** (client,
  2026-09-17). `lib/refunds.ts` (`refundBlock`) decides, and both the card and
  `refundOrderAction` read it, so an admin page left open since before the
  booking is refused by the server too.
  - **Booked but not dispatched:** cancel the order first, which also cancels
    the Shiprocket booking. The button then comes back, because customers may
    cancel until dispatch and the cancellation email has promised the refund.
  - **Dispatched** (`shipped_at` set, or status shipped/delivered, whether or
    not it was booked through Shiprocket): no button, even if later cancelled
    or returned. Refund a return in the Razorpay dashboard; `refund.processed`
    records it here and emails the customer.
  - The card says which applies instead of just having no button.
- **Cash on delivery** has no button; the card says any refund is paid back in
  person. A cancelled order that was paid online and not refunded is flagged in
  amber on its card.

**Tested 2026-09-17 against Razorpay test mode**, using a real test payment made
through the checkout window on the laptop (netbanking, demo bank, Success):

- invalid and over-large amounts were refused
- a dismissed confirmation sent nothing
- the in-flight guard refused a second request
- a ₹49.72 partial refund was recorded and emailed, and the remainder filled in
- a genuine Razorpay refusal was shown with nothing recorded
- the full remainder was refunded, the order became `refunded`, and the button
  disappeared

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
- `payment.failed` marks the order failed and, on the first failure only,
  emails the customer a link to pay again (EMAILS.md B).
- `refund.processed` records the refund on the order (`refunds`,
  `refunded_amount`; `payment_status` becomes `refunded` once the whole total
  is back) and emails the customer, once per Razorpay refund id (EMAILS.md D).
  It fires for refunds made in the Razorpay dashboard.
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

- **Success** — an **Indian** test card, Visa `4100 2800 0000 1007`, any
  future expiry, any CVV. **There is no OTP step:** a separate window opens
  on Razorpay's demo bank page (`api.razorpay.com/v1/gateway/mocksharp/…`)
  with **Success** and **Failure** buttons. Razorpay's own test-card page still
  describes entering an OTP, but that is not what test mode shows — checked by
  driving Checkout end to end on 2026-09-15. Verified on the live site the
  same day: payment captured, order `confirmed`/`paid`.
  **Not `4111 1111 1111 1111`:** that is an international
  card, and an account that accepts domestic cards only refuses it with
  `international_transaction_not_allowed` — which is exactly what happened on
  the first live test, 2026-09-15.
- **Failure** — the same card, then **Failure** on the demo bank page
  (Razorpay records `payment_failed`; Checkout offers a retry). The order
  becomes `payment_status = 'failed'` (badge "Payment failed"); confirm
  **Pay now** is still offered and that paying again marks it `paid`. Until
  2026-09-15 the button was shown for `unpaid` only, so a declined customer was
  stuck — `markOrderPaid` and `/api/payment/create` always accepted a retry, the
  page just never offered one.
- **Abandonment** — open the widget and close it. Confirm the order is still
  there as `pending`/`unpaid`, because this is the case that justifies
  creating the order first.

**UPI cannot be tested in test mode any more.** NPCI deprecated the UPI Collect
flow (typing a UPI ID) effective 28 February 2026, so Checkout shows only a QR
code on desktop and UPI app buttons on a phone — and a test-mode QR cannot be
paid from a real app. Razorpay's test IDs `success@razorpay` and
`failure@razorpay` belong to the retired flow and have nowhere to be entered.
Nothing here depends on the method: the browser handler and the webhook receive
the same order id, payment id and signature for a card as for UPI, so the card
tests exercise the whole path. UPI's first real check is a small live payment.

Test mode needs no funds and no website verification; Razorpay's "Verify now"
card in the dashboard is for going live. Card numbers from
[Razorpay's test card list](https://razorpay.com/docs/payments/payments/test-card-details/),
checked 2026-09-15.

Then test the webhook independently of the browser. **There is no delivery log
to replay it from** — Razorpay gives merchants no per-webhook history, only the
list of webhooks; an earlier version of this section said otherwise and was
wrong. Two things stand in for it:

- **`orders.payment_signature` records which path settled the row.** The
  webhook writes the literal string `webhook` there; the browser writes
  Razorpay's checkout signature. So every paid order carries its own evidence,
  and `select payment_signature from orders where payment_status = 'paid'`
  answers "is the webhook actually working?" without any dashboard at all.
- **Pay, then close the tab before the widget returns.** The browser then never
  calls `verify`, so only the webhook can mark the order paid.

Confirmed in test mode on 2026-09-15: order `VK-0915-T5TQ` was settled by the
webhook, not the browser.

**A working webhook logs nothing.** Only the failures are logged
(`[webhook] signature rejected`, amount mismatch, unknown order), so an empty
log is what success looks like — it is not evidence that nothing arrived.

**Do not skip this.** The browser path working is not evidence the webhook path
works, and the webhook is the one that saves you when a customer's phone drops
the connection during a UPI intent — which, for this audience on rural mobile
data, is not an edge case.

**Going live is four things, not one.** Live keys are gated on Razorpay's
website verification ("To generate API keys in Live Mode, you must provide the
website details where you will collect payments" — quoted three working days),
which is the "Verify now" card above. Then: generate live keys in Live Mode
(the secret is shown once and never again), create a **separate live webhook**
with its own secret — Razorpay keeps test and live webhooks apart, so the test
one does nothing for real payments — and replace all three `RAZORPAY_` values
on the server together. Half-switched is the dangerous state: Razorpay's own
warning for leaving test keys in place is that customers see a success screen
while nothing is captured or settled. Put one real low-value order through,
check `payment_signature` says `webhook`, and refund it. Full steps in
[INTEGRATIONS-SETUP-GUIDE.md](INTEGRATIONS-SETUP-GUIDE.md) Step 6.

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
