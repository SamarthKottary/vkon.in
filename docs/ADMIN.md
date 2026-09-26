# The admin — how it works, and the rules for extending it

Companion to [ARCHITECTURE.md](ARCHITECTURE.md). That file describes the whole
site; this one is only the admin at `/admin`, written so that picking the work
up months from now does not mean re-deriving the decisions.

Everything in §1–§5 describes what is in the code today. §6 is a recipe. §7 is
opinion — decisions not yet made, with a recommendation for each.

---

## 1. What it does today

| Route | Purpose |
|---|---|
| `/admin` | Password form. Redirects to the product list once signed in. |
| `/admin/products` | Every product, published or not, with edit and delete. Search by name, URL, tagline or category; drag to reorder is off while a search is showing. |
| `/admin/products/new` | Create. |
| `/admin/products/[id]` | Edit. |
| `/admin/orders` | Order inbox — **confirmed orders only**: cash on delivery (badge **COD**) and paid online (**Paid online**); unpaid or failed online orders are left out, and **every order arrives as New** — paying online does not confirm one. Search by order number, email or phone; filter by status, by **Pending-not quoted** (waiting orders with no delivery price), or by **Refund-cancelled** — cancelled, paid online, money not back yet. A refund completing moves that order to **Cancelled**; sort newest or oldest first (without a choice each tab keeps the order that suits it); ten a page. Read, move an order along its status, courier tracking, cancel (emails the customer), and refund a cancelled online payment in full or in part. **Book shipment** shows its attempts and Shiprocket's reason on the order's own row, and sends you to support@vkon.in after three without ever blocking the button. A booked order waits in **Ready to ship** until the courier collects it; **Not ready** there cancels the parcel and returns it to Confirmed. **Scan** and the search box both pop the order up — its section, items, money, addresses and parcel — without moving the list. |
| `/admin/users` | Customer accounts. Read and search. Super users and admins also get the **sign-in code switch** (on or off for every customer) and **Sign in as**, which opens a customer's account in a new tab. |
| `/admin/reviews` | Product reviews from customers whose orders were delivered. Three lists — **Pending**, **Approved**, **Rejected** — searchable, ten a page. Only approved reviews appear on the site; a review can be moved between the three at any time. Super users and admins moderate. |
| `/admin/enquiries` | Contact-form inbox. Search by name, email or phone, ten a page. Read, mark handled, remove. |
| `/admin/subscribers` | The mailing list. Search by email, ten a page. Read, export (always the whole list), remove. |
| `/admin/seo` | Static page SEO overrides. |
| `/admin/inventory` | **Stores and what they hold** (2026-09-26). Its own sign-in page, because it is the address the shop floor is given. Lists every store with its address and product count; **View · Edit · Block · Delete** on each row. Inventory users, admins and super users. |
| `/admin/inventory/new` | Add a store: the address name, **Fetch** to fill the rest from Shiprocket's pickup addresses — including where returns go, the pickup hours, the alternate phone and the GSTIN — then **Add products** and **Save products**, which writes the store and opens it. |
| `/admin/inventory/[store]` | One store — name, address and counts at the top, then what it holds: drag or step rows into order, **Edit** the quantity and a note, **View** the product on the site, **Delete** it from this store. |
| `/admin/inventory/[store]/edit` | The store's own details again, including a fresh **Fetch**. The page address never changes. |

One operator, one password, five things to manage: **products**, **orders**
placed at checkout, the **mailing list** those products get announced to,
**enquiries** people send from the contact page, and **SEO** overrides. Nothing else on the site is
editable without a code change — not the hero copy, not the figures, not the
category list, not the contact details.

The two are not symmetrical, and the difference matters:

- **Products** are created here. The admin is the only writer.
- **Subscribers** are created by *visitors*, through the sign-up on the home
  page. The admin can only read, export and delete. There is deliberately no
  "add subscriber" form — an address somebody did not type themselves has not
  agreed to anything, and a list built that way is worth less than no list.
- **Enquiries** are also created by visitors, from `/contact`. The admin reads
  them, marks them handled and deletes them. Read §7.7 — this one has a gap with
  a business cost attached.
- **Orders** are created by *visitors* at checkout, and are the only thing here
  the admin can neither create nor delete — it can read one and move it along
  its status. Deleting is deliberately absent: an order is a financial record,
  and "cancelled" is the state that means it is not happening. §7.8.

> `/admin` and customer accounts are **two separate auth systems** and must
> stay separate: different cookies, different modules, neither reading the
> other's. §2 below is about the operator's session; ARCHITECTURE.md §7a is
> about customers'.

