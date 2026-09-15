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
| **Track** | Courier POSTs to `/api/shipping/webhook` | Quietly — logs, always answers 200 |

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
- **`applyShipmentUpdate` is idempotent and reports whether it changed the
  row.** Couriers redeliver webhooks by design; that boolean is what separates
  a real transition from a repeat, and is where a "your order has shipped" mail
  would hook in when one is written.

> **This authentication is weaker than Razorpay's**, and knowingly so. Razorpay
> signs the request body; Shiprocket sends a bearer secret. That is only as
> good as HTTPS and the fact it never appears in a URL. It is what they offer.

### 4.3 The admin button

`/admin/orders` grows a **Shipment** block per order: a "Book shipment" button,
or the AWB and a tracking link once there is one.

Guarded against a second press — an order that already has a `shipment_id` says
so instead of re-booking. Cancelled orders get no button at all: booking a
parcel for an order that is not happening is the one mistake here that costs
real money.

### 4.4 The customer's view

`/account/orders/[id]` shows an "On its way" panel with the courier, the AWB
and a tracking link once a shipment exists, plus the dispatch or delivery date.
The Delivery line in the totals names the courier once one is known.

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

### Not testable here

- **Live rates.** Needs credentials; the code path is exercised only as far as
  "unconfigured returns null".
- **A real booking.** Needs KYC cleared and a pickup address registered.
- **Shiprocket's own webhook delivery.** Same constraint as the Razorpay
  webhook: it needs a publicly reachable HTTPS URL, and the server is down. The
  *handler* is proven; what is unproven is Shiprocket reaching it.

---

## 6. Known gaps

- **Nothing is measured yet** (§3). Since 2026-09-15 every product has its own
  *estimated* packed weight and box size stored in its row — more specific than
  the category table, and identical on the laptop and the server, but still
  guesses. They are indistinguishable from real measurements in the admin, and
  the category fallback no longer applies to them. Replace them as products are
  weighed and measured.
- **No "your order has shipped" email.** `applyShipmentUpdate` returns the
  boolean that would gate it; nothing sends one. The customer finds out by
  looking at their order page.
- **One parcel per order.** A cart that genuinely needs splitting across two
  boxes is quoted as one heavy one.
- **Prepaid only.** COD is not offered, so COD rates are not requested.
- **Nothing watches the Shiprocket wallet.** Their account is prepaid; if the
  balance runs out, `bookShipment` still creates the order but the AWB step
  fails, and the admin card shows "created but no AWB was assigned". Orders on
  the site are unaffected. There is no low-balance warning in the admin.
- **No return/RTO handling** beyond mapping the status to "cancelled".

---

## 7. Unconfigured is a supported state

With no `SHIPROCKET_*` variables set:

- checkout shows "Quoted on our call" and charges nothing for delivery;
- `/admin/orders` shows "Shiprocket not configured" instead of a button;
- the webhook rejects everything, since no token can match an unset secret;
- nothing else changes.

That is the same contract Resend, Google and Razorpay keep, and it is what lets
a fresh clone and local development work without an account.
