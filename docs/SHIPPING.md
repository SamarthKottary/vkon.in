# Delivery — Shiprocket

Built 2026-09-12. This document describes shipped code.

**Status: code complete and tested, not yet live.** It needs a Shiprocket
account with KYC cleared and five environment variables set. Until then
checkout says "Quoted on our call" and stores `shipping = 0`, which is exactly
the behaviour that existed before this — see §7. Account setup is
[SETUP-GUIDE.md §5](SETUP-GUIDE.md).

This closes the gap [PAYMENTS.md](PAYMENTS.md) flagged and ARCHITECTURE.md §11
recorded: delivery being unpriced was survivable only while every order got a
phone call, and stops being survivable the day online payment goes live,
because there is then no call in which to agree the charge.

Read [ARCHITECTURE.md §7a](ARCHITECTURE.md#7a-customer-accounts) first — the
money rules there (integer paise, one calculation shared by browser and server,
the browser never sending a price) are the ones this builds on, and the last of
those is why a delivery charge is quoted twice.

---

## 1. What it does

Three separate things, which fail differently and are therefore built
separately:

| | When | Fails how |
|---|---|---|
| **Quote** | Customer picks a shipping address at checkout | Silently — falls back to "Quoted on our call" |
| **Book** | Operator presses "Book shipment" in `/admin/orders` | Loudly — a person is waiting and needs the reason |
| **Track** | Courier POSTs to `/api/shipping/webhook`, or the operator presses "Refresh tracking" | Quietly — logs, always answers 200 |
| **Tell the customer** | The order ships, goes out for delivery, is delivered, or is cancelled | Quietly — a mail that fails is logged; the status change stands |

---

## 2. The rule that matters most

**The delivery charge is quoted twice, and only the second one counts.**

Checkout calls `quoteDeliveryAction` to put a figure on screen. That is display
only. When the order is placed, `placeOrderAction` calls the *same* resolver
again on the server and stores **its** answer in `orders.shipping`.

This is the same rule as the goods: the browser sends slugs and quantities,
never prices. A delivery charge posted by the browser would be a price the
customer chose. It is also not merely theoretical — the customer can edit the
shipping address between seeing a quote and pressing the button, and the figure
on screen would then be for the wrong place.

Both calls go through one function, `resolveDeliveryQuote` in
`app/(site)/account/private-actions.ts`, for the reason `lib/pricing.ts`
exists: two implementations of one number eventually disagree, and the first
anyone hears of it is a customer looking at a bill they did not accept.

---

## 3. Weight and size

Rates depend on both, and **size matters more than weight**.

A courier bills the **greater** of actual weight and *volumetric* weight, where
volumetric is `L × B × H / 5000` (centimetres, kilograms). Measured against the
live API on 2026-09-12, one 2 kg parcel:

| Declared box | Rate | Couriers willing |
|---|---|---|
| none, or 15×15×15 | ₹128.36 | 6 |
| 40×40×40 | ₹459.66 | 2 |
| 60×60×60 | ₹1,442.68 | 1 |

Eleven times the price for the same weight — and the courier *list* shrinks,
because size also gates who will carry it. **Quoting without dimensions quotes
the cheapest of those and gets billed one of the others**, after the customer
has paid. The first version of this integration did exactly that; sending real
dimensions is what fixed it.

### `lib/parcel.ts` — what a parcel is

`products.weight_grams` and `length_cm` / `breadth_cm` / `height_cm` hold the
**packed** figures: the box, not the bare product.

Where a product has none, a **per-category estimate** applies. Per category
rather than one global figure because the categories differ by an order of
magnitude — an industrial panel is thirty times an accessory — and getting the
category right is most of the accuracy for none of the effort:

| Category | Packed estimate | Cheapest to 560001 |
|---|---|---|
| `accessory` | 0.5 kg, 16×12×8 | ₹59.36 |
| `home-automation` | 0.7 kg, 20×14×8 | ₹115.36 |
| `auto-start` | 2.5 kg, 24×18×12 | ₹174.36 |
| `starter` | 3.5 kg, 28×20×14 | ₹221.36 |
| `solar` | 5 kg, 35×26×18 | ₹223.66 |
| `cable` | 6 kg, 30×30×14 | ₹265.40 |
| `industrial-panel` | 15 kg, 60×45×25 | ₹529.06 |

Every one is set so **actual weight exceeds volumetric weight**, which is true
of electrical goods and means the volumetric branch does not fire spuriously.
If a real measurement turns out lighter and bulkier, it takes over on its own.

**Weight and dimensions fall back independently**, so somebody who has put a
scale under a panel but not a tape measure keeps the measurement they took.
Dimensions are all-three-or-none: a measured length beside an estimated width
describes a box nobody owns, and the admin rejects a partial set.

**Several items pack as one stacked box** — footprint of the largest item,
height grown to fit the total volume, never less than the tallest item. An
approximation that errs slightly high, which is the right direction.

### The direction of every guess is deliberate

A courier re-weighs at pickup and bills the seller for any shortfall *after*
the customer has been quoted and charged. So a low guess quietly costs the
business money on every order and nobody finds out until the invoice; a high
guess over-quotes, which is visible and correctable. Everything here rounds
toward over-quoting.

Enter real figures in `/admin/products` and the estimates stop being consulted
for that product.

## 3a. Letting the customer choose

Shiprocket returns everything it brokers — six couriers for one Bengaluru
parcel, mostly the same service at slightly different prices. That is not a
choice anybody wants to make, so `shortlistDeliveryOptions` reduces it to at
most three meaningfully different ones: the cheapest, the fastest if it really
is sooner, and one middle option only if it beats the fastest on price *and*
the cheapest on time. Of two couriers at the same price, the quicker counts as
the cheaper.

The result is cheapest first **and** each option strictly quicker than the one
before, so checkout names them by position: **Standard**, then **Faster** (only
when there are three), then **Express**. The estimate in days and the courier's
own name sit beneath. One option renders as a plain "Delivery · Standard" line
rather than a radio — a choice of one is not a choice.

**The names are not taken from air versus road** (Shiprocket's `is_surface`),
which is what the first version did. Air is not reliably quicker. Measured on
2026-09-15 from the Mangaluru pickup:

| Parcel → PIN | What Shiprocket returned | Labelled by air/road | Now |
|---|---|---|---|
| 450 g → 575002 (Mangaluru) | Xpressbees Air ₹49.72 ~2 d, Blue Dart Surface ₹73.44 ~1 d | "Express ~2 d" above "Standard ~1 d" | Standard ₹49.72 ~2 d / Express ₹73.44 ~1 d |
| 450 g → 110001 (Delhi) | cheapest ₹69.72 ~5 d … Blue Dart Air ₹132.84 ~2 d | two different "Standard" rows | Standard ₹69.72 / Faster ₹93.96 ~4 d / Express ₹132.84 ~2 d |
| 25 kg → 575002 (Mangaluru) | three road services ~2 d ₹637–697; Delhivery Air ₹2,408 **~4 d** | one line | one line |
| 25 kg → 110001 (Delhi) | cheapest ₹1,049.92 ~5 d … DTDC Air ₹5,076.12 ~3 d | Standard / Express | Standard / Express |

**Seeing one delivery line and no choice is usually correct.** It means no
courier is quicker than the cheapest for that parcel and PIN code, as in the
third row: the only air service was four times the price *and* slower. It is
most common for heavy orders and for deliveries near the pickup.

**The browser sends a courier id, never a price.** `resolveChargedDelivery`
looks that id up in a quote it fetches itself and charges the rate that came
back just now. So a tampered id can at worst select a *different real service
at its real price* — something the customer could have picked anyway — and an
id that no longer exists falls back to the cheapest available rather than
failing an order somebody has already decided to place.

The chosen `courier_id` is stored and **passed to AWB assignment at booking**.
Letting Shiprocket pick at that point would ship surface against an Express
charge, which is the one way this feature could take money for something not
delivered.

## 4. What was built

### 4.1 `lib/shiprocket.ts`

Everything that talks to Shiprocket, over `fetch`. No npm package — same §2
reasoning as `lib/razorpay.ts`, `lib/mail.ts` and `lib/google.ts`.

- **`quoteDelivery`** — every courier that will carry the parcel, cheapest
  first. Returns `[]` for *every* failure, including "nobody delivers there",
  because to the customer all of them mean the same thing. Sends dimensions,
  for the reason in §3.
- **`shortlistDeliveryOptions`** — reduces that to the two or three worth
  showing.
- **`bookShipment`** — creates the order at Shiprocket, then asks for an AWB.
  Throws if the *create* fails; returns a booking with a **null AWB** if only
  the AWB step fails, because the order then already exists and pressing the
  button again would try to duplicate it.
- **`verifyShippingWebhook`** / **`mapShipmentStatus`** — the webhook's two
  guards.
- **`trackingUrl`** — Shiprocket's public tracking page; no login needed.

**The token is cached as a promise, not a string.** Ten concurrent checkouts on
a cold process produce one login, not ten — Shiprocket rate-limits logins much
harder than the rest of the API. Cached nine days against a documented ten-day
validity, and every request retries once on a 401, because a token can be
invalidated at their end long before our clock runs out.

**Every call has a 6-second ceiling.** A customer is standing at checkout; a
slow courier API must degrade to the old wording, not to a spinner.

### 4.2 `/api/shipping/webhook`

Shiprocket POSTs status changes here.

- **No session, and there must not be one.** Their servers are the caller. The
  shared secret in `x-api-key` *is* the authentication.
- **A request we cannot make sense of still gets a 200** — an unknown AWB, an
  unmapped status word. Same rule as the payment webhook: a 4xx makes the
  sender retry for hours over something that will never resolve. The only 4xx
  is a failed authentication, which *should* be retried after the secret is
  fixed.
- **Everything the courier says is kept** (2026-09-17): its own status words
  in `tracking_status`, the scan history in `tracking_events`, the delivery
  estimate in `tracking_eta`. `lib/tracking.ts` turns the words into customer
  language ("RTO INITIATED" → "Being returned to us").
- **`applyTrackingUpdate` locks the row and returns what changed** — previous
  and new order status, previous and new courier status. Couriers redeliver
  webhooks by design; comparing against the locked row is what makes a repeat
  send no second email, even when two copies arrive together.
- **The order's status only moves forward, and a courier can never cancel an
  order.** Webhooks arrive out of order, and a late "IN TRANSIT" used to put a
  delivered order back to shipped. And until 2026-09-17 any "cancel" or "RTO"
  cancelled the order — harmless while nothing was emailed, dangerous once a
  cancellation mails the customer, because Shiprocket says "CANCELED" when a
  *shipment* is cancelled to re-book it with another courier. Those words are
  now recorded and shown to the operator (in amber), and cancelling is theirs
  to do.
- **"Undelivered" is not "delivered".** The first mapping matched the
  substring and marked failed delivery attempts as delivered.
- **A courier status stamped earlier than the stored one** adds its scans but
  does not replace the current status.

> **This authentication is weaker than Razorpay's**, and knowingly so. Razorpay
> signs the request body; Shiprocket sends a bearer secret. That is only as
> good as HTTPS and the fact it never appears in a URL. It is what they offer.

### 4.3 The admin button

`/admin/orders` grows a **Shipment** block per order: a "Book shipment" button,
or, once there is an AWB, the courier's status (customer wording, with
Shiprocket's own beneath), the latest scan, the estimate, a tracking link and
**Refresh tracking**. Refresh asks Shiprocket's tracking API directly — for
when the webhook is not set up or missed an update — and goes through the same
`applyTrackingUpdate`, so it emails on the same transitions and never twice.

**Cancelling an order cancels its shipment** when one was booked and not yet
picked up (`cancelShipment`, Shiprocket's `/orders/cancel`). After pickup it
cannot, and the page says a return has to be arranged in their dashboard. The
status select now asks before shipped, delivered and cancelled, because those
email the customer and it submits on change.

Guarded against a second press — an order that already has a `shipment_id` says
so instead of re-booking. Cancelled orders get no button at all: booking a
parcel for an order that is not happening is the one mistake here that costs
real money.

**Booking waits until 12 pm the day after the order was confirmed** (client,
2026-09-18) — from payment for an online order, from placing it for COD. Until
then the customer can still change the delivery address (4.4b), and a label
printed before they stop could carry an address that is no longer the order's.
The button shows greyed out with "Opens at 12 pm on Sat, 19 Sep", and
`bookShipmentAction` refuses with `?shipError=window` if posted anyway. Both
read `shipmentBookable` in `lib/order-delivery.ts`, the same module the
customer's window comes from, so the two cannot drift apart. The card also
shows the service the customer chose ("Delivery · Standard · Xpressbees Air")
and, when they changed the address, "Address changed by the customer · {time}"
— the confirmation email has the old one.

### 4.3a What Shiprocket is sent, name by name

`bookShipment` sends **both** of the order's addresses, as they stand when
Book shipment is pressed (so a delivery address the customer changed is the
one that goes):

| Shiprocket field | From |
|---|---|
| `shipping_*` — name, address, city, state, PIN | the **delivery** address (`ship_to`). The courier delivers here |
| `shipping_phone` | the **delivery** address's phone — the number the courier rings |
| `billing_*` — name, address, city, state, PIN | the **billing** address (`bill_to`), for the invoice |
| `billing_phone` | the billing address's phone |
| `billing_email`, `shipping_email` | **the customer's account email** (since 2026-09-19), so Shiprocket's delivery emails reach them — the site no longer sends its own (EMAILS.md §2a). `SHIPROCKET_NOTIFY_EMAIL`, else support@, only for an account with none. Orders booked before then carry ours |
| `shipping_is_billing` | always **false** (2026-09-18) |

Phones are cut to their last ten digits (Shiprocket rejects `+91`). The GSTIN
is not sent — it belongs on the tax invoice, not the parcel.

**Why `shipping_is_billing` is always false.** When it is true, Shiprocket
delivers to the billing details. It used to be set whenever name, first line
and PIN code matched, which cannot see a different phone, landmark or town —
and since 2026-09-18 a customer can correct the delivery address after
ordering, where the likeliest correction is exactly one of those. The courier
would have rung the old number. Sending both in full costs nothing when they
are the same.

### 4.3b The money on a booking — and what a COD agent collects

**Shiprocket's order total is `sub_total + shipping_charges`, and on a COD
order that is what the courier collects.** Read back from their own API on
2026-09-23 for a real booking: items totalling 37,545 and `shipping_charges`
1,961 came back as a total of 39,506 — the GST nowhere in it, though `tax: 18`
was recorded against every line. So their price fields mean the
**customer-facing, tax-inclusive** amount, and `tax` is only the rate their
invoice prints.

| Shiprocket field | What we send |
|---|---|
| `order_items[].selling_price` | the unit price **including** its share of the order's GST |
| `order_items[].tax` | `18`, the rate — for their invoice; it adds nothing to the total |
| `sub_total` | items **plus** CGST and SGST |
| `shipping_charges` | the delivery charge |

So `sub_total + shipping_charges` equals the total the customer was shown, to
the paisa. `bookingMoney` in `lib/shiprocket.ts` is that arithmetic, exported
so it can be checked without booking anything.

**What went wrong before (fixed 2026-09-23).** `sub_total` was the
tax-exclusive item total and nothing else was sent, so their invoice showed
that figure as the whole bill and **a COD courier collected the order minus
GST and delivery** — on a ₹1,401.32 order, ₹1,124. An interim fix added
`shipping_charges` and `tax: 18`, which recovered the delivery but not the
GST, because their total ignores `tax`. Any COD order booked before this is
short: check it in their panel against the order total in `/admin/orders`
before it goes out.

### 4.3c The pickup is requested too

After the AWB is assigned, `bookShipment` calls `/courier/generate/pickup`, so
**Book shipment finishes the job** and nobody has to press Ship Now in
Shiprocket (client, 2026-09-23). Both calls are best effort, in this order:

1. `/orders/create/adhoc` — if this fails, nothing exists and the button
   reports it. Pressing again is safe.
2. `/courier/assign/awb` — a failure means no courier, and since 2026-09-23
   **that order is cancelled again at Shiprocket** (4.3d).
3. `/courier/generate/pickup` — only attempted when there is an AWB, since a
   pickup for an unassigned shipment is refused.

The admin message after booking says which of the three got done, so a
half-finished booking is visible rather than assumed: "booked and pickup
requested", "no courier was assigned", or "schedule the pickup in their
dashboard".

### 4.3d Attempts, and the failure is undone first

Client, 2026-09-23: "cancel the order in shiprocket if it dosent book … After
3 attempts say to contact support@vkon.in for further assistance."

**A booking that gets no AWB is not a booking.** Their `/orders/create/adhoc`
succeeded, so an order sits in their dashboard that no courier will collect;
`bookShipmentAction` now calls `/orders/cancel` on it and writes **nothing** to
the order's shipment fields. The admin is not told about that cancel (client:
"Dont say that order is cancelled. Just cancel and show attempt") — the card
says no courier was assigned, why, and how many attempts are left. Only if the
cancel is itself refused is the shipment recorded — that is the one case where
an order is left open at Shiprocket, and the card says to deal with it in
their dashboard.

**A retry sends a new `order_id`** — `VK-0918-PACK-R2`, `-R3`
(`BookingInput.attempt`). Shiprocket does **not** create a second order for an
`order_id` it already holds: it hands the existing one back. After the first
attempt was cancelled, the retry was therefore assigning a courier to a
cancelled order and every attempt from the second on came back "order is in
cancelled state", hiding the real reason (found on the live site the day this
shipped). Their dashboard sorts the retries beside the original.

**Failed presses are counted, not limited.** Each failure — a refused create
or a cancelled no-AWB booking — goes through `recordShipmentFailure`, in SQL
(`shipment_attempts = shipment_attempts + 1`) so two admins pressing at once
cannot both write 2. Shiprocket's words for it go into `shipment_error`. The
count is reset to 0 by `setOrderShipment` when a booking takes, by
`clearOrderShipment` (Not ready, 4.3e), and by moving the order back to
pending.

Past `SHIPMENT_ATTEMPT_LIMIT` (3, `lib/db/orders.ts`) the row stops counting
down and says "You can keep trying, but contact support@vkon.in for further
assistance" — **the button stays and still works** (client, 2026-09-23: "Even
after 3 attempts show the book shipment button, it should work, just display
contact support message"). Nothing in `bookShipmentAction` refuses a press;
the number is advice, because the operator on the spot knows whether the
wallet has just been topped up.

**Everything is said on the order's own row**, never in a banner above the
list (client: "Only show message in order row, do not show on top"), and the
redirect carries `#order-<id>` so the press comes back to the order instead of
the top of a long list. What the press did is one line under **Shipment**
("No courier was assigned.", "Shiprocket refused the booking.", "Shipment
booked and pickup requested."); under the button, read off the order itself so
a refresh keeps it: "Attempt 2 of 3 failed: Insufficient balance …" and
"1 attempt left."

**The button narrates the wait** (`BookShipmentButton`): *Initializing…* on
press, *Processing…* from 1.5s in, then the outcome on the row. Three API
calls on a rural connection is a long time to look at a button that has not
changed.

### 4.3e Ready to ship, and Not ready

Client, 2026-09-23: "another section after confirmed called ready to ship,
where booked orders stay before delivery agents come to collect".

**A booked order leaves Confirmed.** `/admin/orders` filters on the data
rather than a new status: `confirmed` is `status = 'confirmed' AND awb IS
NULL`, `ready` is `status = 'confirmed' AND awb IS NOT NULL`. The two cannot
hold the same order, and nothing about the customer's own status wording
changes — they see "Confirmed" until the courier's first scan moves the order
to shipped, which is what takes it out of this queue (webhook, or Refresh
tracking).

**Not ready** (`unbookShipmentAction`, `NotReadyButton`) is the way back:
cancel the parcel at Shiprocket, then `clearOrderShipment` empties the
shipment and tracking columns, and the order is in Confirmed again with its
Book shipment button. In that order — if their cancel is refused, ours are
left alone and the row says to cancel it in their dashboard, because an order
that still exists there must stay findable. After pickup it refuses outright
(`unbooked=picked`): the courier has the box, so that is a return, not an
un-booking. The confirmation names where the order lands, since "Not ready"
alone does not.

**Back to New restarts everything**: `setOrderStatus` clears
`shipment_attempts` and `shipment_error` when the status becomes `pending`
(client: "when i use the drop down to manually move the order from confirmed
to pending … i should be able to restart the process").

**The label is still printed in Shiprocket** (Orders → Ready to Ship →
Print), and the manifest is what the courier signs on handover.

### 4.4 The customer's view

`/account/orders/[id]` shows an "On its way" (or "Delivered") panel once a
shipment exists: the courier's status in plain words, the expected or actual
delivery day, courier and AWB, a tracking link, and the scan history — latest
four, the rest behind "Show earlier updates". A cancelled order shows when it
was cancelled and, if it was paid online, that a refund call is coming. The
order list shows the courier status under "Shipped".

### 4.4a Emails

**Shiprocket sends the delivery emails now, not the site** (client,
2026-09-19). Shipped, out for delivery, failed attempts, returns and delivered
are Shiprocket's buyer notifications, sent to the customer's email and phone
from the booking (4.3a). The webhook and **Refresh tracking** still record
every update on the order for `/admin/orders` and the order page; they just do
not email.

The one status email the site still sends is **Cancelled** — the operator
cancels it, no courier event covers it (`sendOrderCancelledMail` ←
`notifyOrderCancelled`). EMAILS.md §2a has the full list and what has to be
switched on in Shiprocket.

### 4.4b Changing the delivery address (2026-09-18)

Client: an order's address should be editable "until next day 12pm" once it is
successful, and while it is unpaid; the edit should "refresh the delivery
option (delivery mode and price)".

- **The window** (`addressEditWindow`, `lib/order-delivery.ts`): open while an
  online order waits for payment; after payment — or after placing, for COD —
  until 12:00 IST the next calendar day. Closed on a cancelled, shipped,
  delivered or fully refunded order, and as soon as a shipment is booked. The
  order page says until when, beside the address.
- **Edit opens a pop-up of the address book** (client, same day; briefly a
  dropdown before that): choose another saved address, edit one, or add one
  (`OrderAddressEdit`). Choosing a delivery address shows the quote before
  "Use this address" changes anything. Originally:
- **Edit** opens the same address form as the address book, posting to
  `changeOrderAddressAction`. It changes the order's `ship_to` only: the saved
  address book and the billing address are untouched, so a combined "Billing &
  delivery" card splits in two afterwards.
- **Same PIN code — delivery untouched**, no Shiprocket call. **New PIN code —
  re-quoted** (as COD when the order is COD, since couriers charge more to
  collect cash), shown live in the pop-up as the PIN is typed:
  - **unpaid (online or COD):** the services on offer with prices, the same
    picker as checkout, and the new delivery charge and total. Saved through
    `totals()`; Pay now or the COD amount then uses the new figure.
  - **paid:** the **same service** it paid for (`sameServiceIndex`), with no
    choice and no figure — "keep what they paid" (client). The courier is
    re-chosen so the admin books one that serves the new PIN; the charge and
    total are not touched, whether the new rate is higher or lower.
  - **no courier:** refused, with the PIN code field marked.
- **Checked twice.** `changeOrderAddress` re-evaluates the window under a row
  lock with the row as it is at that moment, and refuses (`"moved"`) if the
  order was paid between pricing and writing, so an unpaid total is never
  written onto a paid order.
- **The billing address follows the same window** (client, same day — briefly
  "always editable" before that), with no quote and no effect on the amount
  (`OrderBillingDialog`, `changeOrderBillingAction`). A booked shipment keeps
  the billing address it was sent; the parcel does not depend on it.
- `orders.delivery_service` records "Standard" / "Faster" / "Express" at
  checkout, because the name comes from position in that day's shortlist and
  cannot be recovered from a courier id later. For older paid orders it is
  worked out once from a quote to the old address.

### 4.5 Schema

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_grams INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS length_cm    INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS breadth_cm   INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS height_cm    INTEGER;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_provider  TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_order_id  TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_id        TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS awb                TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_name       TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_id         INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at         TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at       TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS orders_awb_idx ON orders (awb);

-- 2026-09-17
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_status     TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_status_at  TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_updated_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_eta        DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_events     JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at        TIMESTAMPTZ;

-- 2026-09-18
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_service    TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_changed_at  TIMESTAMPTZ;
```

`orders.shipping` needed no change — it has been an integer-paise column
included in `total` since orders existed, which is what made this a pricing
change rather than a structural one.

---

## 5. What was tested, and what could not be

### Verified against the live API (2026-09-12)

With real credentials on the account:

| Check | Result |
|---|---|
| Login, pickup address, rates | ✅ `npm run shiprocket:check` green end to end |
| Dimensions change the rate | ✅ 2 kg: ₹128 @15 cm → ₹460 @40 cm → ₹1,443 @60 cm |
| All seven category estimates | ✅ ₹59 (accessory) to ₹529 (industrial panel), all plausible |
| Options shown at checkout | ✅ Standard ₹87.67 ~7 days / Express ₹118.23 ~4 days |
| Switching option | ✅ total moves by exactly the difference |
| **Customer's choice is honoured** | ✅ chose Express → order stored `courier_id 196`, `shipping ₹118.23` |
| **Tampered `courierId` (999999)** | ✅ fell back to cheapest real service, `courier_id 6`, `₹87.67` — no invented price |
| Totals reconcile | ✅ `subtotal+cgst+sgst+shipping = total` on every order |

That last pair is the security-critical one: the browser can name a service but
cannot invent one, and cannot set a price.

### Verified without a Shiprocket account

- **Unconfigured is unchanged.** Full 14-check checkout suite passes with no
  credentials set: Delivery reads "Quoted on our call", `shipping` stays 0, and
  the total is what it was before.
- **The webhook, end to end**, by setting a token locally and firing real
  requests at it:

  | Sent | Result |
  |---|---|
  | Wrong `x-api-key` | 401, nothing changed |
  | `IN TRANSIT` | status → shipped, courier saved, `shipped_at` stamped |
  | `Delivered to consignee` | status → delivered, `delivered_at` stamped |
  | `DELIVERED` again | 200, `delivered_at` **unchanged** (idempotent) |
  | An unmapped status word | 200, status left alone |
  | An unknown AWB | 200, no retry storm |
  | A batch array | 200 |
  | Malformed body | 200 |

  **This found a real bug.** The update failed with *"could not determine data
  type of parameter $2"* — Postgres cannot infer one type for a parameter used
  across `COALESCE`, `IN` and `IS NULL`. The route logs and returns 200 either
  way, so without firing a real webhook this would have shipped as a webhook
  that silently changed nothing. Fixed with explicit `::text` casts, and
  commented in place.

### Tracking and emails (2026-09-17, laptop)

Real orders placed through checkout, a local webhook token, webhooks fired at
`/api/shipping/webhook`, mail logged rather than sent:

| Sent | Result |
|---|---|
| Wrong token | 401 |
| `PICKUP SCHEDULED` | courier status and scan stored; order still pending; no mail |
| `PICKED UP` with scans and `etd` | shipped, estimate stored, **shipped mail** |
| The same again | no mail, no duplicate scans |
| An older `PICKED UP` after `IN TRANSIT` | current status stays `IN TRANSIT` |
| `OUT FOR DELIVERY` | **out-for-delivery mail** |
| `UNDELIVERED` | stays shipped — not delivered |
| `OUT FOR DELIVERY` next day | **out-for-delivery mail** again |
| `DELIVERED` | delivered, `delivered_at`, **delivered mail** — 4 mails in all |
| A late `IN TRANSIT` | stays delivered |
| Unknown AWB, malformed body, a batch | 200 |
| `CANCELED` on a pending order | order stays pending, no mail |
| Admin cancels (prompt dismissed, then accepted) | unchanged, then cancelled + `cancelled_at` + **cancellation mail** |
| `IN TRANSIT` on the cancelled order | stays cancelled, no mail |
| Refresh tracking on a fake AWB | live API answered "no activities"; page says so; nothing changed |

The tracking API's response shape was confirmed against the live API with a
non-existent AWB.

### Not testable here

- **Live rates.** Needs credentials; the code path is exercised only as far as
  "unconfigured returns null".
- **A real booking.** Needs KYC cleared and a pickup address registered.
- **Shiprocket's own webhook delivery.** Same constraint as the Razorpay
  webhook: it needs a publicly reachable HTTPS URL, and the server is down. The
  *handler* is proven; what is unproven is Shiprocket reaching it. Their exact
  webhook body is taken from their documentation; the parser treats every
  field as optional.
- **Cancelling a real shipment.** `cancelShipment` has never been called
  against a real booking — doing so on the live account would cancel a real
  one. The first real cancellation is the test; the admin page reports if
  Shiprocket refused.
- **Tracking a real parcel.** No order has a real AWB yet.

---

## 6. Known gaps

- **Nothing is measured yet** (§3). Since 2026-09-15 every product has its own
  *estimated* packed weight and box size stored in its row — more specific than
  the category table, and identical on the laptop and the server, but still
  guesses. They are indistinguishable from real measurements in the admin, and
  the category fallback no longer applies to them. Replace them as products are
  weighed and measured.
- **Tracking is only as live as the webhook.** Nothing polls. Without the
  webhook set up in Shiprocket (INTEGRATIONS-SETUP-GUIDE.md §4.3), statuses and
  emails move only when somebody presses Refresh tracking.
- **One parcel per order.** A cart that genuinely needs splitting across two
  boxes is quoted as one heavy one.
- **Prepaid only.** COD is not offered, so COD rates are not requested.
- **Nothing watches the Shiprocket wallet.** Their account is prepaid; if the
  balance runs out, `bookShipment` still creates the order but the AWB step
  fails, and the admin card shows "created but no AWB was assigned". Orders on
  the site are unaffected. There is no low-balance warning in the admin.
- **No return/RTO handling.** An RTO is recorded and shown in amber to the
  operator, who decides whether to cancel (and email) the order. No mail goes
  to the customer about a return on its own.
- **Refunds are manual.** A cancelled, paid order's email promises a call about
  the refund; nothing issues one through Razorpay.

---

## 7. Unconfigured is a supported state

With no `SHIPROCKET_*` variables set:

- checkout shows "Quoted on our call" and charges nothing for delivery;
- `/admin/orders` shows "Shiprocket not configured" instead of a button;
- the webhook rejects everything, since no token can match an unset secret;
- nothing else changes.

That is the same contract Resend, Google and Razorpay keep, and it is what lets
a fresh clone and local development work without an account.
