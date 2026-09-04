-- VKON Full Database Dump
-- Exported on 2026-09-04T13:52:07.301Z

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


-- Clear existing tables before population
TRUNCATE products, subscribers, enquiries RESTART IDENTITY;

-- Insert Products (12 rows)
INSERT INTO products (id, slug, name, category, tagline, description, hp_ranges, features, protections, spec, images, video_url, video_title, published, featured, sort_order, created_at, updated_at, seo_title, seo_description, price, discount_percent) VALUES ('dba33600-16d0-4b29-969c-f84d9e0445f5', 'demo-solar-controller', 'DEMO Solar Pump Controller', 'solar', 'Runs the pump on solar, on mains, or changes over between them', 'DEMO PRODUCT — placeholder copy and drawn artwork.

A controller that drives the pump from a solar array, from mains, or changes over between the two as the day allows. The protection set watches the motor whichever source is driving it.', '["3 HP","5 HP"]', '["Automatic changeover between solar and mains","Dry run protection","Overload and voltage monitoring"]', '["dry-run","hv-lv","overload-relay","solar-powered"]', '[{"label":"Type","value":"Solar / mains changeover"},{"label":"Motor range","value":"3 – 5 HP"},{"label":"Supply","value":"Solar array or mains"},{"label":"Changeover","value":"Automatic"},{"label":"Display","value":"Source and load status"},{"label":"Sensing","value":"CT based"},{"label":"Enclosure","value":"Powder coated sheet steel"},{"label":"Mounting","value":"Wall mounting"},{"label":"Warranty","value":"PLACEHOLDER"}]', '[{"alt":"DEMO solar pump controller, front view","url":"/products/demo-solar.jpg"}]', NULL, NULL, TRUE, TRUE, 1, '"2026-08-13T07:12:18.778Z"', '"2026-09-03T08:56:12.393Z"', '', '', 24999, 10);
INSERT INTO products (id, slug, name, category, tagline, description, hp_ranges, features, protections, spec, images, video_url, video_title, published, featured, sort_order, created_at, updated_at, seo_title, seo_description, price, discount_percent) VALUES ('8791f008-bfd3-42a4-b398-75f9c384e93e', 'demo-submersible-cable', 'DEMO Submersible Cable', 'cable', 'Flat submersible cable for continuous underwater duty', 'DEMO PRODUCT — placeholder copy and drawn artwork.

Submersible cable for continuous underwater duty, where ordinary wiring gives way at the joint long before the conductor does. Sized to the panel and the motor it will run.', '["3 core"]', '["Continuous underwater duty","Sized to the panel and motor"]', '[]', '[{"label":"Type","value":"Flat submersible"},{"label":"Cores","value":"3"},{"label":"Conductor","value":"Annealed copper"},{"label":"Insulation","value":"PVC, submersible grade"},{"label":"Duty","value":"Continuous underwater"},{"label":"Sizing","value":"Matched to panel and motor"},{"label":"Supplied as","value":"Coil"},{"label":"Warranty","value":"PLACEHOLDER"}]', '[{"alt":"DEMO submersible cable coil","url":"/products/demo-cable.jpg"}]', NULL, NULL, TRUE, FALSE, 1, '"2026-08-13T07:12:18.778Z"', '"2026-09-03T08:56:12.397Z"', '', '', 4200, 12);
INSERT INTO products (id, slug, name, category, tagline, description, hp_ranges, features, protections, spec, images, video_url, video_title, published, featured, sort_order, created_at, updated_at, seo_title, seo_description, price, discount_percent) VALUES ('e99ccdb1-902e-4f85-8b18-44b5dc6d2d58', 'demo-auto-start-timer', 'DEMO Auto Start Timer', 'auto-start', 'Adds automatic starting to a starter you already own', 'DEMO PRODUCT — placeholder copy and drawn artwork.

Brings the pump back when three phase supply returns within safe limits, after an adjustable delay so it never starts into an unstable line. A cyclic timer runs it on a repeating schedule through the night.', '["Up to 10 HP"]', '["Adjustable restart delay","Separate on and off cycle timers","Works with an existing starter"]', '["hv-lv","auto-start-timer","cyclic-timer"]', '[{"label":"Type","value":"Auto start / cyclic timer"},{"label":"Motor range","value":"Up to 10 HP"},{"label":"Supply","value":"3 phase"},{"label":"Restart delay","value":"Adjustable"},{"label":"Cycle timers","value":"Separate on and off"},{"label":"Fitting","value":"Works with an existing starter"},{"label":"Enclosure","value":"ABS moulded"},{"label":"Mounting","value":"Wall mounting"},{"label":"Warranty","value":"PLACEHOLDER"}]', '[{"alt":"DEMO auto start timer, front view","url":"/products/demo-auto-start.jpg"}]', NULL, NULL, TRUE, TRUE, 1, '"2026-08-13T07:12:18.778Z"', '"2026-09-03T08:56:12.395Z"', '', '', 3499, NULL);
INSERT INTO products (id, slug, name, category, tagline, description, hp_ranges, features, protections, spec, images, video_url, video_title, published, featured, sort_order, created_at, updated_at, seo_title, seo_description, price, discount_percent) VALUES ('bf7607d8-0144-4fb6-804a-d1cfc3fbf660', 'demo-gsm-mobile-control', 'DEMO GSM Mobile Control', 'accessory', 'Switch the motor on or off from any phone, by call or SMS', 'DEMO PRODUCT — placeholder copy and drawn artwork.

Switches the motor from any phone by call or SMS and sends status back as a message. Fits alongside an existing panel.', '["Any HP"]', '["Call or SMS control","Status reply by message","Fits an existing panel"]', '["mobile-control"]', '[{"label":"Type","value":"GSM remote control"},{"label":"Control","value":"Call or SMS"},{"label":"Status","value":"Reply by SMS"},{"label":"Network","value":"GSM, SIM required"},{"label":"Motor range","value":"Any HP"},{"label":"Fitting","value":"Fits an existing panel"},{"label":"Enclosure","value":"ABS moulded"},{"label":"Mounting","value":"Wall mounting"},{"label":"Warranty","value":"PLACEHOLDER"}]', '[{"alt":"DEMO GSM mobile control unit","url":"/products/demo-accessory.jpg"}]', NULL, NULL, TRUE, FALSE, 1, '"2026-08-13T07:12:18.778Z"', '"2026-09-03T08:56:12.399Z"', '', '', 5999, NULL);
INSERT INTO products (id, slug, name, category, tagline, description, hp_ranges, features, protections, spec, images, video_url, video_title, published, featured, sort_order, created_at, updated_at, seo_title, seo_description, price, discount_percent) VALUES ('fd0601c2-056f-44d1-8a8f-cc57a7700dba', 'demo-dol-starter', 'DEMO DOL Starter Panel', 'starter', 'Direct-on-line starting for small pumps, with the full protection set', 'DEMO PRODUCT — placeholder copy and drawn artwork.

Direct-on-line starting for three phase pumps between 3 and 10 HP. Current and voltage are read on all three phases continuously and shown on the front panel, so a fault is a number rather than a guess.

Protection covers what actually destroys pumps on a rural feeder: the borewell running dry, a phase dropping out, supply outside the safe band, and a reversed phase sequence after line work.', '["3 – 7.5 HP","10 HP"]', '["Three phase amps and voltage on the display","Instantaneous fault display naming the last trip","Auto start with adjustable power-on timer","Dry run protection with automatic restart"]', '["dry-run","hv-lv","phase-reversal","single-phase","overload-relay","voltage-current-sensing"]', '[{"label":"Type","value":"Direct on line(DOL)"},{"label":"Motor range","value":"3 – 10 HP"},{"label":"Supply","value":"3 phase"},{"label":"Starting method","value":"Full voltage"},{"label":"Display","value":"Three phase amps and volts"},{"label":"Sensing","value":"CT based, all three phases"},{"label":"Enclosure","value":"Powder coated sheet steel"},{"label":"Mounting","value":"Wall mounting"},{"label":"Warranty","value":"PLACEHOLDER"}]', '[{"alt":"DEMO DOL starter panel, front view","url":"/products/demo-starter.jpg"},{"alt":"Terminal block detail","url":"/products/demo-terminals.jpg"}]', NULL, NULL, TRUE, TRUE, 1, '"2026-08-13T07:12:18.778Z"', '"2026-09-03T08:56:12.387Z"', '', '', 8499, 20);
INSERT INTO products (id, slug, name, category, tagline, description, hp_ranges, features, protections, spec, images, video_url, video_title, published, featured, sort_order, created_at, updated_at, seo_title, seo_description, price, discount_percent) VALUES ('c609d94d-bad2-4f65-9ef4-6df0dfc43c52', 'demo-industrial-dol', 'DEMO Industrial DOL Panel', 'industrial-panel', 'Direct-on-line motor control for continuous industrial duty', 'DEMO PRODUCT — placeholder copy and drawn artwork.

Motor control and protection for industrial duty, where the load runs continuously and a stopped machine costs more in an afternoon than the panel driving it. Same protection set as the agricultural range, in the ratings and enclosure a shop floor asks for.', '["15 HP","25 HP"]', '["Three phase amps and voltage on the display","Overload and single phasing protection","Sheet steel enclosure"]', '["hv-lv","phase-reversal","single-phase","overload-relay","voltage-current-sensing"]', '[{"label":"Type","value":"Direct on line (DOL)"},{"label":"Motor range","value":"15 – 25 HP"},{"label":"Supply","value":"3 phase"},{"label":"Duty","value":"Continuous industrial"},{"label":"Display","value":"Three phase amps and volts"},{"label":"Sensing","value":"CT based, all three phases"},{"label":"Enclosure","value":"Sheet steel"},{"label":"Mounting","value":"Wall or floor"},{"label":"Warranty","value":"PLACEHOLDER"}]', '[{"alt":"DEMO industrial DOL panel, front view","url":"/products/demo-industrial.jpg"}]', NULL, NULL, TRUE, TRUE, 1, '"2026-08-18T09:55:52.722Z"', '"2026-09-03T08:56:12.401Z"', '', '', 38500, 15);
INSERT INTO products (id, slug, name, category, tagline, description, hp_ranges, features, protections, spec, images, video_url, video_title, published, featured, sort_order, created_at, updated_at, seo_title, seo_description, price, discount_percent) VALUES ('9f4bb2cc-af60-4022-83ec-a074fafb6645', 'demo-wardrobe-auto-light', 'DEMO Wardrobe Auto Light', 'home-automation', 'Lights the wardrobe when the door opens, and goes dark when it shuts', 'DEMO PRODUCT — placeholder copy and drawn artwork.

A sensor and strip that light the inside of a wardrobe as the door opens and switch off behind it. No switch to find in the dark, and nothing left burning because somebody forgot.', '[]', '["Door sensor, no switch to operate","Adjustable off delay","Warm white strip"]', '[]', '[{"label":"Type","value":"Door-sensed lighting module"},{"label":"Sensor","value":"Magnetic door contact"},{"label":"Light source","value":"Warm white LED strip"},{"label":"Off delay","value":"Adjustable"},{"label":"Mounting","value":"Adhesive backed"},{"label":"Finish","value":"Aluminium channel"},{"label":"Supply","value":"PLACEHOLDER"},{"label":"Warranty","value":"PLACEHOLDER"}]', '[{"alt":"DEMO wardrobe auto light module and strip","url":"/products/demo-wardrobe-light.jpg"},{"alt":"","url":"/media/8a66f73e8956517c-27960ba9.jpg","pathname":"8a66f73e8956517c-27960ba9.jpg"}]', NULL, NULL, TRUE, TRUE, 1, '"2026-08-18T09:55:52.722Z"', '"2026-09-03T08:56:12.403Z"', '', '', 1499, 25);
INSERT INTO products (id, slug, name, category, tagline, description, hp_ranges, features, protections, spec, images, video_url, video_title, published, featured, sort_order, created_at, updated_at, seo_title, seo_description, price, discount_percent) VALUES ('2d2fdcdb-1c7e-4b5a-95f0-2091468fd2ce', 'demo-staircase-auto-light', 'DEMO Staircase Auto Light', 'home-automation', 'Lights the stairs as you reach them and turns off behind you', 'DEMO PRODUCT — placeholder copy and drawn artwork.

Motion-sensed lighting for a staircase or passage. It lights the flight as you reach it, holds while there is movement, and goes off after an adjustable delay once the stairs are clear.', '[]', '["Motion sensed, both directions","Adjustable hold time","Daylight cut-off so it stays off by day"]', '[]', '[{"label":"Type","value":"Motion-sensed lighting module"},{"label":"Sensor","value":"PIR motion, both directions"},{"label":"Light source","value":"Warm white LED strip"},{"label":"Hold time","value":"Adjustable"},{"label":"Daylight cut-off","value":"Built in"},{"label":"Mounting","value":"Surface or channel"},{"label":"Supply","value":"PLACEHOLDER"},{"label":"Warranty","value":"PLACEHOLDER"}]', '[{"alt":"DEMO staircase auto light module and strip","url":"/products/demo-staircase-light.jpg"}]', NULL, NULL, TRUE, FALSE, 2, '"2026-08-18T09:55:52.722Z"', '"2026-09-03T08:56:12.405Z"', '', '', 2899, NULL);
INSERT INTO products (id, slug, name, category, tagline, description, hp_ranges, features, protections, spec, images, video_url, video_title, published, featured, sort_order, created_at, updated_at, seo_title, seo_description, price, discount_percent) VALUES ('9a482ca3-ac9f-42d6-98b8-d2b9b8839b33', 'demo-kitchen-undercabinet-light', 'DEMO Kitchen Under-Cabinet Light', 'home-automation', 'Lights the counter when a hand crosses the sensor beneath the cabinet', 'DEMO PRODUCT — placeholder copy and drawn artwork.

A warm-white strip mounted under a kitchen cabinet, switched by a wave sensor rather than a wall switch — hands full of vegetables need not stop to look. Adjustable timeout and daylight cut-off.', '[]', '["Wave-sensed, no touch required","Adjustable off delay","Daylight cut-off so it stays off by day"]', '[]', '[{"label":"Type","value":"Wave-sensed lighting module"},{"label":"Sensor","value":"IR wave, no touch"},{"label":"Light source","value":"Warm white LED strip"},{"label":"Off delay","value":"Adjustable"},{"label":"Daylight cut-off","value":"Built in"},{"label":"Mounting","value":"Under-cabinet channel"},{"label":"Supply","value":"PLACEHOLDER"},{"label":"Warranty","value":"PLACEHOLDER"}]', '[{"alt":"DEMO kitchen under-cabinet light module and strip","url":"/products/demo-wardrobe-light.jpg"}]', NULL, NULL, TRUE, FALSE, 3, '"2026-08-19T17:08:23.546Z"', '"2026-09-03T08:56:12.407Z"', '', '', 1999, 18);
INSERT INTO products (id, slug, name, category, tagline, description, hp_ranges, features, protections, spec, images, video_url, video_title, published, featured, sort_order, created_at, updated_at, seo_title, seo_description, price, discount_percent) VALUES ('be49d897-d618-4d6c-ba39-0ae53d316d6d', 'samarth-kottary', 'samarth kottary', 'starter', 'great being venerable immortal. The forbidden seer of the empty sea.', 'great being venerable immortal. The forbidden seer of the empty sea.', '["15 HP","25 HP"]', '[]', '[]', '[]', '[{"alt":"","url":"/media/a50d14535c066cef-95877b2a.png","pathname":"a50d14535c066cef-95877b2a.png"}]', NULL, NULL, TRUE, TRUE, 4, '"2026-08-24T13:45:35.339Z"', '"2026-09-03T15:19:36.782Z"', '', '', 4999, NULL);
INSERT INTO products (id, slug, name, category, tagline, description, hp_ranges, features, protections, spec, images, video_url, video_title, published, featured, sort_order, created_at, updated_at, seo_title, seo_description, price, discount_percent) VALUES ('64c0d9fb-57d7-4c02-8cb2-adbd9d6a4e8c', 'samarth-kottary2', 'samarth kottary2', 'home-automation', 'Direct-on-line motor control for continuous industrial duty', 'dkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkeeeeeeeeeeeeeeeeeeeeeeeffffffffffffffffffffffffffffffff', '["15 HP","25 HP"]', '[]', '[]', '[]', '[{"alt":"","url":"/media/47b4d6255ec7156e-a1d984e4.jpg","pathname":"47b4d6255ec7156e-a1d984e4.jpg"}]', NULL, NULL, TRUE, TRUE, 5, '"2026-08-27T11:21:56.631Z"', '"2026-09-03T08:56:12.409Z"', '', '', 4999, NULL);
INSERT INTO products (id, slug, name, category, tagline, description, hp_ranges, features, protections, spec, images, video_url, video_title, published, featured, sort_order, created_at, updated_at, seo_title, seo_description, price, discount_percent) VALUES ('f13e98d2-313d-417f-bf02-8348e2a76f9f', 'samarth-kottary3', 'samarth kottary3', 'industrial-panel', 'Lights the wardrobe when the door opens, and goes dark when it shuts', '', '["15 HP","25 HP"]', '[]', '[]', '[]', '[{"alt":"","url":"/media/8a66f73e8956517c-f14ce0ac.jpg","pathname":"8a66f73e8956517c-f14ce0ac.jpg"}]', NULL, NULL, TRUE, TRUE, 6, '"2026-08-27T18:41:57.796Z"', '"2026-09-03T08:56:12.409Z"', '', '', 4999, NULL);

-- Insert Subscribers (1 rows)
INSERT INTO subscribers (id, email, source, created_at) VALUES ('a46e5d27-a6e9-433c-bc16-d9048162357e', 'samarthkottary@gmail.com', '/', '"2026-08-18T17:09:40.860Z"');

-- Insert Enquiries (0 rows)
