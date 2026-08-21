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

-- Added 2026-08-21: per-product SEO overrides. `ADD COLUMN IF NOT EXISTS`
-- brings an existing database up to date without touching its data, so this
-- stays safe to re-run alongside the CREATE above.
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_title       TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_description TEXT NOT NULL DEFAULT '';

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