Every admin route is `force-dynamic`. A cached admin page is a stale admin page.

---

## 2. Security model

The whole of it, in four points:

**One password, no user table.** `ADMIN_PASSWORD` in the server's `.env`,
compared with `timingSafeEqual` over SHA-256 digests so neither timing nor
length leaks. `lib/auth.ts`.

**The session is an HMAC-signed cookie**, `expiry.nonce.HMAC(expiry.nonce,
AUTH_SECRET)` — httpOnly, sameSite=lax, secure in production, 12 hours. There
is no session store; the signature is the proof.

**Missing configuration fails closed.** No `ADMIN_PASSWORD`, or an
`AUTH_SECRET` under 16 characters, and every login fails. It never degrades to
"allow everyone".

**`requireAdmin()` is the first statement of every mutating action.** This is
the actual boundary, not the page guards. Server actions are independently
addressable POST endpoints — a layout that checks auth before rendering does
nothing to protect them. `saveProductAction`, `deleteProductAction` and
`uploadImageAction` each call it first. `logoutAction` deliberately does not:
clearing your own cookie is not privileged.

> If you add an action that writes anything, `await requireAdmin()` goes on the
> first line. Not after parsing, not after a guard clause. First.

**`inventory` is a role that is not a level** (2026-09-26). Support and viewer
see less of the same admin; an inventory user sees a different one — the stores,
and nothing else. So `requireAdmin()` *refuses* that role outright, and the
store actions call `requireInventory()` instead; `requireOperator()` exists for
the handful of things anybody does to their own account (name, password,
picture), because an inventory user has to be able to set a password on first
sign-in like everyone else. `requireAdminPage()` sends them to
`/admin/inventory` rather than showing a denial panel for a shop they will
never have. Only a super user can hand the role out.

> A store page's actions start with `await requireInventory()`, and a write to
> a **blocked** store is refused there too. Blocking is not a label on a card:
> hiding the buttons only stops the people who use the buttons.

---

## 3. How a save actually flows

```
ProductForm (client)  ──useActionState──▶  saveProductAction
                                              │  requireAdmin()
                                              │  buildInput()   parse + validate
                                              │  slugExists()   collision check
                                              ▼
                                        createProduct / updateProduct
                                              │
                                        products table (one row)
                                              │
                            /products and / read it on the next request
```

**All input is re-validated server-side**, including `<select>` values and
hidden fields. The client form is a convenience, never a control:

| Field | Rule |
|---|---|
| `name` | Required. |
| `slug` | Re-slugified from the submitted value (or the name), max 80 chars, checked for collision against other rows. |
| `category` | Must be in `CATEGORY_KEYS`; anything else silently becomes `starter`. |
| `protections` | Filtered to known keys; unknown ones are dropped. |
| `videoUrl` | Must parse as YouTube or Vimeo, else rejected with a field error. |
| `price` | Whole rupees, the **M.R.P.** — the figure before any discount. Negative or unparseable becomes blank; blank shows no price anywhere. |
| `discountPercent` | Whole number, clamped to **0–99** server-side. Dropped entirely if there is no `price`, since it could never be shown. 100 is refused because it would price the product at zero. |
| `seoTitle` | Trimmed, capped at 70 chars. Blank falls back to the product name at render. |
| `seoDescription` | Trimmed, capped at 200 chars. Blank falls back to the tagline. |
| lists | `parseLines` — one per line, blanks dropped. |
| `spec` | `parseSpec` — `Label: value` per line, or `Label \| value`. |

`sortOrder` is not a form field at all — `ProductForm` never submits it.
`saveProductAction` sets it itself: a new product gets `nextSortOrder()`
(one past the current highest, so it always lands last), an edit carries the
existing row's value through unchanged. The only way to change it is
`ProductReorder` on the list page — drag a row, or use its up/down buttons —
which calls `reorderProductsAction` with the full ordered id list.

**Uploads** are validated in `lib/storage.ts`: 8 MB limit, and only
`image/jpeg`, `image/png`, `image/webp`, `image/avif`. The `accept` attribute on
the input is a hint to the file picker, not a control. Files are written to
`UPLOAD_DIR` (default `data/uploads`), named from a SHA-256 of their contents
plus a random suffix, and served by `/media/[...path]`.

Each image stores its `pathname`, which is what lets `deleteProductAction`
remove the files as well as the row instead of orphaning them on disk.

---

## 4. Rules that must hold

Each of these encodes a bug that has already happened once, here or in
ARCHITECTURE §9.

**`requireAdmin()` first, in every mutating action.** §2 above.

