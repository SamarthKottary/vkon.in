# Emails — what is sent, and what is still missing

Started 2026-09-17. **This is the tracker.** When an email is built, move its
row from §3 to §2 and add a dated line to §6. When a trigger or wording changes,
update its row. Measured against what a typical e-commerce site sends.

Related: [SHIPPING.md](SHIPPING.md) §4.4a (order status emails in detail),
[PAYMENTS.md](PAYMENTS.md) (receipts, failed payments, refunds),
[ADMIN.md](ADMIN.md) §7.6–7.8 (the operator alerts, and why they mattered).

---

## 1. How mail is sent

- **All of it is in `src/lib/mail.ts`**, through Resend over plain HTTPS. There
  is no npm package (ARCHITECTURE.md §2). A new email is one function there
  plus a call from wherever the event happens.
- **From `no-reply@vkon.in`** (`MAIL_FROM`). Customer emails say replies are
  not read and point to support@vkon.in and the phone number instead. Alerts to
  the business carry the customer as Reply-To.
- **Except the new-order alert, from `nivixsa@vkon.in`** (`ORDER_ALERT_FROM`,
  2026-09-18), so the Microsoft 365 rule that forwards orders@ to Teams can
  match it on its own sender. Falls back to `MAIL_FROM` when unset. The
  enquiry alert stays on `MAIL_FROM`.
- **Customer emails go to the customer only.** None is copied to the business
  (client, 2026-09-18: "just the admin mail is enough"). **The one order email
  the business gets is the new-order alert (15)**, at orders@vkon.in — "only
  new order mail is enough" (same day). Everything after it is followed in
  `/admin/orders`.
- **Plain inline-styled HTML plus a text version** for every message, kept
  small for phones on weak connections.
- **Never throws.** A failed send is logged and the action that triggered it
  (registration, payment, cancellation) still succeeds.
- **Never sent twice for one event.** Each trigger is gated on the database row
  actually changing (`markOrderPaid`, `markPaymentFailed`, `recordRefund`,
  `applyTrackingUpdate`, `setOrderStatus`), because Razorpay and Shiprocket both
  redeliver webhooks.
- **Without `RESEND_API_KEY`**, nothing is sent and each message is printed to
  the server log instead. To read an email's text locally, run
  `RESEND_API_KEY= npm run dev` and watch the terminal.

---

## 2. Sent today

### To the customer

| # | Email | When | Subject | Code |
|---|---|---|---|---|
| 1 | Welcome + confirm email | Registers with email and password, or first Google sign-in (Google accounts get no confirm link — Google has confirmed the address) | Welcome to Vkon Automation | `sendWelcomeMail` ← `account/actions.ts`, `api/auth/google/callback` |
| 2 | Sign-in code | Signs in on a browser not seen before (not for review accounts, see ARCHITECTURE.md §9) | `123456` is your Vkon Automation sign-in code | `sendSignInCodeMail` ← `account/actions.ts`, `api/auth/google/callback` |
| 3 | Password reset link | "Forgot password", from the sign-in page or My account — **only for an account whose email is confirmed** | Reset your Vkon Automation password | `sendPasswordResetMail` ← `account/actions.ts` |
| 4 | Password changed *(C)* | A password is changed or added in My account, or reset from the emailed link. Says when, and what to do if it wasn't them | Your password was changed / A password was added to your account | `sendPasswordChangedMail` ← `account/private-actions.ts` (`setPasswordAction`), `account/actions.ts` (`resetPasswordAction`) |
| 5 | Order confirmation | **Cash on delivery:** when the order is placed. **Online:** only once payment succeeds | Order VK-… — Vkon Automation | `sendOrderPlacedMail` ← `account/private-actions.ts` (COD), `api/payment/verify`, `api/payment/webhook` |
| 6 | Payment receipt | Online payment succeeds | Payment received for Order VK-… | `sendPaymentReceivedMail` ← `api/payment/verify`, `api/payment/webhook` |
| 7 | Payment failed *(B)* | Razorpay's `payment.failed`, **first failure on the order only** — with a link to pay again | Payment for order VK-… didn't go through | `sendPaymentFailedMail` ← `notifyPaymentFailed` ← `api/payment/webhook` |
| 8 | Refund issued *(D)* | The **Refund** button in `/admin/orders` — available until a shipment is booked, and again for an order cancelled before dispatch; never once dispatched (`lib/refunds.ts`) — or Razorpay's `refund.processed` for a refund made in the Razorpay dashboard, which is how a returned order is refunded. Once per Razorpay refund either way. Partial refunds say how much of the total is back | Refund for order VK-… | `sendRefundMail` ← `notifyRefund` ← `admin/actions.ts` (`refundOrderAction`), `api/payment/webhook` |
| 9 | Shipped, with tracking link | Courier reports pickup / in transit, or admin marks Shipped | Order VK-… has shipped | `sendOrderUpdateMail("shipped")` ← `lib/order-notifications.ts` |
| 10 | Out for delivery | Courier reports it (again after a failed attempt) | Order VK-… is out for delivery | `sendOrderUpdateMail("out_for_delivery")` |
| 11 | Delivery attempt failed *(F)* | Courier reports UNDELIVERED / NDR — once per run of failed attempts, with the courier's reason | Order VK-… could not be delivered today | `sendOrderUpdateMail("delivery_failed")` |
| 12 | Being returned *(F)* | Courier starts a return (RTO) — asks the customer to call if they still want it. Does **not** cancel the order | Order VK-… is being returned to us | `sendOrderUpdateMail("returning")` |
| 13 | Delivered | Courier reports it, or admin marks Delivered | Order VK-… has been delivered | `sendOrderUpdateMail("delivered")` |
| 14 | Cancelled | Admin marks Cancelled. Says a paid order is refunded to the original method in 5–7 days — cancelling does not refund by itself; the refund is the **Refund** button, which sends email 8 | Order VK-… has been cancelled | `sendOrderUpdateMail("cancelled")` |

