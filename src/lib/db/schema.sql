-- vkon.in schema.
--
-- Every statement is CREATE ... IF NOT EXISTS and nothing here drops or
-- rewrites data, so this is safe to re-run against a live database.
--
-- LOCALLY:
--   npm run db:setup
--
-- ON THE SERVER:
-- The database is automatically updated on every deploy!
-- The `db-setup` service in `docker-compose.yml` mounts this file and runs it
-- against the database when the container stack starts. Since every statement 
-- is safe and idempotent, it effortlessly ensures the live DB is up to date.

-- Trigram similarity for fuzzy product search. Ships with every standard
-- PostgreSQL installation; adds no external dependency beyond the bundled
-- extension.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  tagline       TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',

  -- Free-form lists the admin edits as one-per-line textareas.
  hp_ranges     TEXT[] NOT NULL DEFAULT '{}',
  features      TEXT[] NOT NULL DEFAULT '{}',

  -- Keys from the fixed protection taxonomy, picked as checkboxes in the admin.
  -- Unknown keys are ignored at render time, so removing one from the taxonomy
  -- degrades gracefully instead of breaking a page.
  protections   TEXT[] NOT NULL DEFAULT '{}',

  -- [{ "label": "Supply", "value": "3 Phase, 280-440 V" }, ...]
  spec          JSONB  NOT NULL DEFAULT '[]'::jsonb,

  -- [{ "url": "...", "alt": "...", "pathname": "..." }, ...]
  -- `pathname` is the Vercel Blob key, kept so deleting a product can also
  -- delete its uploaded files rather than orphaning them.
  images        JSONB  NOT NULL DEFAULT '[]'::jsonb,

  -- YouTube or Vimeo watch/share URL. Parsed into an embed at render time.
  video_url     TEXT,
  video_title   TEXT,

  published     BOOLEAN NOT NULL DEFAULT TRUE,
  featured      BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order    INTEGER NOT NULL DEFAULT 0,

  -- Optional per-product SEO overrides. Blank falls back to name/tagline at
  -- render time — see generateMetadata in products/[slug]/page.tsx.
  seo_title       TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The catalogue always reads published products in sort order.
CREATE INDEX IF NOT EXISTS products_listing_idx
  ON products (published, sort_order, created_at DESC);

CREATE INDEX IF NOT EXISTS products_category_idx
  ON products (category);

-- GIN trigram indexes for fuzzy text search. Overkill for a 50-row
-- catalogue today but cost nothing to maintain and keep the door open for
-- hundreds of products without a migration.
CREATE INDEX IF NOT EXISTS products_name_trgm_idx
  ON products USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_tagline_trgm_idx
  ON products USING GIN (tagline gin_trgm_ops);

-- Added 2026-08-21: per-product SEO overrides. `ADD COLUMN IF NOT EXISTS`
-- brings an existing database up to date without touching its data, so this
-- stays safe to re-run alongside the CREATE above.
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_title       TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_description TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS price           INTEGER;

-- Added 2026-09-03: list price + optional discount. `price` is the M.R.P. --
-- what the product is worth before any reduction -- and `discount_percent` is
-- the reduction applied to it, 0-99. The selling price is derived at render
-- time (`components/product/ProductPrice`) rather than stored, so the two
-- numbers can never disagree with the third.
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_percent INTEGER;

-- Added 2026-09-12: shipped weight, for live delivery rates.
--
-- Grams, and the *packed* weight -- what the courier weighs, not what the
-- product weighs on its own. A courier bills on whichever is greater of actual
-- and volumetric weight, so under-declaring here does not save anyone money:
-- Shiprocket re-weighs at pickup and bills the difference back to the seller
-- *after* the customer has already been quoted. See `CATEGORY_PARCEL` in
-- `lib/parcel.ts` for what a product with no weight yet is quoted as.
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_grams INTEGER;

-- Added 2026-09-12: packed dimensions in whole centimetres, for the same
-- reason as the weight above and a more urgent one.
--
-- Couriers bill on the GREATER of actual and volumetric weight, where
-- volumetric is L*B*H/5000. Measured against the live API the same day: one
-- 2 kg parcel quoted Rs.128 in a 15 cm box and Rs.1,443 in a 60 cm box -- and
-- the number of couriers willing to carry it fell from six to one, because
-- size gates who will take it. Quoting without dimensions quotes the cheapest
-- of those and gets billed one of the others.
--
-- All three or none: a measured length beside an estimated width is not a box
-- anybody measured. `lib/parcel.ts` enforces that and holds the per-category
-- estimates used until a product is measured.
ALTER TABLE products ADD COLUMN IF NOT EXISTS length_cm  INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS breadth_cm INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS height_cm  INTEGER;