**Product-facing routes stay `force-dynamic`.** ISR was tried and rejected:
`revalidatePath` marks a page stale but Next still serves the stale copy to the
*next* request while regenerating, so an admin who saved a product and
immediately opened the site saw the old version — which defeats the entire
point of a CMS. Reading Postgres per request costs one indexed query.

**Uploads never go in `public/`.** That directory is baked into the Docker
image at build time; anything written there at runtime vanishes on the next
deploy. `UPLOAD_DIR` points at a mounted volume.

**Fixed vocabularies live in code, not the database.** Sectors, categories and
protection keys are tied to icons, artwork and copy, so adding one is a code
change either way. `content/taxonomy.ts` is the source. Unknown keys are
filtered at read time, so removing one degrades instead of breaking a page.

**A product's market comes from its category.** There is no market field on the
form and there must not be one. `categories[].sector` in `content/taxonomy.ts`
decides which of agriculture / industrial / commercial a product appears under,
so filing it in the right category is the whole of the decision — and the
`<select>` is grouped by market so that choice is visible while making it. See
ARCHITECTURE §8 for why this is derived rather than stored.

**Nothing here sends email.** `/admin/subscribers` and `/admin/enquiries` both
collect and display; no code path in this repo delivers a message. Read §7.6
before wiring up a sender, and §7.7 for why enquiries make that more urgent than
the mailing list does.

**Admin content can break public layouts.** The catalogue and home grids assume
short values. A very long product name, or a figure like `1–40 HP three phase`,
will overflow a card at 390px. When adding a field, decide its maximum length
and say so on the form.

**Never commit in the deploy directory** (`~/project2/vkon.in` on the server).
The console treats the checked-out SHA as "what is deployed", so committing
there makes it report "up to date" while the container still runs the old
build.

---

## 5. Operating it

**Change the admin password.** Edit `ADMIN_PASSWORD` in the server's `.env`,
then use **Force rebuild** in the deploy console — *not* Pull & Deploy. There is
no new commit, so a pull reports "up to date" and does nothing; the container
has to be recreated to read the new value. Existing sessions survive, because
the cookie is signed with `AUTH_SECRET`, not the password. Change `AUTH_SECRET`
too if you want to sign everyone out.

**`POSTGRES_PASSWORD` is not the same.** Postgres only applies it when it
initialises an empty data directory. Changing it later changes what the app
sends but not what the database expects, and every query fails. See
DEPLOYMENT.md → Troubleshooting for the `ALTER USER` recipe.

---

## 6. Recipe: adding a new editable field

Worked example — adding a `warranty` string to products. Seven files, in order:

1. **`src/lib/db/schema.sql`** — add the column. The file is applied
   idempotently, so use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
2. **`src/lib/types.ts`** — add it to `Product`. `ProductInput` is
   `Omit<Product, "id" | "createdAt" | "updatedAt">`, so it follows for free.
3. **`src/lib/db/products.ts`** — three places: the `ProductRow` type,
   `mapProductRow` (the single snake_case → camelCase bridge), and
   `writeParams` plus the column lists in `createProduct` / `updateProduct`.
4. **`src/app/admin/products/ProductForm.tsx`** — add the input, `name` matching
   what you will read from `FormData`.
5. **`src/app/admin/actions.ts`** — parse and validate it in `buildInput`.
   Anything with a constrained set of values gets checked against that set here,
   not only in the form.
6. **Render it** wherever it belongs on the public side.
7. **Run the migration on the server**: the deploy script applies `schema.sql`,
   so a normal deploy picks it up — but confirm, because an `ADD COLUMN` that
   silently fails leaves the app querying a column that does not exist.

Then check the three things that bite:

- Does an empty value render sensibly? Most fields will be blank on every
  existing row the moment you ship.
- Does a long value break the layout at 390px?
- Does it need to appear in `productJsonLd` in `lib/seo.ts`?

---

## 7. Open decisions, with recommendations

Nothing here is built. Each is written so the reasoning survives.

### 7.1 Make the hero figures editable — *recommended*

The four figures under the hero (`1–40 HP`, `12`, `3 phase`, `280–440 V`) are
hardcoded in `components/home/Hero.tsx`. One of them, the 280–440 V supply band,
is still **unverified** — it came off a competitor's poster during the first
build. Making these editable is what lets that be corrected without a deploy.

**Model each figure as two fields: `value` and an optional `unit`.** Not one
combined string, and not an automatic split.

The value is set large in near-white; the unit small and softer. That difference
is doing real work — the number is the scannable thing, the unit is a qualifier
— and it is the same idiom as the HP ranges on product cards and the spec
tables. Setting `1–40 HP` uniformly makes it one undifferentiated string.