Emails 5 and 6 arrive together for an online order. Merging them into one is an
option, not a fault.

Emails 9–13 from the courier need the Shiprocket webhook set up
(INTEGRATIONS-SETUP-GUIDE.md §4.3). Without it they are sent only when the
operator presses **Refresh tracking** or changes the status by hand.

Emails 7 and 8 need `payment.failed` and `refund.processed` ticked on the
**live** Razorpay webhook (INTEGRATIONS-SETUP-GUIDE.md §6.3). A webhook created
before 2026-09-17 has only the first two events.

### To the business

Reply-To is the customer, so answering reaches them rather than `no-reply@`.
New-order alerts go to **orders@vkon.in** (`site.ordersEmail`) — the only
order email the business receives; enquiries go to **support@vkon.in**
(`site.email`).

| # | Email | When | Subject | Code |
|---|---|---|---|---|
| 15 | New order *(A)* — to **orders@vkon.in**, from **nivixsa@vkon.in** (`ORDER_ALERT_FROM`). Sections: **Customer** (profile name, phone, email), **Deliver to** and **Billed to** (each address with the phone typed on it; GSTIN when given), **Order** (each line, subtotal, CGST, SGST, delivery with service and courier, total, payment) | Cash on delivery: at placement. Online: on the first successful payment. An unpaid or failed online order is not sent | VK-… — New order — ₹total — Paid online / Cash on delivery | `sendNewOrderAlert` ← `notifyNewOrder` ← `account/private-actions.ts`, `api/payment/verify`, `api/payment/webhook` |
| 16 | New enquiry *(G)* | Contact form saved (bots caught by the honeypot are not sent) | New enquiry from {name} — vkon.in | `sendEnquiryAlert` ← `app/(site)/actions.ts` |

