-- vkon.in schema.
--
-- Applied idempotently by `npm run db:setup` (scripts/db-setup.mjs), so it is
-- safe to re-run against an existing database.

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