An automatic split (on the last space, say) looks clever and breaks immediately:
`12` has no unit at all, and any value containing a space breaks it.

Two refinements worth taking at the same time:

- **Drop the colour difference, keep the size difference.** Between `#FFFFFF`
  and `#C3C9CF` at 16px the colour shift is barely visible and adds a second
  variable for nothing; the size step does the work. Fewer variables is a
  simpler mental model for whoever edits it.
- **Guard the length.** Four figures share one row. Cap the value and warn on
  the field, or a long entry will break the hero at 390px.

Storage: a `site_figures` table is overkill for four rows that are really page
content. A single-row `settings` table with a JSONB column, or a `site_content`
key/value table, is the lighter fit — but note that anything editable also has
to be *validated*, and there is currently no validation path for non-product
content.

### 7.2 More than one admin — *recommended approach: Cloudflare Access*

There is one password today. Three ways to add a second person:

| Approach | Cost | What it gives |
|---|---|---|
| **Cloudflare Access in front of `/admin`** | ~20 min, no code | Per-person identity, MFA, instant revocation, an audit log. Free to 50 users, and the client's Cloudflare account already exists. |
| Several passwords in `.env` | ~30 min | Two people can log in. No idea which one did anything. |
| Real user table with hashed passwords | a day+ | Proper accounts — and a login system to keep secure forever. |

The first is the recommendation. It gives genuine per-person accounts without
writing a line of auth code, which for a two-person operation is the right
trade. The existing password stays as a second factor behind it.

### 7.3 Login rate limiting — *known gap, now cheap to close*

Not implemented on login. The original reasoning was that in-memory counters are
per-instance and near useless — true on serverless, and **not true here**: this
deploys as a single container behind the tunnel, so one process is the whole
application.

`lib/rate-limit.ts` now exists, written for the public sign-up, and applying it
to `loginAction` is about four lines. It is worth doing. Note the caveat in that
file: if the site ever moves to a multi-instance host, both uses need a shared
store instead.

Cloudflare Access (7.2) removes the exposure entirely, which is still the better
use of the same effort if you are doing one of them.

### 7.3a "The password is right but it keeps asking again"

Not an open decision — a trap worth naming, because it looks exactly like a
wrong password.

The session cookie is `Secure` in production, so a browser will only keep it on
**https://**, or on `localhost` / `127.0.0.1`, which browsers treat as
trustworthy origins. Reach the admin over plain HTTP on any other host — the LAN
IP `next start` prints beside the localhost URL, for instance — and the cookie
is silently discarded. The password is accepted, the redirect to
`/admin/products` fires, that request arrives anonymous, and you land back on
the sign-in form.

`/admin` now detects this and says so. The fix is to use `localhost` locally, or
https on the server; the cookie stays strict either way.

### 7.4 Database backups — *known gap, and the most serious one*

Nothing backs up `vkon-pgdata`. Every product, every description, every uploaded
image reference lives in one Docker volume with no copy. A nightly `pg_dump`
plus a copy of `UPLOAD_DIR` is an hour of work and is worth doing before the
catalogue has real content in it, not after.

### 7.5 An audit trail — *not recommended yet*

Tempting, pointless with one operator. Revisit if 7.2 lands and there are
several people, at which point Cloudflare Access already logs who reached the
admin and the only thing missing is what they changed.

### 7.6 Actually sending to the mailing list — *two obligations first*

The list exists; nothing delivers to it. Before anything does:

1. **Every message needs a working unsubscribe link.** Today the only way off
   the list is asking the operator to delete the row. That is fine for a list
   nobody is mailing and indefensible for one that is.
2. **Sign-up should become double opt-in.** Right now anyone can type anyone
   else's address into the panel. Nothing is delivered, so nothing happens — the
   moment a sender exists, that becomes a way to subscribe a stranger to your
   mail. The fix is to mail a confirmation link and only write the row when it is
   clicked, which means the `subscribers` table gains a `confirmed_at` and the
   admin list learns to show pending rows differently.

Both belong with the sender, not in this repo's current shape. The recommended
route is an external service (a transactional or newsletter provider) that does
list management, unsubscribe handling and delivery reputation properly — export
the CSV into it rather than building a mailer here. Adding a mail dependency to
a codebase whose whole dependency policy is `next`, `react`, `react-dom` needs
to clear a high bar.


### 7.7 Nobody is told when an enquiry arrives — *the gap with a cost*