**orders@vkon.in and support@vkon.in must both exist in Microsoft 365**
(vkon.in's MX is `vkon-in.mail.protection.outlook.com`) as a mailbox, shared
mailbox or alias, or these alerts bounce. Customers also write to it: it is the address on /contact, the
footer, /terms and /privacy.

---

## 3. Missing

| # | Email | To | Status | Why it matters | What building it involves | Size |
|---|---|---|---|---|---|---|
| E | **GST tax invoice** | Customer | Not started | Business buyers who enter a GSTIN expect a tax invoice; many customers expect one anyway. | Invoice numbering (sequential, per financial year), a printable invoice page or PDF, and a link or attachment on email 5 or 13. Settle the GST treatment first: `lib/pricing.ts` always charges CGST + SGST, and its own note records that an inter-state sale should be a single IGST line. | Large |

---

## 4. Deliberately not sent

| Email | Why not |
|---|---|
| Newsletters to the mailing list | The list collects addresses and sends nothing. Bulk mail needs an unsubscribe link and consent handling first (ADMIN.md §7.6). |
| Abandoned-cart reminders | **Not wanted** (client, 2026-09-17). |
| Unpaid-order reminder | **Not wanted** (client, 2026-09-17). An online order whose payment window was closed without paying gets no email; it stays in `/admin/orders` as Payment due, and the customer can pay from their order page. A payment that actually fails still gets email 7. |
| Review request after delivery | Nowhere on the site to leave a review yet. |
| "Order confirmed" when admin marks Confirmed | Email 5 already confirms the order; a second "confirmed" adds noise. Revisit if orders start being checked before acceptance. |
| A second payment-failed email | Only the first failure on an order is emailed; a customer retrying and failing again is not sent more. |

---

## 5. Decisions waiting on the client

- **E:** whether the business is GST-registered for invoicing, and whether
  out-of-state orders should be IGST.

---

## 6. Change log

- **2026-09-18 (new-order content)** — The new-order alert is laid out in
  sections the client asked for: Customer (profile phone and email), Deliver
  to and Billed to (each with its own phone, and the GSTIN), and the Order as a
  bill — items, subtotal, CGST, SGST, delivery, total, payment — instead of a
  total on the first line. Still `leanAlert`: ~2.9 KB for a two-line order,
  ~5.3 KB at twenty lines.
- **2026-09-18 (sender)** — The new-order alert has its own sender,
  `ORDER_ALERT_FROM` (nivixsa@vkon.in); customer mail stays on no-reply@.
- **2026-09-18 (Teams fix, corrected)** — The one-table rebuild below did not
  reach Teams either (test 5). What separates every email Teams posted from
  every one it skipped is **HTML size**: plain text and the 5.2 KB delivered
  alert posted; the 5.8 KB and 6.2 KB new-order bodies did not. `shell()`
  repeats a full inline style on every table cell, so an order with a few
  lines crossed the line. The new-order alert now uses its own small layout,
  `leanAlert` (~1.9 KB for a two-line order), with no colours so it also reads
  in Teams' dark theme. Customer emails keep `shell()`.
- **2026-09-18 (Teams fix)** — The new-order alert reached the orders@ inbox
  but never the Teams channel it is forwarded to, while shipped/delivered
  alerts did. Tested with real sends, one change at a time: a plain-text email
  and the real subject both reached Teams; the real HTML body did not. Its
  only differences from alerts Teams accepted were a bold "Items" heading and
  a second table (with "×") for the lines. The alert is now one summary line,
  one table with the lines as rows ("1 x …"), and the button — the shape Teams
  is known to post. Keep it to that shape.
- **2026-09-18 (final)** — The order-activity alerts (17: payment failed,
  refund, courier updates, delivered, cancelled, address changes) removed at
  the client's request: "only new order mail is enough". orders@vkon.in gets
  the new-order alert and nothing else.
- **2026-09-18 (Teams)** — The new-order alert's subject now starts with the
  order number (`VK-… — New order — ₹total — payment`), like every activity
  alert. Starting "New order VK-…", it was the one admin mail the client's
  Teams integration did not pick up.
- **2026-09-18 (latest)** — Order-activity alerts (17) to orders@vkon.in for
  every later order event, and for address changes (client: "for the admin to
  track the user, not just simply forwarding the customer's mail").
- **2026-09-18 (later)** — Changed at the client's request: the new-order
  alert goes to orders@vkon.in only (not support@), and customer emails are no
  longer copied to the business at all. Enquiries stay at support@.
- **2026-09-18** — Order emails (5–14) blind-copied to support@vkon.in and
  orders@vkon.in; the new-order alert addressed to both. Until now the
  customer's order emails went to the customer only — nothing reached the
  business except the new-order alert.
- **2026-09-17** — Document started. Emails 1–9 in place: 1–5 from the account
  and payment work (2026-09-06 onwards), 6–9 from Shiprocket tracking and
  order-status emails the same day. Gaps A–G recorded.
- **2026-09-17 (later)** — The site's email became support@vkon.in (was
  vkonautomation@gmail.com). Built A (new-order alert), B (payment failed —
  first failure), C (password changed / added / reset), D (refund issued, from
  `refund.processed`), F (delivery attempt failed; being returned) and G
  (new-enquiry alert). Left: B2 (unpaid reminder, needs a scheduler) and E (GST
  invoice, needs GST decisions). Tested end to end on the laptop with mail
  logged instead of sent: every new email fires once on its event and not on a
  redelivery; the failed-payment mail is not repeated on a second failure; a
  partial then a full refund each email once and mark the order refunded;
  repeated UNDELIVERED sends one mail and an RTO does not cancel the order;
  the reset notice needs a confirmed email, as the reset link itself does.
- **2026-09-17 (refunds)** — Refunds are made from the **Refund** button in
  `/admin/orders` (PAYMENTS.md §5.5). Email 8 is now sent by that button as
  well as by the webhook, still once per refund.
- **2026-09-17 (refunds, later)** — No Refund button once a shipment is booked
  or the order is dispatched (`lib/refunds.ts`). A returned order is refunded in
  the Razorpay dashboard, and email 8 still goes out via `refund.processed`.
  Rows 8 and 14 updated.
- **2026-09-17 (scope)** — The client does not want an unpaid-order reminder
  (B2) or abandoned-cart emails. Both moved to §4. The only email still to
  build is E, the GST tax invoice.
