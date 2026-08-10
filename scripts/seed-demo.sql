-- Demo product, for checking the site end to end before real data exists.
--
-- Run it on the server (the database has no host port, so it goes through the
-- container):
--
--   docker compose exec -T db psql -v ON_ERROR_STOP=1 -U vkon -d vkon < scripts/seed-demo.sql
--
-- Everything here is placeholder: the images are drawings shipped in
-- public/products/, the video is a public-domain film, and the copy is
-- plausible rather than accurate. Delete it from /admin once you have a real
-- product. Re-running updates the same row instead of creating duplicates.

INSERT INTO products (
  id, slug, name, category, tagline, description,
  hp_ranges, features, protections, spec, images,
  video_url, video_title, published, featured, sort_order
) VALUES (
  gen_random_uuid(),
  'ec-dol-demo',
  'EC-DOL',
  'starter',
  'DEMO PRODUCT — three phase DOL starter with the full protection set',
  E'This is a demonstration product. The images are drawn placeholders and the video is a public-domain film standing in for a real walkthrough. Replace or delete it from the admin once you have a real product.\n\nThe EC-DOL is a direct-on-line starter for three phase submersible and openwell pumps between 3 and 10 HP. It reads current and voltage on all three phases continuously and shows them on the front panel, so a fault is a number rather than a guess.\n\nProtection covers what actually destroys pumps on a rural feeder: the borewell running dry, a phase dropping out on either the HT or LT line, supply outside the safe voltage band, and a reversed phase sequence after line work. Where it is safe to do so the panel restarts the motor on its own, so a night of irrigation is not lost to a trip that cleared itself at 2am.',
  ARRAY['3 – 7.5 HP','10 HP'],
  ARRAY[
    'Displays three phase amps and voltage continuously',
    'Instantaneous fault display, naming the last trip',
    'Auto start with adjustable power-on timer',
    'Dry run protection with automatic restart',
    'Cyclic timer with separate on and off periods',
    'CT-based overload with keypad-set trip point',
    'Single phase protection on both HT and LT line',
    'Compatible with the GSM mobile control unit'
  ],
  ARRAY[
    'dry-run','hv-lv','phase-reversal','single-phase','overload-relay',
    'rotary-lock','auto-start-timer','cyclic-timer','voltage-current-sensing'
  ],
  '[{"label":"Type","value":"DOL (direct on line)"},
    {"label":"Supply","value":"3 phase, 280 – 440 V, 50 Hz"},
    {"label":"Motor range","value":"3 – 10 HP"},
    {"label":"Sensing","value":"CT based, all three phases"},
    {"label":"Display","value":"Backlit LCD, amps and volts"},
    {"label":"Enclosure","value":"IP54 polycarbonate"},
    {"label":"Warranty","value":"6 months"}]'::jsonb,
  '[{"url":"/products/demo-front.jpg","alt":"EC-DOL control panel, front view with display and keypad"},
    {"url":"/products/demo-angle.jpg","alt":"EC-DOL control panel, three-quarter view showing enclosure depth"},
    {"url":"/products/demo-terminals.jpg","alt":"EC-DOL terminal block showing three phase, neutral and earth connections"}]'::jsonb,
  'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
  'Installation and settings walkthrough (placeholder video)',
  TRUE, TRUE, 1
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  tagline = EXCLUDED.tagline,
  description = EXCLUDED.description,
  hp_ranges = EXCLUDED.hp_ranges,
  features = EXCLUDED.features,
  protections = EXCLUDED.protections,
  spec = EXCLUDED.spec,
  images = EXCLUDED.images,
  video_url = EXCLUDED.video_url,
  video_title = EXCLUDED.video_title,
  published = TRUE,
  featured = TRUE,
  updated_at = now();