> **Closed 2026-09-17.** Every enquiry is now emailed to `site.email`
> (support@vkon.in) with the visitor as Reply-To — `sendEnquiryAlert`,
> EMAILS.md G. The text below is the reasoning that made it urgent.

The contact form writes a row and stops. There is no email, no SMS, no
notification of any kind: **an enquiry is invisible until somebody opens
`/admin/enquiries`.** For a business whose buyer has a stopped pump, an enquiry
noticed two days late is a lost sale, not a delayed reply.

Three things reduce the exposure today, and they are deliberate rather than
incidental:

1. The contact page puts **call and WhatsApp above the form**, so the fastest
   channels are the obvious ones.
2. The inbox counts what is **waiting for a reply** at the top of the page.
3. Nothing marks itself handled; that is a person deciding they have replied.

Closing it properly is one of:

- **Forward each enquiry to WhatsApp or email on submit.** Smallest change that
  actually works, and it needs an outbound provider — see §7.6, the same
  decision. A WhatsApp Business API message to the office number is the closest
  fit to how this business already operates.
- **Poll the inbox from something that already alerts you.** Crude, but a cron
  job hitting a count endpoint and messaging on a non-zero result needs no new
  dependency in this repo.

Until one of those exists, **the inbox needs checking through the working day**,
and the page says so in as many words.

**This got cheaper on 2026-09-06.** `lib/mail.ts` now exists and sends through
Resend over plain HTTPS with no new dependency, so the first option above —
forward each enquiry on submit — is now a `sendMail` call in
`sendEnquiryAction` rather than a provider decision. The mailing-list
obligations in §7.6 are untouched by that: an enquiry forward is transactional
and needs no unsubscribe; a newsletter is not and does.


### 7.8 The order inbox — *built 2026-09-07; the notification half is not*

> **Notification half closed 2026-09-17.** A new order is emailed to
> support@vkon.in — cash on delivery at placement, online on payment — with the
> customer as Reply-To (`notifyNewOrder`, EMAILS.md A).

`/admin/orders` exists. Newest first, with the line items as they were bought,
the delivery address, the customer's note and their phone number as a
tap-to-call link — while payment is settled by telephone, ringing them is the
actual next action, so it is the most prominent control on the card.

**Added 2026-09-11: a billing address, shown alongside the delivery one only
when the two differ**, plus the GSTIN when the billing address carries one —
both read through the shared `account/OrderAddress` component the customer's
own order page also uses, so a display change to one cannot drift from the
other. Most orders show one address, because most customers leave "ship to
the billing address" ticked; the extra "Bill to" block only appears for the
minority who untick it.

The status control moves an order `pending → confirmed → shipped → delivered`,
or `cancelled`. Three things about it are deliberate:

1. **`setOrderStatusAction` re-validates against a fixed list.** It comes from
   a `<select>`, and §2's rule is that a select's value is a convenience and
   never a control.
2. **It cannot set `payment_status`.** That belongs to the gateway; a human
   toggling "paid" records that money arrived without anything having checked
   that it did. When cash on delivery needs recording, give it its own named
   action rather than widening this one.
3. **There is no delete.** An order is a financial record. "Cancelled" is the
   state that means it is not happening.

**What is still missing is the notification.** Like the enquiry inbox, this
page has to be *looked at* — the confirmation mail goes to the customer, not to
you. Closing it is a `sendMail` call in `placeOrderAction`.

**This became more urgent on 2026-09-07**, when payment was built
([PAYMENTS.md](PAYMENTS.md)). It is not live yet — it waits on Razorpay KYC —
but the day it is, a missed order stops being a missed sale and becomes a
customer who has paid and heard nothing. Do the notification before the keys
go in.

Note also that a paid order arrives here already marked **Paid** and
**Confirmed**: the gateway sets both, not a human.

---

## Change log

**2026-09-26 (inventory)** — **A new section: stores and their stock.**
`/admin/inventory` has its own sign-in page and its own role. A store is one
place that holds stock; its address is fetched from Shiprocket by the same
nickname their pickup address has, so what a courier collects from and what is
written here cannot drift apart by a typo. A store holds products from the
catalogue, each with a quantity and a note, in an order you can drag. **Block**
freezes a store and the server refuses every write to it; **Delete** takes the
store and its stock list, never the products. None of it is visible to
customers — this is the shop's own record, not a stock level on the site.

Roles: a **super user** assigns *Inventory* on `/admin/users/access`. An
inventory user's whole admin is `/admin/inventory`; admins and super users see
it alongside everything else — the last row of the sidebar. New tables,
`stores` and `store_products`, both applied from `src/lib/db/schema.sql`.

