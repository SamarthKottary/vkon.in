# Emails — what is sent, and what is still missing

Started 2026-09-17. **This is the tracker.** When an email is built, move its
row from §3 to §2 and add a dated line to §6. When a trigger or wording changes,
update its row. Measured against what a typical e-commerce site sends.

Related: [SHIPPING.md](SHIPPING.md) §4.4a (order status emails in detail),
[PAYMENTS.md](PAYMENTS.md) (receipts), [ADMIN.md](ADMIN.md) §7.6–7.8 (why
nothing emails the operator yet).

---

## 1. How mail is sent

- **All of it is in `src/lib/mail.ts`**, through Resend over plain HTTPS. There
  is no npm package (ARCHITECTURE.md §2). A new email is one function there
  plus a call from wherever the event happens.
- **From `no-reply@vkon.in`** (`MAIL_FROM`). Order emails say replies are not
  read and give the phone number instead.
- **Plain inline-styled HTML plus a text version** for every message, kept
  small for phones on weak connections.
- **Never throws.** A failed send is logged and the action that triggered it
  (registration, payment, cancellation) still succeeds.
- **Never sent twice for one event.** Each trigger is gated on the database row
  actually changing (`markOrderPaid`, `applyTrackingUpdate`, `setOrderStatus`),
  because Razorpay and Shiprocket both redeliver webhooks.
- **Without `RESEND_API_KEY`**, nothing is sent and each message is printed to
  the server log instead. To read an email's text locally, run
  `RESEND_API_KEY= npm run dev` and watch the terminal.

---

## 2. Sent today

| # | Email | To | When | Subject | Code |
|---|---|---|---|---|---|
| 1 | Welcome + confirm email | Customer | Registers with email and password, or first Google sign-in (Google accounts get no confirm link — Google has confirmed the address) | Welcome to Vkon Automation | `sendWelcomeMail` ← `account/actions.ts`, `api/auth/google/callback` |
| 2 | Sign-in code | Customer | Signs in on a browser not seen before (not for review accounts, see ARCHITECTURE.md §9) | `123456` is your Vkon Automation sign-in code | `sendSignInCodeMail` ← `account/actions.ts`, `api/auth/google/callback` |
| 3 | Password reset link | Customer | "Forgot password", from the sign-in page or My account | Reset your Vkon Automation password | `sendPasswordResetMail` ← `account/actions.ts` |
| 4 | Order confirmation | Customer | **Cash on delivery:** when the order is placed. **Online:** only once payment succeeds | Order VK-… — Vkon Automation | `sendOrderPlacedMail` ← `account/private-actions.ts` (COD), `api/payment/verify`, `api/payment/webhook` |
| 5 | Payment receipt | Customer | Online payment succeeds | Payment received for Order VK-… | `sendPaymentReceivedMail` ← `api/payment/verify`, `api/payment/webhook` |
| 6 | Shipped, with tracking link | Customer | Courier reports pickup / in transit, or admin marks Shipped | Order VK-… has shipped | `sendOrderUpdateMail("shipped")` ← `lib/order-notifications.ts` |
| 7 | Out for delivery | Customer | Courier reports it (again after a failed attempt) | Order VK-… is out for delivery | `sendOrderUpdateMail("out_for_delivery")` |
| 8 | Delivered | Customer | Courier reports it, or admin marks Delivered | Order VK-… has been delivered | `sendOrderUpdateMail("delivered")` |
| 9 | Cancelled | Customer | Admin marks Cancelled. Says a paid order is refunded to the original method in 5–7 days | Order VK-… has been cancelled | `sendOrderUpdateMail("cancelled")` |

Emails 4 and 5 arrive together for an online order. Merging them into one is an
option, not a fault.

Emails 6–8 from the courier need the Shiprocket webhook set up
(INTEGRATIONS-SETUP-GUIDE.md §4.3). Without it they are sent only when the
operator presses **Refresh tracking** or changes the status by hand.