-- ---------------------------------------------------------------------------
-- Per-page SEO overrides for the static routes, editable at /admin/seo.
-- One row per path; a blank value falls back to the page's built-in metadata
-- at render time, so an empty table changes nothing.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS page_seo (
  path        TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Newsletter subscribers.
--
-- Collected by the panel above the footer and read at /admin/subscribers.
-- Nothing sends mail from here — this is a list, not a mailer.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS subscribers (
  id            TEXT PRIMARY KEY,

  -- Stored lower-cased and trimmed by lib/db/subscribers.ts. The UNIQUE
  -- constraint is only meaningful if the value is normalised before it gets
  -- here: "A@b.com" and "a@b.com " are the same subscription to a person and
  -- two rows to Postgres.
  email         TEXT NOT NULL UNIQUE,

  -- Which page the address came from, e.g. "/products". Purely for knowing
  -- what is working; never shown to the subscriber.
  source        TEXT NOT NULL DEFAULT '',

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The admin list is newest first, and that is the only way it is ever read.
CREATE INDEX IF NOT EXISTS subscribers_created_idx
  ON subscribers (created_at DESC);

-- ---------------------------------------------------------------------------
-- Contact enquiries.
--
-- Submitted from /contact and read at /admin/enquiries. Like `subscribers`,
-- nothing here sends mail: the row IS the enquiry, and the admin is where it is
-- read. See docs/ADMIN.md for the notification gap that follows from that.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS enquiries (
  id            TEXT PRIMARY KEY,

  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  -- Optional: a farmer may well prefer a call back and leave email blank-ish.
  phone         TEXT NOT NULL DEFAULT '',
  -- Free text. Length is capped in the action, not here, so an over-long
  -- message is a validation message rather than a database error.
  message       TEXT NOT NULL,

  -- Path the enquiry was sent from, e.g. "/contact".
  source        TEXT NOT NULL DEFAULT '',
  -- Cleared by the operator once they have replied. Not deleted: a handled
  -- enquiry is still a record of who asked for what.
  handled       BOOLEAN NOT NULL DEFAULT FALSE,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The admin list is unhandled-first then newest-first, and that is the only
-- way it is ever read.
CREATE INDEX IF NOT EXISTS enquiries_inbox_idx
  ON enquiries (handled, created_at DESC);

-- ---------------------------------------------------------------------------
-- Customer accounts.
--
-- Added 2026-09-06. Separate from the admin session in `lib/auth.ts`, which
-- has no user table at all: there is one operator and their password is an
-- environment variable. These are shop visitors, there are many of them, and
-- they own data (addresses, orders) that has to survive a deploy.
--
-- **The two never mix.** A customer session cookie grants nothing in /admin
-- and an admin cookie grants nothing here; they are different cookie names
-- verified by different modules. See ARCHITECTURE.md §7a.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customers (
  id             TEXT PRIMARY KEY,

  -- Lower-cased and trimmed by `normaliseEmail` before it ever gets here. The
  -- UNIQUE constraint is only meaningful because of that: "A@b.com" and
  -- "a@b.com " are one person to a human and two rows to Postgres.
  email          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL DEFAULT '',

  -- NULL for an account created through Google that has never set a password.
  -- `lib/password.ts` writes `scrypt$N$r$p$salt$hash`; nothing else parses it.
  password_hash  TEXT,

  -- Google's `sub` claim — the stable, opaque account id. NOT the email, which
  -- a Google account can change. NULL for a password-only account. Two rows
  -- can both be NULL (Postgres treats NULLs as distinct in a UNIQUE index),
  -- which is exactly what is wanted here.
  google_sub     TEXT UNIQUE,

  -- Set by the link in the welcome mail, or immediately on a Google sign-in
  -- (Google has already verified it). Nothing is gated on this today; it is
  -- recorded so that gating something later does not need a migration.
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Added 2026-09-17.
--
-- `signin_code_exempt`: this account signs in with its password alone, never
-- the emailed code. For review accounts only -- Razorpay's website
-- verification asks for a test login, and its reviewers sign in from a browser
-- this site has never seen, with no access to the account's inbox. Set from
-- `/admin/users`; off for every account by default.
--
-- `last_sign_in_at`: stamped whenever a session is issued, for `/admin/users`.
-- Sessions themselves are deleted on logout, so they cannot answer "when was
-- this person last here".
ALTER TABLE customers ADD COLUMN IF NOT EXISTS signin_code_exempt BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_sign_in_at    TIMESTAMPTZ;

-- Added 2026-09-19: a profile picture, shown in the header (client).
-- `avatar` is the file's name in the upload volume, served at /media/<avatar>.
-- `avatar_source`: 'upload' (chosen on /account), 'google' (copied from the
-- Google profile at sign-in), 'removed' (taken off by the customer — Google's
-- is then not put back). `google_picture` is the Google URL last copied, so it
-- is fetched again only when Google's changes.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS avatar         TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS avatar_source  TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS google_picture TEXT;

-- ---------------------------------------------------------------------------
-- Customer sessions.
--
-- Server-side rather than a self-contained signed cookie like the admin's,
-- for one reason that matters to a shop: **"Log out" must actually log out.**
-- A stateless token stays valid until it expires no matter what the server
-- does with it. A row can be deleted, which is what makes logging out on a
-- shared phone mean something.
--
-- The cookie holds `id.HMAC(id, AUTH_SECRET)`. The signature is not what makes
-- the session valid (the row is) — it lets a forged or corrupted cookie be
-- rejected without a database round trip.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customer_sessions (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  -- Truncated to 200 chars on write. Shown nowhere yet; kept so a "signed-in
  -- devices" list is possible without a migration.
  user_agent  TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS customer_sessions_customer_idx
  ON customer_sessions (customer_id);
-- Expired rows are swept opportunistically on session lookup; this is the
-- index that sweep uses.
CREATE INDEX IF NOT EXISTS customer_sessions_expiry_idx
  ON customer_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- One-time tokens: email verification and password reset.
--
-- **The token itself is never stored** — only a SHA-256 of it, the same way a
-- password is never stored. A leaked database backup therefore does not hand
-- somebody a working password-reset link for every account in it.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customer_tokens (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  -- 'verify' | 'reset'. Checked in the query, not by a constraint, so adding a
  -- third kind later is a code change and not a migration.
  kind        TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  -- Stamped instead of deleted, so a second click on the same link can say
  -- "already used" rather than "invalid".
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_tokens_lookup_idx
  ON customer_tokens (customer_id, kind);

-- ---------------------------------------------------------------------------
-- Devices a customer has already proved themselves on.
--
-- Sign-in asks for a six-digit code emailed to the account, but only the first
-- time a browser is seen. A row here is what "seen before" means: the browser
-- holds `id.HMAC(id, AUTH_SECRET)` in `vkon_device`, this holds the SHA-256 of
-- that id, and both have to agree. Deleting the row re-challenges that browser,
-- which is what makes "sign out everywhere" able to mean something later.
--
-- **The hash, not the id**, for the same reason `customer_tokens` stores one: a
-- leaked backup should not contain a working skip-the-code cookie for every
-- account in it.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customer_trusted_devices (
  id           TEXT PRIMARY KEY,
  customer_id  TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  -- Truncated on write, and shown nowhere yet. Recorded so a "devices you have
  -- signed in on" list is possible without a migration.
  user_agent   TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS customer_trusted_devices_customer_idx
  ON customer_trusted_devices (customer_id);
-- Expired rows are swept opportunistically, the same way sessions are.
CREATE INDEX IF NOT EXISTS customer_trusted_devices_expiry_idx
  ON customer_trusted_devices (expires_at);

-- ---------------------------------------------------------------------------
-- The signed-in cart: one row per customer, holding the same
-- `{slug, qty}[]` shape `lib/cart.ts` keeps in `localStorage` for a stranger.
--
-- **A row, not a join to anything** — `items` is slugs and quantities only,
-- the same reasoning as the browser copy: caching a product's name or price
-- here would go stale the moment that product changes. `lib/db/cart.ts`
-- re-sanitises it against the same caps (`MAX_LINES`, `MAX_QTY`) every read
-- and write, because a row written before those caps existed, or edited
-- directly, is not assumed trustworthy either.
--
-- `customer_id` is the primary key, not a separate id column: a customer has
-- at most one of these, so there is nothing else for a key to distinguish.
-- `ON CONFLICT (customer_id) DO UPDATE` is how `saveCustomerCart` writes it,
-- which is what makes the primary key being exactly the conflict target load-
-- bearing rather than incidental.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customer_carts (
  customer_id TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  items       JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Delivery addresses.
--
-- A customer may keep several; exactly one is the default, enforced in
-- `lib/db/addresses.ts` by clearing the others inside the same transaction
-- rather than by a constraint (a partial unique index would make the two-step
-- "set the new one, clear the old" ordering fail on the first step).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS addresses (
  id           TEXT PRIMARY KEY,
  customer_id  TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Who receives it, which is not always the account holder.
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  line1        TEXT NOT NULL,
  line2        TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL,
  state        TEXT NOT NULL,
  postal_code  TEXT NOT NULL,
  country      TEXT NOT NULL DEFAULT 'India',

  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS addresses_customer_idx
  ON addresses (customer_id, is_default DESC, created_at DESC);

-- Added 2026-09-10: GSTIN, for customers who buy against a business's
-- registration and need it printed on the invoice. It lives on the address
-- rather than on the customer because it belongs to a registered place of
-- business -- one buyer can have a GST-registered firm and a home address, and
-- only the first is invoiced under it. Fifteen characters, optional, stored
-- upper-cased and validated in `account/private-actions.ts`.
--
-- **This does not change what tax is charged.** CGST+SGST at 9% each is still
-- computed in `lib/pricing.ts`; capturing a GSTIN is a record on the invoice,
-- not an input to the calculation. See ARCHITECTURE.md §11.
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS gstin TEXT NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- Orders.
--
-- **Every money column is in paise, as an INTEGER.** `products.price` is in
-- whole rupees because a list price never has paise; a tax line does — 9% of
-- ₹818 is ₹73.62 — and floating point cannot hold that reliably through a sum.
-- Paise also happens to be the unit Razorpay's API takes, so the number that
-- goes to the gateway is the number in the row, with no conversion to get
-- wrong. Divide by 100 exactly once, at render time (`formatPaise`).
--
-- **Line items snapshot the product.** The cart stores slugs and resolves them
-- live, deliberately (see `lib/cart.ts`); an order must not. A product renamed,
-- repriced or deleted next year cannot be allowed to change what an invoice
-- from today says.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,

  -- Human-facing reference, e.g. "VK-2609-4F7A". What a customer reads out on
  -- the phone; `id` is a UUID and nobody is reading that aloud.
  order_number  TEXT NOT NULL UNIQUE,

  -- ON DELETE RESTRICT, not CASCADE: deleting a customer must not silently
  -- delete the record of what they bought and what was charged for it.
  customer_id   TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,

  -- 'pending' -> 'confirmed' -> 'shipped' -> 'delivered', or 'cancelled'.
  status        TEXT NOT NULL DEFAULT 'pending',
  -- 'unpaid' | 'paid' | 'failed' | 'refunded'.
  payment_status TEXT NOT NULL DEFAULT 'unpaid',

  subtotal      INTEGER NOT NULL DEFAULT 0,
  cgst          INTEGER NOT NULL DEFAULT 0,
  sgst          INTEGER NOT NULL DEFAULT 0,
  shipping      INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'INR',

  -- A copy of the address as it was when the order was placed, not a foreign
  -- key. Editing a saved address must not rewrite where last month's order
  -- was sent. Same reasoning as the line-item snapshot above.
  ship_to       JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Filled by the payment step.
  payment_provider    TEXT,
  payment_order_id    TEXT,
  payment_id          TEXT,
  payment_signature   TEXT,
  paid_at             TIMESTAMPTZ,

  -- Free text from the customer at checkout, bounded in the action.
  notes         TEXT NOT NULL DEFAULT '',

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Added 2026-09-10: the billing address, snapshotted on the same reasoning as
-- `ship_to` above. Checkout asks for billing first and shipping second, and a
-- ticked "ship to the billing address" writes the same object into both --
-- which is why this is a second snapshot and not a nullable one. A row written
-- before this column existed has `{}`, and `lib/db/orders.ts` reads that as
-- "the one address on this order was both", which is what it was.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bill_to JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Added 2026-09-12: the shipment, once one is booked with a courier.
--
-- All nullable and all empty until somebody presses "Book shipment" in
-- `/admin/orders`. An order with no shipment is the normal state for one that
-- has just been placed, and for every order placed before this existed.
--
-- `shipment_provider` names who booked it ('shiprocket'), on the same
-- reasoning as `payment_provider`: the column says which system the ids below
-- belong to, so a later change of courier aggregator does not make old rows
-- ambiguous. `awb` is the number the customer actually tracks with, and is the
-- one field here a human reads out.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_provider  TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_order_id  TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_id        TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS awb                TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_name       TEXT;
-- Which courier the customer chose at checkout, as Shiprocket's own id. Kept
-- so booking assigns the AWB to the service that was quoted and paid for --
-- picking a different one at booking time would charge for next-day and ship
-- surface.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_id         INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at         TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at       TIMESTAMPTZ;

-- The shipping webhook looks an order up by the courier's AWB, which is the
-- only id it carries that we also store.
CREATE INDEX IF NOT EXISTS orders_awb_idx ON orders (awb);

-- Added 2026-09-17: live tracking, and when an order was cancelled.
--
-- `tracking_status` is the courier's own words for where the parcel is ("OUT
-- FOR DELIVERY"), kept beside `status`, which is this site's four-state summary
-- of it -- the two are not the same thing and one must not be squeezed into
-- the other. `tracking_status_at` is the courier's time for that status, used
-- only to stop a late-arriving webhook overwriting a newer one; null when the
-- courier sent no time. `tracking_events` is the scan history, newest first,
-- capped in code. `tracking_eta` is the courier's estimate, as a day.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_status     TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_status_at  TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_updated_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_eta        DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_events     JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at        TIMESTAMPTZ;

-- Added 2026-09-17: refunds, as Razorpay reports them (`refund.processed`).
--
-- `refunds` is one entry per Razorpay refund -- `{id, amount, at}`, amount in
-- paise -- and the id is what makes a redelivered webhook a no-op and a second
-- partial refund a new one. `refunded_amount` is their sum, kept beside it so
-- a list page does not have to add up JSON. `payment_status` becomes
-- 'refunded' only when the whole total has gone back.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunds         JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at     TIMESTAMPTZ;
-- Set while the admin's Refund button is talking to Razorpay, and cleared when
-- it finishes. A second press in that window -- a double click, a second tab
-- -- is refused rather than sent as a second refund. Stale after a minute, so
-- a crash mid-request cannot lock an order's refunds forever.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_requested_at TIMESTAMPTZ;

-- Added 2026-09-17: when an unpaid order's prices were last brought up to the
-- catalogue's, which only happens when the customer accepted the change at
-- "Pay now". A paid order is never repriced.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS repriced_at TIMESTAMPTZ;

-- Added 2026-09-18: which delivery service the customer chose, by the name
-- checkout showed it ('Standard' | 'Faster' | 'Express'). The courier id alone
-- cannot say: the names come from a service's position in that day's shortlist
-- (see `serviceName` in lib/order-delivery.ts), and the same courier is
-- "Standard" to one PIN code and "Express" to another. Needed to keep a paid
-- order on the service it paid for when its address changes. Null on orders
-- placed before this column, and when no quote was possible.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_service TEXT;

-- Added 2026-09-18: when the customer last changed the delivery address after
-- ordering, so the admin card can say the label address is not the one in the
-- confirmation email.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_changed_at TIMESTAMPTZ;

-- Order history is read newest-first for one customer, and that is the only
-- way a customer ever reads it.
CREATE INDEX IF NOT EXISTS orders_customer_idx
  ON orders (customer_id, created_at DESC);
-- The admin inbox reads it newest-first across everyone.
CREATE INDEX IF NOT EXISTS orders_recent_idx
  ON orders (created_at DESC);
-- The payment webhook/verify step looks an order up by the gateway's own id.
CREATE INDEX IF NOT EXISTS orders_payment_order_idx
  ON orders (payment_order_id);

CREATE TABLE IF NOT EXISTS order_items (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- The product it came from, kept for "buy it again" links. Deliberately not
  -- a foreign key: a deleted product must not delete the line that says it was
  -- once sold, and must not block the delete either.
  product_id  TEXT NOT NULL DEFAULT '',
  slug        TEXT NOT NULL DEFAULT '',

  -- The snapshot. See the note on `orders`.
  name        TEXT NOT NULL,
  image_url   TEXT NOT NULL DEFAULT '',
  unit_price  INTEGER NOT NULL,
  qty         INTEGER NOT NULL,
  line_total  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS order_items_order_idx
  ON order_items (order_id);