A store also records **the point of contact's role** — "Warehouse manager" —
which is typed here: Shiprocket's pickup API returns a name, a phone and an
email, and no role at all. Fetch never overwrites it.

**How they get a password** (2026-09-26): a super user sets it, or they reset
it themselves. A new account has none, so **Set password** on the account's row
in `/admin/users/access` is how the first one is given. **Forgotten password?**
on the sign-in form now works for every role — it used to answer "only super
users can reset their password here", which is a dead end for the person
reading it — and an inventory user's link lands them back on
`/admin/inventory`. It is super-only, refuses a short or common password,
stores a scrypt hash like any other, and cannot be used on your own account
(that is `/admin/profile`, which asks for the current one first). Whoever it is
set for can change it under Profile afterwards.

> The older path — a passwordless account signing in with the server's shared
> `ADMIN_PASSWORD`, which then becomes theirs — still exists for the first
> administrator. Do not use it for staff: it is one password for every
> passwordless account on the site.

**Where an inventory user signs in: `vkon.in/admin/inventory`.** The same
credentials as any other operator, and the same cookie; that page carries its
own form so it can be given out on its own, and it is where they land after
signing in from anywhere else.

**2026-09-25 (pricing)** — **Product prices are shown with GST included.**
The figure on a card, a product page or a cart line is what the customer pays;
the cart and checkout still break it down into Subtotal (excl. GST), CGST,
SGST, delivery and total. The discount still comes off the M.R.P. first and
the tax is charged on what is left. The **CGST and SGST percentages** are
entered beside the GST number under **Tax and invoice details** on
`/admin/profile` (super user only): changing them changes every price on the
site and every order placed afterwards, while orders already placed keep what
they were charged.

**2026-09-25 (invoices)** — **Download invoice** on a customer's order page
now produces a real PDF (from 2026-09-25, only once the order is delivered): Vkon Automation's letterhead (powered by G.N.
Technologies), both addresses, the items, CGST and SGST as separate lines, and
the declaration — laid out after the reference invoice supplied by the client.
The **GST number** it prints is entered under **Invoice details** on
`/admin/profile`, which only a super user sees; leave it empty and the invoice
simply carries no GSTIN line. A business customer who entered their own GSTIN
at checkout sees it on the billing address, and the foot carries the signature
block ("Authorised Signatory"). Amounts read "Rs." rather than the rupee sign,
which the PDF's standard fonts cannot draw.

**2026-09-25 (sign-in)** — Opening an admin link while signed out now shows
the **sign-in form** — "Sign in to open /admin/orders?status=ready" — and
takes you to that page once you are in, instead of the browser's reload/error
screen. Works for any admin page, with its filters and sorting intact, and for
"Continue with Google" too.

**2026-09-25 (orders, items)** — On an order card, and in the Find pop-up,
an item's picture and name **open that product in a new tab**. Nothing is lost
from the order you were working on. An item whose product has since been
deleted stays plain text.

**2026-09-25 (orders, times)** — The dates under an order number are the
courier's own: **Shipped** is the Pickup Done scan, not the moment somebody
pressed Refresh tracking, and an order stamped the old way corrects itself on
the next refresh. A booked order shows **Ready to ship** and since when. The
AWB sits on its own line under the courier, and moving between sections always
fetches the list afresh. Needs the schema change (`booked_at`).

**2026-09-25 (orders, later)** — Scan and the search box **filter the list**
to the order, rather than opening a pop-up over it: the card is where an order
is worked on. A search also clears the section filter, so an order is found
whatever section it is in, and then selects the section the matches are in —
All only when they are spread across several. The AWB is searchable now, so
scanning a parcel label lands on its card.

**2026-09-25 (orders)** — **Looking an order up no longer moves the list.**
Scan and the search box both open the order as a pop-up: which section holds
it (Confirmed, Ready to ship, Delivered …), the items, the money, the delivery
and billing addresses, the account and the parcel. Behind it the chips, the
page and your place in the list are exactly as you left them. Searching an
email or a phone lists the matches to pick from. The list can still be
filtered by a `?q=` link, and the box offers **Clear filter** when one is on.

**2026-09-24 (orders, later)** — A **Scan** button left of the search on
`/admin/orders`: point the camera at a parcel label and the order comes up in
a pop-up, with a link to its card. Either barcode works — the AWB or the order
number — on any browser and any camera, laptop included. If the light or the
focus will not cooperate, **Use a photo** in the same dialog reads a
photograph instead, and the number can always be typed. Also,
the **booking and address-change cutoff moved from 12 pm to 11 am** the day
after an order is confirmed.

