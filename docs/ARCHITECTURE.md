# Architecture

Living reference for how vkon.in is put together and why. Update this file in
the same change that alters the structure — the [Change log](#change-log) at the
bottom is the running history.

**Scope:** structure, decisions and constraints. Setup, how to add a product,
and the placeholder checklist live in [README.md](../README.md).

Last updated: 2026-08-10

---

## 1. What this is

A product catalogue and contact site for Vkon, who make electronic motor
starters and control panels for agricultural pumps.

Products are **created and edited by the owner through an admin at `/admin`** —
name, description, images, a video link, specification, features and
protections. There is no deploy step to publish a product; saving makes it live.

Not e-commerce: no cart, no pricing, no checkout. Every path ends at a phone
call or a WhatsApp message.

**Audience:** an Indian farmer or pump dealer, on a mid-range Android phone, on
a rural connection, who wants three answers fast — *does this fit my pump's HP?*,
*what does it protect against?*, *how do I reach you?*

**Design references:** wago.com (light, industrial, ruled, restrained) and
nvidia.com (dark full-bleed hero, large type, single accent). See §6.

---

## 2. Stack

| | |
|---|---|
| Framework | Next.js 16.2 — App Router, Server Actions |
| UI | React 19.2 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 (CSS-first config, no `tailwind.config.js`) |
| Database | Postgres via `pg`, in a container beside the app |
| File storage | A directory on disk, on a Docker volume |
| Auth | Hand-rolled HMAC-signed cookie, no library |
| Fonts | `next/font/google`, self-hosted at build |
| Hosting | **Self-hosted** — Docker Compose behind a Cloudflare Tunnel |
| Deploys | The deploy console (`cicd/` contract), git push → webhook → build |

### Dependency policy

Runtime dependencies: `next`, `react`, `react-dom`, `pg`. Nothing else —
`@vercel/blob` was removed when the site moved to self-hosting. Icons are hand-written SVG; there is no component, animation, ORM
or auth library. Adding one is a decision to record here.

`pg` was chosen over a Neon-specific driver so the same code runs against a
local Postgres in development and any managed Postgres in production. On
serverless, `DATABASE_URL` **must** be the provider's pooled (pgbouncer) string
— a per-instance pool against a direct connection exhausts the server's
connection limit.

> `npm audit` reports advisories in `postcss` and `sharp`, both transitive
> inside Next.js and build-time only. `--force` downgrades Next to v9, which is
> not an option. Re-check on Next upgrades.

---

## 3. Rendering model

**Everything that shows a product renders per request** (`force-dynamic`):
`/`, `/products`, `/products/[slug]`, `/sitemap.xml`, and all of `/admin`.

This was not the first design. ISR with `revalidatePath` was tried and rejected:
Next marks a cached page stale but still serves the stale copy to the next
request while regenerating, so an admin who saved a product and immediately
opened the site saw the old version. For a site whose entire premise is "what I
publish appears", that is the wrong failure. A single indexed query over a
pooled connection is invisible next to mobile network latency.

`/about` and the metadata routes stay static — they have no product data.

**Consequence to know:** the site depends on the database being reachable at
request time. All reads go through `safeQuery`, which logs and returns `[]`, so
an unreachable database renders an empty catalogue rather than a 500. Writes
deliberately do *not* swallow errors — the admin must see failures.

---

## 4. Layering

Strictly one-directional.

```
app/(site)/    public routes
app/admin/     admin routes + server actions
      ↓
components/    presentation; no data access
      ↓
lib/           db access, auth, storage, video parsing, SEO
      ↓
content/       taxonomy, company details, navigation (code-level constants)
```

Product *data* lives in Postgres, not in `content/`. `content/` now holds only
fixed vocabularies that are tied to icons and copy (categories, protection
keys), which are code changes either way.

---

## 5. File map

```
src/
  app/
    layout.tsx              fonts + global metadata only (no chrome)
    (site)/
      layout.tsx            Header, Footer, MobileActionBar, Organization JSON-LD
      page.tsx              home
      about/page.tsx
      products/page.tsx     catalogue
      products/[slug]/      detail
    admin/
      layout.tsx            admin chrome, reads auth state
      page.tsx              login
      LoginForm.tsx
      actions.ts            ALL server actions — the security boundary
      products/             list, ProductForm, new/, [id]/
    not-found.tsx           renders its own chrome (outside the (site) group)
    globals.css             design tokens + the contrast table
    sitemap.ts robots.ts opengraph-image.tsx icon.svg

  components/
    layout/    Header (client), Footer, MobileActionBar, PageHero
    home/      Hero, ContactStrip
    product/   ProductCard, CategoryRow, ProductMedia (client),
               ProductCatalogue (client), SpecTable, ProtectionList,
               PanelPlaceholder
    icons/     protections.tsx (12-icon set), ui.tsx, Logo.tsx
    theme/     ThemeScript (pre-paint, inline), ThemeToggle (client)
    ui/        Button, Container, Section, Badge, JsonLd

  content/     taxonomy.ts, site.ts, nav.ts
  lib/
    db/        client.ts, products.ts, schema.sql
    auth.ts    session + requireAdmin
    storage.ts blob upload/delete
    video.ts   YouTube/Vimeo URL → embed
    contact.ts seo.ts types.ts

scripts/       db-setup.mjs, db-seed.mjs, make-placeholder-images.py
public/products/  demo-*.jpg (placeholder photography — delete when real)
```

### Client components — all seven

| Component | Why |
|---|---|
| `theme/ThemeToggle` | Reads `data-theme` via `useSyncExternalStore` |
| `layout/Header` | Drawer state, focus trap, Escape |
| `home/HeroRotator` | Slide timer, pause control, reduced-motion opt-out |
| `product/ProductCatalogue` | `useSearchParams` filter state |
| `product/ProductMedia` | Selected media, deferred video embed |
| `admin/LoginForm` | `useActionState` |
| `admin/products/ProductForm` + `DeleteProductButton` | Form state, uploads, confirm step |

Everything else is a server component.

---

## 6. Design system and theming

Tokens live in the `@theme` block of `src/app/globals.css`. Five rules give the
site its character, documented at the top of that file:

1. **Structure over decoration.** Separation is 1px rules and whitespace. There
   is deliberately no shadow token.
2. **Near-square corners** (2px). Pills and heavily rounded cards are the
   single strongest generic-template signal.
3. **The accent is rare.** Primary buttons are near-black (near-white in dark);
   green is for links, active state and small marks.
4. **Mono carries the technical voice.** `.label-tech` (IBM Plex Mono, 11px,
   uppercase, wide tracking) on spec labels, product metadata and eyebrows.
5. **Left-aligned.** No centred body copy.

Type is one grotesque (Inter) at all sizes plus IBM Plex Mono for labels.
Headings are weight 600, not 800.

### Light and dark

The theme is an attribute on `<html>`: `data-theme="light" | "dark"`, always
explicit. It is set by an inline script (`components/theme/ThemeScript.tsx`)
that runs in `<head>` before first paint — the only way to avoid a flash, since
the server cannot know the visitor's preference and a React effect runs after
the first paint has already happened. Preference order: an explicit choice in
`localStorage`, otherwise the OS setting.

`ThemeToggle` reads the attribute through `useSyncExternalStore`. The theme is
genuinely external state living in the DOM, so that is the correct primitive:
it gives a distinct server snapshot (theme unknown → render no glyph) and
avoids the setState-in-an-effect pattern the lint rules reject. The button
keeps its size while the glyph is unknown, so nothing shifts on hydration.

**Components must use semantic tokens, never raw palette steps.** `bg-white`
and `text-graphite-950` do not flip; `bg-surface` and `text-ink` do. The full
set: `surface`, `surface-subtle`, `surface-raised`, `ink`, `body`, `muted`,
`line`, `line-strong`, `accent`, `accent-strong`, `accent-soft`, `action`,
`action-hover`, `action-ink`, and the `band-*` family.

### The band inversion

This is the non-obvious part. The design has deliberately dark sections — the
hero, the protection strip, the footer, the mobile action bar — sitting inside
a light page. In dark mode those cannot simply stay dark: they would dissolve
into the background and the page would become one flat slab.

So the `band` tokens **invert their role**. `--color-band` is *darker* than the
surface in light mode (#14171A on white) and *lighter* than it in dark mode
(#1B1F23 on #0E1113). The section reads as a distinct band either way. Band
content uses `band-ink` / `band-body` / `band-muted` / `band-line` /
`band-accent` rather than the page tokens.

`--color-action` inverts too — near-black in light, near-white in dark — so
anything sitting on it must use `text-action-ink`, never `text-white`. Pairing
`bg-action` with `text-white` renders white-on-white in dark mode; that mistake
was made and caught during this change.

Two things stay fixed in both themes on purpose: the drawer scrim (`bg-black/50`
— a scrim is a scrim) and destructive red.

### The contrast rule

`graphite-500` (#757E87) is **4.1:1 on white and 4.4:1 on graphite-950** — it
fails AA for text at both ends. `.label-tech` is 11px, so it needs the full
4.5:1, not the large-text allowance. Small labels use **graphite-600 on light**
(6.1:1) and **graphite-400 on dark** (7.0:1). The measured table for both
themes is at the top of globals.css.

Contrast is verified by walking the rendered DOM and computing the real ratio
for every element with visible text against its first opaque ancestor
background (see §10). Both themes currently report **zero failures**.

## 7. Admin and security

`/admin` is a single-operator CMS.

**Session.** `lib/auth.ts`. Password in `ADMIN_PASSWORD`, compared with
`timingSafeEqual` over SHA-256 digests (so unequal lengths neither throw nor leak
length). The cookie carries `expiry.nonce.HMAC(expiry.nonce, AUTH_SECRET)`,
httpOnly, sameSite=lax, secure in production, 12-hour expiry. Missing or short
`AUTH_SECRET` fails closed — login always fails rather than letting everyone in.

**The boundary is `requireAdmin()` inside each server action**, not the page
guards. Server actions are independently addressable POST endpoints; a layout
that checks auth before rendering does not protect them. `saveProductAction`,
`deleteProductAction` and `uploadImageAction` each call it first.
`logoutAction` is intentionally unguarded — clearing a cookie is not privileged.

**All input is re-validated server-side**, including `<select>` values and
hidden fields: category is checked against the taxonomy, protection keys are
filtered to known keys, video URLs must parse as YouTube or Vimeo, slugs are
re-slugified and checked for collision.

**Uploads** are validated in `lib/storage.ts` (type and 8 MB limit) — the
client `accept` attribute is a hint, not a control. Blob `pathname` is stored on
each image so deleting a product also deletes its files instead of orphaning
them.

**Not implemented:** rate limiting on login. On serverless, in-memory counters
are per-instance and near useless; doing it properly needs a shared store. With
a strong password this is an accepted risk — see §11.

---

## 8. Content model

One table, `products` (`src/lib/db/schema.sql`). `src/lib/db/products.ts` is the
only module that touches it, and `mapProductRow` is the single snake_case →
camelCase bridge.

List fields (ratings, features) are `TEXT[]`; `spec` and `images` are `JSONB`.
The admin edits lists as one-per-line textareas and spec as `Label: value` per
line — for a catalogue of this size that is faster than repeater widgets and
cannot get into a broken state.

`protections` is a `TEXT[]` of keys from a fixed taxonomy, ticked as checkboxes.
Unknown keys are filtered out at read time, so removing one from the taxonomy
degrades instead of breaking a page.

**Video is a URL, not a file.** `lib/video.ts` normalises watch links, youtu.be,
/shorts/, /embed/ and Vimeo IDs into an embed. The product page renders a poster
plate and only injects the provider iframe after a click, so nothing is
requested from YouTube — and no third-party cookie is set — for a visitor who
never presses play.

---

## 9. Load-bearing constraints

Each encodes a real bug. Breaking one reintroduces it.

**`requireAdmin()` must be the first statement of every mutating server action.**
See §7.

**Product-driven routes must stay `force-dynamic`.** Reintroducing ISR
reintroduces the stale-by-one-request bug in §3.

**`graphite-500` is never used for text.** §6.

**Components use semantic tokens, not raw palette steps.** A `bg-white` or
`text-graphite-700` is a component that will not flip in dark mode. §6.

**`bg-action` is never paired with `text-white`.** The action colour inverts
between themes; its companion is `text-action-ink`. Same for `bg-band` →
`text-band-ink`.

**Health checks must probe `/api/health`, never `/`.** Public reads fail soft,
so the home page returns 200 with the database completely down. See §10a.

**Uploads must not be written into `public/`.** It is baked into the image at
build time; runtime writes there vanish on the next deploy. §10a.

**`cicd/` stays out of git.** It is a security control, not housekeeping. §10a.

**ThemeScript must stay inline and in `<head>`.** Moving it to a deferred
script, or replacing it with a React effect, reintroduces a flash of the wrong
theme on every load.

**Empty grid cells must not show a background.** A `grid gap-px bg-line` layout
paints grey rectangles wherever the item count is not a multiple of the column
count — visible as broken blocks with one product. Cards carry their own border
and the grid uses a normal gap.

**Category presentation must not be a wrapping card grid**, for the same
reason: five categories in a three-column grid leaves a visible hole. It was a
ruled directory until 2026-08-10 and is now one horizontal `CategoryRow` per
category — a single-line track cannot produce an empty cell. A category with no
products is dropped, never rendered as an empty row.

**Accessible names must lead with their visible text.** An `aria-label` that
replaces visible text breaks voice control. This is why the logo link has none
and the delete confirmation reads "Confirm delete" before its screen-reader
suffix.

**Heading order must not skip a level.** `/products` used to need a visually
hidden `<h2>` between the `h1` masthead and its `h3` cards; the category rows
now supply real `h2`s, so it was removed. This is why `ProductCard` and
`CategoryRow` both take a heading-level prop — the home page nests one level
deeper (`h2` section → `h3` category → `h4` card) than the catalogue
(`h1` → `h2` → `h3`). Hard-coding either breaks the other.

**The footer reserves `pb-24 md:pb-0`** for the fixed mobile action bar.

---

## 10. Verification

```bash
npm run lint && npm run build     # must be clean; build fails on type errors
```

Then, against `npm run start`:

- Walk every route at 390px and 1440px **in both themes**; assert
  `scrollWidth === clientWidth` and an empty console.
- Contrast: walk the DOM computing the real ratio for every text element
  against its first opaque ancestor background; both themes must report zero
  failures. This catches what Lighthouse misses, because Lighthouse only
  audits the theme it happens to load in.
- Theme: system preference honoured with no stored choice; `data-theme` already
  correct at `readyState === "interactive"` (no flash); toggle persists across a
  reload.
- Admin end-to-end: unauthenticated redirect, wrong password, login, create,
  product appears on the catalogue **immediately**, duplicate slug rejected,
  invalid video URL rejected, unpublish hides it, delete, sign out revokes.
- Lighthouse mobile on `/`, `/about`, `/products` and a product page.

**Baseline (2026-08-07), Lighthouse mobile, default throttling:**

| Route | Perf | A11y | Best practices | SEO |
|---|---|---|---|---|
| `/` | 96 | 100 | 100 | 100 |
| `/about` | 97 | 100 | 100 | 100 |
| `/products` | 99 | 100 | 100 | 100 |
| `/products/[slug]` | 99 | 100 | 100 | 92* |

CLS 0 everywhere; LCP 2.2–2.8 s under simulated slow 4G and 4× CPU throttling.

\* The product page's SEO 92 is a **Lighthouse false negative**: it reports a
missing meta description, but the tag is present in the server HTML (`curl`) and
in the live DOM inside `<head>` (verified with Playwright). It appears to be a
timing artefact of streamed metadata on a dynamic route. Re-verify before
treating it as real.

> Watch out: `next start` holding the port while `.next` is rebuilt serves HTML
> referencing chunk hashes that no longer exist, producing 500s on assets. Kill
> the server before rebuilding.

---

## 10a. Deployment

Self-hosted. Two containers defined in `docker-compose.yml`:

| Service | What | Exposure |
|---|---|---|
| `app` | Next.js standalone on port 3000 | bound to `127.0.0.1:${APP_PORT}` only |
| `db` | Postgres 16 | **no host port** — reachable only from `app` |
| `cloudflared` | Cloudflare Tunnel connector, profile `tunnel` | outbound only |

The tunnel runs as a **container, never via `cloudflared service install`**: on
the deploy host that systemd unit already belongs to another tunnel and would
be overwritten. The connector reaches the app as `app:3000` on the compose
network, so the server needs no inbound port, no public IP and no firewall
change. It starts only when `COMPOSE_PROFILES=tunnel` is set in `.env`, which
keeps local development tunnel-free.

The tunnel and the domain live in **the client's own Cloudflare account**, not
the operator's — a token is scoped to the account that issued it, so one host
can serve several accounts' tunnels side by side, and handover is just handing
over the account.

Two named volumes carry everything that must outlive a deploy:
`vkon-pgdata` (the database) and `vkon-uploads` (admin-uploaded images). The
image is rebuilt on every deploy and the containers are disposable; the volumes
are not.

`output: "standalone"` in `next.config.ts` is what keeps the runtime image at
~220 MB instead of shipping the whole dependency tree — the Dockerfile depends
on it.

### Uploads

Images go to `UPLOAD_DIR` (a volume) and are served by
`app/media/[...path]/route.ts`. They deliberately do **not** live in `public/`:
that directory is baked into the image at build time, so anything uploaded
afterwards would disappear on the next deploy. The route accepts exactly one
flat path segment, which removes every traversal trick rather than trying to
filter them. Filenames are content-hash based and immutable, so they are cached
for a year.

### The deploy contract

`cicd/` is **gitignored on purpose** — if `deploy.sh` were in the repo, push
access would equal code execution on the server. It holds `deploy.sh` (build,
migrate, restart), `verify.sh` (health gate) and `config.json` (branch, health
URL, webhook secret — host-side authority the browser cannot change). Keep a
copy somewhere; git will not back it up.

`deploy.sh` applies `src/lib/db/schema.sql` on every deploy. The DDL is
idempotent, so it is both the migration step and the provisioner for a fresh
volume. It runs there rather than at app startup so a schema failure fails the
deploy loudly instead of surfacing later as a mysteriously empty catalogue.

### Health

`/api/health` round-trips to Postgres and returns 503 if it cannot. This exists
because **public pages fail soft** — an unreachable database renders an empty
catalogue, not a 500 — so `GET /` returning 200 proves almost nothing. An
earlier `verify.sh` checked only that, and passed a deploy in which every
single query was failing. Both `verify.sh` and the compose healthcheck now
probe `/api/health`.

## 11. Known gaps

- **Company details are placeholder.** `grep -rn "TODO(vkon)" src/`.
- **The demo product is fake.** `npm run db:seed` creates `ec-dol-demo` with
  drawn placeholder images and a public-domain video. Delete it from `/admin`.
- **No login rate limiting.** §7.
- **No image resizing on upload.** An 8 MB photo is stored as uploaded and
  served through `next/image`; resizing before upload is still worth doing.
- **No database backup.** The Postgres volume is the only copy. A nightly
  `pg_dump` to somewhere off the machine is the obvious next step — losing that
  volume loses the whole catalogue.
- **No staging environment.** A deploy goes straight to production; the only
  safety net is that `verify.sh` fails loudly, and there is no auto-rollback.
- **No audit trail.** Nothing records who changed what, and there is one
  operator, so a mistaken delete is unrecoverable without a database backup.
- **No draft preview.** Unpublished products are invisible on the site; the only
  way to see one is the admin form.
- **English only.** Copy is not externalised.
- **No automated tests in the repo.** Verification is the manual loop in §10.

---

## Change log

Newest first. Add an entry for anything that changes structure, a dependency, or
a §9 constraint.

### 2026-08-11 — Hero scrim taken to its floor

The overlay is now about **a third of what shipped this morning**, arrived at by
sweeping its strength and measuring rather than by eye:

| layer | was | now |
|---|---|---|
| flat floor | `bg-band/65` → `/45` | `bg-band/30 sm:bg-band/5` |
| horizontal | `from-band via-band/75 to-band/20` | `from-band/85 via-band/55 to-band/15` |
| vertical | `from-band via-transparent to-band/60` | `from-band/65 via-transparent to-band/40` |

**The scrim was never the real constraint — three text colours were.** Sweeping
it at 100/80/65/50/35 % showed every failure tracing to one element at a time,
and each was cheaper to fix at the type than by dimming the picture:

1. `label-tech` eyebrow at 11 px in `band-accent` (#4cae81). At 11 px it needs
   the full 4.5:1 and nothing else came close to failing first. Added
   `--color-band-accent-strong` (#7ecba6, brand-300) for accent text over
   photography. This one change moved the floor from 100 % to 80 %.
2. The muted third headline line at 40 px, `band-muted` → `band-body`. Still
   visibly a step below the white lines above it. Floor 80 % → 65 %.
3. The last two failures were the eyebrow again, desktop dark only — dark-theme
   band (#1b1f23) is lighter than light-theme (#14171a), so equal alpha darkens
   less. Fixed by weighting the horizontal gradient's **left** stop (`/65` →
   `/85`) and leaving its right stop at `/15`. The text lives on the left; the
   photograph people came to see is on the right. Darkening the whole layer to
   solve a left-edge problem would have been the lazy version.

Result: **0 failures across 98 glyph runs**, tightest margin **1.25× required**,
with an overlay a third of the weight. Contrast improved while the scrim got
lighter, three times running.

**The rule this establishes:** over photography, spend the contrast budget on
the type, never on dimming the image. Every step here that dimmed the picture
made the page worse and bought less than brightening one text colour did. If
new artwork fails, look at `band-accent` at 11 px first.

Re-checked after lightening: mirror-pad joins stay invisible (max 2.5–2.9×
median, and the one 3.3× reading is a genuine building edge at 51 %, not the
join at 33 %). Note the seam detector only works on **text-free** captures —
letter stems are strong vertical edges and will masquerade as seams.

### 2026-08-11 — Hero artwork: lighter scrim, mobile focal point

Two problems, one of which had a counter-intuitive fix.

**The phone was showing a 33 % centre slice of a landscape frame.** At 390×684
the hero is 0.57:1 against a 1.79:1 image, so `object-cover` scales to height
and discards two thirds of the width — on the agriculture frame that landed on
empty paddy with the pump house entirely off-screen.

The fix is `object-right` on mobile, `sm:object-center` above it, driven by a
`--focus` custom property so individual artwork can override it. **Not a second
image per segment**: art direction would mean a second file downloaded on the
phone, and every frame here was already composed with its subject in the right
third, so choosing *which* third to keep costs nothing. `HeroSegment.focus`
exists for artwork that breaks that composition rule.

**The scrim got lighter by making the text brighter.** The obvious move — dim
the photograph less — failed: at `bg-band/45` on mobile, four body-copy runs
dropped to 3.84:1 against the 4.5 they need. But the hero body was
`text-band-muted`, the dimmest grey in the set. Moving it one step to
`text-band-body` raises the luminance the ratio is computed from, so the same
photograph passes with a much lighter scrim.

Net: the floor went from `bg-band/65` → `/45` on mobile and `/25` → `/10` on
desktop, the horizontal gradient from `via-band/85 to-band/35` →
`via-band/75 to-band/20`, and contrast *improved* — 0 failures across 98 glyph
runs with the tightest margin going from 1.06× to **1.22× required**.

The general rule worth keeping: over photography, spend the contrast budget on
the type, not on the image. Dimming the picture defeats the reason it is there.

### 2026-08-11 — Hero background photography

Three generated backgrounds are live: `public/segments/{agriculture,home-automation,solar}.jpg`,
2400×1340, ~240–600 KB each. Source PNGs sit beside them, gitignored — they are
6.5 MB apiece and the JPEG is the committed asset.

**Every generated frame arrived with a hard vertical seam** at 30–33 % of the
width: the model read "left third empty with no detail" as an instruction to
composite a flat panel there. Measured at 10–28× the median column-to-column
delta, and clearly visible through the scrim. Cropping it off was the obvious
fix and the wrong one — it drags the subject out of the right third and puts it
behind the headline.

The fix is **mirror padding**: the photo is reflected back across the seam, so
the column left of the join is the same pixel data as the column right of it and
there is no discontinuity at all, then blurred on a ramp toward the left edge.
If new artwork ever shows a seam, that is the routine — and note the boundary is
not one column: `home-automation` had a 16 px flat stripe between panel and
photograph, so mirroring from the apparent edge left a residue. Find the first
genuinely photographic column, not the first strong edge.

**The scrim is measured, not estimated.** The flat floor is `bg-band/65` on
mobile against `sm:bg-band/25` on desktop. That is a layout difference, not a
brightness preference: at 390 px the copy spans the full width, so the
left-weighted horizontal gradient covers none of it, while on desktop the text
stays in the left column and the gradient does the work.

Before that floor existed, 8 of 30 text runs failed AA — the 11 px eyebrow over
the solar frame sat at 2.90:1 against 4.5. After: **0 failures across 98 glyph
runs**, both themes, both viewports, all three slides, tightest margin 4.79:1.

Two notes on how that was measured, because the usual audit gets it wrong here:

- The standard DOM walk resolves the background to the nearest opaque ancestor,
  finds `--color-band` and never sees the photograph. Contrast over imagery has
  to be sampled from **rendered pixels**, with the text hidden.
- Sample **glyph rectangles** (`Range.getClientRects()`), not element boxes. A
  block `<p>` is as wide as its container; measuring its box samples background
  hundreds of pixels to the right of any actual text and invents failures.

Delivered cost via next/image: **80 KB of AVIF on mobile**, 328 KB on desktop,
for all three. All three load at once because all three slides are mounted —
deferring the unseen two is possible but 80 KB did not justify the complexity.

### 2026-08-10 — /protection redesigned, home band removed

The protection band is **gone from the home page**. It was a teaser for a page
that the hero's Explore button already opens, so it was the same content twice
in one scroll. The home page is now hero → category rows → contact.

**`/protection` is grouped rather than flat.** `protectionGroups` in
`content/taxonomy.ts` splits the twelve into what they actually are: six faults
the panel watches for, three things it does unattended, three that are sensing
and control. A flat grid of twelve hid that distinction.

Two details worth preserving:

- **Group sizes are 6 / 3 / 3**, and every one of those divides evenly into a
  two- *and* a three-column grid. That is what keeps the layout free of the
  trailing empty cells in §9. Re-grouping without checking this reintroduces
  them.
- **Icons sit above their label, not beside it.** Inline, the icon reads as a
  bullet and the description is squeezed into a narrow column; stacked, each
  entry gets the full cell and the grid reads as specifications.

The faults group is set on `bg-band` — in dark mode the band inversion makes it
*lighter* than the page, which is what keeps the section reading as a section
rather than dissolving. The eyebrows are category labels ("The faults",
"Automation", "Interface"), not `01 / 02 / 03`: these are kinds, not a sequence,
and numbering them would have implied an order that does not exist.

**Also:** the "What we make" description said *100 HP*, the same placeholder
overstatement corrected in the hero earlier today. Now 40 HP, per the company's
own product portfolio.

Verified: zero contrast failures across `/`, `/protection` and `/products`, both
themes, both viewports.

### 2026-08-10 — Hero progress bar, and /protection

**The segment labels came off the progress bar.** It is now a bare full-bleed
rule at the foot of the hero, divided into one `flex-1` button per segment. Two
consequences worth keeping:

- **It is rendered outside `Container`,** which is the only reason it reaches
  both viewport edges. Moving it back inside re-inserts the page gutter.
- **Nothing is hard-coded to three.** Verified by temporarily adding a fourth
  segment: widths went 476→356 px on desktop and 126→93 px on mobile, still
  flush 0…1440 and 0…390. Adding a category later needs no layout change.

The label survives as the eyebrow above the headline and as each button's
accessible name (`Show Solar Pumping`) — a 2 px rule with no text would
otherwise be an unlabelled control. The buttons are `py-4` so the touch target
is ~34 px tall while only 2 px is painted.

The pause button is pinned to the container edge just above the bar. It was
briefly `ml-auto` in the CTA row, which aligns to the `max-w-4xl` text column
and left it stranded mid-page on a wide screen.

**`/protection` is a real page**, and the hero's Explore button opens it instead
of scrolling to an anchor. It carries all twelve protections.

**It is deliberately not in the header nav, and not in the footer.** Explore is
its only link in the UI. That makes its `sitemap.ts` entry the only thing
telling a crawler the page exists — treat that line as load-bearing rather than
routine bookkeeping.

**One protection page, not one per segment.** The failure modes are properties
of Indian mains supply and of induction motors — identical whether the motor is
on a borewell, a rooftop tank or a solar array. Per-segment pages would compete
with each other for the same queries and triple the maintenance of nearly
identical text. If a segment needs its own angle, add a section to that page.

**Hero background photography is supported but unused.** `HeroSegment.image`
takes a path in `public/`; the rotator cross-fades them behind a two-part scrim
(a left-heavy horizontal gradient, plus a vertical one) because `band-ink` over
an unmitigated sunny frame fails AA. No images ship yet — the field is absent
from all three segments, and the ruled-grid texture shows through until one is
set. Whatever lands there becomes the LCP element on a rural connection, so
budget it accordingly.

### 2026-08-10 — Rotating hero

**`home/HeroRotator`** (client) replaces the static hero headline. It cycles
market segments — agriculture, home automation, solar — on a 5 s timer, with a
WAGO-style fill line under the segment labels. Copy lives in
`src/content/segments.ts`; delete an entry and the hero adjusts.

Four decisions that are load-bearing rather than stylistic:

- **All slides stay mounted, stacked in one CSS grid cell.** The hero is then as
  tall as its tallest slide and never changes height. Swapping children instead
  would shift the fold every five seconds.
- **Inactive slides carry `inert`**, which removes them from the tab order and
  the accessibility tree together. Without it, keyboard users tab into invisible
  text and screen readers announce all three slides at once. Do *not* also set
  `aria-hidden` on the slide's own headline — that mutes it on the slide that is
  actually showing, which is a bug this component shipped with for one commit.
- **Only slide one's headline is an `<h1>`.** All three are in the markup, so
  three `<h1>` elements would be three to a crawler regardless of what is
  visible. The rest are paragraphs wearing the same type scale.
- **The pause button is a WCAG 2.2.2 requirement**, not a nicety: anything that
  moves on its own for more than five seconds needs a stop mechanism, and hover
  does not count because it cannot be reached from a keyboard. Autoplay is also
  off entirely under `prefers-reduced-motion`, and pauses on tab blur.

The CTA row sits *outside* the rotator so it does not move under the cursor. It
now reads **Explore** and anchors to `#protection` (the "What takes a motor out"
band), which carries `scroll-mt-16` to clear the sticky header.

**Also in this change**
- The hero's motor-range figure read `0.5–100 HP`, a placeholder predating the
  company's product portfolio, which states **1–40 HP**. Corrected. The
  `280–440 V` supply band is still unverified — it came from a competitor's
  poster during the first build — and is now marked `TODO(vkon)`.
- Product cards gain a desktop-only image zoom on hover
  (`md:group-hover:scale-[1.06]`).
- The card's `Video` text badge became a play glyph; the word read as a stray
  field label.
- Primary nav moved to sit beside the logo on the left.

### 2026-08-10 — Category rows, and content from the business plan

**Catalogue layout.** Both the home page and `/products` now present products as
one horizontal row per category rather than a single grid. `product/CategoryRow`
is the shared piece; it is a **server component** — the track is native
`overflow-x` with CSS scroll snap (`.hscroll` in globals.css), not a scripted
carousel. The reason is that the site targets low-end Android, where native
scrolling beats anything scripted. (This paragraph previously also argued that a
carousel would be the first client component in the public tree — that stopped
being true the same day, when the hero rotator landed. The scroll-snap argument
stands on its own.)

The affordance for "this scrolls" is the partially visible card at the right
edge, so card widths (`17rem` / `19rem` at `sm`) are load-bearing — widen them
far enough that a row exactly fills the container and the row stops looking
scrollable. The scrollbar is hidden; keyboard access does not depend on it,
because cards are links and focusing one scrolls it into view.

`lead="card"` puts a category intro panel in the first cell (home);
`lead="heading"` puts a plain heading above the track (catalogue, where the
filter row already frames the page).

**Empty categories are dropped, not rendered.** Same rule as the old category
grid: a row containing only an intro card and no products reads as broken. The
categories still appear as filters on `/products`.

**Heading levels are now a prop.** `ProductCard` takes `headingLevel`, because
the card sits under an `h2` on the catalogue and under an `h3` on the home page.
Without it the document skipped a level on one page or the other. This replaced
the visually-hidden `h2` that `/products` used to carry.

**Home page lost its "Selected products" section** — the category rows above it
showed the same cards. `featured` now orders products within their row instead
of selecting three for a separate grid, so the admin checkbox still does
something.

**Header** — primary nav moved to sit beside the logo on the left.

**Product card** — image zooms on hover at `md` and up. Note that Tailwind v4
compiles `scale-*` to the standalone `scale` property, not `transform`; the
global `prefers-reduced-motion` rule still flattens it. The "Video" text badge
became a play glyph.

**Fixed:** the hero claimed a `0.5–100 HP` range. The company's own product
portfolio says 1–40 HP, so the stat was wrong on a live site. The `280–440 V`
band beside it came from a competitor's poster during the first build and is
now marked `TODO(vkon)` as unverified.

---

### 2026-08-10 — Self-hosting and CI/CD

Moved off Vercel onto the deploy console described in `docs/Hosting.md`.

- **Removed `@vercel/blob`.** It is a Vercel-only service and cannot run on an
  own server. Image uploads now write to a directory on a Docker volume and are
  served by a new `/media/[...path]` route.
- Added `Dockerfile` (multi-stage, standalone, non-root, 221 MB),
  `docker-compose.yml` (app + Postgres, two named volumes, app bound to
  loopback), `.dockerignore`, and `output: "standalone"`.
- Added the `cicd/` contract: `deploy.sh`, `verify.sh`, `config.json`.
- Added `/api/health` — a real database round-trip.
- `SITE_URL` now overridable so staging cannot emit production canonical URLs.
- Excluded `docs/Hosting.md`, `docs/cicd.md` and `docs/Poster.pdf` from git:
  the first two carry Cloudflare tunnel UUIDs, internal hostnames and host
  paths, and would be a real disclosure in a public repo.
- Fixed `.gitignore` `.env*`, which would have excluded `.env.example` too.

Fixed during verification (both found by running the real stack, not by reading):
- **Postgres SSL was inferred from the hostname.** "SSL unless localhost" broke
  the moment the database host became `db`: the driver demanded TLS from a
  container that does not offer it and *every query failed*. Now explicit —
  `DATABASE_SSL`, else `?sslmode=`, else off.
- **`verify.sh` passed that completely broken deploy.** Public reads fail soft,
  so the site served 200s with no database at all. This is why `/api/health`
  exists and why both health gates now use it.

### 2026-08-08 — Dark mode

- `data-theme` on `<html>`, set pre-paint by an inline script; toggle in the
  site header (desktop bar and mobile top bar) and in the admin header.
- Semantic tokens split into light and dark sets; **all components migrated off
  raw palette classes** (`bg-white` → `bg-surface`, and so on) so they flip.
- Added the `band` token family and the inversion described in §6 — the
  intentionally-dark sections stay distinct in both themes instead of
  dissolving into the page.
- Added a DOM-walking contrast audit to the verification loop; it now runs for
  both themes and both viewports.

Fixed during verification:
- `bg-action text-white` in five places — the action colour inverts, so those
  would have been white-on-white in dark mode.
- The drawer scrim was migrated to `bg-action/50`, which would have flashed a
  near-white overlay in dark mode. Pinned back to `bg-black/50`.
- `Section` tone="dark" and `Badge` tone="onDark" had been swept to page tokens
  instead of band tokens.
- Dark `accent-soft` (#12402B) gave accent text only 4.28:1; darkened to
  #0E3322 (5.1:1).
- `ThemeToggle` first written with `useState` + `useEffect`, which tripped the
  setState-in-effect lint rule; rewritten with `useSyncExternalStore`.

### 2026-08-07 — Admin CMS, and a redesign against WAGO/NVIDIA

Two changes at once: products moved from a code file to a database with an
admin UI, and the visual design was rebuilt.

**Architecture**
- Added Postgres (`pg`) + Vercel Blob (`@vercel/blob`). First runtime
  dependencies beyond React/Next since the project started.
- Added `/admin`: HMAC-cookie session, product CRUD via server actions, image
  upload, YouTube/Vimeo video links, publish/draft and featured flags.
- `src/content/products.ts` deleted; `products` table and `lib/db/` added.
  `content/taxonomy.ts` keeps the category and protection vocabularies.
- Routes regrouped under `app/(site)/` so `/admin` can have its own chrome.
- **Removed the Contact and Dealers pages.** Contact now lives in the footer
  and a `ContactStrip` at the foot of every page.
- Public product routes switched from ISR to `force-dynamic` after ISR was
  found to serve one stale response after a save (§3).
- `lib/revalidate.ts` added then removed — unnecessary once rendering is
  per-request.

**Design** — the previous build read as a generic template. Changed:
- Pills → 2px rectangles; drop shadows → 1px rules; ambient gradient glows →
  removed entirely; icon-in-rounded-chip cards → ruled lists.
- Plus Jakarta Sans (geometric, friendly) → Inter alone, headings at weight
  600 instead of 800, plus IBM Plex Mono for technical labels.
- Primary buttons went from brand green to near-black; green is now links and
  active state only.
- Home category cards → a ruled directory; hero rebuilt around a large
  left-aligned headline with the figures on a ruled strip.
- Net effect on performance: TBT 130 ms → 30–40 ms, mobile perf 94 → 96–99.

**Fixed during verification**
- ISR served stale content after save (above).
- `graphite-500` used for `.label-tech` throughout — failed AA on both light and
  dark. Now 600/400. A11y 96 → 100.
- `gap-px bg-line` grids painted grey blocks in empty cells with one product.
- Category card grid left a visible hole at five items → ruled rows.
- `/products` skipped `h1` → `h3` → added a visually hidden `h2`.
- Delete confirmation's accessible name did not start with its visible text.
- Hero stat dividers used `divide-x`, which bordered the item starting the
  second row on mobile.

### 2026-08-04 — Architecture doc added
Created this file. No code change.

### 2026-08-03 — Initial build
Greenfield Next.js site: 7 static routes, products in a typed code file,
Web3Forms enquiry forms, protection icon set, `PanelDisplay` hero visual.
Fixed during verification: drawer clipped by `backdrop-blur` containing block,
JS scroll-reveal could leave sections invisible (→ CSS-only), logo `aria-label`
mismatch, `setState` in effect, four `blur-3xl` filters above the fold.
