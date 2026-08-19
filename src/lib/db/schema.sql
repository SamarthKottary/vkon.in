-- vkon.in schema.
--
-- Every statement is CREATE ... IF NOT EXISTS and nothing here drops or
-- rewrites data, so this is safe to re-run against a live database.
--
-- LOCALLY:
--   npm run db:setup
--
-- ON THE SERVER: **not** `npm run db:setup`. The app runs in Docker and the
-- host checkout has no node_modules, so that script cannot import `pg`. The
-- database has no host port either, so it goes through the container:
--
--   docker compose exec -T db psql -v ON_ERROR_STOP=1 -U vkon -d vkon < src/lib/db/schema.sql
--
-- Run it from the deploy directory (~/project2/vkon.in) after any deploy that
-- adds a table or a column.

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

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The catalogue always reads published products in sort order.
CREATE INDEX IF NOT EXISTS products_listing_idx
  ON products (published, sort_order, created_at DESC);

CREATE INDEX IF NOT EXISTS products_category_idx
  ON products (category);

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