**2026-09-24 (orders)** — **Ready to ship** is what the customer sees too: an
order with a parcel booked reads that in their order history and on the order
page, instead of Confirmed, and their status filter gained the same choice.
**Not ready** is now red, like Cancel. **Cancelled** moved to the end of the
filter row, after Refund-cancelled.

**2026-09-23 (shipment, fix)** — Every Book shipment press now goes up under
a reference Shiprocket has never seen (`VK-…`, then `-R2`, `-R3`, …), counted
on the order and never reset. It used to be derived from the failed-attempt
count, which Not ready and moving an order back to New both clear — so a
restarted order sent references Shiprocket already had, and it quietly handed
back the old cancelled order instead of creating one: three presses that did
nothing before the fourth worked. Needs the schema change (`shipment_tries`).

**2026-09-23 (shipment, later)** — **Ready to ship**, a section between
Confirmed and Shipped: an order moves there the moment a parcel is booked, and
on to Shipped by itself when the courier first scans it. **Not ready** on one
of those orders cancels the parcel at Shiprocket and puts the order back in
Confirmed with its Book shipment button (it asks first, and says where the
order lands); if Shiprocket will not cancel, nothing here changes and the row
says to cancel it in their dashboard. Confirmed now means "confirmed and not
booked", so the two sections never hold the same order. Book shipment also
stopped being limited to three presses — past the third the row says to
contact support@vkon.in but the button still works — and moving an order back
to New from the status box clears its failed attempts, so the whole process
can be started again.