---

## 3. Missing

In priority order. **Status** is one of *Not started*, *In progress*, *Done*.

| # | Email | To | Status | Why it matters | What building it involves | Size |
|---|---|---|---|---|---|---|
| A | **New order alert** | You | Not started | Nothing tells you an order arrived; `/admin/orders` has to be checked by hand. Worse now payments are live — a customer can pay and hear nothing back for a day. | One template. Send beside email 4 (COD at placement, online on payment), to `site.email` or a new `ORDER_ALERT_EMAIL`. Include total, paid or COD, phone, and a link to the order in admin. | Small |
| B | **Payment failed / order unpaid** | Customer | Not started | A failed or abandoned online payment leaves an unpaid order and no message. The customer may think they ordered. | A "your payment didn't go through — pay now" mail on Razorpay's `payment.failed` webhook (already received, `markPaymentFailed`). Optionally a single reminder for orders still unpaid after N hours, which needs a scheduled job — nothing on the server runs on a schedule today. | Small (failed) / Medium (reminder) |
| C | **Password changed** | Customer | Not started | Standard security notice. The only way a customer learns someone else changed their password. | One template, sent after a password is set, changed or reset. No link to act on, just "if this wasn't you, call us". | Small |
| D | **Refund issued** | Customer | Not started | Refunds are done by hand in the Razorpay dashboard, so the site never knows one happened and sends nothing. Razorpay may notify the customer itself depending on dashboard settings — check before building. | Either a **Refund** button in `/admin/orders` that calls Razorpay's refund API and then emails, or Razorpay's `refund.processed` webhook. The button also stops refunds being forgotten after a cancellation. Needs a `refund_status`/`refunded_at` on orders. | Medium |
| E | **GST tax invoice** | Customer | Not started | Business buyers who enter a GSTIN expect a tax invoice; many customers expect one anyway. | Invoice numbering (sequential, per financial year), a printable invoice page or PDF, and a link or attachment on email 4 or 8. Settle the GST treatment first: `lib/pricing.ts` always charges CGST + SGST, and its own note records that an inter-state sale should be a single IGST line. | Large |
| F | **Delivery problem** | Customer | Not started | A failed attempt ("UNDELIVERED") or a return to origin (RTO) is shown to you in amber in admin; the customer is not told. | A template for each, decided in `mailForTrackingChange`. Wording needs care — an RTO can still be turned around by a phone call. | Small |
| G | **New enquiry alert** | You | Not started | Contact-form enquiries sit unseen until `/admin/enquiries` is opened. ADMIN.md §7.7. | Same shape as A, sent from the enquiry action. | Small |

---

## 4. Deliberately not sent

| Email | Why not |
|---|---|
| Newsletters to the mailing list | The list collects addresses and sends nothing. Bulk mail needs an unsubscribe link and consent handling first (ADMIN.md §7.6). |
| Abandoned-cart reminders | Marketing mail: needs consent and an unsubscribe. Signed-in carts are saved (`customer_carts`), so it is possible later. |
| Review request after delivery | Nowhere on the site to leave a review yet. |
| "Order confirmed" when admin marks Confirmed | Email 4 already confirms the order; a second "confirmed" adds noise. Revisit if orders start being checked before acceptance. |

---

## 5. Decisions waiting on the client

- **A / G:** which address gets alerts — `vkonautomation@gmail.com`, or a
  separate one.
- **B:** whether to send a reminder for unpaid orders, and after how long.
- **D:** refund from the admin (a button) or keep refunding in the Razorpay
  dashboard.
- **E:** whether the business is GST-registered for invoicing, and whether
  out-of-state orders should be IGST.

---

## 6. Change log

- **2026-09-17** — Document started. Emails 1–9 in place: 1–5 from the account
  and payment work (2026-09-06 onwards), 6–9 from Shiprocket tracking and
  order-status emails the same day. Gaps A–G recorded.