**2026-09-23 (shipment)** — **Book shipment counts its attempts.**
A press that does not end in a courier is quietly undone at Shiprocket, and
the retry is sent under a new reference (`VK-…-R2`) because they hand back the
order they already hold for one they have seen. Everything is said **on the
order's row**, not in a banner above the list, and the page comes back to that
order instead of the top: one line for what happened ("No courier was
assigned."), then "Attempt 2 of 3 failed: Insufficient balance …" and "1
attempt left" under the button, both read off the order so a refresh keeps
them. After the third the row says to contact
support@vkon.in — the count is cleared by a booking that works, by Not ready,
or by moving the order back to New. The button reads **Initializing…** and then
**Processing…** while Shiprocket answers. Needs the schema change
(`shipment_attempts`, `shipment_error`).

**2026-09-23 (orders)** — `/admin/orders` sorts **newest first** or **oldest
first**, a **Sort order** dropdown under the filter chips (client: "filter in orders to set
newest to oldest or oldest to newest orders"). It stays on **Default order** unless an order is chosen, which leaves each
tab as it was — the Pending, Confirmed and Refund-cancelled queues oldest
first, Shipped and Delivered by their own dates. A choice is always by order
date, so "oldest first" means the same thing on every tab, and it rides in the
URL beside the search and the filter: changing the filter, paging and every
button on a card come back to the same view.

**2026-09-22 (reviews)** — Product reviews. A customer whose order is marked
**delivered** gets a rating form under each product on that order: half a star
to five stars, an optional comment of 20–2,000 characters, and up to four
photos or clips (stars alone is a complete review). Attachments are shown on
the review card in `/admin/reviews` — approving a review approves its pictures
too. Photos are shrunk in the customer's browser; a clip may be up to 25 MB. They are never told a review was rejected — they always
see their own, and moderation decides only whether strangers do. Everything lands in
`/admin/reviews` as **Pending** and is invisible to the public until approved;
approving puts the review and its stars on the product page, rejecting keeps
it off, and either can be undone later. A customer may rewrite their review at
any time, which sends it back to Pending. The star figure on a product page and on every product card
is the average of its approved reviews only; clicking the one on a product
page jumps to the reviews at the foot of it. One review per customer per product; eligibility is
checked in the query that writes the row, so a forged form gets nothing.

**2026-09-22 (products)** — Three tags on the product form, shown as a ribbon across the
top-right corner of the photo on every card: **Out of stock** (red), **Best seller** (green) and
**Limited time deal** (orange). Out of stock is the only one that does
anything: the photo dims, Add to cart becomes a disabled "Out of stock", the
cart marks the line, and an order containing it is refused with the product
named — checked again on the server, so a page left open cannot get through.
Nothing expires the deal tag; turn it off when the offer ends.

**2026-09-21 (users)** — The emailed sign-in code is now one switch at the top
of `/admin/users` rather than a button on each account: off means no customer
is asked for a code, and it is meant to go back on as soon as the review that
needed it is done (it reads amber while off, and fails safe towards on if the
database cannot be read). Each row also gained **Sign in as**, which opens that
customer's account in a new tab — an ordinary session, invisible to them,
recorded in the server log and on the session row. Both are super-user and
admin only, checked in the action and the route rather than only in the page.

**2026-09-21 (later)** — The order card was rearranged to the client's sketch:
items across the left, and under them a row with the payment note on the left
— its rule running from the card's edge to the bill's — and the bill above the
shipment on the right. The addresses keep their own column, so a long list of
items pushes the bill, payment and Book shipment down instead of squeezing
them. The **Refund** filter became **Refund-cancelled**: cancelled orders paid
online whose money is not back yet, owed or being processed. Each leaves for
**Cancelled** as its refund completes, so the two never hold the same order.
**Pending** gained one companion, **Pending-not quoted** — a slice of it, the
waiting orders checkout could not price delivery for, which need a charge
agreed before dispatch. Cash on delivery and online orders stay together under
Pending; how an order is paid is on its card. Also fixed: /admin/reset
and /admin/forgot hardcoded the light page background, so in dark mode the
heading was dark-on-dark.

**2026-09-21** — Three changes from the client. **Paying online no longer
confirms an order**: it arrives as New and waits for the operator, as cash on
delivery already did (`markOrderPaid` stops writing `status`). **A Refund
filter** on `/admin/orders` — every cancelled order still owed money or
waiting on Razorpay, so a refund can be found without hunting through
Cancelled; it leaves the filter once the money is back. **The standing notes**
on orders, enquiries and subscribers are folded behind an info button
(`components/admin/InfoNote`, a `<details>` element) instead of sitting above
the list.

**2026-09-19** — Search and paging on the admin lists (client: "fixed number
of emails per page … it moves to the next page", with a "1–10 of 23 ·
Previous · Next" footer as the reference). Orders, enquiries and subscribers
show ten a page; orders also filter by status with a count on each choice.
The view lives in the URL, and every button on a card posts it back, so an
action returns to the same page, search and filter. Products gained a search
only — there are too few to page. §1 updated; details in ARCHITECTURE.md's
2026-09-19 (admin) entry.

**2026-09-11** — Checkout gained a billing address distinct from the shipping
one, with an optional GSTIN. `/admin/orders` now shows a "Bill to" block
(only when it differs from the delivery address) and the GSTIN, through the
same `OrderAddress` component the customer-facing order page uses. See
ARCHITECTURE.md's 2026-09-11 change log entry for the full account of it.

**2026-09-07** — Payment built (not yet live; awaiting Razorpay KYC). Nothing
in `/admin` changed, but §7.8's notification gap is now the thing standing
between a paid customer and silence.

**2026-09-07** — `/admin/orders` built, closing the gap the previous entry
opened. §1 gains the route and now says five things to manage rather than four;
§7.8 records what was built and the three deliberate limits on it — validated
status, no `payment_status` by hand, no delete.

**2026-09-06** — Customer accounts and orders arrived (ARCHITECTURE.md §7a).
`/admin`'s single-operator auth and the new customer auth are separate systems
by design and must stay so.

**2026-09-03** — Product pricing. `discount_percent` joins the existing `price`
column, and the two are entered as **M.R.P. + percent off** rather than two
rupee figures — the selling price is derived at render time in
`components/product/ProductPrice`, so the three numbers a customer sees cannot
disagree. Both are in the §3 validation table; the percent is clamped 0–99 in
`buildInput`, not merely on the input's `max`. Note for §4's "admin content can
break public layouts" rule: the price block replaces "View details" inside a
card footer whose height is reserved by an invisible sizing clone, so it is
built to two lines in 36px — a longer treatment there changes every card's
height. Prices show on the catalogue, featured and recently-viewed cards, in
Quick View and on the product page; an unpriced product falls back to exactly
what was there before.

**2026-08-19** — Enquiries added: a third thing to manage, and the first one
where not noticing it costs money. New §7.7 on the notification gap and the two
ways to close it. §1 and §4 updated.

**2026-08-18** (later) — §7.3a added: the `Secure` cookie silently drops over
plain HTTP on a non-localhost host, which presents as a rejected password. The
login page now warns instead of bouncing without explanation.

**2026-08-18** — Subscribers added: a second thing to manage, created by
visitors rather than by the operator. New §7.6 on what sending to the list would
require, and §7.3 revised — the in-memory limiter written for the sign-up makes
login rate limiting cheap, because this is a single container and not
serverless. §4 gained the rule that a product's market is derived from its
category.

**2026-08-12** — Created. Describes the admin as built, and records the open
decisions discussed while building the public site.
