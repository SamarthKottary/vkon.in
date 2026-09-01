# Architecture

Living reference for how vkon.in is put together and why. Update this file in
the same change that alters the structure — the [Change log](#change-log) at the
bottom is the running history.

**Scope:** structure, decisions and constraints. Setup, how to add a product,
and the placeholder checklist live in [README.md](../README.md).

Last updated: 2026-08-10

---

> New to this project? **[HANDOFF.md](HANDOFF.md)** is the orientation layer —
> where things stand, how to run it, the traps that cost real time, and what is
> outstanding. This file is the reference.

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
      layout.tsx            Header, Footer, SubscribePanel, MobileActionBar, JSON-LD
      actions.ts            PUBLIC server actions — sign-up and contact enquiry
      page.tsx              home
      about/page.tsx
      contact/page.tsx      contact channels, enquiry form, address
      products/page.tsx     catalogue
      products/[slug]/      detail
    admin/
      layout.tsx            admin chrome, reads auth state
      page.tsx              login
      LoginForm.tsx
      actions.ts            ALL admin server actions — the security boundary
      products/             list, ProductForm, new/, [id]/
      enquiries/            contact inbox: read, mark handled, remove
      subscribers/          mailing list: read, export, remove
    not-found.tsx           renders its own chrome (outside the (site) group)
    globals.css             design tokens + the contrast table
    sitemap.ts robots.ts opengraph-image.tsx icon.svg

  components/
    contact/   EnquiryForm (client)
    layout/    Header (client), Footer, MobileActionBar, PageHero,
               ProductsMenu (client), SubscribePanel (client)
    home/      Hero, HeroRotator (client), SectorBrowser (client),
               ContactStrip, RecentlyViewed (client)
    product/   ProductCard, ProductRow (client), ProductMedia (client),
               ProductCatalogue (client), SpecTable, ProtectionList,
               PanelPlaceholder, RecordView (client)
    icons/     protections.tsx (12-icon set), ui.tsx, Logo.tsx
    theme/     ThemeScript (pre-paint, inline), ThemeToggle (client)
    ui/        Button, Container, Section, Badge, JsonLd

  content/     taxonomy.ts (sectors + categories), segments.ts, site.ts, nav.ts
  lib/
    db/          client.ts, products.ts, subscribers.ts, enquiries.ts, schema.sql
    auth.ts      session + requireAdmin
    rate-limit.ts in-memory fixed window; guards the public sign-up
    recent.ts    recently-viewed slugs in localStorage
    storage.ts   blob upload/delete
    video.ts     YouTube/Vimeo URL → embed
    contact.ts seo.ts types.ts

scripts/       db-setup.mjs, db-seed.mjs, make-placeholder-images.py
public/products/  demo-*.jpg (placeholder photography — delete when real)
public/segments/  one photograph per sector, used by the hero AND the cards
```

### Client components

| Component | Why |
|---|---|
| `theme/ThemeToggle` | Reads `data-theme` via `useSyncExternalStore` |
| `layout/Header` | Drawer state, focus trap, Escape, hide-on-scroll |
| `layout/ProductsMenu` | Dropdown state, outside-click, measured slider |
| `layout/SubscribePanel` | `useActionState` over the public sign-up action |
| `layout/IntroSplash` | Session-gated brand intro; logo flies to the header logo (measured) |
| `home/HeroRotator` | Slide timer, pause control, reduced-motion opt-out |
| `home/SectorBrowser` | Open card, measured paging arrows |
| `home/FeaturedProducts` | Measured paging arrows, wheel-to-scroll, measured centred-card detection |
| `home/RecentlyViewed` | Reads localStorage via `useSyncExternalStore`; measured paging arrows, wheel-to-scroll, measured centred-card detection |
| `about/TiltCard` | Pointer-tracked 3D tilt, fine-pointer devices only |
| `about/StatCounter` | Counts a figure up from zero on first entering the viewport |
| `about/AboutGallery` | Endless photo belt (doubled list, seam reset); arrows, pause, dots |
| `product/ProductCatalogue` | `useSearchParams` filter state |
| `product/ProductRow` | Measured paging arrows over a scroll track |
| `cart/CartLink` | Cart count from localStorage via `useSyncExternalStore` |
| `cart/QuantityStepper` | − / count / + for one product, card and cart page |
| `cart/CartList` | Cart contents, quantity and removal |
| `cart/AddToCartButton` | Writes to the cart, shows its own confirmation |
| `product/RelatedProducts` | Measured paging arrows over a scroll track |
| `product/ProductCard` | Places the spec truncation mark from measured layout (`"horizontal"` orientation only — `"vertical"` and `"featured"` need no measurement) |
| `product/ProductMedia` | Selected media, deferred video embed |
| `product/RecordView` | Writes the viewed slug to localStorage |
| `home/CopyEmail` | Clipboard, with a mailto fallback |
| `admin/LoginForm` | `useActionState` |
| `admin/products/ProductForm` + `DeleteProductButton` | Form state, uploads, confirm step |
| `admin/subscribers/SubscriberTools` + `DeleteSubscriberButton` | Clipboard, CSV, confirm step |
| `admin/enquiries/EnquiryActions` | Mark handled, confirm-delete step |
| `contact/EnquiryForm` | `useActionState`, per-field errors |

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

### The band, and the inversion it no longer does

The design has deliberately dark sections — the hero, the protection strip, the
footer, the mobile action bar — sitting inside a light page. In dark mode those
cannot simply stay dark without dissolving into the background.

The `band` tokens used to **invert their role** for exactly that reason: darker
than the surface in light mode, lighter than it in dark. **They no longer do.**
On 2026-08-18 the client asked for the same near-black in both themes, and
`--color-band` is now `#181D22` either way.

Know what that costs, because it is the thing the inversion was buying: in dark
mode the band separates from the `#0E1113` ground by 1.14, where the previous
`#2A313A` gave 1.44. **The top hairline is now what marks a band, not the
fill.** `band-line` is deliberately kept at the lighter `#3D4650` in dark mode
rather than matching the light theme — remove or dim that border and the footer
merges into the page with nothing to say where one ends. A band added in future
must carry a border; it can no longer rely on its fill to be seen.

Band content uses `band-ink` / `band-body` / `band-muted` / `band-line` /
`band-accent` rather than the page tokens. Those did not change.

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

> Extending the admin? **[ADMIN.md](ADMIN.md)** covers it in depth — the full
> data flow, a recipe for adding an editable field, and the open decisions
> (editable hero figures, multi-admin, backups) with a recommendation each.
> This section is the summary.

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

### The taxonomy is two levels, and only one of them is stored

**Sector → category → product.** Three sectors (agriculture, industrial,
commercial), each holding one or more product categories, each holding products.

A product row stores its **category** and nothing else. The sector is derived —
`categories[].sector` in `src/content/taxonomy.ts` says which market each
category belongs to, and `sectorOf()` looks it up. That is the whole reason
there was no migration when the site gained a level above categories on
2026-08-18, and it is why moving a range from one market to another is a
one-line edit rather than an UPDATE over the table.

The consequence to know: **a product cannot sit in two markets**, because its
category cannot. If that is ever needed, it is a real schema change, not a
tweak to the taxonomy file.

Both levels are code, not database rows. Categories are tied to icons, copy and
route parameters; sectors are tied to hero artwork and slide copy. Adding either
is a code change whichever way it is stored.

### Tables

Two, both in `src/lib/db/schema.sql`.

**`products`.** `src/lib/db/products.ts` is the
only module that touches it, and `mapProductRow` is the single snake_case →
camelCase bridge.

List fields (ratings, features) are `TEXT[]`; `spec` and `images` are `JSONB`.
The admin edits lists as one-per-line textareas and spec as `Label: value` per
line — for a catalogue of this size that is faster than repeater widgets and
cannot get into a broken state.

`protections` is a `TEXT[]` of keys from a fixed taxonomy, ticked as checkboxes.
Unknown keys are filtered out at read time, so removing one from the taxonomy
degrades instead of breaking a page.

**`subscribers`.** `src/lib/db/subscribers.ts` is the only module that touches
it. One address per row, stored lower-cased and trimmed so the `UNIQUE`
constraint means what it looks like it means, plus the path it was submitted
from. Written by the public action in `app/(site)/actions.ts`; read and deleted
at `/admin/subscribers`.

**`enquiries`.** `src/lib/db/enquiries.ts` is the only module that touches it.
One row per contact-form submission, with `handled` as a flag rather than a
deletion — a dealt-with enquiry is still a record of who asked for what.

**Nothing in this codebase sends email.** The site collects addresses and
enquiries and shows them in the admin. That is a bigger deal for enquiries than
for the mailing list: **an enquiry sits unseen until somebody opens
`/admin/enquiries`.** It is why the contact page puts phone and WhatsApp above
the form rather than below it. Wiring up a sender brings obligations that are
not met today — see §11 and ADMIN.md §7.6–7.7.

**Video is a URL, not a file.** `lib/video.ts` normalises watch links, youtu.be,
/shorts/, /embed/ and Vimeo IDs into an embed. The product page renders a poster
plate and only injects the provider iframe after a click, so nothing is
requested from YouTube — and no third-party cookie is set — for a visitor who
never presses play.

---

## 9. Load-bearing constraints

Each encodes a real bug. Breaking one reintroduces it.

**`requireAdmin()` must be the first statement of every mutating server action
in `app/admin/actions.ts`.** See §7.

**`app/(site)/actions.ts` is the only unauthenticated write path, and every
action in it carries the same three guards.** Anything added there is reachable
by anyone on the internet as a bare POST. Both actions there — the sign-up and
the contact enquiry — have a honeypot that returns the ordinary success message
so a bot learns nothing, a rate limit keyed on the client address, and bounded,
validated values reaching Postgres through parameterised queries only. A new
public action must carry all three, or belong in the admin file instead.

**A sector is derived from a category, never stored on a product.** §8.

**Product-driven routes must stay `force-dynamic`.** Reintroducing ISR
reintroduces the stale-by-one-request bug in §3.

**`graphite-500` is never used for text.** §6.

**Components use semantic tokens, not raw palette steps.** A `bg-white` or
`text-graphite-700` is a component that will not flip in dark mode. §6.

**`bg-action` is never paired with `text-white`.** The action colour inverts
between themes; its companion is `text-action-ink`. Same for `bg-band` →
`text-band-ink`.

**Fonts are committed files, never fetched at build time.** `next/font/google`
downloads from fonts.googleapis.com during `next build`, which makes every
build — including the Docker build inside `cicd/deploy.sh` — fail on a slow or
interrupted connection, *after* the deploy has already pulled the commit.
`src/app/fonts/` holds the same latin-subset woff2 files Google would have
served, wired through `next/font/local`. Runtime bytes are identical; only the
network dependency is gone.

**Health checks must probe `/api/health`, never `/`.** Public reads fail soft,
so the home page returns 200 with the database completely down. See §10a.

**Decorative images may be CSS backgrounds; content images may not.** The rule
is `next/image` everywhere, with one measured exception: a purely decorative
picture that is hidden below a breakpoint. `<Image fill>` inside a
`hidden lg:block` wrapper has no layout on a phone, so the browser cannot
resolve `sizes` and falls back to the **largest** candidate — the subscribe
panel's decoration was measured requesting `w=3840` at a 390px viewport, hidden.
A `background-image` declared inside the media query is never fetched at all.
The trade is losing automatic WebP; only take it for a small decorative file,
and never for anything a reader needs.

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
ruled directory until 2026-08-10 and is now a single horizontal track
everywhere it appears — `SectorBrowser` on the home page, `ProductRow` per
category on the catalogue, fixed-width columns in the header dropdown. A
one-line track cannot produce an empty cell. On the catalogue a category with
no products is dropped, never rendered as an empty row.

**Accessible names must lead with their visible text.** An `aria-label` that
replaces visible text breaks voice control. This is why the logo link has none
and the delete confirmation reads "Confirm delete" before its screen-reader
suffix.

**The hero scrim's flat floor must lift at `lg`, not `sm`.** It is the
breakpoint at which the copy moves into the left column and the horizontal
gradient starts doing the work. Lifting it at `sm` leaves 640–1023px with
neither protection, and the slide body drops to 2.91:1 over a bright frame.
The floor now lifts to nothing at `lg` rather than to a residual film; the
breakpoint is what is load-bearing, not the value.

**Scrims are shaped, not flat, and their right edge must stay clear.** This
holds for the hero, both page mastheads (`/contact`, `/about`) and the
sign-up panel. The darkness follows the text — heavy left, falling to
transparent on the right — because every one of these frames has its subject
on the right, and a flat floor or a full-width vertical pass dims it. Layers
are: a mobile-only flat floor, a horizontal pass ending transparent, and one
more shaped to wherever the copy sits (a bottom band where the copy is
bottom-left, a top-left diagonal where it is top-left). Do not reintroduce a
full-width vertical stop: that is what put a film over the whole frame, and
the text it was protecting is served by the shaped layer instead.

**The sign-up panel's mobile floor is the exception at 58.** Its frame is a
high-key paddy field (mean luminance 0.43 against 0.05–0.15 for the hero) and
at 390px the copy spans the panel's full width, so neither the left-weighted
pass nor the diagonal covers its right half. It measured 4.09:1 at 44.

**Hero contrast must be measured with `Range` rects, never element boxes.**
The eyebrow is a full-width `<p>` holding one short word, so its element box
spans the container. Sampling that reads the bright right of the frame as
though it were behind text that is actually far left — it reported 2.3:1
while the glyphs sat over an 85 %-covered edge, and sent two rounds of
"fixes" in the wrong direction. Range rects hug the glyphs. The same run also
has to filter to painted text: the rotator keeps every slide mounted, so
inactive ones are in the DOM at `opacity: 0` and get measured against the
visible slide's background unless `checkVisibility` excludes them.

**Hero slide headlines must state their typography explicitly.** Only slide one
is an `<h1>`; the rest are `<p>` so the markup does not carry three. A `<p>`
never receives the base stylesheet's heading rules, so the later slides
rendered at 400 weight and normal tracking against the first slide's 600 at
-0.03em — same family, same size, visibly different type. The shared `HEADLINE`
constant in `HeroRotator` is what keeps the tag a semantic choice rather than a
visual one. The hero deliberately settled on the **lighter** of the two (400,
normal tracking), so `font-normal` and `tracking-normal` in that constant are
load-bearing on slide one: drop them and the `<h1>` reverts to 600/-0.03em
while the paragraphs stay light.

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
- **No login rate limiting.** §7. Note that the *sign-up* is limited, by
  `lib/rate-limit.ts` — that limiter is sound only because this deploys as a
  single container, and applying it to login would be worth doing for the same
  reason.
- **The mailing list has no unsubscribe and no confirmation.** Removing an
  address means asking the operator, who deletes it at `/admin/subscribers`.
  There is also no double opt-in, so anybody can put anybody else's address on
  the list. Neither matters while nothing sends mail. Both become real the day
  something does, and the sender is the right place to fix them — an unsubscribe
  link in every message, and a confirmation mail before the row is written.
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

### 2026-09-01 (home, featured products) — Quick View moves from dead-centre to 10% up from the image's bottom edge

**Client: "place quick view in the feature card 25% above from the bottom of the image," then, same day, two follow-ups: "make 15% from bottom," then "i changed to 10%."** `FeaturedCard`'s Quick view wrapper (both branches — with and without a photo) was `top-1/2 -translate-y-1/2`, vertically centred on the image. Swapped for `bottom-[10%]` with no vertical translate (the intermediate `25%` and `15%` passes were both superseded before this shipped — the client's own direct edit to the no-image branch's className was the immediate trigger for this entry, made to match the with-image branch, which had been left at `15%`), so its own centre sits 10% of the image's height up from the bottom edge instead. Horizontal centring (`left-1/2 -translate-x-1/2`) is unchanged, as is everything driving its opacity (`--pop-progress` on touch, `group-hover` on a pointer) and the `data-featured-quickview` autoplay-pause marker.

Verified: Quick view now renders 10% up from the image's bottom edge rather than dead centre, on both the with-photo and no-photo `FeaturedCard` branches, matching each other. `npx tsc --noEmit` not run in this session (no local Node toolchain available); change is a plain Tailwind class swap with no new types.


### 2026-09-01 (products catalogue) — Vertical `ProductCard`'s own tagline reveal removed; Quick View already shows it

**Client: "remove tagline for product card in the product page, because tagline available in quick view."** The hover-reveal tagline paragraph (`grid-rows-[0fr]` → `group-hover:grid-rows-[1fr]`, between the price and the "Range" row) was specific to the vertical/catalogue-grid branch of `ProductCard` — the one rendered on `/products`, `home/RecentlyViewed`'s strip and `product/RelatedProducts`. `HorizontalCard` and `FeaturedCard` each carry their own, separate tagline block and were not touched; `QuickViewModal` already renders the tagline on its own, which is what made this one redundant rather than the site's only copy.

Verified: catalogue cards no longer show a tagline on hover; price now sits directly above the "Range" row with no gap left behind; Quick View (unaffected) still shows the tagline. `npx tsc --noEmit` not run in this session (no local Node toolchain available); change is a plain JSX removal with no new types.


### 2026-09-01 (home, featured products) — Quick View sometimes stayed invisible on a centred mobile card; a race between two independent timers, not the fade logic itself

**Client: "please check why some time quick view is not visible in mobile view while scrolling, when it is in center for featured product card in home page."** The fade itself (`--pop-progress`, driven by `updatePopProgress`'s `requestAnimationFrame` loop, entries above) was not the bug — its *lifetime* was. `touchend`/`touchcancel` and `advance`/`retreat`/`goTo` each schedule exactly one fixed-delay stop for that loop (`schedulePopProgressStop(500)` and `(700)` respectively), sized to outlast the 120ms settle delay in `sync` plus one typical `scrollTo({behavior:"smooth"})`.

**`correctCardStep` (this same day, above) is a second animation on top of that first one.** It fires from *inside* the settle timer, after the gesture or tick has already been accounted for, whenever a swipe or autoplay step settles short of an exact card boundary — which on a real phone is common, not the exception. That second `scrollTo` needed time the original 500ms/700ms buffer was never sized to include, since it did not exist yet when those figures were picked. Once it ran long enough, the `requestAnimationFrame` loop those timers guard died mid-nudge, freezing `--pop-progress` at whatever partial value the card had reached the instant it stopped — not always invisible, which is exactly why it read as "*sometimes* not visible": whether it froze near `0`, mid-fade, or already at `1` depended entirely on how close the settle was when the buffer ran out.

**Fixed by re-arming the stop timer from `sync` itself, on every real scroll frame, not only once from whatever started the gesture.** `sync` already re-arms its *own* settle timer this way on every `scroll` event; `schedulePopProgressStop(500)` now runs alongside it, guarded on `dragFrame.current !== null` so it only extends a loop already running (from a touch or a button/autoplay tick) rather than starting one of its own on an unrelated `measure()` call (a resize, for instance). Since `correctCardStep`'s own corrective `scrollTo` is a genuine scroll animation, it keeps firing `scroll` events of its own, which keeps pushing this deadline out for as long as that correction is actually still moving the row — the loop now only stops once scrolling has *fully* settled, corrective nudge included, instead of on a fixed clock that assumed there would only ever be one animation to outlast.

Verified by reasoning through the timeline `correctCardStep`'s own changelog entry already put on record (settle timer + a second `scrollTo`) rather than on a real phone — no browser-automation tool was available in this session to reproduce the original intermittent race directly; worth confirming on real hardware alongside the other unverified mobile items in this log. `npx tsc --noEmit` not run in this session (no local Node toolchain available); change is additive to an already-verified per-frame `requestAnimationFrame` loop and introduces no new types.


### 2026-09-01 (product/ProductMedia, QuickViewModal) — Quick View's gallery drops the thumbnail grid for a multi-photo product, in favour of the dots `ProductCard`'s own gallery already uses

**Client: "In quick view panel if there more than one image in a product do not show preview at the bottom, just the dots are enough. Otherwise the image becomes too small."** The thumbnail grid (`grid-cols-5`, one square per photo) is a real, several-rows-tall claim on the modal's own vertical space — on top of the width cap the entry above already put on the image itself, that space cost read as the image being squeezed from two directions at once, not one.

**New `compact` prop on `ProductMedia`, off by default, so the product detail page's own gallery — sharing this exact component — is untouched.** `compact` swaps the thumbnail `<ul>` for a small dot row overlaid directly on the image, reusing `ProductCard`'s own catalogue-grid gallery dots verbatim (shape, colour, the `pointer-events-none` strip with only each pill itself clickable) rather than inventing a second dot style — that component settled this exact "dots on the image, not a row underneath it" question once already (2026-08-something entries on `ProductCard`, further down this log), and Quick View's version is the same trade-off for the same reason: a position indicator that costs almost no vertical space instead of one that shows the actual photos. `QuickViewModal` passes `compact`; the product detail page's own `<ProductMedia>` call passes nothing, so it keeps the full thumbnail grid exactly as it always has — that page has the room for it, and jumping by an actual photo is strictly more useful there than a plain dot.

Verified via `npx tsc --noEmit`, `npx eslint` (`ProductMedia.tsx` clean; `QuickViewModal.tsx`'s one finding is the same pre-existing, unrelated `set-state-in-effect` already on record in the entry above), and `npm run build`, all clean. No browser-automation tool was available in this session to open Quick View on a multi-photo product and confirm the dots read correctly in place of the grid — worth a manual check alongside the other unverified items above.

**Client, with a screenshot: "This is only for mobile view. In desktop view its fine to show preview below like previous. Also in mobile there is space for image size to increase, check the image attached."** Two things the screenshot made visible at once, both fixed together: `compact` had swapped the grid for dots unconditionally, at every width — nobody had asked for that on desktop, which was never cramped and never asked to change; and the image itself, still capped from the entry below at a flat `55%`, now sat in a lot of unclaimed dark space once the grid beneath it was actually gone on mobile, exactly the space that cap had originally been leaving room for.

**`compact` is now a `md:` split, not a flat swap.** Both the dot row and the thumbnail grid stay mounted at every width — `md:hidden` on the dots, `hidden md:grid` on the grid when `compact` — so nothing mounts or unmounts crossing the breakpoint (no lost scroll position or focus on a resize), only which one is visible changes. Below `md`: dots, no grid, as shipped in the entry above. At `md` and up: grid, no dots — the product detail page's own always-plain-grid behaviour, now also what `compact` itself resolves to there, so a desktop visitor sees the exact same gallery either way.

**The image's own cap went from `55%` to `80%`** (`QuickViewModal`'s wrapper around `<ProductMedia>`, from the entry below) — arithmetic follows directly from the dots fix: that cap was sized to leave headroom for a thumbnail grid that, on mobile, no longer renders at all, so the same width was leaving space unclaimed for a reason that had just stopped applying.

Verified via `npx tsc --noEmit`, `npx eslint` (same one pre-existing finding, unchanged) and `npm run build`, all clean. Still no browser-automation tool available this session — the CSS-only `md:hidden`/`hidden md:grid` split and the new `80%` cap are reasoned through against the screenshot rather than watched directly; worth confirming both on an actual phone alongside the other unverified items in this log.

### 2026-09-01 (product/QuickViewModal) — Below `md`, the image and the details scroll together as one surface, and the image itself shrinks to leave room for them

**Client: "Now lets work on the quick view card in mobile view, only the content is scrollable not the image. I want the entire image and content tab to scrollable as single entity. Also in order to fit the quick view panel in mobile view let it adjust the the image size by fitting it as needed to fit the quick view panel in mobile view."** Below `md` the modal stacks image above details (`flex-col`, `md:flex-row` only at the breakpoint where they sit side by side); the modal wrapper carried `overflow-hidden` with `overflow-y-auto` on the details column alone, so once the stacked total exceeded the modal's own `max-h-full`, only the details column's own cramped remainder scrolled — the image, sized to its full-bleed square, was locked in place above it.

**Two independent changes, both scoped to below `md` so the desktop side-by-side layout — where the image genuinely should stay put while its own column scrolls — is untouched.** `overflow-hidden` on the modal wrapper became `overflow-y-auto md:overflow-hidden`, and the details column's own `overflow-y-auto` moved to `md:overflow-y-auto` — the wrapper is now the one scrolling surface below `md`, carrying the stacked image and details together; at `md` and up, scrolling hands back to the details column exactly as before. Separately, the image itself is capped to `max-w-[55%] md:max-w-none` inside a new wrapper `div` around `ProductMedia` — that component's own plate is `w-full` of whatever contains it, which on a narrow phone meant the image alone (plus its arrows and thumbnail row) could run past a third of the viewport before any product details were visible at all. Capped on this wrapper, not inside `ProductMedia` itself, since that component is shared with the product detail page's own gallery, which still wants its existing full-width treatment.

Verified via `npx tsc --noEmit`, `npx eslint` (one pre-existing, unrelated finding on this file confirmed via `git stash` — a `set-state-in-effect` on the modal's own portal-mount gate, present before this pass), and `npm run build`, all clean. No browser-automation tool was available in this session to open the modal on an actual mobile width and confirm the combined scroll and the smaller image read correctly — worth a manual check before treating this as done.

### 2026-09-01 (products catalogue, card gallery) — The catalogue grid's scroll-triggered Quick View reveal becomes a continuous fade, not a binary flip at the 50% boundary

**Client: "Then in mobile when we scroll through products i want the quick view button to appear only on cards which are visible, they should have similar smooth fading animation."** Already true in one sense — each card's own `IntersectionObserver` (2026-08-31 entry below) already gated Quick View to roughly-half-visible cards, independently per card, so it never showed on an off-screen one. What it did not have was the fade: `entry.isIntersecting` off a single `{ threshold: 0.5 }` is a hard yes/no, and while the `transition-opacity duration-300` already on the wrapper does animate that flip, the trigger itself snaps exactly at the boundary rather than tracking how visible the card actually is on the way there.

**Replaced with a continuous `--iv-progress` custom property, the same "write to the DOM on every observer tick, not React state" idiom `home/FeaturedProducts` already uses for `--pop-progress`.** A fine-thresholded observer (`0, 0.05, 0.1, … 0.5`) fires as `intersectionRatio` crosses each step; the callback sets `--iv-progress` to `min(ratio / 0.5, 1)` directly via `style.setProperty` on the card's own outer wrapper, inherited straight down to the Quick View wrapper's `[opacity:var(--iv-progress,0)]` with nothing to query for — a direct ancestor/descendant relationship, unlike `FeaturedProducts`' own version which has to reach across sibling cards in a horizontal track. Same "reveal once roughly half visible" contract survives exactly — `progress` hits `1` right at the same `intersectionRatio: 0.5` the old boundary used — but now ramps through the 0%–50% range instead of jumping at the far end of it. `transition-opacity duration-300`, already on the wrapper, is left in place rather than removed the way `FeaturedProducts` eventually dropped its own touch transition — that removal was specifically because a value retargeted every ~16ms (a `requestAnimationFrame` loop) made a transition visibly lag; an `IntersectionObserver` tick is nowhere near that frequent, so a short transition here is a hedge smoothing the gaps *between* ticks, not something fighting a faster signal underneath it.

**Needed an explicit `[@media(hover:none)]` gate that `FeaturedProducts`' equivalent does not.** `--pop-progress` there is only ever written from a loop started on `touchstart`, so it is structurally never set at all on a mouse-only device — nothing extra was needed to keep it off desktop. A vertical page scroll fires on every device alike, so without a gate the same continuous fade would start appearing on hover-capable desktops purely from scrolling a card into view, which the original `!hoverCapable` check (removed with this pass) existed specifically to prevent. Scoped in CSS instead of JS this time — `[@media(hover:none)]:[opacity:var(--iv-progress,0)]` — which is also strictly more robust than the state it replaces: the old `hoverCapable` boolean started `false` and only flipped after a mount-time `matchMedia` effect ran, a real (if brief) window where a desktop visitor could see the old flash; a media query is evaluated by the browser before first paint, with no such window. Removing that JS check as dead code also happened to clear this file's own pre-existing `set-state-in-effect` finding on `hoverCapable` — a side effect of the fix, not a separate cleanup pass.

Verified via `npx tsc --noEmit`, `npx eslint` (one fewer finding than before this pass — the `set-state-in-effect` finding on the now-removed `hoverCapable` effect is gone; the file's one remaining finding, an already-accepted `isPopped`-unused warning, is unchanged) and `npm run build`, all clean. No browser-automation tool was available in this session to scroll a real card through the threshold and watch the fade, so — as with the filter panel above — this has not been visually confirmed; worth a manual check on an actual mobile width before treating it as done.

**Client, after testing on an actual phone: "I only want one quick view button to be visible at a time. I tested it it dosent fade away or fade in it looks like its on all cards."** The pass above was still per-card independent — every card past 50% visible shows its own button, unrelated to any other card's state. On this grid's actual proportions a phone viewport routinely fits more than one card at once, so two (or more) buttons could sit at opacity `1` simultaneously with nothing between them ever animating — which reads exactly as reported, "always on," not broken so much as never having had the single-active-card behaviour the client was picturing. `home/FeaturedProducts` avoided this from the start by construction — one horizontal track, one `centeredId` — but this file's own 2026-08-31 entry below explicitly reasoned the opposite way for this grid ("a vertical page-scroll grid has no 'one active card' concept the way a horizontal carousel does"), which is exactly what the client's testing just contradicted.

**Made exclusive via a module-scope registry (`inViewRegistry`, `reconcileInView`), declared once above the component rather than in any single instance's state.** No individual card can decide "am I the most visible one" alone — that requires comparing against sibling cards it has no reference to, and these are unrelated instances (`ProductCatalogue`'s grid, `RelatedProducts`' belt — the same vertical-orientation branch, on two routes that are never mounted at once, so a page-lifetime `Map` needs no explicit scoping between them). Every card's observer still fires independently and reports its own ratio into the shared map; a `reconcileInView()` afterward finds the highest ratio across all of them and only that element gets a nonzero `--iv-progress` — everyone else is pinned to `0`, which the existing `transition-opacity` on the wrapper turns into a genuine fade-out rather than an instant cut, so the handoff between two cards reads as one continuous crossfade rather than two independent fades that happened to overlap. Thresholds widened from `0–0.5` to the full `0–1` (still `21` steps) — the registry needs a card's true ratio past `50%` to correctly judge "more visible than the current winner" between two cards that are both already more than half visible; the wrapper's own opacity still caps at `1` right at `0.5`, unchanged.

**`WIN_MARGIN` (`0.03`) is hysteresis, not a magic tolerance.** Picking the strict highest ratio on every single tick sounds right until two adjacent cards cross paths at roughly equal visibility — a `Map` iteration order flicker or a fraction of a percent of ratio noise right at that crossing would otherwise flip the winner back and forth for several ticks in a row, which reads as a stutter, not a handoff. Requiring a real margin before a challenger can take the win from the current holder — simulated directly against a synthetic three-card scroll sequence with two deliberately-planted near-ties (`0.51`/`0.49` then `0.49`/`0.51`; `0.5`/`0.51` then `0.48`/`0.52`) before shipping — holds the current winner through both, only handing off once a card actually pulls ahead by more than the margin, confirmed via the same script: exactly one nonzero `--iv-progress` at every step across the whole sequence, winner transitioning `A → B → C` with no flapping at either crossover.

Verified via the synthetic reconciliation simulation above (logic-level, run outside the browser), `npx tsc --noEmit`, `npx eslint` (no new findings), and `npm run build`, all clean. Still no browser-automation tool available this session to actually scroll a real phone-width grid and watch the handoff — the algorithm is confirmed correct in isolation, but the fade's real-device feel has not been.

**Client, confirming the handoff itself: "yes exactly like this but make the fading away and in slower."** `duration-300` on the wrapper split into `[@media(hover:hover)]:duration-300` / `[@media(hover:none)]:duration-[600ms]` rather than just raising the one shared value — the ask was specifically about the scroll-triggered fade, and this wrapper's `duration-300` was also the desktop `group-hover:opacity-100` transition's own timing, which nobody asked to slow down. Same media-feature split this wrapper already uses for *whether* the continuous value applies at all, reused here for *how long* the transition takes once it does.

Verified via `npx tsc --noEmit`, `npx eslint` (no new findings) and `npm run build`, all clean.

### 2026-09-01 (products catalogue, filter panel) — The filter overlay now slides in/out instead of popping instantly

**Client: "Lets work on the all products page, i want the filter which appears from left in desktop view and from below in case of mobile view to be smooth and not instant."** The overlay's own component note already had this on record as a deliberate choice, not an oversight — "plain conditional mount, no enter transition — matching `layout/Header`'s own mobile drawer" — but the client asked for the opposite of what that note defended, so this replaces it rather than working around it.

**Staged into three pieces of state instead of the one `filtersOpen` boolean the trigger button still sets.** `panelMounted` puts the overlay in the DOM (in its off-screen position); `panelEntered` is what actually flips the CSS transition to its on-screen target. Mounting on open and dropping `panelEntered` on close both happen synchronously **during render**, not inside a `useEffect` — the same "adjust state when a prop changes" pattern this file's own `searchDraft`/`prevQ` sync already uses further up, needed here for the identical reason: a `useEffect` doing the same `setState` is a render after the one the user sees, and trips this project's `set-state-in-effect` lint rule besides (confirmed directly — an earlier draft that called `setPanelMounted(true)` straight in the effect body did trip it). Only the genuinely async half stays in an effect: flipping `panelEntered` on, two `requestAnimationFrame`s after mount (one is not reliably enough — it can still land inside the same paint as the mount, skipping the transition entirely, the same "mount already open" glitch this codebase already has on record elsewhere for a different component); and unmounting only `PANEL_TRANSITION_MS` after `filtersOpen` goes false, so the slide-out has time to actually play instead of the panel just vanishing mid-animation.

**Direction differs by breakpoint, matching where each shape is anchored.** Below `lg` the sheet is bottom-anchored, so closed is `translate-y-full` (off the bottom); at `lg` and up the panel is left-anchored, so closed is `-translate-x-full` (off the left) with `lg:translate-y-0` cancelling the mobile vertical offset at that breakpoint — without it the desktop "closed" position would sit off-screen in both directions at once instead of a clean horizontal slide. The backdrop gets a plain opacity fade on the same `panelEntered` flag and matching duration/curve, so the dimming and the slide finish together.

**Client, immediately after: "more smoother."** Two changes, both applied to the panel and the backdrop together so they stay in sync: the curve went from a stock `ease-out` (and the backdrop's un-set default `ease`, mismatched with the panel to begin with) to `cubic-bezier(0.32,0.72,0,1)` on both — a fast initial move that settles gently into place, the shape iOS-style sheets use, reading as noticeably less mechanical than `ease-out`'s more uniform decel; and the duration went from `300ms` to `350ms` (`PANEL_TRANSITION_MS` moved with it — it has to match the CSS duration exactly, or the unmount fires before the slide-out finishes). Also added `will-change-transform` on the panel — this project's low-end-Android target (see §1) is exactly the hardware where an un-composited transform on an element this large is most likely to visibly stutter regardless of curve or duration.

**Client, a third pass: "Could we make it a bit slower by 20%."** `350ms → 420ms`, arithmetic rather than a re-guessed number, on the panel, the backdrop, and `PANEL_TRANSITION_MS` together — the curve from the pass above is untouched, only the duration each of its three copies runs over changed.

Verified via `npx tsc --noEmit`, `npx eslint` (no new findings — the one pre-existing `set-state-in-effect` finding on this file's unrelated fuzzy-search effect is unchanged), and `npm run build`, all clean, after all three passes. No browser-automation tool was available in this session to drive the actual open/close interaction, so the slide/fade itself has still not been visually confirmed — recommend a manual check on both a real mobile width and desktop before treating this as fully verified.

### 2026-09-01 (recently viewed) — Mobile gets the same swipe mechanism as `FeaturedProducts` — `snap-mandatory` plus a settle-timer, real centring — scoped to just that; no autoplay or Quick View here to also carry over

**Client: "lets implement the same swipe mechanism for recent viewed cards in mobile view. Just the swipe feature and the card should be the centre."** Deliberately narrower than everything `FeaturedProducts` accumulated across the entries above: this row has no autoplay to reset a timer on, and `ProductCard`'s `orientation="horizontal"` (what this row renders) has no Quick View button to fade — neither mechanism was ported, since neither applies.

**`snap-mandatory` below `sm`, `snap-proximity` from `sm` up** — same split, same reasoning as `FeaturedProducts`': a touch swipe carries none of the incidental-wheel-noise risk `proximity` exists to avoid on this row (documented on this component since 2026-08-24), so `mandatory` is safe specifically where a real gesture is touch. `correctCardStep`, a new settle-timer armed by `sync`'s existing `onScroll` handler, forces the rest position to the nearest exact card boundary once scrolling has genuinely stopped, the same "`mandatory` alone is not perfectly reliable" fix `FeaturedProducts` already has on record. Centring is `measureHalfPeek`, applied as an inline `scroll-padding-left` below `sm` — measured from the real rendered card rather than a fixed CSS percentage, for the identical reason the equivalent fix landed on `FeaturedProducts`: `w-[92%]` resolves against this track's own content box (`clientWidth` minus its `px-6` padding), not the bare `clientWidth` a percentage on `scroll-padding-left` resolves against, so a flat `4%` (this row's own original attempt, from the same earlier pass as `FeaturedProducts`' `9%`) was never exactly half the true peek either.

**Two bugs specific to *this* component, not copy-paste of the `FeaturedProducts` versions — this row's own `null`-until-hydrated return path and its own `px-6` leading padding each needed their own fix:**

1. **The peek-applying effect silently never ran past its first, no-op pass.** This component returns `null` — no `<ul>`, `trackRef.current` still empty — until `raw` resolves from `localStorage` (its own documented pre-hydration state), so the effect's first execution is always a same-render no-op against a `null` ref. With only `measureHalfPeek` (a `useCallback` whose reference never changes) in its dependency array, React saw an unchanged dependency list on the next render — the one where the ref is finally attached to a real element — and skipped re-running the effect entirely. Confirmed directly: `el.style.scrollPaddingLeft` measured empty, and the computed value fell back to `.hscroll`'s own base `20px` regardless of how the track resized. Fixed by adding `recent.length` to the dependency array, the same value `sync`'s own pre-existing `ResizeObserver` effect already depends on for what turns out to be the identical reason.

2. **`correctCardStep`'s first draft used `index * step − halfPeek` as its target, the same formula `FeaturedProducts`' own version uses — and it was measurably wrong here.** This track's first card does not start at `scrollLeft: 0` in DOM terms; `card.offsetLeft` is `24px` (the track's own `px-6`), not `0`, so `index * step` silently omits that leading offset. A real drag settled *natively* at a correct, symmetric `317px` (`scroll-mandatory` already resolving `card.offsetLeft − scrollPaddingLeft` correctly on its own), while the formula computed `292.9375px` for the same card and forced a `scrollTo` toward it — fighting the browser's own already-correct resolution rather than reinforcing it, a worse source of visible lag than no correction at all. `FeaturedProducts`' identical formula was left alone rather than also rewritten here — confirmed working there via the user's own explicit "Yes it is perfect now," and changing an already-trusted mechanism nobody reported a problem with was not this pass's job. Fixed on this component specifically by reading each card's real `offsetLeft` directly — the same nearest-card scan `sync` already performs, reused rather than duplicated as a formula — correct regardless of leading padding, non-uniform gaps, or anything else a formula would have to know about in advance.

Verified: the peek-application fix confirmed via `el.style.scrollPaddingLeft` reading the true measured value (`37.6875px`) instead of empty; centring confirmed symmetric on a real swipe (`{left: 37.625, right: 37.75}`). The settle-timer fix confirmed via two consecutive swipes: the first (card 0 → 1) measured short of a "full" step at first glance (`317px` movement against an assumed `~331px` step) — traced to card 0 itself being clamped at `scrollLeft: 0` since its own true centred target is negative (nothing to peek at before the first card, the identical asymmetry already on record for peek), not a bug; a second swipe (card 1 → 2, neither end clamped) landed at exactly `331px`, matching that pair's own real `offsetLeft` difference (`330px`) within a pixel. Desktop reconfirmed unaffected (`scroll-snap-type` still resolves to plain proximity, card width still exactly `392px`, inline `scroll-padding-left` reads empty so the untouched `sm:`/`lg:` CSS values are genuinely in control); no accidental navigation from a swipe. `npx tsc --noEmit`, `npm run build` clean; `npx eslint` shows the same single pre-existing `hoverCapable` finding already on record for this file.

### 2026-09-01 (featured products, follow-up) — The whole card's own pop (border/scale/lift) gets the same per-frame fix Quick View's opacity already got

**Client: "Yes it is perfect now, But the centre card pop up is not smooth it feels like there 2 pop ups. How could we make it smoother and less laggy."**

**Same root cause as the Quick View entries above, on a mechanism this pass had not touched yet.** `centeredId` — the state that decides which card's `<article>` carries `data-popped`, and through it the whole border/scale/lift/shadow treatment via one `transition-all duration-300` — still only ever updated from `measure()`, itself still only called from `onScroll`. Real mobile hardware not firing `scroll` on every frame of a drag was already established as the cause of a stepped Quick View fade two entries ago; the identical gap here meant `centeredId` could sit on the *previous* card for a stretch of a gesture and then jump straight to the new one, restarting that card's `duration-300` transition from a cold stop instead of a value that had been continuously tracking the swipe — which reads exactly like a second pop firing right after the first, not one continuous handoff, matching "feels like there 2 pop ups" precisely.

**Fixed by extending `updatePopProgress` — the same function already running on every `requestAnimationFrame` tick for Quick View — to also find and set `centeredId`, not by building a second mechanism.** It already scans every card's distance from centre once per frame to compute `--pop-progress`; finding the nearest one and calling `setCenteredId` is the same scan, not an additional one. `measure()` keeps computing and setting `centeredId` too, unchanged — still the only source for the very first render and for anything that is not an active gesture (a resize, the section scrolling into view) — `setCenteredId` bails out of re-rendering when the value has not actually changed, so both callers agreeing on the same value during a gesture costs nothing beyond a scan already proven cheap enough at 60fps.

Verified: sampling `data-popped` through the same slow synthetic drag used to verify the earlier entries shows it holding on the starting card for the first several samples, then flipping exactly once, cleanly, partway through the gesture, and staying on the new card — one transition, not two. Mount-time behaviour reconfirmed unaffected: the first card still reads `data-popped="true"` immediately on load, before any interaction, since `measure()`'s own call still covers that case. Desktop (arrow clicks, card width) and a full mobile swipe (still exactly `0.999` of a step) both reconfirmed unaffected. `npx tsc --noEmit`, `npm run build` clean; `npx eslint` unchanged (same pre-existing findings on record throughout this file's history).

### 2026-09-01 (featured products, follow-up) — Quick View's fade now also runs for autoplay, arrows and dots, not swipe alone; a swipe near autoplay's own 3s mark no longer lets the stale tick double-fire

**Client, two reports in one message: "Now the quick view button only appears when i swipe the card on mobile, i want autoplay to also show quick view button with fading animation. Also the timer when it is close to 3 seconds dosent reset when i swipe then. After i swipe near the 3 second limit it fires and swipes the next card."**

**Bug 1 — Quick View invisible through anything that wasn't a drag.** The previous pass's `requestAnimationFrame` loop was only ever started from `touchstart`, on the reasoning that it existed specifically to serve touch. True, but incomplete: autoplay's own `advance()` (and a tap on an arrow or dot, also reachable on mobile) moves the row via `scrollBy`/`scrollTo` with nothing watching `--pop-progress` at all, so the row visibly moved while Quick View just sat at whatever it was last left at. Fixed by splitting the loop's start/stop machinery out of the touch-listener effect into two small shared functions, `runPopProgressLoop` and `schedulePopProgressStop(delayMs)` — `advance`, `retreat` and `goTo` now call both at their own top, the same pair the touch listener calls, so the loop reacts to the row actually moving regardless of what moved it. Touch keeps its own longer buffer (`500`ms, covering an unreleased finger's own gesture length) via its existing `touchstart`/`touchend` wiring; the three programmatic movers use a shorter one (`700`ms) sized to outlast a single smooth-scroll animation rather than an open-ended gesture, since there is no finger still on the glass keeping the loop alive the way there is for a drag.

**Bug 2 — a swipe landing close to autoplay's own 3s mark could still double-fire.** The reset added in an earlier pass was real (the interval genuinely tears down and rebuilds), but not instant: it only takes effect once `sync`'s settle-timer fires, itself 120ms plus a scroll-settle animation after the swipe — 300ms or more in total. A swipe landing inside that window left the *old* interval's already-scheduled tick free to fire anyway, autoplay stepping the row a second time right on top of the visitor's own swipe. Closed from the other end with a new `swipePausedRef`, set `true` the instant a touch starts (before any scroll has even happened) and checked in the interval's own tick callback alongside the existing `hoverPausedRef`/`modalPausedRef` — so any tick that would fire *during* a swipe, before the reset has taken effect, is skipped rather than firing on the stale schedule. Cleared two ways: the fast, correct path is the same settle-timer that bumps `swipeResetSignal` (now clearing this too, unconditionally rather than only inside its own `< 640` branch, so a stray wide-viewport touch can't leave it stuck); a fallback 500ms-after-`touchend`/`touchcancel` timer covers the case where no `scroll` event ever fires at all — a tap, or a drag too small to move anything — where the settle-timer path would otherwise never run and this would stay stuck `true` forever.

**One ESLint-caught fix along the way, not new behaviour:** `stopTimer` moved from a variable local to the touch effect's closure to a component-level ref (`popProgressStopTimer`), needed so `advance`/`retreat`/`goTo` — separate functions elsewhere in the component — can reach the same stop-timer the touch listener uses, rather than each function managing its own.

Verified: right after mount, before any interaction, no card shows any Quick View opacity; after autoplay's own first tick (~3.5s in), the newly-centred card reads exactly `1`, confirmed also settling through an intermediate value first, not just appearing at the end. The race: a swipe dispatched at `2.75s` (deliberately close to the vulnerable window around the original `3s` mark) lands the row at exactly one card's width forward (`0.999` of a step) and holds there completely still for over two full seconds — no second, stale advance landing on top of it — with the *next* autoplay-driven step only arriving at `~2.25s` after the swipe, a genuinely fresh cycle counted from the reset rather than the old schedule. Desktop hover, arrow clicks, dot clicks and no-accidental-navigation all reconfirmed unaffected. `npx tsc --noEmit`, `npm run build` clean; `npx eslint` unchanged (same pre-existing findings on record throughout this file's history).

### 2026-09-01 (featured products, follow-up) — Quick View's fade is driven by a dedicated `requestAnimationFrame` loop now, not `scroll` events — real mobile hardware does not fire those on every frame of a touch drag

**Client, confirming on the actual phone the previous pass's fix was tested against: "The quick fade is not smooth, i will let you handle the fade but i should be able to look and feel that it is fading away appearing."**

**The root cause was never the curve shape — both previous passes drove `--pop-progress` from inside `measure()`, which only ever runs from an `onScroll` handler.** That was smooth in every test this file could run against it: desktop, and this sandbox's own synthetic touch simulation, both fire `scroll` on essentially every frame. Real mobile Safari and Chrome do not make that same guarantee during an active touch gesture — both are documented to coalesce or throttle `scroll` dispatch rather than firing once per compositor frame, and this exact file already had the identical fact on record for a different reason (the `scrollend`-listener note elsewhere: "mobile momentum can keep `scrollLeft` moving for longer than 120ms between individual `scroll` events"), previously only understood as a risk to the seam settle-timer's own timing. Once `--pop-progress` was also riding on `scroll` dispatch, that same gap surfaced as a visibly stepped fade instead — invisible to every test available in this sandbox, confirmed only by testing on the one device that actually exhibits it.

**Fixed by no longer depending on `scroll` dispatch frequency at all.** A new `updatePopProgress(el)` holds the same `closeness` formula from the entry below (unchanged — this was never about the curve), but is now called from a dedicated `requestAnimationFrame` loop (`dragLoop`) started on `touchstart` and kept running until 500ms after `touchend`/`touchcancel` — long enough to cover `correctCardStep`'s own 120ms settle-timer plus its `scrollTo` animation, so the fade keeps tracking through the final glide into place rather than freezing the instant a finger lifts. `requestAnimationFrame` fires once per compositor frame regardless of how the browser paces `scroll`, so this reaches up to 60 updates a second whether or not a single `scroll` event fires in between — confirmed directly with a tick counter: 18 frames counted across 300ms of a stationary touch (exactly 60fps), continuing to tick through the post-release buffer, then cleanly stopping and staying stopped afterward. `measure()` no longer touches `--pop-progress` at all; the per-card distance loop it used to share with the opacity write is back to computing only `centeredId`.

**The touch-only 100ms transition added in the previous pass is gone.** It existed specifically to paper over gaps between infrequent `scroll`-driven writes; a value now updating on every animation frame does not have gaps to smooth over, and keeping a transition on top of an already-continuous signal would only add lag back in. Desktop's pointer-hover transition (`[@media(hover:hover)]:duration-300`) is untouched.

**One real bug caught by ESLint before shipping, not a style nitpick — `react-hooks/immutability` flagged the first version of `dragLoop` as a self-referencing `useCallback`** (`const dragLoop = useCallback(() => {… requestAnimationFrame(dragLoop) …}, [updatePopProgress])`): runs correctly as written, but is fragile exactly the way the rule describes — if `updatePopProgress` is ever recreated, an already-scheduled frame from the *old* closure keeps calling the *old* `dragLoop`, not the new one. Rewritten as a plain function declared inside the effect that starts and stops it, closing over `updatePopProgress` from that effect's own dependency array instead of naming itself — sidesteps the category of bug rather than silencing the rule.

Verified: one decisive swipe still moves exactly one card (`0.999` of a step) and a full swipe still settles with exactly one card at opacity `1`; mobile peek centring (from two entries below) unaffected (`{left: 54.5, right: 55.1}`); desktop hover reconfirmed unaffected end to end (still fades to `1` after its own 300ms transition). `npx tsc --noEmit`, `npm run build` clean; `npx eslint` back down to the same pre-existing findings on record throughout this file's history, the `react-hooks/immutability` finding from mid-development fixed before this shipped, not left in place.

### 2026-09-01 (featured products, follow-up) — Quick View's fade gets a plateau instead of ramping from the instant a card leaves dead centre, plus a short touch-only transition

**Client, on a real phone, immediately after the crossfade above shipped: "When the card is 40% at the centre the fading animation quick view should aappear and then when it moves 40% away the fading animation quick view should smoothly go away. Currently it looks like it appears suddenly not smooth enough."**

**The previous pass's `closeness = 1 − distance / step` was mathematically continuous but not what "smooth" meant here — full opacity existed at exactly one point (dead centre), so any movement at all, even a pixel, immediately started pulling it down.** A `PLATEAU = 0.4` constant now holds `closeness` flat at `1` for the inner 40% of a step either side of centre (`distance <= 0.4 * step`), giving the button an actual moment of "arrived and staying" rather than beginning to leave the instant it finishes arriving; outside that zone it ramps linearly across the remaining 60% down to `0` at a full step away, the same endpoint the previous pass already used, so the outgoing/incoming pair still sum to `1` throughout that ramp.

**A second change, not explicitly asked for but reasoned through given the same "not smooth enough" report**: added `[@media(hover:none)]:duration-100` alongside the existing `[@media(hover:hover)]:duration-300`, so touch devices now get a short (100ms) transition rather than none at all. The entry above deliberately removed any transition on touch, reasoning a 300ms one chasing a value retargeted every ~16ms would visibly lag a finger — confirmed at the time, and still true for a duration that long. A **much shorter** one is a different trade: 100ms is short enough not to meaningfully lag behind a real drag, but still smooths over any gap between individual `--pop-progress` writes on hardware where `scroll` does not fire on literally every compositor frame (this sandbox's own testing cannot distinguish "genuinely stepped on real hardware" from "the synthetic touch simulation's own scroll position was itself non-monotonic" — see the verification note below — so this is a reasoned hedge, not a confirmed fix for a specifically diagnosed cause).

**Verification here has a real, disclosed limit, not swept under the "verified" line the way it usually would be.** Sampling opacity through a slow synthetic drag confirms the plateau shape is present (the outgoing card holds at a flat `1.000` for the first several sampled steps, only beginning to fall once past the 40% threshold) and that a full swipe still settles with exactly one card at `1` — both directly observed. But the same sampling also showed the underlying `scrollLeft` itself jumping non-monotonically between synthetic touchmove dispatches in this sandbox (`2405 → 2413 → 2405 → 2413 → 2420 → …`, repeatedly, not a smooth increasing sequence) — a synthetic-touch-simulation artifact this file's own history already has multiple entries on record for, not something introduced by this change. Because the opacity is a direct, position-based function of that same `scrollLeft`, a jump in the (unreliable) simulated position produces a correspondingly abrupt opacity read at that sampled step — consistent with the formula tracking its input correctly, not with the formula itself being non-smooth. This sandbox cannot distinguish those two explanations from each other, and a real finger's continuous, high-frequency touch input is not something CDP's discrete synthetic dispatches reproduce reliably. Recommending the client re-test on the actual phone that reported this, rather than reporting this fully resolved on the strength of automation alone.

`npx tsc --noEmit`, `npm run build` clean; `npx eslint` unchanged (same pre-existing findings on record in every entry above). Desktop hover reconfirmed unaffected: `transition-duration` reads `0.3s` there (`0.1s` on touch), and a real hover still shows a genuine in-between value mid-transition on the way to `1`.

### 2026-09-01 (featured products, follow-up) — Quick View's fade becomes a continuous, swipe-position-driven crossfade on touch, instead of a binary flip plus a fixed-duration transition

**Client, after confirming the centring fix: "now lets make the quick view button which appears smooth and should come from 0% to 100% visiblity when the card comes to the centre. Also similarly fade away when the next card comes to the centre."**

**Written directly to a `--pop-progress` CSS custom property on each card's own Quick View wrapper, from inside `measure()`'s existing per-card loop — not through React state.** `measure()` already computes every card's distance from the track's centre every scroll frame (to find `centeredId`); this reuses that same distance to compute `closeness = max(0, 1 − distance / step)` per card and writes it straight to the DOM via `querySelector` + `style.setProperty`. Deliberately not React state: a drag produces this update on every animation frame, and routing up to 24 cards' worth of writes through a state-driven re-render each time is exactly the per-frame cost this file's own established idiom (`measureStep`, `correctSeam`, `correctCardStep`) already avoids by writing to the DOM directly. The opacity rule itself is `[opacity:var(--pop-progress,0)]` on the wrapper, so a card this never runs for (desktop) still renders correctly at `0`.

**`closeness` reaching `0` at exactly one `step` (not half a step) is what makes the outgoing and incoming card's own values always sum to `1`** — at `distance = 0` a card reads `1` (dead centre); by the time an *adjacent* card reaches its own `0` (i.e. this card is now a full step away, the adjacent one is the new centre), this one has linearly reached `0` too. Meeting exactly at `0.5` each halfway between two cards is a direct consequence of the same linear formula, not something tuned separately.

**Two real bugs found via direct opacity sampling through a slow drag before this actually worked, both regressions this pass itself introduced against the entry below, not pre-existing:**

1. **`group-data-[popped=true]:opacity-100` — the *existing* discrete pop rule this wrapper already carried — fought the new continuous value.** `data-popped` only flips at the exact instant `centeredId` changes, so it pinned the *outgoing* card's Quick View at a flat `1` for nearly the entire drag (overriding a steadily falling `--pop-progress` underneath it) and then jumped the *incoming* card straight to `1` the moment it won, rather than letting either fade smoothly — confirmed directly: sampling every card's opacity through a slow synthetic drag showed one value sitting at `1.00` unmoving for nine consecutive samples, then snapping. Removed from the Quick View wrapper specifically; still exactly what drives the article's own border/scale/lift pop, unrelated and untouched.

2. **A plain `transition-opacity duration-300` cannot track a value that changes every ~16ms — it visibly lags behind instead.** A CSS transition always animates toward whatever target it was *last* given; retargeting it every animation frame during a drag means it is perpetually chasing a moving goalpost and never catches up, which read as mushy and delayed rather than glued to a finger. Fixed by scoping the transition itself to `[@media(hover:hover)]:transition-opacity` — present (and still smooth, exactly as before) on a pointer device where the trigger really is a discrete flip (`:hover` on/off), absent on a touch device, where the continuous value now applies with nothing fighting it.

Verified via direct opacity sampling, not just eyeballing: sampling every visible card's opacity through a slow drag now shows a monotonic crossfade where the outgoing and incoming values sum to exactly `1.00` at every sampled step (`1.00`/`0` → `0.90`/`0.10` → `0.80`/`0.20` → … → `0.50`/`0.50`); after a full swipe settles, exactly one card reads `1` and every other reads `0`. Desktop hover reconfirmed unaffected — mid-transition reads a genuine in-between value (`~0.70`) on the way to `1`, the same smooth 300ms fade as before this pass; the catalogue grid's own, unrelated Quick View (both its scroll-triggered touch reveal and its desktop hover) reconfirmed untouched, since this only edited `FeaturedCard`'s two branches. `npx tsc --noEmit`, `npm run build` clean; `npx eslint` unchanged from the entry below (same pre-existing findings, plus the same already-accepted `isPopped`-unused warning on `ProductCard.tsx` already on record from earlier entries).

### 2026-09-01 (featured products, follow-up) — The peek-centring math itself was wrong from card 1 on; fixed by measuring the real rendered card instead of assuming a percentage

**Client, immediately after the entry below shipped, from a real phone: "Yes the swipes work as intended but the cards are not centered after the first card."** `correctCardStep`'s settle-timer was forcing every rest position back to a `scrollLeft` that ignored `scroll-padding-left` entirely — genuinely undoing the centring from the entry below on every single swipe, not a rendering glitch. Card 0 happened to look fine regardless (nothing to peek before it, so the bug's own error term is invisible there), which is exactly why only "after the first card" showed it.

**First fix attempt (subtracting the padding at all) was still wrong, for a second, different reason** — `parseFloat(getComputedStyle(el).scrollPaddingLeft)` on a percentage value returns Chrome's own literal `"9%"` string, not a resolved pixel figure; `parseFloat` silently read `9`, not the true value. Read `el.clientWidth * 0.09` directly instead — and this was *also* wrong, just less obviously: `w-[82%]` on the card resolves against the track's own **content box** (`clientWidth` minus its `24px`-a-side padding), not the bare `clientWidth` a percentage on `scroll-padding-left` resolves against, so `9%` never was half of the true peek to begin with. Measured directly on a real settle: a `35px` left peek against a `74px` right one, where symmetric would be `~55px` each.

**Fixed by measuring the actual rendered card, not deriving a percentage from its class.** A new `measureHalfPeek` reads `(clientWidth − firstCard.getBoundingClientRect().width) / 2` straight off the DOM — correct for whatever the card's real width computes to, regardless of the padding/percentage relationship producing it, so nothing here needs updating if `82%`, `px-6`, or the gap ever change independently again. Applied as an **inline** `scroll-padding-left` (not a CSS class) in a new `useLayoutEffect`, since the value is only knowable after layout, not derivable as a fixed CSS percentage at all; cleared to `""` at `sm` and up so the untouched `sm:`/`lg:` CSS rules take back over (an inline style always wins over a class, so leaving one behind would have silently overridden them). **Declared as a `useLayoutEffect`, and before the existing "opens at `oneSet`" layout effect in source order** — a plain `useEffect` here would apply the padding only after that mount-time jump had already read whatever `scroll-padding-left` was in effect (the `.hscroll` default), landing the opening card off-centre until the next resize happened to fix it; React runs same-type effects in declaration order, so this one has to run first to have any effect on that one. `correctCardStep` now shares this same `measureHalfPeek` rather than its own separate (and separately wrong) calculation.

Verified via real geometry, not just alignment ratios: card 1 (mount) reads `{left: 54.5, right: 55.1}`; after two further swipes, `{left: 54.9, right: 54.6}` then `{left: 54.4, right: 55.2}` — symmetric within a pixel of rounding noise every time, screenshotted to confirm visually too. One decisive swipe still moves exactly one card (`0.999` of a step). Desktop unaffected: card width still exactly `387px`, the inline style itself reads empty (`""`) at that width so the CSS `sm:`/`lg:` values are genuinely in control, and the vertical-wheel-scrolls-the-page safety property still holds. `npx tsc --noEmit`, `npm run build` clean; `npx eslint` unchanged from the entry below (same two pre-existing findings).

### 2026-09-01 (featured products) — Mobile swipe becomes `snap-mandatory` with its own settle-timer, so a swipe always fully commits to one card; the autoplay interval restarts after a swipe instead of keeping its old phase

**Client, with a screenshot showing two cards half-visible mid-scroll:** "In mobile view i want one swipe and the next card to come in featured products, like in how images are swiped in product details. The cards should be at the centre. After swipe the timer should be reset. It should not swipe like this and both cards are visible unless i fully swipe across."

**Below `sm`, the track is `snap-mandatory` now, not `snap-proximity` — everything from `sm` up is untouched.** `proximity` was chosen deliberately for this row (see the component's own note, further up) specifically because `mandatory` was found to grab a wheel/trackpad gesture that carried even a little incidental horizontal noise, breaking vertical page-scroll over the row on desktop. That risk is wheel-specific, not touch-specific — a real finger swipe locks onto one axis early in the gesture the way a mouse wheel's per-tick deltas do not — and `product/ProductMedia`'s own per-card image gallery already relies on exactly this same `mandatory` + touch pairing safely. `snap-x snap-mandatory sm:snap-proximity` scopes the change to mobile only, the same way the card width/`scroll-padding-left` centring from the entry below already is.

**A new `correctCardStep`, sharing the existing settle-timer rather than adding a second one** — forces the rest position to the nearest exact card-step multiple, mobile only (`window.innerWidth < 640`, checked in JS since this isn't itself a CSS rule). `snap-mandatory` alone still is not perfectly reliable on its own (the exact lesson already on record for `ProductMedia`'s gallery: the browser's own snap resolution does not always land on the true target from every gesture shape) — this is the same fix, reusing `measureStep` and firing from the same `120ms` timer `correctSeam` already uses, right after it, not a competing second timer. Uses `scrollTo`, not a raw `scrollLeft` write, deliberately — `correctSeam`'s own raw writes are what produced the 12px mount-time reassertion noise documented in the entry below; an animated `scrollTo` does not have that problem, which is also why `ProductMedia`'s settle-timer already uses it.

**"After swipe the timer should be reset."** A new `swipeResetSignal` counter, bumped inside the same settle-timer callback (mobile only) once a gesture has genuinely stopped, sits in the autoplay interval effect's own dependency array — bumping it tears the interval down and rebuilds it, which is the only way to actually restart a `setInterval`'s phase. This is a deliberate, one-off exception to that same effect's own established rule of never doing this for hover-pause (documented at length in its own comment): a manual swipe and an autoplay tick landing on the same card moments apart reads worse than the interval's phase drifting by the ~120ms its own settle-timer already takes. Fires unconditionally on every settle, autoplay's own ticks included — harmless there, since each tick already produces its own settle a moment later regardless, so the interval simply keeps re-arming itself on a roughly-3.1s cadence either way.

Verified: a short/soft touch-drag (well under half a card) now settles back to `0.000` steps from its start — never a lingering half-and-half view; a decisive full-distance drag settles at exactly `1.002` steps forward and stays there; a mid-distance, lower-velocity synthetic swipe (a known source of CDP touch-simulation gesture-shape variance already on record elsewhere in this file) sometimes reverted rather than committed forward, matching real scroll-snap-mandatory behaviour (a genuinely ambiguous drag can resolve either way) rather than a new bug; desktop (`sm` and up) confirmed unaffected directly — `scroll-snap-type` still resolves to plain proximity, a vertical mouse-wheel gesture over the row still scrolls the page and leaves the row's own `scrollLeft` untouched, card width is still exactly `387px`, and the arrow button still steps by one card. The autoplay-restart mechanism confirmed via a temporary log that the interval-creation effect genuinely re-runs after a swipe, not only at mount (removed before shipping). `npx tsc --noEmit`, `npm run build` clean; `npx eslint` shows the same two pre-existing findings on this file already on record in earlier entries (`set-state-in-effect` on the `hoverCapable` effect, `exhaustive-deps` on the autoplay interval effect — the latter's dependency array gained `swipeResetSignal` this pass but the finding itself is unchanged).

### 2026-09-01 (home, featured products) — Hovering the Quick view button now pauses the belt too, not only after it's clicked

**Client: "in featured product when i point the mouse on the quick view its should not scroll to right automatically, it should stop autoscrolling to right, when it not pointing to quick view then its can autoscroll."** `modalPausedRef` already stopped the belt while the Quick View modal was open, but that only starts *after* the click — hovering the button beforehand, deciding whether to click it, had no effect, and the belt could carry the card away mid-decision.

Reused the existing footer-hover pause mechanism rather than adding a second one: `product/ProductCard`'s Quick view button wrapper (both the `FeaturedCard` branches — with and without an image) now also carries `data-featured-quickview`, and `home/FeaturedProducts`' `isOverFooter` scans for that alongside `data-featured-footer` in the same point-in-rect pass. Same `hoverPausedRef` skip-this-tick behaviour as the footer row, so leaving the button resumes the belt on its original cadence rather than restarting a fresh 3s. Also dropped a stray debug `console.log` left in `FeaturedCard`'s (with-image) Quick view `onClick` from an earlier pass, unrelated to this fix but in the same handler.

Verified: hovering the Quick view button on a featured card stops the belt advancing; moving off it (without clicking) resumes autoplay; clicking it still opens the modal and pauses via the existing `modalPausedRef` path; the footer row's own pause is unaffected. `npx tsc --noEmit` not run in this session (no local Node toolchain available) — change is additive to an existing, already-verified point-in-rect scan and introduces no new types.

### 2026-09-01 (products catalogue, card gallery) — Tapping a card's own photo did nothing; the vertical card's image wrapper now navigates itself

**Client: "when i click on the image of product in the product page its not taking to the that product page."** The 2026-08-31 entry below elevated this wrapper to `relative z-20` so the arrows/dots/swipe track would win against the title `Link`'s stretched `after:absolute after:inset-0` hit area — but that elevation is unconditional, not just for those controls: it puts the whole image wrapper *above* the link's pseudo-element at every point over the photo, including the plain area none of those controls cover. A tap there had nothing left under it to navigate; only a tap that landed on the title text still worked.

Fixed with an `onClick` on that same wrapper, calling `router.push(`/products/${product.slug}`)` directly rather than re-plumbing a `Link` around the gallery track — the arrows, dots and Quick View button all already `stopPropagation` before this would see the event, so none of them start double-navigating, and a genuine swipe never fires a click at all (same browser behaviour `goToImage`'s own comment already relies on: a drag that moves the pointer suppresses the click that would otherwise fire at release). `HorizontalCard` and `FeaturedCard` were not touched — neither elevates its image wrapper above its own stretched link, so neither had this bug.

Verified: clicking the plain image area on a catalogue card (`/products`) navigates to that product's detail page; clicking an arrow or a dot still only changes the visible photo; clicking Quick View still only opens the modal; a real swipe still pages the gallery without navigating away mid-drag. `npx tsc --noEmit` clean.

### 2026-08-31 (home carousels; catalogue grid) — Featured products/Recently viewed cards centre with peeking neighbours on mobile; Quick View reveals on scroll visibility, not just hover; a pre-existing `group-` selector bug fixed along the way

**Client, one message:**
> "Similar to how w implemented image scrolling in product cards. I want to implement scrolling or swipe in mobile view for featured product cards and recent viewed cards. I want the product cards to be centered and not to the left in mobile view, its fine if borders of the previous and next card are visible. Also one swipe should bring me the next card. Also when i swipe and next card apeears to the centre near 50% or something i want the quick view button to appear at the centre like an animation like in what we make the 3 category cards appear when we scroll down right. Similarly the quick view button becomes visible when i swipe and goes away in same way when i swipe next or previous. SImilarly in mobile view in all products page when i scroll down in all products page, i want the quick view button to appear when the card is 50% or something visible same as in how we implement it in featured product cards. But i want the quick button to show as it shows in all products at the bottom part of the image in all products page and at the centre in featured product cards section"

**Found, before writing anything, that the "appear on 50%-visible/centred" mechanism the client was describing already existed and was already wired up — it just didn't work.** `FeaturedProducts`/`RecentlyViewed` already compute a `centeredId` (touch fallback for `poppedId`, driving `data-popped` on the card's `<article>`), and `FeaturedCard`'s own Quick View wrapper already carried `data-[popped=true]:opacity-100` specifically to reveal on that state. But that selector targets the wrapper's *own* `data-popped` attribute — the wrapper never has one, only its ancestor `<article>` does — so it silently never matched; only `group-hover:opacity-100` (real hover) ever did anything. Fixed to `group-data-[popped=true]:opacity-100` (the `group` marker was already on the ancestor `<article>`) in all three places this exact bug existed: `ProductCard`'s vertical, `FeaturedCard`'s no-image branch, and `FeaturedCard`'s main branch. This alone made the client's "appears at the centre… like an animation" request mostly already true, once the swipe-to-centre geometry below made the underlying `centeredId` reflect what a visitor actually sees.

**Mobile cards now centre via `snap-start` + `scroll-padding-left`, not `scroll-snap-align: center`** — tried `snap-center` first, on the same "should just work" reasoning `FeaturedProducts`' own change log already warns against for a *different* reason (the `snap-center`→`snap-start` note further down, kept from an earlier pass). It broke worse here: `correctSeam`'s entire `oneSet`-based wrap-around math assumes a raw `scrollLeft` write lands on a valid snap point untouched, true under `snap-start` (a card's own left edge is always one) but false under `snap-center` (valid points are offset by the peek amount, so a `oneSet` write gets silently reasserted somewhere else, confirmed directly landing a full extra `oneSet` away) — reproduced as a real, deterministic bug via repeated touch-drag simulation (a swipe meant to move about half a card instead measured `-7` to `-7.45` card-widths, consistently, `git stash`-compared against the untouched original to confirm it was not a test artifact). Reverted to `snap-start` and achieved the same *visual* centring by giving the track `scroll-padding-left: 9%` (`FeaturedProducts`, 82%-width cards) / `4%` (`RecentlyViewed`, 92%-width cards) on mobile only — half of each side's own peek amount, computed from the card's own width so a `snap-start`-aligned card's left edge lands with equal space either side. `sm:`/`lg:` keep their existing, untouched scroll-padding values; this is mobile-only.

**`correctSeam`'s safety margin grew from `4` to `40`, on `FeaturedProducts` only** (`RecentlyViewed` has no looping/seam machinery to need one) — the *same* raw-write-gets-reasserted behaviour, in a smaller and survivable form, still applies to `snap-start` once nonzero `scroll-padding-left` is introduced: the mount effect's `el.scrollLeft = oneSet` write was confirmed landing 12px short (`2436` → `2424`) rather than exactly on target, which is more slack than the original `4`px margin (tuned for a near-zero-padding track) tolerated — just enough to make `correctSeam`'s own settle-timer misread a 12px rounding gap as "at the true edge," firing a spurious full-`oneSet` jump immediately after every mount with no gesture involved at all. `40` comfortably covers the observed noise while staying tiny next to `oneSet` (hundreds of pixels), so it cannot start misreading the genuine middle of the row as an edge.

**The catalogue grid (`ProductCard`'s vertical orientation) gets its own, new `IntersectionObserver`** — nothing here to reuse from the home carousels, since a vertical page-scroll grid has no "one active card" concept the way a horizontal carousel does; each card independently reveals its own Quick View once **that card** crosses 50% visible (`threshold: 0.5`), gated on the same `!hoverCapable` split `FeaturedProducts`/`RecentlyViewed` already use so a desktop visitor's hover-only behaviour is completely unchanged. Kept at its existing bottom-of-image position rather than moved to centre — the client asked for the two surfaces to differ exactly this way ("at the bottom part of the image in all products page and at the centre in featured product cards section").

Verified: a real touch-drag swipe on `FeaturedProducts` mobile now reproducibly moves exactly one card (`1.002`/`1.001` of a step across repeated runs, matching the untouched original's own precision); the centred card visibly shows peeking neighbours on both sides (screenshotted); Quick View correctly follows the swipe to the newly-centred card and away from the old one; the same centring/one-swipe/Quick-View-follows behaviour holds on `RecentlyViewed`; on `/products`, a card's `data-inview`/Quick View opacity flips from `0`→`1` exactly at the 50% visibility boundary (measured `0.49` visible → hidden, `0.57` visible → shown) and stays hover-only, unchanged, on a non-touch context; desktop's 3-up belt (`387px` cards) and arrow navigation are unaffected on both carousels. `npx tsc --noEmit`, `npm run build` clean; `npx eslint` shows the same pre-existing `set-state-in-effect`/`exhaustive-deps` findings already on record for `FeaturedProducts`/`RecentlyViewed` (confirmed via `git stash`), plus one new instance of the identical, already-accepted `set-state-in-effect` finding on `ProductCard`'s own new `hoverCapable` detection — the same established idiom, not a new pattern.

### 2026-08-31 (products catalogue, follow-up) — Mobile filter panel reverts to the partial-height sheet; only "Search" closes the panel again

**Client, immediately after the entry below shipped: "I want the previous filter in mobile view and not full page. Also lets only have search close the panel."** Two of that entry's four changes reversed the same day; the desktop left-anchored overlay and the four-column grid were not mentioned and stayed as shipped.

1. **Mobile panel is `max-h-[85vh]`/`rounded-t-2xl`/bottom-anchored again**, not the `inset-0` full-screen version from the prior pass. Confirmed via bounding box: reads `{x:0, y:547, width:390, height:297}` on a 390×844 viewport — clearly a partial sheet with the dimmed page visible above it, not corner-to-corner. The `lg:` override (`lg:right-auto lg:w-96`, pinned left, full height) is untouched — still reads `{x:0, y:0, width:384, height:<viewport>}` on desktop, unaffected by this revert.

2. **"Clear" no longer closes the panel** — back to resetting the URL only, same as every pass before the prior one. Only "Search" (plus Escape and the backdrop) closes it now.

Verified: mobile panel bounding box confirms the partial sheet is back; clicking "Clear" resets filters (`/products`) but the panel stays mounted, on both mobile and desktop; clicking "Search" still closes it; desktop's left-anchored `384px` panel and the four-column `xl` grid from the entry below are both unchanged. `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean.

### 2026-08-31 (products catalogue) — The permanent desktop rail is gone; one overlay filter panel at every width, over the grid rather than beside it; results grid goes to four columns

**Client, one message:**
> "I want the filter button same in all view modes next to the search bar in mobile view, In case of mobile view the filter extends from bottom of the page to the top right. Similarly in desktop view the filter to extend from left. But it should not push the product cards but be displayed over it on the left side. When we click search or clear button the filer goes away. Then instead of 3 cards in a row in desktop view lets have 4 cards in a row."

**Removed the `lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]` split and its permanent `<aside>` rail entirely.** That layout was the previous design's whole reason the results column had less than the full page to work with — the rail was a real grid column, always rendered from `lg` up, reserving 14rem plus a 3rem gutter beside the cards. "It should not push the product cards but be displayed over it" is a structural instruction, not a styling one: the rail could not become an overlay without stopping being a grid column first. `ProductCatalogue`'s outer element is a plain `<div>` now; the results block is the only column there is at any width.

**One "Filters" trigger, unconditional now — it used to be `lg:hidden`, existing only because the rail already covered desktop.** With the rail gone, the same button that opened the mobile bottom sheet is the only way to reach the filter tree at every width, sitting next to the search input exactly where it always did on mobile ("filter button same in all view modes next to the search bar").

**The overlay panel is one element with two shapes, not two components** — below `lg` it is `absolute inset-0` inside a `fixed inset-0` wrapper, corner to corner ("the filter extends from bottom of the page to the top right" — full-screen, not the previous `max-h-[85vh]` rounded sheet that left a gap at the top); at `lg` and up, `lg:right-auto lg:w-96` is the only override — pinned to the left edge, full height, a fixed 384px width with the rest of the viewport, and the grid under it, visible and dimmed past its right edge ("in desktop view the filter to extend from left"). The full-screen `<button>` backdrop behind it is unconditional too: real, clickable space on desktop next to the narrower panel; simply covered edge-to-edge and unreachable on mobile, which costs nothing since Escape and the panel's own buttons remain.

**"Clear" now closes the panel, not just "Search."** Previously only "Search" called `setFiltersOpen(false)`; "Clear" only reset the URL params, leaving the sheet open on an now-empty filter state. Per "When we click search or clear button the filer goes away," `onClick` on Clear now does both in sequence — reset, then close — matching what "Search" already did.

**Results grid: `xl:grid-cols-[repeat(3,...)]` → `repeat(4,...)`, same breakpoint, same `minmax(17.5rem,1fr)` card floor.** Not an arbitrary bump — with the rail gone, the grid no longer loses 14rem plus a 3rem gutter to it, so the same `xl` width that used to just fit three cards beside a rail now fits four without one. The `sm` (2-column) tier was left unchanged; only the desktop tier was asked to change.

Verified: desktop shows four cards per row at `xl`; the "Filters" button opens a left-anchored, full-height, `384px`-wide panel with the grid visible and dimmed to its right, confirmed by reading its own bounding box (`{x:0, y:0, width:384, height:<viewport>}`); on a 390px mobile viewport the same panel's box reads `{x:0, y:0, width:390, height:844}` — genuinely full-screen; selecting a filter then clicking "Search" closes the panel with the URL already updated; clicking "Clear" resets the URL to `/products` and closes the panel; Escape closes it; clicking the backdrop past the panel's right edge closes it on desktop; no horizontal overflow at 390px or 1440px, open or closed. `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean.

### 2026-08-31 (featured products pause button; header nav) — Pause button gets square corners; primary nav goes uppercase and gains a Home link

**Client, one message, two unrelated tweaks: "Lets make the pause button in featured product have square boundary instead of round. Also lets Products, About Us and Contact Us all capital letters. Also add HOME button before PRODUCTS."**

1. **`FeaturedProducts`' `PageButton` (the pause/play control) drops `rounded-full` for `rounded-sm`** — not `rounded-none`: `ui/Button`'s own default corner is `rounded-sm` (2px), the same "bordered rectangle, no radius beyond 2px" convention already on record for this site's other chrome (`ProductCard`'s own note), so this matches existing precedent rather than introducing a third corner treatment. `ArrowButton` beside it is untouched — it was already deliberately bare chevrons with no boundary at all, a different, already-settled design decision from an earlier pass.

2. **`content/nav.ts` gains a `{ href: "/", label: "Home" }` entry, first in `primaryNav`**, and every place that renders those labels (`Header`'s desktop nav, its mobile drawer, both of `ProductsMenu`'s own "Products" renderings — the trigger button and its empty-catalogue plain-link fallback) gets `uppercase` added to its className. Labels themselves stay Title Case in the data (`"Home"`, `"Products"`, `"About Us"`, `"Contact Us"`) — the capitalisation is a CSS `text-transform`, not a data change, so the accessible name read by assistive tech is unaffected.

3. **Home could not simply be prepended to the array and left to `primaryNav.map`** on the desktop nav specifically, unlike the mobile drawer (which already renders every entry through one plain `.map`, so reordering the array alone was enough there). Desktop renders `<ProductsMenu>` as a hardcoded first `<li>`, with the rest of `primaryNav` mapped as plain links afterward and `/products` filtered out of that map to avoid a duplicate — `ProductsMenu` is a whole separate component with its own trigger markup, not one of the mapped links. Placing Home before it required rendering the `href === "/"` entry from `primaryNav` explicitly ahead of `<ProductsMenu>`, then extending the trailing map's filter to exclude both `/products` and `/`. `isActive("/")` already existed and already special-cases an exact match rather than `pathname.startsWith("/")` (which would otherwise mark Home "active" on every page, since every path starts with `/`) — pre-existing code, not new for this.

Verified: desktop header reads `HOME  PRODUCTS ▾  ABOUT US  CONTACT US` in that order, all uppercase; Home is the active/underlined link on `/` and correctly not active on `/products` (where Products becomes active instead, unchanged); clicking Home navigates to `/`; the mobile drawer shows the same four entries, same order, same capitalisation; the pause button's `border-radius` computes to `2px`. `npx tsc --noEmit`, `npm run build` clean; `npx eslint` shows the same two pre-existing findings in `FeaturedProducts.tsx` (a `set-state-in-effect` and an `exhaustive-deps`) already on record in earlier entries, confirmed unchanged via `git stash` — nothing new introduced by either tweak.

### 2026-08-31 (product galleries, follow-up) — `.hscroll`'s shared `scroll-padding-left` was silently offsetting native snap in both galleries; cancelled with `scroll-pl-0`

**Client: "When i scroll or drag only that image should be visible, it should also be centred. Currently i can see the edge of the previous image on the 2nd image and also it is not centered."** Root cause traced to a shared utility rather than anything specific to the gap added in the entry below. `.hscroll` (`globals.css`) sets `scroll-padding-left` — `1.25rem` by default, `1.5rem`/`2rem` at larger breakpoints — tuned for a *different* track shape elsewhere on the site, one with a deliberate peek of the next card. Both product galleries reuse `.hscroll` for the scrollbar-hiding rule it also carries, and that padding came along with it unnoticed: `scroll-snap-align: start` aligns a slide's start edge with the scrollport edge *plus* `scroll-padding-left`, not the scrollport edge itself, so a real swipe's native snap resolution was landing with the previous slide's own trailing 20–32px still inside the viewport — exactly "the edge of the previous image" — before the settle-timer's own correction pulled it the rest of the way a moment later. That second, visible correction is what made it read as a real bug rather than an imprecise final position: confirmed directly by sampling `scrollLeft` every 100ms through a real touch-drag, which showed a two-phase motion (settle near the padding-offset position, pause, then a second animated jump to the true one) before the fix, collapsing into one smooth continuous motion straight to the correct position after it.

**Fixed with `scroll-pl-0` on both tracks, not by changing `.hscroll` itself** — the class is shared with other tracks that *do* want that padding for their own peek design, so overriding it locally on the two components that don't is the correct scope, not a global change. Tailwind's utility layer outranks the `components`-layer class `.hscroll` is defined in, so the override applies without any specificity fighting. The previous entry's reasoning ("nothing here needs `scroll-padding-left`... there is nothing to peek at either side") was directionally right but incomplete — it assumed the padding simply wouldn't matter without the track's own scroll-snap math accounting for it, rather than confirming that directly; this pass corrects the claim in the component doc comment to state what was actually verified.

Verified: `getComputedStyle(track).scrollPaddingLeft` reads `0px` on both galleries; a real touch-drag swipe on the product detail page, its Quick View copy, and the catalogue card all now settle in one continuous motion with no visible previous-slide edge and no second corrective jump, confirmed via a rest-state screenshot on both the detail page and the catalogue card; arrows, dots, and thumbnails all still land exactly on target (`clientWidth + gap`) with no regression; card-title navigation still works, unaffected. `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean (same pre-existing `isPopped` warning as every entry above).

### 2026-08-31 (product galleries) — A `gap-x-3` separates slides while dragging, in both `ProductMedia` and the catalogue card gallery, replacing `ProductMedia`'s per-slide border

**Client: "The images should be separate and when i drag and do not add borders to the image."** Confirmed scope directly rather than guessing: applies to both galleries — the product detail/Quick View gallery (`product/ProductMedia`) and the catalogue grid card's own gallery (`ProductCard`) — and the fix is a small gap between slides, not a border on either photo. `ProductMedia` already had a `border border-line` around each slide from an earlier pass; two adjacent borders touching mid-drag read as one seam rather than two distinct images, which is what prompted "do not add borders" as an explicit constraint on the fix rather than an afterthought. Removed that border and added `gap-x-3` to the track instead, showing a thin strip of the page's own background between photos while dragging. `ProductCard`'s own gallery had no border to remove, just the same `gap-x-3` added.

**Every place that treated `clientWidth` alone as the distance between one slide and the next had to change to `clientWidth + gap`.** Both galleries follow the "one slide is exactly the track's own width" idiom on record below, which depended on there being zero space between slides; introducing a gap breaks that unless the step math accounts for it. Updated in both components: the active-index read in `sync`/`gallerySync`, the settle-timer's nearest-multiple correction, `goTo`/`goToImage`, and (`ProductCard` only) the hover-pop resize correction, which already had its own live-clientWidth-based target and needed the same `+ gap` added. The gap itself is a hardcoded constant (`SLIDE_GAP` / `GALLERY_GAP`, `12`, matching `gap-x-3`) in each component rather than read back from the DOM — native `snap-start` resolves correctly regardless, since it snaps to each child's actual rendered position; only this component's own JS math needed telling about it explicitly.

Verified: a real touch-drag mid-gesture screenshot on both galleries shows a clear gap between the current and incoming image, no border on either; the settle-timer still lands exactly on the new, larger step in both components (measured `588px`/`362px`/`379px` against a computed `clientWidth + 12`, matching in the detail page, its Quick View copy, and the catalogue card respectively — one early reading landed 4px short at 600ms and settled to the exact value by 600–750ms once fully re-measured, the same synthetic-touch-timing looseness already on record elsewhere in this file); arrows, thumbnails and dots all still land exactly on target with no accidental navigation. `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean.

### 2026-08-31 (products catalogue, card gallery, second follow-up) — The dots' pill background is gone; smaller, green

**Client: "I only want dots no boundary on them, also make it smaller and let it have green."** Removes the `bg-black/35` pill from the entry directly below, on the same day it shipped — each dot button is now its own `pointer-events-auto` island straight on the positioning strip, with nothing drawn behind them at all, no background shape left to be a "boundary."

**Legibility on a plain dot with no pill behind it still needed solving** — this shop's photography is mostly light studio shots, and a bare dot with no backing can vanish against one. Kept as a fine `shadow-[0_0_1px_rgba(0,0,0,0.6)]` on each dot itself rather than reintroducing any background: a soft dark edge around the mark, not a visible box, satisfying "no boundary" while the dots still read on a light photo.

**Colour is the hardcoded light-mode accent green (`#23703d`)**, not the `bg-accent` token — same reasoning as the arrows already on record: this sits on a product photo unrelated to the site's own light/dark theme, and the token itself resolves to a different, lighter green in dark mode with no connection to what's under it here. The inactive dot is the same green at lower opacity (`/45`) rather than a separate grey, so the whole indicator reads as one green mark, per "let it have green," not just the active one.

**Smaller across the board**: mark height `h-1.5` → `h-1`, active width `w-4` → `w-3`, inactive `w-1.5` → `w-1`; the button hit area shrank correspondingly (`h-5 w-4` → `h-4 w-3`) since a hit area much larger than a now-tiny mark would just be dead space around it.

Verified: no background box behind the dots at any zoom; a dot click still moves the track exactly one slide, updates `aria-current`, and does not navigate; the mark is visibly green and reads clearly against this shop's demo photography at 3x device-scale zoom. `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean (same one pre-existing `isPopped` warning as both entries below).

### 2026-08-31 (products catalogue, card gallery, follow-up) — Dots move from a row below the image onto the image itself

**Client: "The dots should not be seperate row but on the image itself at the bottom."** The entry below shipped the dots as their own `border-b`/`bg-surface-raised` row between the image and the text block — reasonable given they were modelled on `home/FeaturedProducts`' own dot row, which really is a separate row (below a whole carousel of cards, not one photo). Per-card dots are a different fit: moved inside the image wrapper as an `absolute bottom-2` overlay, centred, `z-20` for the same stretched-link reason as everything else in this box.

**The overlay sits inside a small `bg-black/35` pill instead of bare dots on the photo**, and the dots themselves are white rather than the page's `bg-accent`/`bg-line-strong` tokens the row version used. Both choices trace to the same fact: this is now sitting on top of a product photograph, not the card's own background — this shop's photography is mostly light studio shots, and plain `bg-line-strong` dots (or accent, which is a dark green in light mode) would wash out against a light photo the way they never could sitting on the page's own surface colour. The pill guarantees contrast regardless of what's in the photo underneath, the same reasoning already on record for why the arrows are hardcoded rather than theme tokens.

**The outer positioning strip is `pointer-events-none`; only the pill inside it is `pointer-events-auto`.** The strip spans the image's full width so the pill inside can stay centred at any dot count, but a full-width absolutely-positioned strip at `z-20` sitting over the swipeable track would otherwise block a swipe or tap started in the empty space either side of the visible pill — the same class of interception bug as the two above, caught the same way, before it shipped rather than after.

**The hover-revealed Quick View button had to move to make room.** Both it and the new dots overlay are bottom-anchored and horizontally centred over the same image, so on a multi-photo card the two would sit on top of each other whenever a visitor hovered — confirmed directly via a hover screenshot before adjusting anything, rather than assumed from the class names. Fixed by conditionally raising Quick View to `bottom-10` only when `product.images.length > 1` (i.e. only when the dots pill actually renders); a single-photo card has nothing to clear and keeps the original `bottom-4`.

Verified: dots render as a white-on-black pill over the image, not a row below it; a dot click still moves the track exactly one slide and updates `aria-current`, with no accidental navigation; a hover screenshot confirms Quick View now sits fully above the dots pill with no overlap; a single-image product renders no dots and keeps Quick View at its original position. `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean (same one pre-existing `isPopped` warning as below).

### 2026-08-31 (products catalogue, card gallery) — `ProductCard`'s vertical orientation gets its own arrows/swipe/dots, reusing `ProductMedia`'s gallery idiom; two stretched-link interception bugs and a hover-pop resize interaction found and fixed along the way

**Client: "Also in all products page lets have left and right buttons on the product cards as well to scroll. In mobile view i also want swipe scrolling as well on product card to view the next and previous image. Lets have dots below the image to indicate how many iages we have and it should move when swipe or toggle like in featured product section."** Scoped to the `/products` catalogue grid's vertical/plain card orientation only — `HorizontalCard` and `FeaturedCard` were not mentioned and were not touched. The vertical branch is not its own named function the way those two are; it is `ProductCard()`'s inline fallthrough case, and the file already has a precedent for this (`isQuickViewOpen` is declared unconditionally at the top of `ProductCard()` even though only the vertical branch uses it, since the other two branches return early). The new gallery state/refs follow that same placement rather than introducing a fourth named function for a structural cleanup nobody asked for.

**Same "one slide is exactly the track's own width" idiom as `product/ProductMedia`, including its settle-timer** — a bounded `snap-x snap-mandatory` track, `snap-start` (not `snap-center`, for the same rounding-precision reason already on record in that component's own entry below), and a settle-timer armed on every `scroll` event that corrects to the nearest exact multiple of `clientWidth` once scrolling genuinely stops. This is the third place this exact pattern now lives in this codebase (`FeaturedProducts`' `correctSeam`, `ProductMedia`, now this), each one independently re-deriving the same lesson before this pass finally reused it outright.

**Two rounds of the same stretched-link interception bug, both fixed the way the file's own Quick View button already is.** This orientation's whole `<article>` is one link end to end — the `Heading` link's `after:absolute after:inset-0` reaches the entire card, not just its own text, because the article itself is `position:absolute` and that is the pseudo-element's containing block. Anything without its own `z-index` loses to that pseudo-element under plain DOM-order stacking whenever it sits *earlier* in the article than the text block the link lives in — which the whole image area does. First found on the new dot row (`locator.click()` reported the link's own `after:inset-0` subtree intercepting the click) and fixed with `relative z-20`, matching the arrows and Quick View button already using that exact class for the identical reason. Then found again, more seriously, on the image wrapper itself via mobile touch testing — `document.elementFromPoint()` at a touch-start coordinate over a plain part of the image returned the link's `<a>`, not the `<img>`, because only the arrows nested inside the wrapper had been elevated, not the wrapper (and the scrollable track inside it) as a whole. Fixed by giving the wrapper div itself `z-20` — it was already `position:relative`, so this needed no other change — which covers the track and everything nested in it as one unit instead of needing the fix repeated per element.

**A third, more subtle bug: this card's own hover-pop is a real layout resize, not just the `scale()` sitting next to it in the same class list, and a resize mid-gallery can leave `scrollLeft` misaligned.** `hover:-inset-x-2.5` (and `data-[popped=true]:-inset-x-2.5`) genuinely changes the `<article>`'s width — confirmed directly, the gallery track's own `clientWidth` measured 297px unhovered and 317px hovered, a 20px difference matching two `inset-x` steps exactly. A `scrollLeft` in absolute pixels does not update when the container it lives in resizes, so navigating to a slide while hovered (landing at, say, `1 × 317px`) and then moving the mouse away — the track shrinking back to 297px wide — leaves `scrollLeft` at a value that is no longer an exact multiple of the new, smaller slide width once there is a non-first, non-last slide for it to be off from: the same partial-slide sliver `ProductMedia`'s settle-timer exists to prevent, just triggered by a resize instead of a scroll. Reproduced directly (temporarily adding a third image to `demo-dol-starter` in the dev database, since no real product currently has more than two, then reverting it after): hovering, navigating to the middle slide, then moving the mouse away left the track at `317px` against a new `297px` clientWidth — a real, visible seam.

Fixed by giving the same `ResizeObserver` that already exists (previously wired straight to `gallerySync`, to keep the arrows'/dots' state fresh on resize) an additional job: re-pin `scrollLeft` to `knownActiveIndex × currentClientWidth` — a plain assignment, not an animated `scrollTo`, so it does not fight the CSS transition already producing the resize — whenever that product differs from the live `scrollLeft` by more than a pixel. The known-active-index is read from a ref updated inside `gallerySync` itself, not re-derived from `scrollLeft` at resize time, since `scrollLeft` is exactly the value in question. **This on its own briefly broke arrow clicks**, caught by the same verification pass that found the bug: clicking an arrow also triggers `:hover` first (Playwright, like a real mouse, moves the pointer to the target before clicking), so the pop's own resize events fire throughout the same smooth `scrollTo` the click just started, and an unconditional resize-correction stomped on it mid-flight. Fixed by having the resize handler skip its own correction whenever the scroll settle-timer is currently pending — a pending timer means a scroll is in flight or just ended, and that timer already re-reads a fresh `clientWidth` once it genuinely stops, so deferring to it there avoids the two corrections fighting over the same pixel. Confirmed both cases after the fix: an arrow click while hovered still lands exactly (`317/317`); the reproduced middle-slide-then-unhover case now re-pins to exactly `297` instead of drifting to `317`.

One pre-existing, cosmetic-only quirk was found and deliberately left alone rather than chased: while actively hovered, `scrollWidth` measures a few pixels wider than `clientWidth × imageCount` would predict (a vertical scrollbar transiently entering the box model under the hover-pop's own `h-fit` switch, unrelated to anything this pass added), which can leave the "Next" button briefly not visually disabled at the true last slide while hovering. The only consequence is a harmless no-op click (the browser clamps an out-of-range `scrollTo` to the same position it is already at) — chasing the root cause further would mean redesigning the senior's own pre-existing hover-pop system, well outside what this pass was asked to do.

Verified: arrows present and correctly disabled/enabled at each end; a click moves the track by exactly one live `clientWidth` regardless of hover state; dots render one per image, track the active slide via `aria-current`, and clicking one navigates to that slide; a real touch-drag swipe simulation lands exactly on the target slide (`348/348`, confirmed stable for 300ms+ after release, not mid-animation); a partial-distance drag correctly reverts to its starting slide rather than committing, matching native scroll-snap carousel behaviour; none of the arrow, dot, or swipe interactions navigate away from the page, while clicking the card's title still does. `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean (one pre-existing `isPopped`-unused-in-`HorizontalCard` warning, confirmed present before this change via `git stash`, unrelated to it).

### 2026-08-28 (product media, follow-up) — A settle-timer forces exact slide alignment; `snap-mandatory` alone was not enough

**Client, after trying the previous entry's fix: "Cant we implement like in amazon, where when we scroll only one image is visible at a time... the previous image is not visible."** The open caveat flagged at the end of that entry turned out to matter: a real touch drag past the midpoint measured settling — stably, confirmed by re-reading `scrollLeft` over several seconds, not mid-animation — 24–20px short of the true slide boundary, depending on viewport size. `snap-mandatory` was necessary but not sufficient; the browser's own snap resolution does not always land on the exact multiple.

**Fixed by reading where a scroll actually stops and correcting to the nearest exact multiple immediately after, rather than trusting the browser's snap alone** — a settle-timer, the same shape as `FeaturedProducts`' own `correctSeam`: armed on every `scroll` event, fires once 100ms passes with no further scrolling, and only then calls `scrollTo` if the rest position is off by more than 1px. Never mid-gesture, for the same reason that component's own timer never is — correcting while a touch drag is still in progress means fighting it.

**A custom touch-drag/`translateX` pager (dragging the image with the finger by hand, snapping via a JS-driven transform instead of native scrolling) was considered and rejected.** It would need to distinguish a horizontal swipe from a vertical page-scroll itself, in a `touchmove` handler, reliably enough to decide when to call `preventDefault()` — precisely the failure mode `FeaturedProducts`' own history documents at length for the equivalent wheel-event problem, including the specific finding that React's synthetic handlers cannot always call `preventDefault()` at all. The settle-timer gets the same visible result (always exactly one image at rest, `Amazon`-like) without touching how the scroll itself is produced, so none of that risk applies here.

Verified: the exact previously-measured discrepancy is gone — a single large synthetic scroll past the midpoint now settles at precisely `952px` (the true boundary) instead of `928px`; a real touch-drag simulation in a mobile-emulated context settles at precisely `350px` instead of the previously-measured `330px`; a short/soft swipe still correctly resolves to `0` (unchanged); arrow clicks and thumbnail clicks were re-verified landing exactly on their target slide with no regression from the added correction. `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean.

### 2026-08-28 (product media) — `ProductMedia` gains left/right arrows and a swipeable main image, shared by the product page and the new Quick View modal

**Context: a teammate's own commits landed directly on `main` since the previous entry** (pulled in via a plain fast-forward, no local divergence) — a `QuickViewModal` component, a nullable `price` column end-to-end, and a substantially reworked hover-pop treatment on `ProductCard`. That pop rework kept and then improved this project's own bidirectional seam-correction fix on `FeaturedProducts` (moved from two duplicated copies to three, giving more generous buffer in both scroll directions off the same `correctSeam` shape) rather than colliding with it.

**Client, next: "Lets implement scrolling of images in quick view and in product details page. I want a left and right toggle button to move to the next image or previous. Also in quick view just like in product details page show a small copy of the images below the full size image. Also in mobile view i want a scroll button and be able to swipe to the next or previous image in product details page."** `QuickViewModal` already rendered `product/ProductMedia` for its own gallery — the same component the product detail page uses — so the thumbnail strip "just like in product details page" was already true structurally; what neither surface had was arrow navigation or a swipeable main image, and fixing `ProductMedia` once covers both call sites rather than fixing each separately.

**A plain bounded `overflow-x-auto` track, one full-width slide per item — not a belt.** Every horizontal track on this site that loops forever (`FeaturedProducts`) does so because there is always more to discover; a product's own photo set is small and finite, with a real first and last image, so arriving at an end and stopping there is correct rather than a gap to route around. `.hscroll` is reused for the scrollbar-hiding rule it already carries; its `scroll-padding-left`, tuned for `snap-start` tracks with a deliberate peek of the next card, does not apply here — each slide is `snap-center` and exactly the track's own width, with nothing adjacent to peek at.

`active` is read back from `scrollLeft` on every scroll rather than tracked by hand — the same idiom every other scroll-driven carousel on this site already uses — so a native swipe past more than one image still lands the thumbnail row and both arrows' disabled state on whichever image a visitor actually stopped on, regardless of whether the arrow, a thumbnail click, or a raw swipe is what moved it.

**`priority` is `index === 0` only, not applied to every slide.** All images now sit in the DOM as siblings in one scrollable row instead of one being conditionally rendered at a time, and `priority` on all of them would eagerly preload every product photo regardless of whether a visitor ever swipes to see it — the exact regression flagged in the teammate's own `FeaturedProducts` change above (`priority={true}` on every belt card once it renders three copies), not repeated here.

Verified against `demo-dol-starter` (the only dev-database product with more than one image): arrows correctly disabled/enabled at each end; a click moves the track by exactly one `clientWidth`; the active thumbnail and both arrows' disabled state update correctly after an arrow click, a thumbnail click, and a wheel-scroll (a swipe's proxy in this sandbox); identical checks pass inside `QuickViewModal`'s own copy of the gallery, opened via a live "Quick view" button. No horizontal page overflow at 390px, arrows visible and clickable at that width. `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean.

**Local-only note, not a code change:** the pulled commits added a `price` column via `schema.sql`, which is a file, not a migration that runs itself — this session's own local dev database did not have it, and every product page 404'd (`column "price" does not exist`) until it was applied directly (`psql < src/lib/db/schema.sql`, idempotent, confirmed safe to rerun). Anyone else pulling this history needs the same step against their own database before testing product pages.

### 2026-08-27 (home, carousels, follow-up) — When everything fits, the row centres instead of hugging the start edge; `RecentlyViewed`'s cards stop stretching too

**Client, immediately after the entry below: "could you centre the featured product cards if they all fit when we zoom out, same for recent viewed do not stretch instead just fit and centre."** Two gaps in the previous pass, one per component:

1. **`RecentlyViewed`'s cards were still `lg:w-[calc((100%-2rem)/3)]`** — a percentage of the track's own width. `FeaturedProducts` had already been given a fixed `w-[387px]` specifically so its cards would stop growing as the newly full-bleed track widened; `RecentlyViewed`'s track went full-bleed the same day but its cards were left on the old percentage formula, which is exactly what "stretch" meant once there was more track to be a percentage of. Fixed the same way: `lg:w-[392px]`, measured directly as what the old formula already rendered at exactly 1280px (this page's own width ceiling before either full-bleed change), so nothing changes at or under that width.

2. **Neither row centred its content once nothing overflowed.** A fixed-width flex row narrower than its own container defaults to hugging the start edge — the leftover space becomes a trailing gap after the last card, not something split evenly around the row. Both tracks' `justify-content` is now conditional: `FeaturedProducts` uses `canLoop` (already the exact signal for "this row currently overflows"), `RecentlyViewed` uses `showArrows` (its own equivalent, `canScroll.left || canScroll.right`) — `justify-start` while either is true, `justify-center` once both are false. Deliberately conditional, not always-on: `justify-center` on a row that *does* overflow is unreliable across browsers for what `scrollLeft: 0` then means (some browsers centre the overflow symmetrically), which would break the "first card sits at the true edge" assumption every seam calculation and the CSS `scroll-padding-left` tuning on `FeaturedProducts` depends on — `canLoop`/`showArrows` being false is precisely the case where there is no such overflow to protect.

Verified directly at 1400px (still overflowing) and 2700px (everything fits) for both rows: at 2700px, the gap before the first card and the gap after the last measure equal on both (`FeaturedProducts` 129px each side; `RecentlyViewed` 134px each side), and `RecentlyViewed`'s own card width reads exactly 392px at both widths, confirming it no longer grows with the track. `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean (the same three pre-existing findings from the entry below, unchanged).

### 2026-08-27 (home, carousels) — Featured products and Recently viewed go full-bleed at any zoom; the belt's seam correction becomes bidirectional and gets a `scrollend` path

**Client, one message, four related reports on `home/FeaturedProducts` and `home/RecentlyViewed`:**
> "When i zoom out the page using ctrl and -, i see that the featured product starts and ends not at the literal page ending but at a fixed position. Can we fix this such that whatever zoom is there it starts and ends at the literal page corners. If all products fit in the zoomed out page, then there is no need for movement or pause or anything. Also for recent viewed, the products should start and end at the literal page ending not at fixed position. Also in mobile view, in featured product section. When i keep scrolling right the featured product cards moves by itself when i reach the last card. Also when the first featured product card is there i cant scroll left. When i scroll left it should show the last product, this is also in desktop view as well. Also sometimes it behaves that way when using buttons as well."

Read the whole of `FeaturedProducts.tsx` and `RecentlyViewed.tsx` before changing either — both carry an unusually long history of hard-won, narrowly-targeted fixes (recorded in their own top-of-file comments), and several of the four reports here turned out to share root causes with fixes already on record there, not new territory.

**1. Full-bleed track, `mx-[calc(50%-50vw)]` in place of a breakpoint-keyed negative margin.** Both tracks used to cancel only `ui/Container`'s own side padding (`-mx-5 sm:-mx-6 lg:-mx-8` on `FeaturedProducts`; nothing at all on `RecentlyViewed`, which just sat inside its section's own `max-w-7xl` div) — which cancels the *container's* inset but does nothing once the container's `max-w-7xl` cap itself is narrower than the viewport, exactly what zooming out produces (it widens the viewport in CSS px without moving the cap). `calc(50% - 50vw)` has no such ceiling: for an element inside a horizontally centred ancestor (`Container` is always `mx-auto`), that formula is algebraically "cancel however far my parent sits from the true viewport edge," whether that distance is a fixed padding, a max-width's leftover margin, or both — confirmed directly at 1280/1400/1920px that the track's left edge sits at `x: 0` at all three, where it previously drifted to 60px then 320px. `RecentlyViewed`'s track padding grew from a bare `px-1` to `px-6 sm:px-7 lg:px-9` to replace the inset the container used to provide for free — and, as a side effect, now matches `FeaturedProducts`' own track padding, which was already tuned to clear a popped card's `shadow-card-hover` bleed, a concern `RecentlyViewed` shares (identical pop treatment) but had never carried enough padding to actually cover.

**2. Fixed-width cards on `FeaturedProducts` at `lg` (`w-[387px]`, not `w-[calc((100%-3rem)/3)]`) — the fix that actually satisfies "if all products fit… no need for movement."** A percentage-of-track width is always exactly three cards by construction, at any track width, so making the track full-bleed alone would only render three ever-wider cards, never a fourth — with 6 featured products, `canLoop` would then never go false no matter how far out anyone zoomed. A fixed width lets `clientWidth / cardWidth` grow instead; `measure`'s existing `canLoop`/`canScroll` gating — already correct, already what hides the belt, the arrows, the dots and the pause button the moment nothing overflows — needed no changes at all once there was a way for more cards to actually fit at once. `387px` is not a round number: it is what the old formula already rendered at exactly 1280px (measured directly, 386.7px) — the widest the row could ever get before today, since `Container size="wide"` caps there — so nothing about how the row looks at or under that width changes now. Verified directly: card count and paging-row presence measured across 1400/2000/2600/3200px — 12 rendered `<li>` (doubled, looping) with arrows present through 2000px, dropping to 6 rendered `<li>` (single set, not looping) with arrows gone from 2600px on, exactly where 6×387px plus gaps stops needing to scroll. `RecentlyViewed` was **not** given this same treatment — the client asked for full-bleed there but did not repeat the "no movement once everything fits" request, and its existing `canScroll`-only gating (no `canLoop`, no doubling) already hides its own arrows once nothing overflows at whatever card count it happens to show.

**3. `correctSeam` becomes bidirectional, and `advance`/`retreat`/`goTo` stop each keeping their own copy of it.** The belt's "invisible wrap" only ever worked forward: a duplicate copy rendered *only* behind the first set, so `scrollLeft` could drift past one set-width scrolling forward but could never go negative scrolling back — a native scroll container simply clamps at 0, which is exactly "when the first featured product card is there i cant scroll left." The three step functions each carried their own one-directional pre-jump for the *button* case (`retreat` jumping forward into the duplicate before stepping back) — but a raw swipe or trackpad drag calls none of them, so the wraparound only ever existed for clicks, never gestures, on any device: "this is also in desktop view as well" was already true of the underlying cause, not a separate bug.

Rather than add a third rendered copy to give a literal negative-direction buffer, the row now **opens at `oneSet`, not `0`** (a new `useLayoutEffect`, so the jump lands before first paint and is never visible), which — with the same two copies already rendered — puts a full duplicate set on *both* sides of the opening view: copy 1 in `[0, oneSet)` behind it, copy 2 in `[oneSet, 2×oneSet)` ahead. `correctSeam` was rewritten to watch both true edges (`scrollLeft <= 4` → jump forward by `oneSet`; `scrollLeft >= scrollWidth - clientWidth - 4` → jump back by `oneSet`) instead of one fixed threshold, and now returns whether it corrected anything. `advance`, `retreat` and `goTo` were rewritten to call this one function first instead of each repeating a narrower version of it — which is also the fix for "sometimes it behaves that way when using buttons as well": the three functions' own inline pre-jumps never called `measure()` afterward, unlike `correctSeam`, whose own doc comment already explained exactly this failure mode for the forward case ("the popped card's outline and shadow vanished for two to three frames… reappeared with its transition restarting from flat… almost certainly what read as the section glitching") — the same gap, just never closed in the other three call sites until now.

Verified with realistic input, not raw property pokes — a raw `el.scrollLeft = n` write was found to get silently reasserted by the browser's own snap machinery immediately on read-back, the exact quirk this file's own `correctSeam` comment already has on record from an earlier bug hunt. Real `mouse.wheel` scrolling backward from the opening view correctly revealed prior content, and scrolling backward hard enough to threaten the true edge settled at 2029px, never pinned at 0. Ten real "Previous" clicks in a row, then ten real "Next" clicks, walked cleanly through multiple seam crossings in both directions with no stuck position and no wild overshoot — including the forward walk correctly bouncing off the true end (~3696px) at the same 4px margin the backward walk bounced off the true start. Autoplay re-confirmed still advancing normally afterward (2466px → 2877px across one 3s tick).

**4. `correctSeam` also gets a `scrollend` listener, additive to the existing 120ms settle timer** — the diagnosis for "in mobile view… When i keep scrolling right the featured product cards moves by itself when i reach the last card," specifically flagged as mobile. The settle timer is a heuristic ("no `scroll` event for 120ms" ≈ "scrolling has stopped"), and mobile momentum can keep `scrollLeft` moving for longer than 120ms between individual `scroll` events on some devices — firing the timer's correction while momentum is still actually in flight means fighting a live scroll animation with a discrete JS write, which reads exactly like the belt moving on its own. `scrollend` is the browser's own purpose-built signal for "scrolling, including momentum, has genuinely finished" — feature-detected (`"onscrollend" in el`) and purely additive: where it fires, correction happens immediately and reliably, and the existing timer still also fires afterward and finds nothing left to do (`correctSeam` is a no-op once already safely mid-row); where the browser doesn't support it, only the timer runs, unchanged from before. Not independently reproduced on real hardware — genuine momentum-vs-heuristic races are inherently hard to force in headless automation — but the mechanism is sound and the fix is risk-free for browsers without support, so it ships as reasoned rather than empirically forced.

Verified overall: `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean (two pre-existing `set-state-in-effect`/`exhaustive-deps` findings in each file confirmed present before this change too, via `git stash`, left untouched). No horizontal page overflow introduced at any tested width from 375px to 2600px — a 6px overflow at 320px specifically was also confirmed present *before* this change via the same `git stash` comparison, unrelated to it.

### 2026-08-27 (header) — A search icon, then a live search dropdown: new `layout/HeaderSearch`

**Client, first message: "Lets add a search icon before cart button on top of page."** `layout/Header.tsx`'s right-hand control cluster gained a plain icon `Link` to `/products` — using `SearchIcon` (added a few entries above for the catalogue's own search field) — positioned immediately before `CartLink`, matching its exact shape (`inline-flex h-11 w-11 items-center justify-center text-ink hover:text-accent`). No panel of its own yet: search lived only on `/products`, so this was a shortcut into that page, the same relationship `CartLink` already has with `/cart`.

**Client, second message, same day: "I should be able to search there and see the list of products as well."** The plain link was not enough — replaced with `layout/HeaderSearch.tsx`, a new client component that opens a live search panel in place, modelled directly on `ProductsMenu` next to it: full-width dropdown under the header (`absolute inset-x-0 top-full` against the same `relative` `Container`), Escape and an outside click both close it, and a followed result link closes it too rather than leaving it open over the new page. Copying that shape rather than inventing a second one was deliberate — it is this header's own already-established pattern for "a button that opens a panel," proven working two entries above.

**A lightweight search index, not the full catalogue.** `(site)/layout.tsx` already calls `listProducts()` once for `ProductsMenu`'s own category counts; `HeaderSearch`'s index (`slug`, `name`, `category`, one image URL) is derived from that same call rather than a second query, and ships only the fields the panel renders — no tagline, no description, no spec rows — the same restraint the file's own comment already argues for `menu`'s shape, extended to this one. Filtering matches on **name only**, not name-and-tagline the way `/products`' own search does: that page's search narrows a grid the visitor is already looking at, where a tagline-only match reads fine next to its own card copy; a six-row header preview has no such copy underneath, and a tagline-only hit there would read as a wrong result.

**Controlled from `Header`, not local state** — `open`/`onToggle`/`onClose` are lifted the same way `ProductsMenu`'s already are, for the same two reasons: the header's hide-on-scroll condition (`hidden && !open && !productsOpen && !searchOpen`) needs to know this panel is open too, and — a real conflict this component introduces that did not exist before it — `HeaderSearch`'s trigger is visible at *every* width, unlike `ProductsMenu`'s (`nav` is `hidden md:block`), so both panels' triggers can be reachable at once on desktop. Since both render at the identical `top-full` position against the same container, having both open at once would stack them on top of each other; each one's own `onToggle` now closes the other first.

**Degrades to a plain link when the index is empty**, mirroring `ProductsMenu`'s own identical bail-out for the identical reason: the root 404 renders `<Header />` outside the `(site)` route group that would otherwise supply this data, so `searchProducts` arrives as `[]` there — a magnifying glass that can only ever say "no results" for any query typed into it is worse than the plain link this replaces it with in that one case.

**Caught and fixed before shipping, not left as a rough edge:** the "View all N results" link under a capped list of matches was labelled with the header's own match count, but `/products`' broader name-*and*-tagline search can genuinely turn up more results once landed on — reproduced directly with a deliberately broad one-letter query (`"e"`): header counted 9 name matches, `/products?q=e` showed 11. Dropped the number from the label ("View all results") rather than try to make the two counts agree, since the two searches are intentionally scoped differently and always could diverge.

Verified: renders on every page; trigger sits left of `CartLink`; panel opens with the input auto-focused; typing filters live and shows name, category and thumbnail (or `PanelPlaceholder` for a product with no image yet) per row; clicking a result navigates to that product *and* closes the panel; an unmatched query shows "No products match "…""; Escape and an outside click both close it; opening `ProductsMenu` then this panel closes the first, confirmed via `#products-menu`'s own visibility; on the 404 page it renders as a plain link with no console errors; no horizontal overflow at 390px with the panel open. `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean.

### 2026-08-27 (catalogue, filter rebuild — third pass, same day) — Search moves into the results column, "Clear all" splits out of the rail's own scroll region to stop its pop clipping, search gets a text "Clear" instead of an icon, count relocated

**Client, one message, five more refinements on the same day's rebuild:**
> "I want a clear button in the search bar as well, at right corner, instead of x. Let search bar in desktop view start from the right of filter scroll in desktop view. Also lets make the clear button above the filter tab a bit smaller. Also let it have the same animation as add button in product car. Also make sure the button pop up is clear and edges are not cut. Also lets move the n out of n products at the bottom of the filter tab below the clear button."

1. **Search bar moved from above the whole two-column layout into the results column itself.** The previous pass had one `mb-8` row (search + the mobile Filters trigger) sitting above `lg:grid lg:grid-cols-[minmax(0,14rem)_...]`, spanning the rail's width too — this pass's `<div>` holding it is now the grid's *second* column, so on desktop it starts exactly where the results column starts, past the rail and its `lg:gap-12` gutter ("Let search bar in desktop view start from the right of filter scroll") — measured directly: rail right edge at x=316px, search left edge at x=364px, a 48px gap matching `gap-12` exactly. Below `lg` the rail renders nothing at all, so this remains the first visible element on the page, unchanged from the previous pass.

2. **The rail split into a fixed header and a separately-scrolling body** — `<aside>` went from one `lg:overflow-y-auto` region holding "Clear all" *and* the filter tree together, to `lg:flex lg:flex-col` with a `shrink-0` header (the button plus the count) above a `min-h-0 flex-1 overflow-y-auto` body (just `FilterPanel`). This is the fix for **"make sure the button pop up is clear and edges are not cut"**, not a style tweak: `overflow-y-auto` on one axis makes a browser treat the *other* axis as clipped too, per the CSS Overflow spec's own rule for a lone non-`visible` axis — so "Clear all"'s `hover:[transform:scale(1.08)]`, sitting inside that same scrolling region in the previous pass, could have its scaled-up edges sliced by the region's own clipping. Confirmed the mechanism directly rather than guessing: walked up the DOM from the button checking every ancestor's computed `overflow-y` for `auto`/`hidden`/`scroll` — before the split, the scrolling `<aside>` itself was the first match; after moving the button out, no clipping ancestor exists at all (`{ found: false }`). `min-h-0` on the new scrolling body is load-bearing on its own: a flex item's default `min-height: auto` refuses to shrink below its content size, which silently stops `overflow-y-auto` from ever engaging inside a flex column — confirmed the scrollbar still works after adding it (unchanged from the previous pass's own rail-scrollbar behaviour).

3. **"Clear all" itself is smaller** — dropped the `w-full` it carried in the previous pass (which stretched it across the entire 14rem/224px rail column) and let it size to its own text instead, inside the new fixed header. Measured: 76px wide now, versus the rail's own 224px column width. `ui/Button`'s `sm` size was already the smallest defined variant, so the width was what needed to shrink, not the type scale. Verified hover still reads `matrix(1.08, 0, 0, 1.08, 0, 0)`, same pop as before, now unclipped.

4. **The product count moved from the bottom of `FilterPanel` to directly under "Clear all"** ("lets move the n out of n products at the bottom of the filter tab below the clear button") — computed once in `ProductCatalogue` (`countText`) and rendered in both places that need it: the rail's new fixed header (right under the button) and the mobile sheet (in its own row, directly under the Clear/Search header, still above the scrolling filter list). `FilterPanel` no longer receives or renders it at all — the prop was removed from its signature rather than left unused.

5. **Search's clear control is a text "Clear", not an icon** ("I want a clear button in the search bar as well, at right corner, instead of x") — the previous pass had already swapped a native `type="search"` cancel button for a hand-built one, but built it from `CloseIcon`, which still reads as "an x" rather than a labelled control. Same position (the field's right edge, shown only once there is text to clear), same behaviour, different glyph: literal `Clear` text instead of the icon, with the input's own right padding widened (`pr-9` → `pr-14`) to keep the wider label clear of typed text.

Verified: `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean; no horizontal overflow at 320/375px; a screenshot of the hovered "Clear all" button shows its full pop rendered with clean edges, nothing sliced; the search field's clear control reads literally "Clear" with visible clearance from typed text; the count text sits, in DOM and Y-order both, between "Clear all"/"Clear" and the filter content in both the rail and the sheet.

### 2026-08-27 (catalogue, filter rebuild — second pass, same day) — Product picker removed, Rating gated on a sector being picked, search gets its own clear button, "Clear all" moves and gets the add-to-cart pop, mobile sheet header becomes two buttons

**Client, one message, five changes to the filter rebuild that had just shipped:**
> "When i click commercial or any other sub-category, i dont want the product list box seperately on the left side. Also in mobile view filter no need for seperate product box at the bottom. In mobile view filter lets have 2 buttons at the top on the left side clear and on right search. Also do not show rating when it is in all categories. In search bar instead of X, lets have clear button. In desktop top view make sure the clear all button is the top and has same animation pop up as add button on product cards."

1. **The product `<select>` — the whole fifth filter axis from the entry above — removed outright**, both the desktop rail and the mobile sheet copy, along with its `product` URL param, `selectProduct`, and `productsInScope` (the `hp`-scoped-but-not-product-scoped intermediate list that existed only to feed its options). `filtered` now applies sector/category/hp/search directly to `products` in one pass — `ProductRow`'s grid already shows every matching card once those narrow the list; naming the same products a second time in a dropdown next to it turned out to be redundant rather than useful once it was actually on the page.

2. **Rating hidden until a sector is picked** ("do not show rating when it is in all categories") — `FilterPanel`'s rating block gained `sector !== "all"` alongside its existing `hpRanges.length > 0` gate. Verified against two different sectors on purpose, since a naive first check looked like a bug and wasn't: selecting Commercial still hides Rating, correctly — every Commercial product (home automation / lighting) has an empty `hp_ranges` array in the dev database, confirmed directly with `SELECT name, hp_ranges FROM products WHERE category = 'home-automation'` — so the *existing* `hpRanges.length > 0` half of the gate was already doing that on its own. Re-tested against Agriculture, which does carry HP figures, to confirm the *new* half of the gate actually does something: Rating stays hidden at `sector=all`, appears once Agriculture is picked.

3. **The search input is `type="text"` now, not `type="search"`** ("In search bar instead of X, lets have clear button"). A native `type="search"` field grows its own `×` in WebKit/Blink once it has focus and text — exactly the control being replaced — and a plain `text` input never grows one, so a hand-built clear button (this component's own `CloseIcon`, shown only once `searchDraft.length > 0`, absolutely positioned at the field's right edge) is now the only clear affordance there is.

4. **Mobile sheet header is two buttons, not a title and a close icon** ("In mobile view filter lets have 2 buttons at the top on the left side clear and on right search"). "Clear" resets every filter (same handler the rail's own button now calls); "Search" dismisses the sheet onto the grid, which is already live-filtered underneath it since every filter click updates the URL as it happens — Escape and the backdrop tap, both already built the same day, remain as the other two ways out and are unaffected.

5. **"Clear all" moved to the top of the desktop rail and picked up `ProductCard`'s add-to-cart scale-pop** ("make sure the clear all button is the top and has same animation pop up as add button on product cards") — `[transform:scale(1)] hover:[transform:scale(1.08)]` on a wrapping `<div>`, the same idiom used everywhere else this pop has landed on this site, around a `ui/Button` `outline` instead of the plain underlined text link it replaced. Always rendered now rather than gated on `activeFilters > 0` — a header that appears and disappears as filters change reads worse than one that occasionally does nothing when clicked with nothing to clear. The mobile sheet's "Clear" got the identical pop for consistency, though only the desktop placement was asked for directly.

**A real, if minor, false alarm caught and traced to its actual cause, not worked around blindly:** verifying the new pop with a raw `page.mouse.move()` at the button's coordinates read the resting `matrix(1,0,0,1,0,0)` transform even while parked squarely on the button — looked exactly like the animation not firing. `document.elementFromPoint()` at that same coordinate named the actual hovered element as `layout/IntroSplash`'s own full-page overlay `<span>`, not the button underneath it: the splash is a real, deliberate ~2080ms once-per-session animation, and Playwright's raw `mouse.move` — unlike locator-based `.click()`/`.hover()`, which retry until a target is genuinely actionable — does not error when it silently lands on the wrong element. Re-run after `waitForTimeout(2300)` past page load (comfortably past the splash's own timer) read `matrix(1.08,0,0,1.08,0,0)` immediately, on both the rail's and the sheet's copy of the button. Recorded as a memory for future testing on this page rather than only fixed in this one script.

Verified: `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean; zero `<select>` elements anywhere in either the rail or the sheet; typing into search shows the clear button and clicking it empties the field; the sheet's header reads exactly "Clear" / "Search" with no leftover "Filters" title text, the two buttons on opposite ends of one row, and clicking "Search" closes the sheet.

### 2026-08-27 (catalogue, filter rebuild) — Search, a nested category tree, a scoped product picker, and a mobile bottom sheet replace the three flat filter lists

**Client, one message covering all of this:**
> "Lets add search bar to the all products page and next to it lets place the filter for mobile view. Also in mobile view that filter drop dwon must open from the bottom of the page. In desktop view the filter on the left dide of the pagee should have its won seperate scroll bar. Also, it should be like this: All categories / Agriculture / Industrial / Commercial. Then when i click a particular category, it should drop dwon and show all the sub categories… Same should be followed for raatings and others as well. When i select a category or sub category it should display all products in it, then there should be a drop next to these buttons to select specific products. Also add the same animation to these buttons as view details on product cards without the ->. Also make sure the these filter buttons are responsive."

Two decisions were asked back before building, since either one wrong would have meant reworking the state model, not just styling: **(1)** does clicking a sector both expand it and filter to it in one click, or expand only, leaving "All sub-categories" underneath as the thing that actually filters — client chose **expand and filter together**; **(2)** does picking a product from the new picker navigate to its page or filter the grid down to that one card — client chose **filter the grid, stay on `/products`**. Both are load-bearing in what follows.

**`product/ProductCatalogue.tsx` rewritten**, `product/FilterGroup` (the old dual select/button-list component) retired in favour of a new `FilterPanel` + `FilterButton` pair shared between two render sites — the desktop rail and the new mobile sheet — rather than duplicated markup.

1. **Category is a tree now, not two flat lists** ("Category" + "Sub-category" collapsed into one). "All categories" is a permanent root row; each sector below it is a row whose children — "All sub-categories" plus that sector's own categories — only render while that sector is the active filter. There is deliberately no separate "expanded" boolean: the expanded sector *is* the active `sector` filter, so switching sectors closes the old children and opens the new ones for free, with nothing to fall out of sync. Clicking a sector calls the same `selectSector` that used to run from the old flat list — filtering and revealing children in the one click the client asked for.

2. **New `product` URL param**, alongside the existing `sector`/`category`/`hp`. `productsInScope` (sector+category+hp, excluding `product` and search — same "must not depend on itself" rule already on `hpRanges`, so the picker's own options never collapse to the one thing already chosen) feeds a native `<select>` — a `<select>`, not another button list, because the client's own word for this control was "a drop[down]", and unlike category or rating this list has no natural "all N" grouping worth its own row beyond the first option. Gated on `(sector !== "all" || category !== "all") && productsInScope.length > 1`, per the client's own sequencing: "When i select a category or sub category it should display all products in it, then there should be a drop… to select specific products." Selecting one narrows `filtered` to that single card and stays on `/products`, per the client's explicit choice above.

3. **New `q` URL param, and a `search products…` input above the rail.** Filters live, against **local `searchDraft` state, not `q`,** on every keystroke — the `products` array is already loaded client-side, so live filtering needs no round trip, and routing on every keystroke would be needless `router.replace` churn. `q` itself commits on blur or Enter, so a search is still a shareable, back-button-able URL, just not mid-keystroke. Syncing `searchDraft` back from `q` (for "Clear all" and back/forward navigation) uses React's own documented "adjust state during render" pattern — comparing against a `prevQ` state and calling `setSearchDraft` directly in the render body — rather than a `useEffect` doing the same `setState`, which trips this project's `set-state-in-effect` lint rule and is a render later than the one the visitor sees regardless.

4. **Rating keeps its old flat list** but now uses the same `FilterButton` row style as the tree, for the visual consistency the client asked for ("Same should be followed for ratings and others as well") — it has no natural second level of its own, so it did not get the tree's expand mechanic, only its row look.

5. **Below `lg`, the whole panel moved into a bottom sheet** ("In mobile view that filter drop dwon must open from the bottom of the page"), replacing the inline `hidden`/`block` disclosure this page used before. `role="dialog" aria-modal="true"`, Escape closes it, body scroll is locked while it is open, and a full-viewport backdrop button closes it on an outside tap — the same shape as `layout/Header`'s own mobile drawer, this codebase's one existing precedent for a modal panel. Deliberately **no enter/exit transition**, matching that same precedent, which is also a plain conditional mount with no animation — consistent with the rest of the site rather than a new interaction idiom invented for this one panel. The trigger moved out of the rail (which no longer renders anything below `lg` at all) and into a new row beside the search input — "next to it lets place the filter for mobile view" — since the rail's content is no longer inline page content the toggle sits above.

6. **The rail gets its own scrollbar from `lg`** ("the filter on the left dide of the page should have its won seperate scroll bar"): `lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto` alongside the existing `lg:sticky lg:top-24`. A long filter list — a sector's children plus rating plus the product picker — now scrolls inside the rail instead of stretching the sticky column taller than the results beside it.

7. **Every `FilterButton` carries `ProductCard`'s "View details" hover, with no arrow** ("add the same animation to these buttons as view details on product cards without the ->"): `hover:text-accent` plus a sweep-underline `[transform:scaleX(0)]` → `group-hover/filter:[transform:scaleX(1)]` span, same idiom as everywhere else this pattern has landed this week. The existing accent-left-border "selected" mark is untouched — the sweep is a hover effect layered on top of it, not a replacement, so an already-selected row still sweeps on hover same as any other.

**"Responsive," checked directly rather than assumed:** no horizontal overflow at 320/360/375px, with or without the sheet open; no console errors at any of those widths. The rail's `lg:max-h-[calc(100vh-8rem)]` measured `772px` at a 900px-tall test viewport — exactly `100vh - 8rem` (900 − 128). Full interaction sweep verified against the dev database: clicking a sector updates the URL and reveals exactly that sector's categories; clicking a category narrows further and reveals the product picker with exactly the two products left in scope; picking one narrows the visible grid to exactly one card (an early "still shows 4 cards" reading turned out to be `ContactStrip`'s own unrelated `.grid` footer, caught by widening the query and only fixed in the test, not the component); combining an active product pick with a mismatched search term correctly returns zero results; "Clear all" resets both the URL and the search input's visible value. On mobile: search and the Filters trigger sit in one row: the rail renders nothing below `lg`; the sheet opens anchored to the bottom (measured: bottom edge within 5px of the viewport's own bottom edge, panel height ≈ 711px at 85vh of an 844px-tall viewport); selecting a filter inside the sheet leaves it open; Escape, the backdrop, and the explicit close button all close it; body scroll is locked while open and restored after.

`npx tsc --noEmit`, `npx eslint`, `npm run build` all clean. New `icons/ui.tsx` export: `SearchIcon`, for the search field — same 24×24/stroke-1.5/`currentColor` convention as every other icon in that file, hand-drawn rather than pulled from a library for the same no-new-dependency reason the rest of the set exists.

### 2026-08-27 (catalogue, follow-up) — Grid columns get a `minmax` floor so cards stop shrinking between breakpoints; `auto-fit` tried and reverted for breaking monotonic 3→2→1

**Client, same day as the grid entry below: "When i reduce page size, do not reduce the product card size."** The previous pass's `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` made *column count* discrete at each breakpoint but left each column a bare `1fr` — exactly as wide as the results area divided by the column count, so a card's actual rendered width still shrank continuously with the browser window at any width *between* two breakpoints. That continuous shrink, not the breakpoint jumps, is what the client was seeing.

**First attempt: `grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]`**, no explicit breakpoints at all — column count computed directly from how many 18rem tracks fit the grid's own real width. This produces a genuine regression, caught by measuring computed `gridTemplateColumns` and card width across a full width sweep before shipping it, not by inspection: `ProductCatalogue`'s results column sits beside a fixed `14rem` filter rail from `lg` (1024px) up, and that rail collapses to a small toggle button below `lg` — so the grid actually has *more* real width available at, say, 960px (rail gone) than at 1024px (rail still there). Measured directly: columns went 3 → 3 → 2 → 2 → **3** → 2 → 1 while narrowing from 1400px to 390px, bouncing back up to three right as the rail disappeared, which is not "reduce from 3 to 2 to 1."

**Shipped instead: explicit breakpoint columns, each an explicit `repeat(N, minmax(17.5rem,1fr))` rather than a bare `1fr`.** Three from `xl` (1280px), two from `sm` (640px), one below it. Both the breakpoint choice and the 17.5rem floor were solved for the rail's worst case, not picked by eye: at `lg`'s own lower edge (1024px) the results column has only ~688px to work with, which fits two comfortable columns but not three without going under the floor — so three columns wait for `xl`, and `xl` (1280px) is not an arbitrary second choice, it is exactly `Container size="wide"`'s own `max-w-7xl` cap, the point past which the results column stops growing at all (~944px, ceiling) and three 17.5rem columns plus their gaps (888px) comfortably fit under it for good. Below `lg` the rail is gone and stops competing for width entirely, so the same floor clears two columns from `sm` with no such ceiling to solve for.

Verified with a full width sweep, 1400px down to 320px in irregular steps including both breakpoint edges (639/640/641 and 1279/1280/1281): column count is strictly non-increasing throughout — 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1 — card width never drops below 280px anywhere in that sweep (the tightest point, 320px exactly, lands the single mobile column exactly on the floor with zero slack), and `document.documentElement.scrollWidth` never exceeds `clientWidth` at any tested width — no horizontal overflow anywhere the floor is holding a column open.

**Second question from the same message, answered rather than fixed: "when i reduce page size, the page moves down. Why is that."** Reproduced and measured directly rather than guessed at: scrolled the page 900px down, then narrowed the viewport from 1400px to 900px (crossing a column-count drop). `window.scrollY` was unchanged by the browser (900 before, 900 after) — resizing never scrolls the page — but `document.documentElement.scrollHeight` grew by 1250px, because the same products now need more rows once fewer of them fit per row. At the same fixed pixel offset, the content now sitting under that offset is *earlier* in the list than it was before (confirmed: the topmost visible product's name changed) — which reads as "the page moved down" from the visitor's chair, when what actually happened is the page got taller above an unmoved scroll position. This is not specific to this grid or this change: any reflow that adds rows above the current scroll position produces it, on any site, because browsers preserve scroll position in pixels, not "same content stays under the cursor," across a resize. Nothing was changed for this one — it was reported to the client as expected browser behavior rather than a bug, with the mechanism above, rather than silently building a scroll-position-restoration script for behavior that is standard everywhere on the web.

Verified: `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean.

### 2026-08-27 (catalogue) — `/products` cards move from two scrolling, column-first tracks per category to one responsive grid; `ProductRow` drops `"use client"`

**Client: "I want product cards to adjust according to page size. In desktop view I want product cards in a category to be arranged 3 in row. Then the 4th card will come to the next row and then 7th card to the next row and so on. Lets remove the left and right toggle button. In mobile view the products should be one in each row. Also in desktop view when i reduce web page size it should adjust by bringing product cards down... the number of cards in a row should reduce from 3 to 2 to 1."** `product/ProductRow.tsx` rewritten from scratch rather than patched — the two features being replaced (arrows, column-first fill) were what the rest of the file existed to support.

**What it was:** each category rendered as **two independently-scrolling horizontal tracks**, column-first — card 2 under card 1, card 3 beside card 1, and so on — so that each row's own left/right arrows made sense as paging a self-contained strip. `useRef`, `ResizeObserver`-driven `canScroll` state, and a `page()` scroll-by-one-card function existed per track, doubled, because the two tracks scrolled independently by design.

**What it is now:** one `<ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">` per category. Ordinary CSS Grid row-major flow (`grid-auto-flow: row`, the default) gives exactly "3 in a row, 4th starts the next row" with no code watching anything — verified directly: with three products in the largest dev-data category, all three sit at the same computed `y` and in left-to-right `x` order, `gridAutoFlow` reads `"row"`, and `gridTemplateColumns` has 3 tracks at 1400px, 2 at 800px, 1 at 390px, stepping down live as the window narrows since these are ordinary Tailwind breakpoints, not a script. The arrows are gone — `page()`, `PageButton`, `canScroll` state and the `ResizeObserver` effect deleted along with the two-track split, not hidden. With no state, no ref, and no effect left in the file, `ProductRow` also drops `"use client"` and is a plain server component now — a genuine simplification that fell out of removing the interactivity, not a separate goal.

`product/ProductCatalogue.tsx`'s own comment on why its results column is `minmax(0,14rem)_minmax(0,1fr)` and not a bare `1fr` cited "a horizontal scroller"'s min-content width as the reason `auto` had to be overridden; updated to describe a grid's own min-content behaviour (the widest unbreakable run of text in any one card) instead, since the mechanism it exists to prevent is different now even though the fix (`minmax(0,1fr)`) is unchanged and still necessary.

**Same message, separately: "lets have same animation in view details and add (add to cart) button in all products page, same as in view details and add button in featured product cards in home page."** The catalogue's cards render through `ProductCard`'s plain ("vertical") branch, which keeps "View details" a `<span>`, not a second `Link` — the whole card is already one stretched link (the heading's `after:absolute after:inset-0`), and a second link to the same destination would be a second tab stop for no reason. Added `FeaturedCard`'s footer treatment to that span anyway: a nested `relative` span wraps the label with an underline that sweeps in on `group-hover:`, and the arrow shifts `[transform:translateX(0.25rem)]` on the same trigger — no named group needed, unlike `FeaturedCard`'s `group/details`, because there is nothing else on this card competing for the plain `group` scope the way `FeaturedCard`'s independent `AddToCartButton` does. `AddToCartButton` itself gained the same `[transform:scale(1)] hover:[transform:scale(1.08)]` wrapper `FeaturedCard`'s copy already had, adding no `position`/`z-index` of its own so the button's existing `relative z-10` keeps escaping the stretched link exactly as before.

**Fixed a 6th instance of this Tailwind version's utility-gap while already rewriting the line it was on**: this card's arrow used `translate-x-1` — the original, deliberately-unfixed instance named repeatedly elsewhere in this doc as the "reference" case for that gap. Since the line was already being rewritten for the sweep, it became `[transform:translateX(0.25rem)]` here too, rather than leaving a newly-styled arrow sitting on a known-broken utility right next to its own fixed sibling in `FeaturedCard`.

**Scope note, not asked for but unavoidable:** `ProductCard`'s plain/vertical branch is shared with `product/RelatedProducts.tsx` (the product detail page's "related products" strip), so that section picks up the same sweep-and-pop hover treatment as a side effect of touching the shared branch — there was no plain-orientation instance to change that wasn't shared. Loaded a product detail page directly to confirm nothing broke there: no console errors, card renders normally.

Verified: `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean; zero `button[aria-label*="Previous"]`/`"More "]` paging controls found anywhere on `/products`; no horizontal overflow at 390px; card hover measured directly — text `rgb(35, 112, 61)`, underline `matrix(1, 0, 0, 1, 0, 0)`, arrow `translateX(4px)` on card hover, Add-to-cart wrapper `matrix(1.08, 0, 0, 1.08, 0, 0)` on its own hover.

### 2026-08-27 (mobile, two-line buttons) — `SectorBrowser`'s "All N in [sector]" and `ProductCard`'s "View details" wrap to a second line on narrow phones; both fixed with `whitespace-nowrap`

**Client: "in home page in mobile view... The All N in sub category button is in 2 lines. I want it to be a 1 line button... in featured card section, the view details button is in 2 lines... Sometimes... are in one line. I want it to always be in 1 line."** "Sometimes" was the useful word — both bugs are the same underlying CSS mechanism (a flex/inline-flex row shrinking a text-bearing child below its natural width, which lets the text itself wrap), and neither reproduced at every width or every state, which is exactly what that mechanism predicts.

**`ProductCard`'s featured-card footer (`data-featured-footer`)** — reproduced directly, not just reasoned about. At normal widths the row (`View details` link + `AddToCartButton`) has room to spare. `AddToCartButton` swaps itself for the wider `QuantityStepper` once the product is already in the cart (documented in that component's own comment, for an almost identical bug on the product page), and `AddToCartButton` already carries `shrink-0 whitespace-nowrap` for exactly that reason — but the "View details" `Link` beside it had neither, so once the stepper widened the row, 100% of the resulting squeeze landed on "View details" instead of being shared, and past a point the browser's flex-shrink calculation (default `min-width: auto`, i.e. shrinkable down toward the widest unbreakable word) let the text wrap to keep the row's total width down. Confirmed by scripting the exact sequence — load a 320px-wide viewport, add the product to cart, measure — against the unmodified file first: wraps (`linkWidth` drops from its natural 103px to 95px, line count 2). Same script against the fix: does not wrap at any width from 320px to 767px, cart-empty or cart-full. Added `shrink-0 whitespace-nowrap` to the Link, matching `AddToCartButton`'s own already-proven fix for this exact failure mode.

**`SectorBrowser`'s "All N in [sector]" link** did not reproduce under the same script at any tested width (320–412px) with this dev database's actual sector names and counts — there is no sibling competing for space in its row, unlike the featured footer, so the mechanism here is the plainer version: an `inline-flex` element's own shrink-to-fit sizing can still let its text child wrap if the available line-box width is ever tighter than the client's was when this got reported (a longer sector name, a double-digit total, or a larger effective font size than this environment's headless Chrome renders — mobile "text size adjust" boosting and per-device accessibility font scaling are both real and neither is visible to this kind of test). Fixed the same way regardless, since the mechanism and the fix are identical: `whitespace-nowrap` added to the link, so the row can never wrap no matter what pushes it — worst case for a sector name long enough to still not fit, the row now overflows past the card instead of wrapping, which is not a problem that exists with today's three sector names and is a better failure than a two-line button either way.

Verified: `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean. Screenshots at 320px confirm both read as a single line — `View details` beside the (already-added) quantity stepper without wrapping, and `All 6 in Agriculture →` on one line.

### 2026-08-27 (header, follow-up) — The header's "Products" dropdown gets the same "View details" treatment as `SectorBrowser`'s

**Client: "Lets make changes to the product page drop down, Lets make all the sub categories and all products button have the same animation as in view details of featured product cards."** `layout/ProductsMenu.tsx` — the "Products" dropdown in the header (desktop only, `md` and up; the mobile drawer's nav is a flat list of top-level links with no sub-category or "All products" row to touch) — is a second, independent place this same site structure (sectors → categories → "all products") is rendered, distinct from `home/SectorBrowser`'s cards, which had already gotten this exact request the day before ("the sub categories and all products button let it have the same animation as in view details of featured product card section"). This carries the same treatment to the one place that request hadn't reached.

1. **Each sub-category link** (`category.count > 0` branch) already had `text-ink`/`hover:text-accent`; added the sweep-underline span around the label. An `ArrowRightIcon` went on first, new to this row entirely — the same call already made for `SectorBrowser`'s "All N in sector" link, which had no arrow either until that request — then came straight back off the same day (client: "In product drop down lets not have the -> arrow symbol just the name and animation is enough"). Asked to confirm scope, since the dropdown has an arrow in two places: client chose sub-category rows only, leaving "All products" (below) with its arrow. Final shape: `text-ink`, `hover:text-accent`, sweep-underline, no icon, no `flex`/`justify-between` layout — reverted to a plain `inline-block` link since there is nothing left in the row to justify apart from the label.
2. **"All products"** was `.link-cta`, the same bordered always-underlined pill `home/Hero`'s "Explore" link used to be — same swap, for the same reason: the pill replaced with the sweep+arrow pattern. Its arrow predates this change (`.link-cta` always carried one) and was not part of what got removed.

`[transform:translateX(0.25rem)]` and `[transform:scaleX(...)]`, not `translate-x-1`/`scale-x-*`, since both are on this Tailwind version's list of utilities that silently no-op (now five instances on record, see the entry above).

Verified directly, after the arrow was removed: sub-category link carries zero `<svg>` children; resting colour `rgb(20, 23, 26)` (`--color-ink`), hover `rgb(35, 112, 61)` (`--color-accent`) with the underline span at `matrix(1, 0, 0, 1, 0, 0)` (fully swept); "All products" still carries exactly one `<svg>`, its arrow still shifting `translateX(4px)` on hover, unaffected by the sub-category change. `npx tsc --noEmit`, `npx eslint`, and `npm run build` all clean.

**Caught one mistake mid-edit, not shipped:** closed the sub-category comment with `*/}`, the closing this file's *other* comments use because they open with `{/*` (a JSX-children comment). This one sits inside a ternary's parentheses, in JS-expression position, not JSX-children position — a plain `/* */` block comment, no wrapping `{}`. The stray trailing `}` had no opening `{` to match and broke the parse (`tsc`: "Expression expected"); caught immediately by the same `tsc`/`eslint` pass this project always runs before treating an edit as done, fixed by dropping the stray brace before this was ever loaded in a browser.

No change needed to the mobile drawer — confirmed by reading `Header.tsx`'s `#mobile-menu` block, which renders only `primaryNav`'s flat links, never `ProductsMenu`.

### 2026-08-27 (SectorBrowser, follow-up) — "N sub-categories" glows green and pops alongside the chevron; a 5th Tailwind utility gap found (`rotate-180`, not fixed)

**Client, immediately after the entry below: "when i hover the cursor on a category card in what we make section i also want the N sub categories to also glow green same as the downward >. Could we also make the downward > and N sub categories to pop up when hovered as well."** Two additions to the same card footer row `SectorBrowser.tsx` already had `group`/`group-hover:text-accent` on from the prior change:

1. **The "N sub-categories" text now also turns `text-accent` on card hover**, same conditional branch structure as the chevron (only `expandable` cards; a `disabled` "Coming soon" card has nothing to expand into, so it stays plain rather than inviting a hover state that leads nowhere).
2. **Both the text and the chevron pop to `scale(1.08)` on card hover** — `1.08` chosen to match the pop magnitude already established elsewhere on this site (`about/SocialProfileCard`'s name pop, `home/FeaturedProducts`' pause button), not a new figure invented for this.

**The chevron's pop couldn't go directly on the `<svg>` itself.** That element already carries a *different*, state-based `transform` — `rotate-180` when the card `isOpen` — and CSS `transform` is a single property; a hover-based `scale` written onto the same element would have to be hand-composed into all four `isOpen`×`hover` combinations instead of applying independently. Wrapped the icon in its own `<span>` and put the hover-scale there instead: nested elements' transforms compose visually for free, so the wrapper scales on hover regardless of what the inner `<svg>` is doing with its own rotation.

**Found, and deliberately left alone: `rotate-180` silently does nothing in this Tailwind install.** Checking the chevron's open-state transform during verification, `getComputedStyle` read `transform: none` while `isOpen` was true and the card unhovered — confirmed not a fluke of this component by testing a bare, unrelated `<div className="rotate-180">` in isolation, which reads the same `none`. This is the same failure shape as four other utilities already on record in this codebase (`scale-x-*`/`scale-y-*`, negative `-translate-y-*`, stacked-variant `scale-[1.05]`/`scale-[1.06]`, `translate-x-1`) — a fifth instance, not a new kind of bug. The class predates this change (copied verbatim from the existing card markup) and this project's own convention is to fix the utility gap only in code being newly written, not to drive-by-fix a pre-existing instance while touching an unrelated part of the same element — so it is reported here, not patched. Practical effect: the chevron has apparently never visually rotated when a category card opens, on this Tailwind version, since the feature was built. The proven fix, when this gets picked up, is the same arbitrary-property substitution used everywhere else: `[transform:rotate(180deg)]` in place of `rotate-180`.

Verified directly: resting text colour `rgb(90, 99, 108)` (`--color-muted`); hover text colour `rgb(35, 112, 61)` (`--color-accent`) with `transform: matrix(1.08, 0, 0, 1.08, 0, 0)`; chevron wrapper hover transform likewise `matrix(1.08, 0, 0, 1.08, 0, 0)`; chevron colour on hover `rgb(35, 112, 61)`. `npx tsc --noEmit`, `npx eslint`, and `npm run build` all clean.

### 2026-08-27 (home page) — "View details"'s sweep pattern spreads to Hero, SectorBrowser and RecentlyViewed; RV's arrows move on desktop

**Client, five changes in one message, the first four all pointing at `product/ProductCard`'s "featured" orientation "View details" link as the pattern to copy:**

1. **Hero's "Explore" link** (`home/Hero.tsx`) — was `.link-cta`, a bordered pill with an always-visible underline that turns green on hover. Replaced with "View details"'s own shape: no border, no underline until hover, then one sweeps in from the left; `band-accent` in place of `accent` since this sits on the hero's photograph, the same substitution this pattern already gets everywhere else it lands on band content. Deliberately dropped `text-sm` from the copied pattern — that class is the product card's own small type scale, and shrinking the hero's one primary CTA to match a card's secondary link was never asked for, only the hover behaviour was.

2. **The "Or call [number]" text beside it** — removed outright, not hidden or restyled. `site`/`telLink` dropped from the file's imports along with it, now unused.

3. **`SectorBrowser`'s category cards** — the downward chevron that shows/hides each card's sub-category panel now turns green on hovering the *card*, not only when already open (`group` added to the card's own button, `group-hover:text-accent` added to the chevron's closed-state branch; the open-state branch was already unconditionally green and needed no change). Both links inside the opened panel — each sub-category and the "All N in [sector]" link — get "View details"'s full treatment: the sub-category links already had a colour change and an arrow shift, so this added the sweep underline (under the label only, not the fixed-width count prefix beside it) and fixed the arrow's `translate-x-1` to the arbitrary-property form while that line was already being rewritten; the "All in sector" link was previously a plain, always-underlined green link with no arrow at all, and is now rebuilt as the same `text-ink`/`hover:accent`/sweep/arrow shape as the row above it, rather than an underline bolted onto its old colours.

4. **`ProductCard`'s "horizontal" orientation add-to-cart wrapper** (used by `RecentlyViewed`) — was a bare positioning `<div>`; now carries the same `transition-transform duration-200 ease-out [transform:scale(1)] hover:[transform:scale(1.08)]` the "featured" orientation's own wrapper already had. `AddToCartButton` itself is untouched, same reasoning as the original: it's shared across every card on the site, so the scale lives on a wrapping `<div>` around this one instance, not on the button.

**Same message, separately: "lets bring the left and right toggle in desktop mode to the centre below the recent viewed product cards"** (`home/RecentlyViewed.tsx`). Two copies of the same paging controls rather than one repositioned with CSS: the existing above-heading pair gained `lg:hidden`, and a second pair — `hidden lg:flex`, centred — was added after the card list, active only from `lg` up. `display: none` removes a hidden copy from the accessibility tree and tab order together, so whichever breakpoint is active is the only one ever reachable by keyboard or screen reader; confirmed via `getByRole`, which only ever found one of the two at a given viewport. Deliberately breaks the "matched pair" `SectorBrowser` and this component were built to keep (noted where they're rendered in `home/page.tsx`) — that symmetry was never itself the ask, and moving only one of the two off it is what this instruction asked for.

**Verification was unusually failure-prone this round, worth recording why.** Every one of the first three checks below initially "failed," and every failure was in the test, not the implementation:

- A generic `button[aria-expanded]` selector matched the header's own nav dropdown first, not a `SectorBrowser` card — scoping the query to the section fixed it.
- `el.querySelector('svg')` on a card button matched `PanelPlaceholder`'s icon instead of the chevron, on a sector currently missing a real photo — fixed by matching the chevron's own path data (`m6 9 6 6 6-6`) instead of "the first svg."
- The card's `min-h-[19rem]` is a floor, not its actual height — this card renders at ~495px tall with its photo and copy, so a mouse move to its *vertical centre* landed off-screen below a 1400px-tall test viewport, and the hover state genuinely never engaged (confirmed directly: `element.matches(':hover')` was `false`, and `elementFromPoint` at that coordinate returned `null`). Fixed by hovering near the card's top instead of its centre.
- Separately, seeding `localStorage` with guessed product slugs for `RecentlyViewed` testing initially seeded three that don't exist in this dev database at all (confirmed against `SELECT slug FROM products` directly) — only the ones that happened to coincide with real slugs rendered, capping the row at 3 cards and never triggering the overflow needed to test the arrows at all.

None of these were the code being wrong; all four were resolved by fixing the check, then re-confirming the original result. Final state, verified directly: chevron computed `color` reads `rgb(35, 112, 61)` on card hover; both panel links' underline spans read `matrix(1, 0, 0, 1, 0, 0)` (fully swept) on hover, with the "All in sector" link's own text colour also confirmed green; the add-to-cart wrapper's `transform` reads `matrix(1, 0, 0, 1, 0, 0)` at rest and `matrix(1.08, 0, 0, 1.08, 0, 0)` on hover; the desktop-only arrow pair measured exactly centred under the card track (0px offset between the pair's midpoint and the track's) and below its bottom edge; and the mobile-width arrow pair confirmed still in its original above-heading position, unmoved. No horizontal overflow at 390px. Two pre-existing lint findings (`RecentlyViewed`'s `hoverCapable` effect, the same `set-state-in-effect` pattern already on record elsewhere in this codebase) confirmed present before this change too, via `git stash`, and left untouched.

### 2026-08-27 (§04 social media, X-specific) — X's pop and button loading colour get a dark-mode override

**Client: "in dark mode lets make X social media profile when poped up white grey colour. Also the view page button loading animation colour to white grey as well."** `about/SocialProfileCard.tsx`'s card border and "View page" button sweep both key off `profile.color`, theme-invariant by design for four of the five platforms — but X's brand colour is `#000000`, and this page's dark-mode ground is also near-black, so X's pop and button loading fill were both silently invisible in dark mode specifically. New `isX = profile.key === "x"` gates a dark-mode-only override on both: `dark:group-hover:border-body` on the card, `dark:before:bg-body` on the button. `border-body`/`bg-body`, not a new colour: `--color-body`'s dark value (`#c3c9cf`) is already this project's "light grey/off-white" text tone, reused rather than inventing a fresh hex for "white grey." Light mode is untouched — X's black pop and black sweep still work fine against this page's light-mode ground — and all four other platforms are completely unaffected, since `isX` is false for them and every override is conditional on it.

**The button's hover text needed its own X-specific branch too, not just the fill.** `hoverTextClass` (added the same day, see the earlier §04 entry) picks white or black once per card based on `profile.color`, and for X that resolves to white — correct against the light-mode fill (still pure black), but white-on-`#c3c9cf` measures ~1.7:1 by the same formula, worse than the black-on-black this exact function was written to fix in the first place. X now gets its own branch: white text in light mode (fill still black), black (`text-band`) in dark mode (fill now the grey override) — every other platform's branch is untouched.

**Caught and fixed a real mistake mid-edit, not shipped:** the first attempt built those branches by interpolating a colour name into the middle of a class string (`` `hover:text-${choice}` ``) instead of writing out full literal strings. Tailwind's scanner matches complete utility names as literal text in the source; a class assembled at runtime from fragments is invisible to it and silently generates no CSS — the *exact* failure mode this codebase has hit before with unsupported utility names in older Tailwind versions, but self-inflicted this time rather than a version gap. Rewritten as explicit branches, each one a complete literal string, before this was ever tested.

**Also hit, and this time genuinely a false alarm rather than a bug:** an initial verification pass showed the new classes completely missing from the rendered DOM. Traced to a stale dev server — `rm -rf .next/dev` (this session's usual clean-restart step) was not enough; only clearing the *entire* `.next` directory and restarting picked up the change. Re-verified after that: computed `border-color`/`background-color` on the X card and button read `rgb(0, 0, 0)` in light mode and `rgb(195, 201, 207)` in dark, exactly `#000000`/`#c3c9cf`, with computed button text flipping from white to `rgb(24, 29, 34)` (`--color-band`) alongside the fill so it stays legible in both cases; all four other platforms' hover border colours confirmed identical between themes, unaffected by any of this.

### 2026-08-27 — Contact masthead resized to match About's

**Client: "Make hero image at top where it is written tell us what you need, same size as the image on top in contact us page."** Asked to confirm, since the request as written names the contact page as its own size target — a typo, corrected to About, the only other page using this same fixed-height masthead pattern (a full-bleed photo behind a `min-h-*` band; the home page's hero is a different, content-sized rotating component with no single number to match). `contact/page.tsx`'s masthead `min-h-[12rem] sm:min-h-[15rem] lg:min-h-[18rem]` became `min-h-[14rem] sm:min-h-[17rem] lg:min-h-[21rem]`, About's exact values.

Rendered height still differs slightly between the two pages after this (336px vs ~380px at `lg`, measured directly) — not a leftover mismatch: About's masthead carries a `label-tech` eyebrow line and a row of category chips Contact's never had, which push its content past the shared floor `min-h-*` sets. The sizing *constraint* is now identical; the two pages' different content is what it always was.

**Same day, client: "No i want contact us image same height as about us image, add text like call, whatsapp, write below and all three reach the same desk in seperate rows. But make sure the image are of same height. Also in about us page remove the ABOUT VKON which is written in green."** Three changes, the first two working together toward the third:

1. Removed the green `label-tech text-band-accent` eyebrow ("About · Vkon Automation") from About's masthead entirely — one fewer row of content there.
2. Split Contact's tagline from one sentence into two stacked `<p>` rows ("Call, WhatsApp or write below" / "All three reach the same desk.") — one more row of content there.
3. Neither of those was trusted to *guarantee* equal height on its own — content-driven matching is inherently approximate, confirmed by measuring directly rather than assuming: after steps 1–2 the gap shrank but did not close (0px at `lg`, but 55px at 390px and 59px at 768px — About's headline wraps to more lines at narrower widths, so the gap was not even consistent across breakpoints). Fixed properly by raising the shared `min-h-*` floor at each breakpoint above *both* pages' natural content height — `19rem/21rem/22.5rem`, up from the `14rem/17rem/21rem` both pages had just been set to — so the floor, not either page's own content, is what determines the rendered height. Verified exactly 0px difference at 375px, 640px, 768px, 1024px, 1280px and 1440px.

**One real gap remains, flagged rather than silently left in or chased further: at 320px specifically, About's headline wraps to enough lines that its content overflows even the new floor**, reopening a ~110px gap at that one width. Old, now-uncommon phones (original iPhone SE and similar) are the only devices this width; every width this project has actually tested at throughout this session (390px and up) matches exactly. Pushing the mobile floor high enough to cover 320px too would mean a substantial empty gap above Contact's shorter content at every ordinary phone width instead — a worse trade for covering a width this site's own testing convention doesn't otherwise use.

**Same day, client: "Also make the text tell us what you need same level as in we make future in about us page."** Matching the container height (the entry above) turned out not to matter for this: both mastheads use `justify-end`, bottom-anchoring the whole text stack, so equal *container* height says nothing about where the *heading* sits within it — that depends on how much trailing content follows each heading, and About's paragraph-plus-chip-row is taller than Contact's two plain lines. Measured before touching anything: About's `<h1>` sat 88px higher than Contact's at `lg` (55px at 390px). Fixed with a `min-h-*` spacer wrapped around Contact's two lines — full reasoning and the exact values are in the comment directly above it in `contact/page.tsx`, since that is where anyone tuning it next will already be looking. Values were arrived at by measurement and adjustment, not computed from the CSS box model on paper: an initial estimate landed within 1–5px, and two rounds of measure-then-adjust closed it to 0.1–0.6px at every breakpoint tested — see that file's comment for why touching Contact's spacer rather than About's trailing content was the right side to adjust.

### 2026-08-27 — Featured products gets a paging row: `< • • || • • >`, modelled on About's gallery dots

**Client: "Like in 03 info section of about us we have images right below that we have moving dots moving along with images. I want to implement same thing for featured products sections below the cards in this way < • • • || • • • >. Where pause button is at centre, then at the corners we have < and > toggle buttons but they should not be a circle in design but just < and > no boundary."** `home/FeaturedProducts.tsx` had a pause/play button already (added 2026-08-26) but no dots and no direction arrows — those existed once, and were explicitly removed the same day ("the direction arrows that once ran this in reverse are gone"). This reinstates them, not as a plain revert but alongside dots, in the layout the client sketched: `<` — dots split either side of the centred pause control — `>`.

**Dots are one per product, not one per page of visible cards** — same convention as `about/AboutGallery`'s own dots, which the client named directly as the model. New `stepIndex` state, computed in the existing `measure()` callback the same way `AboutGallery`'s `index` already is: `Math.round(scrollLeft / step) % products.length`, so a position past the seam (in the belt's duplicate copy) still lights a real dot instead of running off the array. Split `Math.ceil(length / 2)` first, the rest second, around the pause button — with up to 8 featured products this lands close to even regardless of parity.

**A new `retreat()` mirrors `advance()` in the opposite direction** — the belt's own backward-stepping function had never existed; the old arrows this replaces predate the current doubled-list seam-crossing belt entirely. The same problem `advance()` solves for the forward seam has a mirror image here: a native `scrollLeft` cannot go negative, so stepping back from within one step of the start would otherwise just clamp at 0 instead of moving. `retreat()` pre-corrects by jumping *forward* one set-width first when close to the start — landing on the duplicate copy's identical content, so the jump is invisible — then steps back from there with room to run. `correctSeam`'s own doc comment needed a fix alongside this: it already only handles the forward seam (correct — there is no backward one, since the duplicate content only ever exists ahead of the first set, and `retreat` handles its own pre-correction before it steps), but its stated *reason* ("the belt itself only ever moves forward now that the direction arrows are gone") was about to become false and was rewritten to state the actual invariant instead.

**Arrows are deliberately not styled like the existing pause button** ("they should not be a circle in design but just < and > no boundary"). New `ChevronLeftIcon`/`ChevronRightIcon` in `icons/ui.tsx` — bare two-stroke chevrons, matching the existing `ChevronDownIcon`'s style exactly, not the site's other `ArrowLeftIcon`/`ArrowRightIcon`, which draw a full arrow (shaft plus head) rather than a bare angle bracket. New `ArrowButton` component: no border, no background, no shadow, no `rounded-full` — confirmed directly (`border-width: 0px`, `box-shadow: none`, `border-radius: 0px`), just the glyph at `text-muted`, darkening to `text-ink` on hover, the same resting/hover pair as a plain text link rather than a button-shaped control. `PageButton` (the pause/play control) keeps its own circular, bordered, `shadow-card` styling untouched — its doc comment updated to say the two now look different on purpose, not by accident of history.

**The whole row is gated more loosely than the pause button alone**: `products.length > 1 && (canLoop || canScroll.left || canScroll.right)`, versus the pause button's own `autoplay && canAdvance`. A `prefers-reduced-motion` visitor has `autoplay` off, which would have hidden a row gated only on the tighter condition — but manual paging via the dots and arrows is exactly what that visitor still wants, autoplay or not.

Verified directly, not assumed: an initial confound in testing this — clicking arrows while autoplay was still running concurrently, landing an independent autoplay tick mid-sequence — read as a step advancing by two instead of one; re-tested with autoplay paused first, and separately confirmed pause/resume both work correctly on their own and combined with manual navigation. Scroll position after 3× next / 2× prev lands exactly where arithmetic predicts (0 → 411 → 821 → 1232 → 821 → 411 at this viewport), the correct dot lights at each step, dot clicks jump straight to the right product, and paused autoplay resumes and continues advancing normally. Confirmed no horizontal page overflow on a 390px mobile viewport, and the row renders correctly in both themes. Two pre-existing lint findings in this file (a `set-state-in-effect` error on the unrelated `hoverCapable` effect, and an `exhaustive-deps` warning on the autoplay interval effect) were confirmed present on the file before this change too, via `git stash`, and left as out of scope.

### 2026-08-27 (SEO) — Root `/favicon.ico` was 404ing; the favicon and Organization JSON-LD both replaced

**Client, relaying a senior's audit note:** two separate SEO findings, both fixed.

**Missing root `/favicon.ico`.** `src/app/icon.png` alone gets Next.js to emit a `<link rel="icon" href="/icon?<hash>">` tag, which covers browsers that read the HTML — but a crawler or browser that requests `https://vkon.in/favicon.ico` directly, bypassing the page entirely, got a bare 404, since nothing was served at that literal path. Confirmed the failure mode directly before fixing it: `curl localhost:3000/favicon.ico` in dev returned 404 against the pre-fix tree. Fixed with Next's own `favicon.ico` file convention (`src/app/favicon.ico`) rather than the audit note's suggested route — a static file in `/public` plus a manual `metadata.icons` block in `layout.tsx` — checked against this exact Next 16.2.12 install's own docs (`node_modules/next/dist/docs/.../app-icons.md`) rather than assumed from general Next.js knowledge, per this project's own "not the Next.js you know" warning: `favicon.ico` in the root `/app` segment is auto-detected and Next injects the `<link>` tag itself, the same mechanism `icon.png` already relies on with no manual metadata block, so adding one alongside would have been redundant against working precedent already in this codebase. Verified after the fix in both `next dev` and a real `next start` production server (a separate concern from dev-only behaviour): `curl` against the bare, query-string-free path returns `200` with `content-type: image/x-icon` in both.

**The favicon content itself, not only its route.** The audit's other half: "The favicon is still the old circular badge. A wordmark does not survive 32px; it needs its own mark, probably just the red 'o'." `icon.png` was the full "Vkon Automation" wordmark inside a thin-ringed circular badge — fine at logo size, illegible at 16–32px. Replaced both `icon.png` and the new `favicon.ico` with a standalone mark: the red "o" glyph cropped directly out of the existing wordmark artwork (`public/brand/vkon-logo-light.png`), not a new shape invented from scratch, so it stays recognisably the same brand mark rather than a fresh interpretation. The crop needed one touch-up — this logotype's letters interlock (no gap between "k" and "o" in the source art), so a pure colour-threshold crop pulled in a small disconnected fragment of the "k"; found by inspecting column-by-column ink presence near the left edge, confirmed it was a separate, unconnected blob (not part of the "o"'s own outline curve) before clearing it. Transparent background, confirmed with the client rather than assumed, given this is a visible brand asset most users have no reason to think of as "just a technical fix." Rendered at true favicon sizes (16×16, 32×32) before shipping to confirm it actually reads at the size that matters, not just at editing resolution — the current `favicon.ico` carries 16/32/48px frames, generated from one transparent master via Pillow's ICO writer (`Image.save(..., format="ICO", sizes=[...])` — note this only works correctly saving the *original*-resolution master with the `sizes` list; pre-resizing each frame and passing them via `append_images` silently wrote a single-frame file instead, caught by inspecting the output with `file` rather than assuming the call succeeded).

Not touched: `apple-icon` (no file convention for it exists yet, and none was flagged in the audit — adding one now would mean deciding whether it also gets the red-o treatment or keeps the full badge at the larger size Apple's home-screen icon actually renders at, a separate decision this entry deliberately leaves open) and `site.logo` (still `vkon-logo-round.jpeg`, the more elaborate 3D-styled badge used for Open Graph and the JSON-LD `logo` field below — the audit's "too much detail" concern was specifically about the 32px favicon, not the knowledge-panel logo, which renders considerably larger).

**`organizationJsonLd()`'s `@type` was `"LocalBusiness"` alone.** Google's own Logo structured-data examples use `Organization`; the audit note's claim that a bare `LocalBusiness` type does not reliably feed Google's logo-indexing pipeline (despite `LocalBusiness` technically extending `Organization` in schema.org's hierarchy) could not be independently confirmed without Search Console access, but costs nothing to hedge against. Changed to `"@type": ["Organization", "LocalBusiness"]` — an array of types is valid JSON-LD — rather than replacing `LocalBusiness` outright, which was the audit's other offered option: checked every field this function already sets (`address`, `telephone`, `foundingDate`, `areaServed`, `sameAs`) against schema.org's property list first, and none of them are `Place`-specific properties (like `openingHoursSpecification` or `geo`) that only `LocalBusiness` carries and a bare `Organization` would drop — so the array costs nothing already working (this function's own comment: "so the phone number and address are eligible to appear directly in search results") while adding the `Organization` type the logo pipeline wants. Verified the rendered `<script type="application/ld+json">` output directly rather than trusting the source change alone: `"@type":["Organization","LocalBusiness"]`, with every other field unchanged.

Next steps outside this session's scope: submit the homepage through Google's Rich Results Test and request a Search Console recrawl once this is deployed — both need the live domain, not local dev.

**Same day, client after seeing it live: "that was not the logo right i dont want that shown to people i wanted the original logo instead. Thar red O has no reference to my business."** The red-"o" mark is reverted — `icon.png` restored byte-for-byte from the commit before this entry (`438a4ce`, confirmed with `git diff --exit-code` against it), and `favicon.ico` regenerated from that same original circular-badge artwork rather than left pointing at the red o. The client's call on their own brand mark, not overridden: legibility at 16–32px is a real cost of going back to the full wordmark-in-a-ring (the original audit's point stands), but "does not look like my business" is a harder failure than "slightly soft at tab size," and it is their identity to weigh that trade on.

**What stays from this entry despite the revert:** the `/favicon.ico` *route* fix — a crawler or browser hitting that literal path still gets `200`, now serving the original badge instead of a 404 or the red o; confirmed again with the same `curl` check post-revert. The `organizationJsonLd()` `@type` array change is untouched — the client's objection was specifically about the favicon image, not the JSON-LD schema, and nothing in their message referred to it.

**Same day, client supplied a purpose-made mark: "I have placed a favicon_logo in png and .ico format use that instead... Check if .ico quality is good if not convert."** A dropped-in `favicon_logo.png` (1024×1024, solid white background despite RGBA mode — not actually transparent) and `favicon_logo.ico` (a single 32×32 frame) at the repo root, both removed after their content was copied into place. The provided `.ico` was checked before use, not assumed adequate: single-frame, and rendering it (and a fresh resample of the PNG) at real favicon sizes showed the ring and "V" both faint at 32px and close to illegible at 16px — a stroke-weight issue in the artwork itself, not something a better resize algorithm fixes. Regenerated a proper multi-frame `favicon.ico` (16/32/48px) from the high-resolution PNG instead of using the provided single-size file, keyed the white background to transparent first (this project's established favicon preference, from the earlier red-o round), and tightened the crop to the mark's own bounding box plus small padding so it isn't swimming in a mostly-empty square — all straightforward technical improvements on the client's own asset, not a design change, so implemented without another round of sign-off. The 16px legibility softness was flagged back to the client rather than silently accepted or silently fixed by altering their design.

**Same day, a further senior note arrived: "Google Search Results: Must be a multiple of 48×48 px... Crop the image according if required."** Checked against Google's current published favicon guidelines (`developers.google.com/search/docs/appearance/favicon-in-search`) before acting on it, the same discipline applied to the Next.js-version-specific claims earlier in this entry — the "multiple of 48" framing is not what the source states. Google's actual requirement: square (1:1), at least 8×8px, with 48×48px or larger *recommended* for quality across surfaces — a soft floor, not a mandatory multiple. Not implemented as a new constraint because nothing needed to change to satisfy it: `icon.png` is 192×192 (already a multiple of 48, and well past the 48px recommendation either way) and `favicon.ico`'s largest frame is exactly 48×48, so the current assets clear the *real* documented bar regardless of which reading of the senior's paraphrase is intended.

**Same day, split resolution: "icon you keep same (Which means the original)... favicon.ico i send right use that (The current one we are using)."** The two files this whole entry has been treating as a matched pair turned out to have different owners' preferences: `icon.png` — the source of the `<link rel="icon" sizes="192x192">` tag, what a browser tab shows next to the page title, per the senior's own browser-tab screenshot — goes back to the original circular badge (re-extracted from `438a4ce`, the commit before any of this entry's changes, and confirmed byte-identical against it again). `favicon.ico` — the literal root-path file, what this entire entry was originally about fixing the *existence* of — keeps the "V" mark from `favicon_logo.png`/`.ico`, unchanged. Both files are legitimately independent: Next.js emits a separate `<link rel="icon">` tag for each (confirmed in the rendered `<head>`, both present simultaneously), and different browsers/contexts pick between them, so there is nothing contradictory about the tab icon and the bare `/favicon.ico` response being two different images. Verified by fetching each route directly post-change: `/icon.png` returns the circular badge, `/favicon.ico` returns the V mark.

Also, separately, this round's deploy needed a manual step: the previous entry's `git commit --amend` + force-push had already been run against `origin/main` by the time this split landed, which left the deploy host's checkout diverged (it still had the pre-amend commit, force-push doesn't reach a separate clone) — its own CI agent correctly refused to auto-resolve that ("the agent will not force-reset"), so it was fixed by hand: `git fetch origin && git reset --hard origin/main` run directly on the host over SSH, after confirming its working tree was clean first.

**Same day, client: "still see the same O logo... use this favicon.ico i converted into standard size 144x144."** A new `favicon.ico` dropped at the repo root, noticeably higher quality than either prior attempt — a proper 10-frame package (16 through 256px, including the "multiple of 48" sizes from two notes up: 48, 96, 144) that stays crisp at every size checked, 16px included, unlike the hand-built version from earlier in this entry. Used as provided, no touch-up — this one reads as a finished, professionally generated asset rather than a raw crop needing cleanup, so the same "fix the clear technical gap, don't quietly redesign" line drawn earlier in this entry says leave it alone. Its background is opaque off-white, not transparent; not changed to match this entry's earlier transparency preference without asking, per the standing lesson from the red-o round about not making unrequested calls on brand-identity assets. `icon.png` untouched — this message was specifically about `favicon.ico` only, consistent with the split immediately above.

"Still see the same O logo" is very likely the browser's own favicon cache, not a serving problem: `Cache-Control: no-cache, must-revalidate` was already confirmed on the response before this change, meaning the server was never the source of staleness — browsers are known to cache favicons independently of normal HTTP cache rules, sometimes surviving a hard-refresh and requiring a closed-and-reopened tab, a cleared site-data cache, or a private window to show the update.

### 2026-08-27 (contact page, next session) — "Where we are" boxed to match the enquiry card, which also aligned the two headings for free

**Client: "create a box around the where we are section to Hours Monday – Saturday, 9:30 am – 6:30 pm IST. Such that the text send us an enquiry and on the right side where we are text are on the same row aligned. Also include the same glow animation to the where we are box as well."** `contact/page.tsx`'s right column (heading, map, address, "Open in Google Maps", the Hours line) wrapped in the identical `TiltCard max={0}` + padded, bordered, `tilt-glare`-carrying `<div>` the enquiry card already uses — same reasoning as that card's own entries above (glow via `--mx`/`--my`/`data-active`, rotation permanently off via `max={0}`, no `tilt-layer` on the children).

The heading-alignment half of the request needed no separate fix: both columns are equal-width `lg:grid-cols-2` cells starting at the same top edge, and once both headings sit as the first item after the *same* `p-6 sm:p-8 lg:p-10` top padding, they land on the same row as a consequence of the shared wrapper, not a bespoke margin adjustment. Verified directly rather than trusting the CSS reasoning alone: both headings' bounding-box `y` coordinates measured identical.

Not height-matched (no `h-full`/`items-stretch` between the two boxes) — the client asked for the headings to align, not the boxes to be equal height, and this column's content is a different length to the form's regardless, so the two cards end at different points; only their top edges were in scope.

Confirmed both `TiltCard`s work independently on the same page (two `.tilt` elements, hover-tested each in isolation) — worth recording that an early verification pass read one of them as inactive on hover, which turned out to be a scroll-timing artifact in the test script (a stale `boundingBox()` captured before a smooth-scroll finished settling, not a rendering bug): recomputing the bounding box after an explicit settle wait made both cards activate reliably on every run.

**Same day, client after seeing it: "No remove the box and animation on where we are. Just align where we are text with send us an enquiry text."** The box and glow above were the wrong read of the original request — alignment was the actual ask, boxing was this session's route to it, not the goal itself. Reverted `TiltCard`/border/background/shadow/`tilt-glare` entirely; the column is bare again, same as before this whole entry. Alignment survives on its own: the heading's wrapper kept `pt-6 sm:pt-8 lg:pt-10`, matching the enquiry card's top padding without any of the chrome that came with it, since that padding alone was what positioned the heading, not the border or background around it. No horizontal padding on this wrapper — there is no box edge left to inset from. Measured 1px between the two headings' `y` coordinates, not 0 — the enquiry card's own 1px `border-top` accounts for it exactly (padding-only here, padding-plus-border there); left as is rather than added a matching invisible border, since 1px is well under any threshold a client asking for "same row" is going to notice or care about.

### 2026-08-27 (§04 social media, later) — Background glow, per-platform button colour, centred names

**Client: "when a cursor is hovered over a card i also want the background to also have glow not just the border."** Added as a third `box-shadow` layer, `0 0 32px color-mix(in srgb, var(--brand) 45%, transparent)`, alongside `var(--shadow-card-hover)` rather than a duplicate of its two values (so the two can't drift apart if that token changes). Not an internal radial-gradient overlay, unlike `tilt-glare` elsewhere on the site: this card's chrome bar, cover band and content area are each their own opaque background, so a glow layered *behind* them would be invisible under all three. A box-shadow paints outside the border box regardless of what's inside it, and is unclipped by the card's own `overflow-hidden` (which only clips overflowing descendants, never the element's own shadow) — confirmed no ancestor between the card and the page adds its own `overflow-hidden` that would clip it either. Verified in a screenshot: a soft blue halo bleeding a few pixels past Facebook's card edge on hover.

**Same day, client after seeing it: "Lets remove the background glow on pop up."** Reverted to plain `group-hover:shadow-card-hover` — the third `box-shadow` layer above is gone, the card's own `overflow-hidden` bg-surface-raised behind the chrome bar/cover band/content is untouched, and the brand-coloured border intensify-on-hover from the entry below is unaffected (a separate property, `border-color`, never touched by this). Verified computed `box-shadow` is back to exactly `shadow-card-hover`'s two neutral layers, no brand tint.

**Client, same message: "view page button should have its respective colour and when cursor is hovered over it, it should have the loading animation like in the explore our products and download our brochure button in thier respective colours. Lets make the view our page button white in dark mode and black in light mode."** The "View page" button switched from `ui/Button` to a bespoke `<a>` — `ui/Button`'s `sweep` prop hard-codes its fill to `bg-accent`, one colour for every button using it, and this needed each card's own `profile.color`, which `ui/Button` has no way to accept. `href` here is always a bare `https://` URL, never an internal path, so there was no routing logic to lose by dropping the shared component. Resting colour is the same literal black/white pairing as `SubscribePanel`'s button (`border-band`/`text-band` in light mode, `dark:border-band-ink`/`dark:text-band-ink` in dark), reused for consistency; the sweep fill is `before:bg-[var(--brand)]`.

**Hover text colour is computed per platform, not fixed** — added `contrastTextColor()`, a small WCAG relative-luminance function that picks whichever of black or white clears more of the 4.5:1 bar against `profile.color`. Necessary because no single fixed choice works across all five: by the same formula, white passes against X's black and LinkedIn's blue but fails Instagram's pink, Facebook's blue and YouTube's red (4.0–4.3:1); black passes those three but is invisible on X's own black fill and fails LinkedIn's blue (3.7:1). Verified computed hover `color`/`background-color` for all five platforms in both themes — each lands on the predicted choice (black for Instagram/Facebook/YouTube, white for X/LinkedIn), identically in light and dark, since the choice depends only on the brand colour.

**Found while checking dark mode specifically: `hover:text-band` lost to `dark:text-band-ink` when both matched at once** (hovering while the site itself is in dark mode) — confirmed directly, not assumed: Facebook's dark-mode hover kept the resting near-white text instead of switching to the computed black. Fixed with explicit `dark:hover:`/`dark:focus-visible:` compound variants rather than relying on cascade order between two simple ones resolving the way intuition suggests; re-verified across all five platforms and both themes after the fix, all correct.

**Client, same message: "bring the social media names to the centre."** `justify-center` added to the icon+label row above each card — full width already (it spans the same column as the card below it), so this is `justify-content`, not `text-align`; the icon travels with the name as one centred unit. Verified computed `justify-content: center` and confirmed in a screenshot on the mobile stacked layout, where the row is at its narrowest.

### 2026-08-27 (§04 social media) — Platform name and card pop together; border switched to brand colour

**Client: "I want the box pop up to include name of the social media above it as well. Also the name should pop up seperately, the animation design is left to you. Also the box of particular social media should have it respective colour as boundary, also when pop up that colour should increase."** Four asks in `about/SocialProfileCard.tsx`, three of them about mechanism rather than just styling.

**Name and card had no way to react together as written** — the platform name (icon + `h3`) sits *before* the card in DOM order, and the card's pop was a plain `:hover` on itself. CSS sibling combinators only select forward, so a card-only hover can never reach an earlier sibling; the two could not have shared a trigger without a structural change. Fixed by promoting the outer wrapper to `group` and switching the card's hover classes to `group-hover:` — hovering the card still pops it (hovering it is hovering inside the group), and hovering the name now does too, both firing together either way. Verified directly rather than assumed: hovering the name and hovering the card produce identical computed `transform` values on both elements.

**The name's own pop** is a scale (`group-hover:[transform:scale(1.08)]`), deliberately not a repeat of the card's translateY lift — chosen so the two read as two things responding together rather than one dragging the other. Scale doesn't consume layout space the way a translate does, so there was nothing to check for overlap with the tight `mt-2` gap to the card below.

**Border replaced the neutral `border-line`/`hover:border-line-strong` pair with the card's own `--brand` custom property** (already set on the wrapper for the cover-band wash, one line down) — `border-2 border-[var(--brand)]/35` at rest, `group-hover:border-[var(--brand)]` (full strength) on hover, so "the colour should increase" is literal: more of the same colour, not a second one swapped in. Width is a constant `border-2` in both states — thickening on hover as well would reflow the box a pixel each way, and the opacity jump alone reads clearly as "more" without that cost. Checked X's card specifically before committing to a single opacity value for all five: its brand colour is pure black (`#000000`, `about/page.tsx`), and 35% black over `bg-surface-raised` renders as a legible mid-grey rather than vanishing the way a very light or desaturated brand colour might have at the same opacity — confirmed in a rendered screenshot of the full row, all five borders distinguishable at rest.

### 2026-08-27 (later still) — Subscribe panel: button/input recoloured to invert with the page theme; scrim gradient shortened

**Client: "Lets make the button and input box white in dark mode and black in light mode. Such that the subscribe button glows from white to green or black to green."** A deliberate, one-off break from `band-*`'s documented theme invariance (the tokens are calibrated for the photograph, not the page's light/dark toggle — noted beside their definitions). Both the input pill (`bg-band`, unchanged in light mode since it was already near-black; `dark:bg-white` added) and the submit button (same resting pair) now use `dark:` variants, which this project already wires to `[data-theme="dark"]` via the `@custom-variant dark` line near the top of `globals.css` — the same mechanism `Logo.tsx` and `IntroSplash.tsx` use to swap logo images between themes, not a new pattern.

Text/placeholder had to follow the background swap for legibility, and there was no existing token that fit directly: every semantic colour here (`text-band-ink`, `text-band-muted`, `text-muted`) is designed to auto-invert *with* the page theme, but this component's surface is now inverted *against* it, so the token that is correct for the page's dark theme is exactly the wrong one for this white surface. Landed on `dark:text-band` (reusing the existing near-black band token as text rather than background) for the input value and the button label, and a hard-coded `dark:placeholder:text-[#5a636c]` for the placeholder — that hex is `--color-muted`'s own light-theme value, copied verbatim rather than inventing an unrelated grey, since it's already the site's vetted answer to "muted text on a light surface."

The button's sweep fill changed from `band-accent-strong` to the ordinary `accent` token, and this was a contrast-driven choice, not a style one: with the resting colour now black/white instead of green, the *hover* colour is the only green involved, and it needs to stay legible against whichever text colour sits on top of it. `band-accent` (`#4cae81` in light mode) against white text measures ~2.7:1 by the WCAG relative-luminance formula — a real dip, and not one with existing precedent elsewhere in this codebase despite first assuming `ui/Button`'s own sweep buttons carried the same tradeoff (checked directly: they sweep to `accent`, not any `band-*` token, and white-on-`accent`'s light-mode value, `#23703d`, is 6.1:1 — no dip at all). Switching this button's sweep to plain `accent` avoids inventing a new problem: light mode's hover is white-on-`#23703d` at 6.1:1, and dark mode's is `dark:text-band` on `accent`'s dark-mode value — which happens to equal `band-accent` exactly, `#4cae81` — at 6.2:1. All four resting/hover × light/dark combinations now clear 4.5:1, the two resting pairs by a wide margin (~17:1, near-black on white or the reverse).

Verified directly: computed `background-color`/`color` for the pill, input, and button in both themes match the intended pairs (confirmed a mid-transition read that initially looked wrong — `rgb(103,106,110)` on the button's text right after a theme switch — was `transition-colors` still animating, not a broken override; a longer settle wait resolved to the correct `rgb(24,29,34)`); the sweep fill's computed colour reads `rgb(35,112,61)` (`#23703d`) in light mode and `rgb(76,174,129)` (`#4cae81`) in dark mode; and the input remained typeable throughout.

**Same message, second half: "reduce dark tint length from left to centre/right on the background image by 20%."** The sharp panel's left-to-right scrim (`bg-gradient-to-r from-scrim/88 via-scrim/70 to-transparent`) had its stops compressed from the implicit `0%/50%/100%` to explicit `via-40% to-80%` — same shape, held within 80% of the element's width instead of the full width, so the tint reaches full transparency a fifth of the way sooner. Gradient colour-stop position utilities (`via-N%`, `to-N%`) hadn't been used anywhere else in this codebase and this project has a real history of specific Tailwind utilities silently no-op'ing (`scale-x-*`, negative `-translate-y-*`, `translate-x-1`, all on record above), so this was checked rather than assumed: computed `backgroundImage` on the div shows `40%` and `80%` literally present in the rendered `linear-gradient(...)` — the named utilities compiled correctly this time, no arbitrary-property fallback needed.

### 2026-08-27 (even later) — Subscribe panel: gradient shortening reverted, green outline added to the button

**Client: "Lets revert the dark tint on the background image to previous version. Lets have green outline on the subscribe button."** The `via-40% to-80%` gradient-stop change from the entry directly below is undone — the left-to-right scrim is back to the implicit `via-50% to-100%` stops it shipped with originally, confirmed via computed `backgroundImage` reading `50%`/`100%` again.

Border added to `SubmitButton` itself (`border-2 border-accent`), not the pill wrapper around it — the pill's own `border-band-line` is a separate, unrelated border and stays as it is. Colour is the same `accent` token already driving the sweep fill, not a second green: at rest the outline is `#23703d` (light) / `#4cae81` (dark), and it happens to match exactly what the button floods to on hover, so there's one green in this component's vocabulary, not two competing ones needing their own justification. Verified computed `border-width`/`border-color` read `2px` / `rgb(35, 112, 61)` in light mode and `2px` / `rgb(76, 174, 129)` in dark mode.

### 2026-08-27 (later) — Subscribe panel's button gets the sweep, reproduced locally rather than switched to `ui/Button`

**Client: "add the loading animation to the subscribe button in subscribe section."** Same left-to-right `::before` fill as `ui/Button`'s `sweep` prop (`layout/SubscribePanel.tsx`'s `SubmitButton`), but hand-written on the existing bespoke `<button>` instead of switching it to `ui/Button` the way the contact page's enquiry-form submit button did earlier the same day. That component is hard-set to `rounded-sm` — its own doc comment states "No pills, no shadows" as a rule — and its colour variants are all `action`/`accent` tokens for an ordinary page surface; this button is a `rounded-full` pill using the `band-*` token family specifically calibrated for text over a photograph, so swapping components would have meant fighting the shared one's opinions rather than reusing them.

Fill colour is `band-accent-strong` (`#7ecba6`), not the button's own `band-accent` (`#4cae81`) — sweeping a colour into itself would be invisible. `band-accent-strong` already exists in the token set for a related but distinct purpose (accent text over the hero scrim, per the comment beside its definition), reused here as a background rather than adding a new colour for one effect. Checked it doesn't fight the text contrast note two lines above it (`text-band`, near-black, chosen because white-on-`band-accent` is 1.9:1): `band-accent-strong` is strictly lighter, and by the same relative-luminance formula `text-band` against it comes out around 8.9:1, so the sweep only gains contrast, never costs it. Dropped `hover:opacity-90` — with the sweep itself as the hover signal, dimming the whole button including the new fill on top of it would just muddy the effect rather than adding one.

Verified directly rather than assumed: computed `transition-duration` on the pseudo-element reads `0.7s` (matching `ui/Button`'s own sweep timing) and the `transform` genuinely animates `matrix(0,0,0,1,0,0)` (scaleX 0) → `matrix(1,0,0,1,0,0)` (scaleX 1) over that window, not a static end-state; `overflow-hidden` clips the fill to the pill shape rather than showing square corners; and the button's `border-radius` and `text-band` colour are unchanged from before.

### 2026-08-27 — Contact page borrows three interaction patterns from About and the featured cards

**Client: "add the same glowing white in dark mode and green in light mode animation to the send us an enquiry box. Same as in about us page boxes."** `contact/page.tsx`'s enquiry card wrapped in `about/TiltCard` — the exact pattern `about/page.tsx`'s §01 market cards and §02/§03 boxes use: a `tilt-glare` span as the first child for the cursor-tracked glow, `tilt-layer` on each direct child (the heading, the paragraph, the form wrapper) so they stand off the tilted face. No `max-w-*` on `TiltCard` itself unlike the about page's own usage — there it was needed because those boxes sit in a `grid-cols-[minmax(0,16rem)_1fr]` layout with room to spare; here the existing `lg:grid-cols-2` column already constrains the width, and `TiltCard` renders a plain block `<div>` that fills it without help. Verified the card still works as a form and not just a decoration: typed into a field successfully, confirmed `--rx`/`--ry` genuinely change with cursor position (not just visually static classes), and confirmed a focused input's rect stays fully inside the tilt wrapper's bounds — the new `overflow-hidden` needed for `tilt-glare` to clip correctly had a real chance of cutting off a focus ring, and didn't.

**Same day, client after seeing it: "I just want the glowing animation, not distorting the enquiry box."** Rotation only, not the glow, turned out to be the objection. Fixed with `TiltCard max={0}` and no other change: `max` is the sole scale factor in `TiltCard`'s rotation formula (`(0.5 - py) * max * 2`, `(px - 0.5) * max * 2`), so `max={0}` holds `--rx`/`--ry` at a permanent `0deg` while `--mx`/`--my` and `data-active` — the glow's only inputs — are computed exactly as before; nothing changed in `TiltCard.tsx` or `globals.css`, and the about page's own `TiltCard`s, which don't pass `max`, keep their rotation untouched. Also dropped `tilt-layer` from the card's three children: that class puts a `translateZ(2.2rem)` on each one, and a translateZ'd element under the wrapper's `perspective(900px)` renders measurably larger than its natural size *regardless of rotation* — confirmed via the standard perspective-projection scale factor, `d / (d - z)` = `900 / (900 - 35.2)` ≈ 1.04, a static ~4% enlargement with `rotateX/Y` pinned at `0deg`. Left in, that would have been exactly the kind of residual visual distortion the client's "not distorting" was asking to remove, and with no tilt left, `tilt-layer`'s purpose — standing content off a tilting face — no longer applies anyway. Verified directly: `--rx`/`--ry` read `0deg` and the wrapper's computed `transform` is an identity `matrix3d` at both card corners; `--mx`/`--my` still track the cursor precisely (1.7%/1.2% near the top-left corner, 98.3%/98.8% near the bottom-right); glow opacity reaches `1` while active and `0` after `pointerleave`; the light-mode background resolves to the green `color-mix`, the dark-mode background to the white `rgba`; and zero `tilt-layer` nodes remain inside the card.

**Same day, client again: "I do not want the glowing animation on the text box."** Asked which "text box" — the whole card, the form fields, or just the message textarea — and the client chose the form fields. Implemented (now reverted, see below): gave the form's wrapping `<div>` (previously bare `mt-10`) `relative z-10 bg-surface-raised`, lifting it above `tilt-glare`'s implicit stack level so the glow stopped at the top of the form section.

**Same day, client once more, after seeing that: "I meant only the boxes where we input text not the text above it. Like in the first version where the enquiry box was distorting the glow animation in that was perfect, except for the box distorting."** The `z-10`/`bg-surface-raised` change above was a misread of the previous message — the client's actual reference point is the very first `TiltCard` version (the "add the same glowing… animation" entry higher up this same date): uniform glow across the whole card, fields included, with only the rotation as the objection — which is exactly what the `max={0}` fix already delivered. Reverted the form wrapper to plain `mt-10`; the glow is uniform across the card again (heading, paragraph, and every field), rotation stays off. Verified: glare opacity reads ~1 while the cursor sits directly over the "Your name" input, screenshots in both themes show the glow visibly washing over that field the same way it does the paragraph above it, the card's computed transform stays an identity `matrix3d` (still no rotation), and the field remained typeable.

**Same day, one more round, now precisely scoped: "There should be no glow on the input boxes namely name, phone, email and what do you need... only in the input box there should no glow... the text where it describes what to enter like above first box we have text your name that should glow not the box where we input below it."** Unambiguous this time, and narrower than the reverted `z-10`-on-the-whole-form-wrapper attempt two entries up: only the `<input>`/`<textarea>` elements themselves lose the glow, not their `Field` labels or hint text. Fixed in `EnquiryForm.tsx`'s shared `input()` helper (used by all four visible fields) by adding `relative z-10` to its returned class string — the field already had an opaque `bg-surface-subtle`, so lifting just the element above `tilt-glare`'s implicit stack level (positioned, `z-index: auto`, which paints above ordinary in-flow content regardless of DOM order) is enough; nothing about the label above it changes, since `Field`'s `<label>` stays plain in-flow content and keeps showing the glow. Verified: glare opacity reads ~0.98 while hovering directly over the "YOUR NAME" label and ~1 while hovering the input box beneath it (the glow layer itself is equally active in both spots — only the *painted* result differs), the input's computed `position`/`z-index` read `relative`/`10`, and screenshots in both themes show the glow visibly covering the "YOUR NAME" and "EMAIL" labels while stopping cleanly at each field's own border. (Caught mid-verification: a stray `next start` production server was squatting on port 3000 from outside this session, so the dev server had silently bound to 3001 instead and an early check against `:3000` was reading stale, pre-edit content — not touched, since it might be the client's own preview; verification was redirected to the port the dev server actually logged.)

**Client: "the send enquiry button should have the same loading animation as in explore products and download our brochure in about us page."** `EnquiryForm`'s `SubmitButton` switched from a bespoke `<button>` to `ui/Button` with `sweep` — the same prop those two about-page buttons use, rather than re-implementing the sweep a second time. `variant="primary"` (the default) is `bg-action text-action-ink hover:bg-action-hover`, identical to what the bespoke button already had, so resting and hover colours are unchanged; the size preset (`lg`) differs slightly from the old bespoke padding (`px-6`/`text-[0.9375rem]` vs the old `px-8`/`text-sm`), accepted for consistency with the two reference buttons rather than kept pixel-identical. Verified the sweep actually completes, not just starts: caught it mid-transition once (`scaleX ≈ 0.87`) and re-checked past the 700ms duration to confirm it reaches `scaleX(1)`, the same discipline this file's own history has needed more than once when checking Tailwind transitions.

**Client: "the open in google maps button should have the same animation as in view details button in featured product cards."** The link's `.link-cta` class replaced outright with `product/ProductCard`'s "View details" pattern — replaced, not layered, since the two disagree about the resting state (`.link-cta` shows an underline always, turning green on hover; this shows none until hover, then sweeps one in), and running both would show two competing underline behaviours on one element. `inline-flex`, not `flex` — "View details" uses `flex` because it is one of two items in a `justify-between` row; this link sits alone in normal page flow, and `inline-flex` sizes it to its own content instead of stretching to fill a container that isn't there. A named group (`group/maps`) scopes the effect regardless of what other `group`s exist elsewhere on the page.

**Found copying that last pattern: `translate-x-1` is a fourth instance of this Tailwind version's silent bracket-value gap**, alongside the `scale-x-*`/`-translate-y-*` ones already on record in `ui/Button` and `product/ProductCard`. The arrow's hover-shift is part of the "View details" pattern being copied, and confirming it before shipping it turned up that it does nothing on the *original* either — `getComputedStyle(svg).transform` reads `"none"` on hover on both the source ("View details" in the featured cards) and a faithful copy of the same class here. Fixed here with the established arbitrary-property workaround, `[transform:translateX(0.25rem)]`; the original "View details" arrow was left exactly as it is, the same scoping decision made for the other three instances — fix where new code is already being written, flag rather than drive-by-fix the rest.

### 2026-08-26 (part ten, same day) — Footer hover-pause reinstated, third attempt, this time by skipping the tick rather than rebuilding the timer

**Client, after asking for an explanation first and then choosing between the options offered: "Lets implement option B. Also only the view details and add button row should be able to pause when the cursor hovers."** Third attempt at footer hover-pause; the first two are two and three entries below.

**What was actually wrong with attempts one and two was the timing mechanism, not the scope.** Both folded a hover flag into `running` as React state, which meant the autoplay effect tore the interval down on hover and built a fresh one on un-hover. `setInterval` does not fire on creation, so every exit cost a **full fresh 3s regardless of how much of the cycle had already elapsed** — hover 2.9s into a cycle and you got 3s more, not 0.1s — and crossing a boundary repeatedly reset the countdown indefinitely. That is precisely the "previously when i removed the cursor it would take a while for it to start moving again" the client described, and it is also what made attempt one's footer-wide scope measure as an 8-second freeze under ordinary cursor movement: not one long pause, but the timer being reborn over and over. `home/HeroRotator` already solves this class of problem in this codebase, with `remainingRef`/`startedAtRef` bookkeeping; the belt never had it.

**Option B, implemented: never stop the timer, skip the tick.** The interval now runs permanently whenever `running`, and its callback returns early while `hoverPausedRef` is true. That flag is a **ref, not state** — the essential detail. Nothing re-renders, the effect never re-runs, and the interval keeps its own phase, so a tick spent hovering is *lost* rather than *deferred*, and leaving a footer resumes on the original cadence. Measured: **1475ms to resume** after leaving a footer, against a guaranteed 3000ms before — almost exactly the ~1.5s average the phase-preserving approach predicts. Also confirmed the starvation case that sank attempt one is gone: brief repeated grazes across a footer with ~90% of time spent off it advanced the belt repeatedly over 12.8s, where the old mechanism would have reset the clock on every crossing and never advanced. (That count over-reports somewhat — smooth scrolling means one tick registers across several samples — so it is the qualitative "repeatedly, not never" that is the signal there; the 1475ms figure is the precise one.)

**Scope is the footer row**, per the client's wording, via `data-featured-footer` on `product/ProductCard`'s footer `<div>` and a geometric point-in-rect scan (`isOverFooter`) matching the existing `findCardAt` pattern. Confirmed the scope behaves: hovering a footer for 4s held the belt completely still; hovering a card's *image* for 3.6s let it advance twice, so the pause genuinely does not extend beyond the row. Worth being explicit that Option B fixes resume latency and starvation but **not breadth** — parking the cursor on a footer still holds the belt for as long as it sits there, which is what pausing means; the row is simply a wider target than the two controls alone (attempt two's scope) and that remains a one-line change if it ever feels sticky.

Gated on `hoverCapable`, matching the pop logic, for a specific reason: a touch tap can fire one stray `mousemove` and never a `mouseleave`, which would latch the flag true and stop the belt permanently on that device.

No regressions: the consecutive-footer sweep still runs 24 cards with 0 hover misses, and clicking a duplicate card's add-to-cart still works — both properties from the `inert` fix in the entry below.

### 2026-08-26 (part nine, same day) — `inert` on the belt's duplicate cards was silently killing clicks, not just hover; replaced with `aria-hidden` + `tabIndex={-1}`

**Client: "When i hover the cursor over consecutive 3 cards the button animation works, after 3 i have to go out of the card then bring it. Also the third right most card button dosent animate properly. Could you fix such that in any condition when the cursor is on the 2 buttons it animates and i am able to click it."** The mention of *clicking* is what made this worth re-testing from scratch rather than treating it as another hover-timing complaint — and it turned out to be a genuine, long-shipped functional bug, considerably worse than the animation symptom that surfaced it.

**Root cause: `inert` on the doubled row's second copy disables pointer interaction entirely, not just keyboard and assistive-tech access.** The belt renders every product twice so the loop never visibly rewinds; the second copy carried `inert={canLoop && index >= products.length}`, chosen deliberately (and correctly, for its stated purpose) so screen readers don't announce twelve products where the catalogue holds six, and so keyboard focus can't land in a duplicate. But `inert` also makes the browser treat the whole subtree as `pointer-events: none`. Confirmed both halves directly, not inferred: hovering a duplicate's "View details" never matched `:hover` (6 consecutive autoplay ticks, `inert=true` → `hoverWorked=false` every single time, `inert=false` → worked every time), **and a real click on a visible duplicate's "Add to cart" left `localStorage` completely unchanged** — the button was simply dead. Since the belt spends roughly half its time with a duplicate under the cursor, this is why the client saw it as "works for 3 cards, then stops until I leave and come back": the fourth card onward was the second copy.

This also retroactively explains the earlier "third card doesn't pop" report (part five), which was diagnosed and worked around at the highlight level via `findCardAt`'s geometric scan without recognising that the same `inert` was disabling real user interaction underneath.

**Fix: `aria-hidden` for the accessibility tree, plus `tabIndex={-1}` on the duplicates' focusable descendants for the tab order** — the standard carousel-clone pattern, which delivers both guarantees `inert` was chosen to provide in one attribute, without the third, unwanted one. The `tabIndex` pass runs from an effect rather than declaratively because the focusable elements (title link, "View details", add-to-cart) live several layers inside `product/ProductCard`, which is shared with the catalogue and every other card on the site; threading belt-specific "don't be focusable" plumbing through it would put carousel concerns in a component unrelated to the carousel.

Verified after the change, all directly rather than by reasoning: hover on a duplicate now fires (`:hover` matches, colour resolves to the accent green, underline transform reaches `scaleX(1)`); **clicking a duplicate's "Add to cart" now actually adds to the cart**; a deliberate sweep across **24 consecutive card footers without ever leaving the belt produced zero misses**, which is the client's exact reported scenario; and the accessibility properties `inert` was protecting are intact — all 15 duplicate controls carry `tabindex="-1"`, all 15 real ones carry none, and 60 consecutive Tab presses never once landed inside a duplicate card.

### 2026-08-26 (part eight, same day) — Hover-pause removed entirely; back to plain CSS

**Client, after the previous entry's narrowing: "Nope lets remove the pause when hovering entirely, i just want the view details and add button animation to work properly thats it."** Removed `hoveringControl`, `isOverControl`, and the `data-featured-control` markers entirely — `home/FeaturedProducts`' autoplay no longer reads pointer position at all for pausing purposes, and `product/ProductCard`'s footer controls are plain CSS `:hover`/`group-hover`, exactly as any other hover state on the page, with nothing telling the belt about them.

This closes out a same-day sequence worth having on record as a unit, so it isn't retried piecemeal later: whole-footer pause (too broad — froze the belt 8 seconds under normal browsing) → two-controls-only pause (fixed the breadth, but the client decided the mechanism itself wasn't worth keeping) → removed. What remains is exactly the 2026-08-24 position: the animations are correct CSS, they fire reliably the large majority of the time, and the belt being mid-transition at the exact instant a cursor arrives is a real, accepted, low-frequency cost of not pausing on hover — the same trade-off already made for clicks two entries prior, now confirmed to extend to hover animations too, by explicit client choice rather than by default. Re-verified after removal: autoplay advances normally while "View details" is being hovered (no residual pausing), and all three hover effects — the underline sweep, the colour change, the add-to-cart scale — still fire correctly as pure CSS.

### 2026-08-26 (part seven, same day) — The footer-wide pause was too broad; narrowed to the two controls themselves

**Client, after the previous entry's fix: "Lets not pause when i touch the autoplay, i see same errors such as it not moving when cursor is moved and view details and add button animation pop up not working. Why is this happening tell me before changing anything."** Diagnosed before touching code, per the request:

- **The belt appearing stuck was not a malfunction — it was the previous fix working exactly as built, on a target far bigger than intended.** `data-featured-footer` marked the *entire* footer row, a full-width strip with real empty space in it (`justify-between` puts a gap between "View details" and the add-to-cart button). Confirmed directly: moving the cursor footer-to-footer across three cards, the way someone comparing products actually moves their mouse, froze the belt for a full 8 seconds with zero advances, against an expected two or three — because any cursor movement anywhere along that strip paused autoplay, not just an approach to one of the two controls in it. A second test with the cursor wandering the general row area at random showed the same effect at a smaller scale (1 advance in 10s where ~3 were expected).
- **The animation-miss report was explained already** (previous entry) — pausing only prevents the *next* autoplay tick from being scheduled, it does not interrupt one already mid-flight, so a rare miss right at that boundary was always possible even with the fix in place. Nothing new found here beyond what was already on record.

Client chose to narrow rather than revert entirely: **`data-featured-control` now marks the `Link` and the add-to-cart wrapper individually, in `product/ProductCard`, not the row that holds them.** `home/FeaturedProducts`'s `isOverControl` (renamed from `isOverFooter`) and `hoveringControl` (renamed from `hoveringFooter`) are otherwise the same geometric point-in-rect mechanism as before, just scanning a narrower marker. Re-verified all three claims directly: hovering the gap between the two controls no longer pauses anything (belt advanced normally); hovering either control still pauses (confirmed for both independently); the footer-to-footer wandering reproduction that froze the belt for 8 seconds now advances within one tick (~2.8s); and the original animation-reliability check still holds at the narrower scope (20/20 successful hovers, same as the wider version).

### 2026-08-26 (part six, same day) — Footer hover pauses autoplay, narrowly; "View details" back to neutral-until-hovered

**Client: "The view details and add button animation should work when i bring cursor to it sometimes when i bring cursor from one card to another it dosnet."** Investigated rather than assumed a cause: 15 attempts to hover a footer's "View details" while the belt was free to autoplay produced 1 miss; the identical 15 attempts with the belt paused (via the pause button) produced 0. The animations were never broken — the belt was occasionally moving a footer out from under an approaching cursor between the coordinates being read and the pointer arriving, the same class of friction the 2026-08-24 entry already named and accepted when whole-card hover-pause was removed, just showing up now on a smaller, easier-to-miss target.

Offered three options (pause over the footer only, pause over the whole card, or leave it); client chose the first: **`hoveringFooter`, a new piece of state scoped to exactly the footer, not the whole card.** `home/FeaturedProducts` already scans pointer position geometrically against `[data-product-id]` for the pop highlight (`findCardAt`, itself a fix for the `inert` gap earlier this same day) — `isOverFooter` is the identical pattern against a new marker, `data-featured-footer`, added to `product/ProductCard`'s featured footer specifically. `running` now also requires `!hoveringFooter`. Kept deliberately separate from the existing `paused` state, which the pause button's own icon and label read from — folding footer-hover into `paused` would have shown "Resume" while someone was simply hovering, not pressing anything. Re-verified: scroll position frozen for a full 3s+ tick while hovering the footer, resumes on the very next tick after leaving it, and the pause button's label stays "Pause the featured products row" throughout, confirming the two states don't cross-contaminate. Re-ran the original 15-attempt reproduction afterward at 20 attempts: 0 misses.

This is a narrower carve-out than the whole-card hover-pause removed 2026-08-24, not a reversal of it — hovering a card's image, or the gaps between cards, still does not pause anything. The two situations were judged differently: 2026-08-24 accepted the risk of a click landing on the wrong card because the pause button was reasoned to be the real WCAG mechanism regardless; this pass fixes an animation not firing at all on a control the visitor is looking directly at, a smaller but more certain cost than the click-drift risk was.

**"View details" reverted from green-by-default back to neutral-until-hovered, one day after being made green outright.** Client: "the view details button should be black in light mode and white in dark mode only when i bring cursor over it. It should turn green." `text-accent` (resting) / `hover:text-accent-strong` → `text-ink` (resting) / `hover:text-accent` — `ink` is exactly "black in light mode, white in dark mode" as a single theme-aware token, and this is now the same resting-neutral/hover-green convention every other card's "View details" already used; the underline's own colour matched down to `bg-accent` for consistency, since it only shows once hover is already green. Re-measured resolved colours directly rather than trusting the class names alone (this file's own recurring lesson): light rest `rgb(20,23,26)`/hover `rgb(35,112,61)`, dark rest `rgb(242,244,245)`/hover `rgb(76,174,129)` — matching `--color-ink`/`--color-accent` exactly in both themes.

### 2026-08-26 (part five, same day) — The real causes, finally: the pop's "scale" never worked, and one shared class's `scroll-padding-left` broke this track's snap alignment

**Client, after the previous fix: "Still the right most cards edges are not visible when it pops up."** Investigated properly this time rather than reapplying the same kind of fix again. Directly measured `getComputedStyle(poppedCardInner).transform` on a genuinely popped card: `"none"`. **`scale-[1.05]` and `-translate-y-2.5` are both silent no-ops on this row** — the second one was already on record (2026-08-24) as a known, deliberately-unfixed gap; the first is a new instance of the identical Tailwind bracket-value problem, never previously checked here specifically. Neither has ever done anything visually; only the `outline` and `shadow-card-hover` ever actually changed on pop, which is why the effect still reads as "popping" at all.

Given that, the two prior entries' diagnosis (a transform bleeding past its box) was wrong. **The actual bleed is `shadow-card-hover`'s second layer, `0 10px 28px`** — a 28px blur radius, present on every pop regardless of the transform, and far bigger than the 12px margin sized for the wrong cause could ever cover. Fixed by widening the track's clip-safe margin to match each breakpoint's own `Container` padding exactly (`px-5`/`px-6`/`px-8`, size `wide`) rather than one flat number — 20px/24px/32px of margin via `-mx-5 sm:-mx-6 lg:-mx-8`, using all the room actually free at each width without ever pushing the track past the viewport edge (confirmed: no page-level horizontal overflow at 375px). Only `lg` (32px) fully covers the 28px blur; `sm` and below fall a little short — an accepted trade-off against overflowing a narrow viewport, recorded rather than hidden. Re-verified visually: the previous hard, flat cutoff on the right edge is now a normal soft shadow fade.

**Second, unrelated bug, from an earlier report that day: "the 3 cards are visible at a time. But on the leftmost side the previous card's edge is visible. I dont want that edge visible."** First diagnosed as scroll-snap-align:center fundamentally conflicting with "show exactly three whole cards" — true in principle (centering one card of an odd visible set can't also align to card boundaries), and `snap-center` was changed to `snap-start` on that reasoning. It did not fix the symptom by itself. Chased further: a JS "round `scrollLeft` to the nearest step" correction was written next, and it also did nothing, for a instructive reason — logged directly, the smooth-scroll animation was already settling at the wrong value (395px, not the intended 410.66px) *before* the correction function even ran, and writing the corrected value afterward was silently overwritten back to 395 by the browser's own snap machinery on the same tick, confirmed by reading `scrollLeft` back immediately after the write. That JS fix was removed — fighting a browser's own synchronous snap resolution from JS does not work, and the attempt is left recorded on `correctSeam`'s doc comment as a dead end worth not repeating.

The actual cause was `.hscroll`'s `scroll-padding-left` (1.25rem/1.5rem/2rem across its breakpoints) — a rule shared with `SectorBrowser`/`ProductRow`, tuned for their geometry, silently inherited onto this track where it did not match this track's own padding. Confirmed by testing a spread of `scroll-padding-left` values directly against this exact layout: `0` still produced an offset settle, one step short of clean; the value that produced clean, evenly-spaced rest positions (0px, 411px, 821px at `lg`) turned out to be **this track's own `padding-left`, exactly** (24px/28px/36px, matching the new margin fix's own breakpoints) — not zero, and not derived from reading the CSS Snap spec, from testing. Set via `[scroll-padding-left:24px] sm:[...:28px] lg:[...:36px]`, overriding `.hscroll`'s inherited value. Re-verified across five consecutive autoplay laps, including the wrap back to the start: zero partial cards at any point, where every one previously showed a sliver of a fourth card on one edge.



**Vignette lengthened again** (client: "Increase the fade length by 20% more") — top 61px→73px, bottom 72px→86px, on top of the previous entry's increase. Same standing caveat: still a fixed-fraction hold on a longer band, so this keeps helping by degrees without closing the gap a hold sized to the actual text would.

**A real, confirmed bug, not a styling nitpick: the popped rightmost card's corner was genuinely being clipped, not just crowded.** Client: "when i bring the cursor over the rightmost card it pops up but the rightmost corner gets cut." Measured at the time as the popped card's inner layer overrunning the track's `overflow-x: auto` box by ~5.6px, and diagnosed then as `scale-[1.05]` painting outside its own box. **That diagnosis was wrong, corrected two entries below**: `scale-[1.05]` never applies at all on this row (same silent Tailwind gap already on record for `-translate-y-2.5` here), so there was no transform bleed to explain — the 5.6px figure was real but its cause was misattributed, and the fix built for it (a 12px margin) consequently didn't reach the actual cause either, which the next report confirmed.

Fixed the same way the component's existing `py-4` already handles the matching vertical case: `-mx-3 px-4` on the track, a negative margin widening the track's own box (and so its clip boundary) by 12px on each side, paired with 4px more padding than that to net back to the original `px-1`'s 4px inset exactly — confirmed directly, the first card's `getBoundingClientRect().x` is identical before and after this change. This margin sizing was itself superseded two entries below, once the real cause (the hover shadow's 28px blur, not a transform) was found.

### 2026-08-26 (part three, same day) — Vignette lengthened 20%, pause control resized and given weight, footer controls get their own hover animation

**Direct response to the previous entry's flagged issue**: "increase the fade
length by 20%." Both scrims lengthened again — top 51px→61px, bottom
60px→72px — the 10% hold staying a percentage so it grows in step rather
than needing a separate number. Re-checked against the same crop that
showed the problem: modestly better, not fixed. The previous entry's
diagnosis holds — a fixed fraction of a fixed-length band, not a hold sized
to the actual text — and a length increase alone doesn't change that shape,
only how far it reaches. Documented as a partial improvement in the
component doc rather than claimed as a fix.

**Pause control resized and restyled** (client: "make the pause button bit
more better looking and bigger by 20%") — `PageButton` (now the pause
button's only remaining use, the direction arrows having been removed
earlier the same day) went from `h-9 w-9` (36px) to `h-[43px] w-[43px]`, its
icon 14px→16px. Gained `shadow-card`, a `hover:bg-surface-subtle` tint on
top of the existing border darken, and a `hover:[transform:scale(1.08)]` —
arbitrary-property form, not `scale-108`/`scale-[1.08]`, per this file's
running list of bracket-value scale utilities silently failing to compile
under various variants.

**Footer hover animations improved on both controls** (client: "make the
animation of the view details and add button better"), each scoped to this
footer alone:

- "View details" gains a 1px underline that sweeps in from the left on
  hover, the same idiom as `ui/Button`'s `sweep` prop scaled down to a rule
  instead of a fill — `[transform:scaleX(0)]`→`[transform:scaleX(1)]`,
  arbitrary-property form again, for the same reason.
- `AddToCartButton` is shared across every card on the site, so its own
  hover was left untouched; this instance is wrapped in a plain `<div>`
  that scales to 1.08 on hover instead, which cannot leak to any other
  card. The wrapper carries no `position`/`z-index` of its own, so the
  button's existing `relative z-10` is unaffected.

### 2026-08-26 (part two, same day) — Footer row goes light and frosted, scrim reshaped into a thin vignette, text recoloured — and the vignette makes the heading hard to read against this placeholder

**The footer row** (client: "I dont want black in the row in light mode...
blur the background and change colour to something that matches the web
page"; also: "row the length of the space" — read as shorten, matching this
session's running direction of trading chrome for photograph, and easy to
correct if that guess is wrong). Padding cut `p-4`→`p-3`. Background changed
from inheriting the card's dark `bg-band` to its own
`bg-surface-raised/90 backdrop-blur-sm` — confirmed compiling
(`backdrop-filter: blur(8px)`, not silently dropped like some of this
Tailwind version's other utilities). `bg-surface-raised` is already
theme-aware (white in light mode, near-black in dark), so it satisfies "not
black in light mode" without a separate dark-mode override — dark mode looks
the same as it did.

**"View details" recoloured to match** (client: "change the view details
button to matching green as well") — `text-band-ink`/`hover:text-band-accent`
→ `text-accent`/`hover:text-accent-strong`, the ordinary light-surface accent
pair, green by default rather than only on hover, a deliberate difference
from every other card's neutral-until-hovered "View details".

**On-image text recoloured** (client: "the tagline and range should be
bright white. Also make sub category name in matching green"). Tagline
`band-body`→`band-ink`; range `dt` `band-muted`→`band-ink` (`dd` was already
`band-ink`); category label `band-body`→`band-accent-strong` — the brighter
of the two greens, same reasoning as `home/HeroRotator`'s eyebrow: 11px over
a photograph needs the stronger one.

**The scrim reshaped into a vignette** (client: "reduce the dark tint length
from top and bottom corner towards the center by 40%... the top and bottom
most corner like 10% length should be darker by 30% and gradually fade
towards the centre"). Length cut 40% (top 85px→51px, bottom 100px→60px);
peak raised 30% off the previous 47% (→61%, rounded to 60%) but now held
only through the outer 10% of that shorter band before easing straight to
transparent — a real change of shape, not just size, from every earlier
pass on this card, which held flat through the *measured text*. This one
holds through a fixed fraction of the band regardless of what text is in
it, trading guaranteed coverage for more visible photograph.

**That trade did not land evenly, and it is worth being specific about
where it broke rather than reporting a single blended number.** Measured
against the current placeholder photography (the same flat line-art
material every prior contrast note in this file has used): the bottom band
— tagline and range — is genuinely readable, if not high-contrast; a
close crop confirms it by eye, not just by the numbers. **The top band's
second line is not.** The product name sits far enough past the 10% hold
that the scrim has already faded close to nothing by the time it reaches
it, and this placeholder's background there is plain white — a close crop
shows "DEMO Industrial DOL Panel" nearly disappearing into it, not merely
measuring low. The category label above it, closer to the hold, stays
legible. This is applied exactly as specified — both bands got the same
10%/30%/40% treatment — and the difference in outcome comes from where each
piece of text happens to sit relative to the fade and what is directly
behind it in this particular photograph, not from the two bands being
built differently. Flagged rather than quietly re-widened: the numbers
were specific enough that they read as deliberate, and the fix, if wanted,
is a client decision — hold the top a little longer for the name
specifically, accept it against today's placeholders and expect it to
read better against real photography (the standing reasoning elsewhere in
this file), or something else.

### 2026-08-26 — CTA row moved off the image, scrim cut 35%, a real intermittent hover bug found and fixed, belt controls simplified

**Four changes, two in `product/ProductCard`'s `FeaturedCard`, two in
`home/FeaturedProducts`.**

**"View details" and Add-to-cart moved off the image into their own flat
footer row** (client: "lets have the view details and add button down
below the image, in a separate row"). The card is no longer `aspect-square`
end to end — the *image* still is, the card is that square plus a footer
row's height. This broke the single-`inset-0`-wrapper trick the previous
entry's stretched link relied on: that wrapper spanned the whole card only
because the whole card *was* the image. Scoping it to the image sub-box
instead means the stretched link now only covers the image, not the footer
— confirmed directly, by building the "footer inside the same wrapper"
version first and finding the click area exactly matched what the wrapper
spanned. Fixed by giving "View details" its own real `Link` in the footer,
rather than trying to extend one stretched link across a footer that lives
outside the box its positioning climbs to.

**Both scrims cut by roughly a third** (client: "reduce the dark tint...
by 35%") — top peak 73%→47%, bottom 72%→47%. The bottom band also shrank
independently (150px→100px, hold 77%→65%) because the CTA row leaving it
means it only has to cover the tagline and the range now. **Re-measured
after, and it matters this time**: category label 2.24:1, name 3.42:1,
tagline 2.24:1, range 3.00:1 — all below AA's 4.5:1 against the current
placeholder photography, which is flat line-art on a near-white canvas, the
same material every prior contrast note in this file has been measured
against. This is the same category of trade-off already on record for this
card's original scrim weight (3.7:1, accepted) — the client asked for a
specific number this time rather than "a bit," so it was applied as asked
and reported here rather than quietly overridden to protect AA. Visually
still legible against the current placeholders; expected to read better,
not worse, once real product photography replaces them, same reasoning as
before. "View details" in the new flat footer measures 16.97:1 — unaffected
by any of this, since it no longer sits on the image.

**A real, 100%-reproducible bug found and fixed: `inert` blocks pointer
hover on the doubled row's second copy, not just keyboard/screen-reader
access.** Client report: "the third card (rightmost) pops up sometimes,
only when i bring the cursor from left most card to right most, otherwise
it doesn't pop up." First looked like a timing flake — it survived several
rounds of testing different approach paths and speeds with no clear pattern
— until isolating *which* `uid` failed and comparing it against which
`index` values carry `inert={canLoop && index >= products.length}`: the
failure was 100% reproducible on every second-copy (duplicate) card and
100% reliable on every first-copy card, regardless of approach path or
speed. Root cause: `inert` makes the browser treat an element as
`pointer-events: none` for hit-testing purposes, which is exactly what both
`event.target` (via the old `onMouseOver`) and `document.elementFromPoint`
(in `measure`'s stationary-cursor re-resolution) depend on — so a duplicate
card, despite being visually identical to a "real" one and periodically
becoming the rightmost card visible as the belt scrolls, could never be
found as a hover target by either mechanism. Confirmed with an isolated
Playwright reproduction before touching any code: 20 trials cycling through
which uid was rightmost, 100% failure on duplicate uids, 100% success on
originals, `scrollDelta` logged at zero throughout to rule out a scroll-
timing race.

Fixed by adding `findCardAt(x, y)` — a plain point-in-rect scan over every
`[data-product-id]` element's `getBoundingClientRect()`, which is unaffected
by `inert` the same way `measure`'s existing centred-card scan already is
(that one was never broken, because it was never hit-testing-based to begin
with). `onMouseOver` replaced with `onMouseMove` calling `findCardAt`
directly off `event.clientX/clientY` rather than `event.target`; `measure`'s
`document.elementFromPoint(pointerRef.current)` replaced with the same
`findCardAt` call. Re-ran the 20-trial reproduction after: 20/20 pass,
including the uids that failed 100% of the time before.

**Middle card no longer pops just from sitting centred — only an actual
cursor does that now** (client: "lets not make the middle card pop up
automatically. When the cursor is on a card i want that card to pop up").
`poppedId`'s `hoverCapable` branch dropped its `?? centeredId` fallback;
touch devices keep the fallback, since they have no cursor to hover with and
`centeredId` is the only signal they can offer at all. Confirmed with the
cursor genuinely off the belt (well above and well below the row, not just
off to the side where a taller card could still be under it): nothing
popped, where the old code always had the centred card popped by default.

**Autoplay slowed from 2s to 3s per card** (client, literal number given).

**Direction arrows removed** (client: "lets remove the left right toggle
button"); `page(direction)` simplified to a parameterless `advance()` since
autoplay was its only remaining caller. **Pause control moved from beside
the heading to its own row, centred, below the belt** (client: "move the
pause button below the featured product cards and place it at the centre")
— it used to sit next to the arrows, which are now gone. Still gated the
same way, `autoplay && canAdvance` rather than just `autoplay`: a row with
nothing to scroll has nothing for the button to pause.

### 2026-08-25 (tuning) — Featured card's scrim bands shrunk and lightened, same day as the redesign below

**Client, same day as the redesign this immediately follows: "push the sub
category and product name... up. Also the tagline and range also the view
details and add to cart button down. I want more of the picture. Also reduce
the dark tint shading a bit."** Four related changes, all in `FeaturedCard`:

- Content wrapper padding `p-4` → `p-3`, and the internal `mt-*` spacing
  throughout tightened one step (heading `mt-1.5`→`mt-1`, range `mt-2`→
  `mt-1.5`, CTA row `mt-3`→`mt-2`) — this is the literal "push up"/"push
  down": both blocks sit closer to their edge, and everything between them is
  now visible photograph rather than padding.
- Top scrim `108px`→`85px`, bottom `190px`→`150px`, remeasured against the
  new (now tighter) content zones: top content measures ~55px into the 85px
  band (hold to 70%), bottom ~107px into 150px (hold to 77%) — bottom
  measured against the binding case, a card with a range row, same as the
  entry below.
- Peak opacity lowered — top `color-mix(… 85%, transparent)` → `73%`, bottom
  `88%` → `72%` — the literal "reduce the dark tint."
- Re-measured contrast after both changes landed together (smaller *and*
  lighter compounds, so this needed checking, not assuming): category label
  5.36:1, name 8.24:1, tagline 5.33:1, range 5.53:1, "View details" 7.87:1 —
  every one still clears AA's 4.5:1, with the smallest text (the 11px
  category label, the one that actually needs the full 4.5:1 rather than the
  large-text 3:1) landing at 5.36 after one correction: the first pass at
  68% peak measured that label at 4.47:1, a hair under the line, so the top
  scrim's peak was nudged to 73% and re-verified before treating this as
  done.

### 2026-08-25 (redesign) — Featured card's blurred-bleed idiom replaced with one full-bleed image and every field overlaid on it, hero/subscribe-style

**Client: "there should only be the product image and no other space top and
bottom for text… like in hero slideshow on top or subscriber section where
behind text there is dark tint."** The previous build of this card (entry
below, 2026-08-24) gave the photograph its own blurred, extended copy to
stand in as a background above and below a smaller sharp square — that whole
idiom is gone, not retuned. `product/ProductCard`'s `FeaturedCard` is now one
`aspect-square` image, `fill` + `object-cover`, filling the entire card, with
category, name, tagline, range and the CTA row all overlaid directly on top
of it. The component doc above is emphatic again, without exception, that
this site's photography is shot 1:1 so a square plate never crops it — there
is no longer a second, decorative copy that was allowed to.

**The scrim is `home/HeroRotator` and `layout/SubscribePanel`'s plain
gradient idiom, not the previous build's eight-stop smoothstep curve — and
deliberately simpler, not a regression.** That curve existed to solve one
specific problem: a translucent scrim fading out *right where a
differently-rendered second copy of the same photo began* was a real visual
seam even where the numbers were smooth (a Mach band). There is no second
copy here — one photograph runs underneath the scrim edge to edge, so a
plain two-stop `linear-gradient(…, transparent 100%)` has nothing to seam
against, the same reasoning that already lets the hero and subscribe panel
use plain gradients successfully.

**The "hold flat through the content zone" lesson from the previous build
still applies, even without the Mach-band concern, because it was never
about that** — the underlying problem is that content sits nearer the image
than the band's midpoint, so a gradient that fades evenly across the whole
band leaves the content under-covered regardless of how many stops draw the
fade. First pass used Tailwind's plain `from-scrim/80 via-scrim/40` (implicit
50% via-stop) and measured badly — category label 2.67:1, product name
2.08:1, tagline 2.64:1, all well under the 4.5:1 AA needs, because the via
stop's 50% fell inside the content zone and the second line of each block sat
past it. Fixed by measuring the actual rendered content — top block (label +
name) runs ~57px into the card, bottom block (tagline + range + CTA row) runs
~110px — and building each scrim as an explicit hold-then-fade
`color-mix(in srgb, var(--color-scrim) N%, transparent)` gradient: peak held
flat through 60%/108px at the top and 68%/190px at the bottom, only fading to
transparent after. Re-measured: category 8.32:1, name 12.54:1, tagline
9.09:1, "View details" 14.02:1 — comfortable AA across the board, and
against the same placeholder line-art photography the previous build's
3.7:1 was measured against and accepted as a known limitation. This is
better than that accepted number, not merely adequate.

**One `absolute inset-0` content wrapper holds both text blocks, not two
separately-positioned top/bottom ones — load-bearing for the stretched link,
confirmed by building the two-wrapper version first and watching it fail.**
`flex flex-col justify-between` inside the single wrapper pushes the top
block up and the bottom block down without either needing its own `absolute
top-0`/`bottom-0`. `after:absolute after:inset-0` on the product name's
`Link` climbs to the nearest *positioned* ancestor to size itself — with two
separately-positioned blocks, that ancestor is whichever block holds the
link, and the clickable area shrinks to that block alone; confirmed exactly
that with `elementFromPoint` before switching to one wrapper. With the single
wrapper, that ancestor is the one `inset-0` box spanning the whole card, so
the stretched link works with no z-index patch — verified with
`elementFromPoint` at the image centre, over the name, and over the tagline,
all three resolving to the link; the Add-to-cart button verified separately
still resolving to itself, on its own pre-existing `relative z-10`, same
mechanism the plain vertical card already uses.

**Found and fixed in this card only: `scale-[1.06]` is a fourth instance of
this Tailwind version's silent-arbitrary-value gap.** `md:group-hover:scale-[1.06]`
on the sharp image — present in this card since before, carried forward
unchanged in the rewrite — turned out to never have worked: `getComputedStyle(img).transform`
reads `"none"` after a real hover, confirmed identically on the untouched
plain vertical card elsewhere in the catalogue, which still carries the same
class. Same category of gap as the `scale-x-*`/`-translate-y-*` ones found
2026-08-24, same fix: `md:group-hover:[transform:scale(1.06)]`, arbitrary
property syntax, confirmed by the same computed-style check now reading
`matrix(1.06,0,0,1.06,0,0)`. Fixed here because the line was being rewritten
regardless; the identical, still-broken class on the plain vertical card
(`product/ProductCard`) and the horizontal strip was left as-is, same scoping
decision as the three instances already on record — now four, all in one
place in this file's doc comments rather than scattered.

**Video badge moved from top-left to top-right.** It sat at `left-3 top-3`
against the old sharp-image band, which had no text in it. The category
label and name now start at that same corner, so the badge moved to the
opposite one rather than overlapping.

### 2026-08-24 (tuning) — Sweep slowed, glow darkened; §03's standfirst confirmed already matching §01's, not touched

**Client asked to slow the button sweep, darken the light-mode glow, and
match §03's new standfirst font size to §01's opening paragraph.** The third
turned out to already be true — both paragraphs carry the identical
className (`text-xl leading-snug tracking-tight text-ink sm:text-2xl`), and
`getComputedStyle` on the live page confirms pixel-identical rendering at
both breakpoints (24px/33px line-height at desktop, 20px/27.5px at 375px
mobile width, same 672px/335px content width). Checked rendered output
rather than trusting the className match alone — this session's own
scale-x/translate-y gap (two entries below) is a standing reminder that
matching classNames do not guarantee matching CSS in this Tailwind version.
No change made; nothing was wrong.

**`.tilt-glare`'s light-mode intensity raised from 30% to 48%**
(`color-mix(in srgb, var(--color-accent) 48%, transparent)`, both instances
above corrected to match). **`ui/Button`'s `sweep` fill slowed from 500ms to
700ms** (`before:duration-700`). Both are pure value tuning on features this
same day's entry below already documents and verified structurally — no new
surface area, so this entry only records the new numbers, not a re-verification
of the mechanism.

**Verified**: resolved `background-image` on a live `.tilt-glare` shows
`color(srgb 0.137255 0.439216 0.239216 / 0.48)` in light mode — the same
accent triple as before, alpha raised from `0.3` to `0.48`; resolved
`transition-duration` on the sweep's `::before` reads `0.7s`. Confirmed
visually with a cursor held at a card's centre past the 2.6s `IntroSplash`
self-clear (an early check in this pass hit the splash's still-live
full-viewport hit target and read a false "listener never fires" — the splash
was still capturing `elementFromPoint` at the coordinates used, not a real
regression; resolved by waiting past `intro-clear`'s delay before probing).

### 2026-08-24 (interactions) — About §02/§03 get the tilt-glow and a button sweep; a real gap in this Tailwind version found and worked around twice

**§03 gains a standfirst** ("A closer look at Vkon Automation…") — it went
straight into the brochure card with nothing saying what the section covers;
§01 and §04 both already open with one.

**The "Explore our products" and "Download our brochure" boxes are now
`TiltCard`s**, the same component and the same `.tilt-glare` cursor-tracked
sheen §01's three market cards already use — client asked for "that same
animation," so this reuses the component rather than rebuilding the effect.
`max-w-2xl` moved from the card onto `TiltCard` itself in both cases: the
tilt reads its own `getBoundingClientRect`, so the width constraint has to
live on the element the ref is attached to.

**`.tilt-glare` is now theme-aware — green in light mode, white in dark**
(client, 2026-08-24). It was a flat white radial sheen regardless of theme,
which is fine as a highlight against a dark card but nearly invisible
against light mode's near-white `surface-raised`. Light mode now reads
`color-mix(in srgb, var(--color-accent) 48%, transparent)`; `[data-theme="dark"]`
overrides back to the original white. Verified the resolved colour
literally, not just that the rule exists: light mode composites to
`rgb(35, 112, 61)`, which is exactly `--color-accent`'s light value
(`#23703d`) converted to decimal — confirming the token is what is actually
painting, not a coincidentally similar hardcoded value.

**`ui/Button` gains an opt-in `sweep` prop** — a `::before` layer that
scales in from the left on hover, applied to both boxes' CTAs
("See all products", "Download brochure (PDF)"), client: "animate like
loading from left to right." Off by default; nothing else on the site
opted in. Colour is `bg-accent`, already correctly themed by the same token
the glow uses.

**Found while building the sweep, and it is bigger than this one button:
several named Tailwind utility classes this project already relies on do not
exist in the installed Tailwind version and fail completely silently — no
error, no warning, just no CSS rule generated.** `scale-x-0`/`scale-x-100`
(needed for the sweep) turned out to be one of them — confirmed by grepping
the installed `tailwindcss` package's own compiled source for `scale-x`,
which returns zero matches anywhere in the module. Switched to the arbitrary-
property form, `[transform:scaleX(0)]`, which bypasses Tailwind's utility-name
lookup entirely and does not depend on which named utilities a given version
ships.

**The same investigation found `-translate-y-*` (the negative, named
form) is *also* silently absent** — and this one is not new code, it is
already shipped and live: `product/ProductCard`'s `hover:-translate-y-0.5`
(three separate call sites) and the pop effect's `-translate-y-2.5` in both
`home/FeaturedProducts` and `home/RecentlyViewed` have, as far as this
investigation can tell, never actually applied a lift on hover — confirmed
directly on the *live catalogue page*, untouched by anything in this
session: `getComputedStyle(cardEl).transform` reads `"none"` before **and**
after hovering a card that carries `hover:-translate-y-0.5`. The scale and
shadow components of those combined hover effects still work and are
visually the more prominent part, which is almost certainly why this has
gone unnoticed rather than being reported as "the cards don't lift."

**Fixed here only where this session's own new code needed it** — the
`sweep` prop above, and the new "pop" hover on `about/SocialProfileCard`
below use `[transform:...]` arbitrary properties throughout, deliberately,
not the named translate/scale utilities. **The three pre-existing instances
in `ProductCard`/`FeaturedProducts`/`RecentlyViewed` were left as they are.**
Fixing those is a distinct, separate piece of work — outside what was asked
this session, and worth a deliberate decision (do all three want the same
arbitrary-property fix, and should the *amount* of lift be reconsidered while
touching them) rather than a drive-by change bundled into an unrelated
request. Flagged to the client directly rather than silently fixed or
silently left; if this is not picked up as its own follow-up, a future
reader hitting a "hover lift doesn't work" report should start here, not
re-diagnose from zero.

**`about/SocialProfileCard` gains a "pop" on hover** (client: "when cursor is
… on the social media profile boxes I want it to pop") — lift plus a
stronger shadow, not a scale: the `lg` (desktop) layout packs five cards
into one row with a 12px gap at ~170px each, and a scale-based pop risked
the lifted card visibly overlapping its neighbours, which the FeaturedProducts/
RecentlyViewed pop-card treatment does not have to worry about (those sit one
at a time, centred, with room around them). Uses the same
`hover:[transform:translateY(-0.25rem)]` arbitrary-property form as the
button sweep, for the reason above.

**Verified, not assumed, throughout** — every piece above has a specific
check behind it: glare opacity read via `getComputedStyle` before/after a
simulated pointer move (`0` → `1`); the sweep's resolved transform matrix
before/after a 700ms hover (`matrix(0,0,0,1,0,0)` → `matrix(1,0,0,1,0,0)`,
i.e. exactly `scaleX(0)` → `scaleX(1)`); the pop card's transform likewise
(`none` → `matrix(1,0,0,1,0,-4)`, i.e. `translateY(-4px)`); `elementFromPoint`
at both CTA buttons' centres resolving to the `<a>` itself with
`pointer-events: auto`, confirming the glare spans' `pointer-events-none`
does not block the click it sits on top of; both buttons re-confirmed to
still navigate/download correctly with the new `TiltCard` wrapper in place.

### 2026-08-24 (design, held+smoothed) — The previous entry's fix reintroduced the Mach-band seam it was meant to avoid; both fixed together this time

**Client report: the boundary between the top/bottom scrim and the image
"looks like a line," should "merge with the image at the centre."** This is
the same Mach-band effect from three entries up — a linear gradient's rate of
change stopping abruptly rather than easing to zero — but reintroduced by the
*previous* entry's own fix. Holding peak opacity through the measured content
zone and then linearly tapering the rest, as that entry did, creates a rate
discontinuity exactly where the hold ends and the taper begins: the slope
jumps from ~0 (flat hold) to a constant steep value in one step. Compressing
the taper into a shorter span (needed to still cover the text) made this
*worse*, not better — the same total opacity drop now happens over less
distance, so the rate at the jump is proportionally steeper. Confirmed with
the two-derivative check used the first time this was diagnosed: a rate
change of 197 luminance-levels at one point, against ~2-3 (anti-aliasing
noise) everywhere else once fixed.

**Fixed by keeping the hold genuinely flat and replacing the linear taper
with its own small smoothstep curve** — `peak × (1 − smoothstep(x))` over
just the ease-down span, which by construction has zero slope at both the
point it leaves the hold and the point it reaches full transparency,
matching the flat regions on both sides exactly. This is not a taller or
weaker gradient, only a differently-shaped ease-down within the same hold
boundaries (65%/77%) the previous entry established.

**Verified two ways, deliberately separated so neither could hide the
other's problem:**
1. *Smoothness, isolated from content.* Rendered each gradient alone against
   a flat backdrop — no text, no photo — and swept a rate-of-change check
   down the centre: max jump 2 (top), 3 (bottom), both essentially
   measurement noise. The *composited* card screenshot alone was not
   trustworthy for this — sampling straight through the card picks up text
   glyph edges and the placeholder artwork's own hard lines, which produce
   large "jumps" that have nothing to do with the scrim and would have been
   misread as a smoothness failure if not separated out.
2. *Contrast, unchanged or improved.* Re-measured all four text positions
   with the same method as the previous two entries: sub-category 3.67:1,
   product name 5.6:1, description 4.08:1 (up from 3.74 — the smoother curve
   actually holds slightly *more* area near-peak than the previous entry's
   sharper corner did), View details 6.22:1. The fix for "looks like a line"
   did not cost back any of the fix for "no dark tint."

**Also: caught a stale dev build again mid-verification**, the same failure
mode as the previous entry — confirmed the live `style.backgroundImage`
string on the page before trusting a measurement, per the practice that
entry established, and this is now the second time it has mattered enough
to record. `rm -rf .next/dev` before restarting is the reliable fix, not
just restarting the process.

### 2026-08-24 (design, held) — Featured-card scrim: darkness held through the actual text, not just at the outer edge

**Client report: sub-category, product name and description "have no dark
tint."** Measured each independently (screenshot pixel behind the text,
composited against the resolved gradient, not the CSS colour value alone).
Confirmed and explained: the previous entry's five stops eased *evenly*
across the full band height, but "evenly across the band" and "evenly across
the actual text" are different things once the two are different sizes —
content occupies 172px of the bottom band's 224px and 83px of the top
band's 128px, and every text element sits nearer the image than the band's
own midpoint, i.e. in the half of the curve already most faded. Sub-category
measured 2.6:1, product name 2.59:1, description 1.25:1 — all failing, and
in the description's case barely better than the pre-scrim baseline several
entries back.

**Fixed by holding near-peak opacity through the measured content zone and
compressing the entire fade-to-transparent into only the remaining gap
before the image** — 0–65% of the top band, 0–77% of the bottom band, both
read from the actual measured content heights, not guessed. The stops
themselves are still an eased curve (this did not reintroduce the Mach-band
seam from two entries back), just eased over a shorter final stretch instead
of the whole band. Re-measured after: sub-category 3.61:1, product name
5.35:1, description 3.74:1, "View details" 6.13:1 — two of four now clear
full WCAG AA outright, the other two clear the 3:1 large-text threshold and
are a visibly solid dark backing rather than the near-invisible tint
reported. Confirmed by screenshot, not just the numbers: every element reads
as clearly legible now, and the gradient still looks like a fade rather than
a hard edge.

**Caught and worth recording separately: the dev server served a stale
build for one full edit-measure cycle.** The very first re-measurement after
this fix showed numbers *identical* to the un-fixed version, which briefly
looked like the fix had done nothing — turned out `.next/dev` had not
picked up the change. Confirmed via the browser's own resolved
`style.backgroundImage` string before trusting any further measurement, and
now doing so as standard practice after any inline-style edit on this
component: measuring a stale render and concluding a genuine content or
CSS-value fix "didn't work" is a more likely mistake than the fix actually
being wrong.

Peak opacities (`62%`/`65%`) and the resulting known trade-off on today's
placeholder photography are otherwise unchanged from two entries back —
this was purely about *where along the band* the peak is held, not how dark
the peak itself is.

### 2026-08-24 (design, smoothed) — Featured-card scrim gradients replaced with an eased five-stop curve

**The two-stop `from`/`to` gradients read as having a seam where they met the
sharp image**, client-reported ("should be smooth... gradually reduces going
to the centre"). Measured before changing anything: a pixel-by-pixel
luminance sample straight down the card found *no* actual brightness jump at
that boundary — the perceived seam is a Mach band, the well-documented effect
where the eye picks up a linear gradient's abrupt *rate* change at the exact
point it ends, even when the colour values either side genuinely match. Fixed
by replacing both gradients with five hand-placed stops approximating a
smoothstep curve (steep in the middle, shallow at both the peak and the
point it vanishes), which is the standard fix for this — not a stronger or
taller gradient, a differently-*shaped* one. Implemented as inline
`style={{ backgroundImage: ... }}` rather than Tailwind utilities: a five-stop
curve has no clean expression as chained `via-*` classes, and `color-mix(in
srgb, var(--color-scrim) N%, transparent)` per stop keeps it reading the
`scrim` token rather than a value copied out of it.

Re-verified with the same pixel-sampling method: zero jumps >15 luminance
levels anywhere in either scrim band post-change (previously several, right
at the image boundary); the bottom band's profile from image edge to card
foot is now a smooth, monotonic decline (247 → 102 in even ~6-8-level steps).
Peak opacities (`62%`/`65%`) are unchanged from the previous entry — this
was purely a curve-shape fix, not a strength change, and the same accepted
low-contrast-on-placeholder-images trade-off from that entry still applies
unchanged.

**Also confirms the "View details"/Add-to-cart row now has clear margin,
not just adequate coverage**, per the client's specific callout — measured
the actual content geometry (button row sits 81px above the card's bottom
edge; the scrim band is 224px tall) rather than assuming the existing height
was already enough.

### 2026-08-24 (design, corrected) — Featured-card scrim brought back down; the contrast trade-off is deliberate, not overlooked

**The `scrim/92` version from the entry below was reversed the same day.**
Client feedback on sight: it reads as a black bar, not a lit photograph —
"I dont want it black... the actual image to be mirrored or another copy to
be extended and then blurred," pointing at `home/HeroRotator` and
`layout/SubscribePanel` as the reference for how light the tint should read.
Both scrims dropped to `scrim/62`–`/65` peak, matching those two components'
actual weight rather than a number invented for this card.

**Measured before proposing it, not after:** at that opacity, the
description text's contrast against the current placeholder photography is
**1.1:1** (WCAG AA wants 4.5:1) — sampled a real rendered pixel behind the
text (`246, 247, 249`, a near-white placeholder canvas), composited the
scrim's actual alpha at that exact Y-position on top of it, then ran the
standard relative-luminance formula. Also computed the floor: even a *flat,
non-fading* 70% scrim is the minimum that clears AA against the palest pixels
present across the current cards — confirming the fade-shaped light scrim
cannot pass on this photography at any peak weight that still reads as
"light," full stop, not only at the specific value tried.

**Presented three options with those numbers attached — flat-but-darker,
light-and-temporarily-illegible, or light-plus-text-shadow — and the client
chose light-and-temporarily-illegible explicitly**, on the reasoning that the
component should not be shaped around today's placeholder graphics: real
product photography has actual tonal range, the same opacity that fails on a
flat white canvas is exactly what already works on the hero and subscribe
panel's real photographs, and the fix on the day real photography lands is
new images, not new code. Recorded here and in the component's own doc
comment specifically so this is legible as an accepted, load-bearing decision
if it is ever rediscovered — the failure mode ("description text is
unreadable") is real and was not missed, only knowingly deferred to the
correct fix rather than patched around with a heavier scrim.

### 2026-08-24 (design) — Featured-products card redesigned; a real click-through bug found and fixed along the way

**A third `ProductCard` orientation, `"featured"`, not a change to `"vertical"`.**
The client asked to redesign "the featured product card" specifically — image
in the middle, the same photo extended and blurred above and below it, text
over the blur. `ProductRow` (the catalogue grid — "do not touch, they are
perfect", an explicit earlier instruction) and `RelatedProducts` (the product
page's "Similar products") both call `ProductCard` with no `orientation`
override, i.e. the default `"vertical"` — checked by grep before writing a
line of this, since editing that branch in place would have redesigned the
catalogue along with the request. Only `home/FeaturedProducts` now passes
`orientation="featured"`; `HorizontalCard` (`RecentlyViewed`) and the default
vertical branch are untouched, confirmed unchanged by screenshot for the
catalogue and by re-reading `RelatedProducts`' call site for the other.

**One photograph, shown twice**, same idiom as `layout/SubscribePanel`'s
bleed background: a `fill` copy blurred and `scale-110`'d to fill the whole
card (the overscale hides the transparent halo blur leaves at a hard edge,
clipped by `overflow-hidden`), with a second, sharp, un-blurred copy in an
`aspect-square` band over it partway down — same aspect the plain vertical
card already uses, so the "photography is 1:1, never cropped" rule from the
top of this file still holds for the copy anyone is actually meant to look
at. The blurred copy is exempt from that rule on purpose: it is a color wash
standing in for a background, not a presentation of the product.

**The scrim first went much stronger than initially drawn** — `scrim/80`–`85`
read as close to illegible against these placeholder images, so it went to
`scrim/92` with the solid portion held well past where the text actually
sits. **This did not stand: reversed the same day, on sight, for reading as a
black bar rather than a lit photograph — see the entry above this one, which
is the version that actually shipped.** Left here rather than deleted because
the diagnosis in this entry is still the accurate explanation of *why*
legibility is hard on the current placeholder photography in the first place
(flat line-art on white canvas, not real images with tonal range) — only the
"so we went to `scrim/92`" conclusion was undone.

**A real bug, not a design nitpick: the sharp image band was unclickable.**
The stretched-link pattern (`after:absolute after:inset-0` on the title
link) depends on nothing between the link and its positioned ancestor also
being positioned — documented already, on this exact component, for a
different reason (`AddToCartButton`'s note on why it needs `relative z-10`).
The image band needs `position: relative` for `next/image`'s `fill` to work
at all, and being a *later* sibling than the title's wrapper, it painted
*above* the link's `::after` overlay and swallowed every click on the photo
— roughly the middle third of the card. Confirmed directly:
`elementFromPoint` at the image's centre returned the `<img>`, not the link,
and a real click there left the URL unchanged. Fixed with `after:z-[1]` on
the link — enough to clear the image band's implicit `z-index: auto`,
still well below the Add-to-cart button's established `z-10`. Re-verified
after the fix: `elementFromPoint` at all three bands (top, image, bottom)
now resolves to the product link, and a click on the image navigates.
Worth remembering for any future stacked-band card: a stretched link is not
safe merely because nothing *encloses* it is positioned — a later sibling
that has to be positioned for an unrelated reason can still cover it.

### 2026-08-24 (three more) — Pop-highlight follows the cursor; RecentlyViewed and AboutGallery get the same fixes

**`FeaturedProducts`: the pop highlight can now track the cursor through the
belt's own motion, not only through pointer movement.** The previous entry
flagged this as a known, accepted gap: `mouseover` only fires when the
pointer itself moves, never when content scrolls past a stationary one, so
once autoplay could move while hovering, the highlighted card could keep
following whatever was first touched even after the belt carried it away.
Fixed by re-resolving `hoveredId` from `document.elementFromPoint` at the
last known pointer position on every `measure()` call — which already runs
on every scroll frame the belt produces, so the highlight now updates
continuously through an autoplay step, not just at its start and end. Gated
on `hoverCapable`, same reasoning as `poppedId`'s existing gate: a touch
device's stray `mouseover` shouldn't spend an `elementFromPoint` call every
frame resolving a value that device is going to ignore anyway. Verified by
hovering a card once, then making *zero* further mouse movement for 3.5s of
autoplay: at every sampled instant, `document.elementFromPoint` at the fixed
cursor position and the actually-popped card's id matched exactly (5/5), and
the popped id changed twice over that window, tracking the belt correctly.

**`RecentlyViewed` had the exact same wheel-hijack and `snap-mandatory` bugs
`FeaturedProducts` had**, independently, since it's a separate component that
happened to be built the same way. Same fix: the `onWheel` handler (converted
vertical wheel deltas into a horizontal scroll and blocked the page under it)
is gone, and `scroll-snap-type` is `proximity`, not `mandatory`. Verified:
computed `scroll-snap-type` no longer reports `mandatory`; a vertical scroll
with the cursor over a card now moves the page (`2313 → 2713`) and leaves the
row untouched (`0 → 0`); the arrows still page the row (`0 → 392`). This
component has no autoplay, so there was never a hover-pause or
pop-highlight-staleness concern here — only the wheel/snap issue applied.

**`about/AboutGallery`: hover/focus no longer pause the belt**, same change
and same reasoning as the `FeaturedProducts` entry above, requested
specifically because the strip looked stuck whenever the pointer rested on
it. The `engaged` state and its four handlers are gone entirely — nothing else
read it. Verified: hovering an image, `scrollLeft` now advances (`0 → 840`
over 4.5s; previously frozen).

**Material difference from the `FeaturedProducts` case, worth restating: this
gallery has no pause button at all** (removed in an earlier entry the same
day) and no `hoveredId`/pop-highlight system to begin with — it is a plain
photo strip, not clickable cards. So unlike `FeaturedProducts`, which keeps an
explicit pause button as the actual WCAG 2.2.2 mechanism, removing hover/focus
pausing here leaves *no* interactive way to stop the belt short of leaving the
page — only `prefers-reduced-motion` at the OS level still works. The file's
header comment was two paragraphs behind reality before this change (still
describing a pause button and hover/focus parking that had already been
removed in earlier entries); both are rewritten to state plainly that no
pause mechanism remains.

### 2026-08-24 (one more) — Featured-products autoplay no longer pauses on hover or focus

**Hover and keyboard focus used to stop the belt; they no longer do**
(client, after the wheel fix, noticing the row looked "stuck" whenever the
pointer rested on it). The trade-off was raised before making the change: the
belt can now shift a card out from under an in-progress click — including an
"Add to cart" press landing on whichever card the belt scrolled into that
spot rather than the one being looked at — and the client accepted that
explicitly. Recorded as a real, accepted risk, not resolved or mitigated.

**The `engaged` state is gone entirely**, not merely excluded from `running`
— it had no other reader. Removed with it: `onMouseEnter`, `onFocusCapture`
and `onBlurCapture` on the track, all three of which existed only to set it.
`onMouseLeave` keeps its other job (clearing `hoveredId`, for the pop-highlight
system) and loses only the `setEngaged(false)` call.

**The explicit pause button, `paused`, and the pop-highlight system
(`hoveredId`/`centeredId`) are all unchanged.** The pause button was always
the mechanism actually satisfying WCAG 2.2.2; hover/focus pausing was a second
safety net on top of it, and losing the net doesn't remove the requirement's
own mechanism. Verified directly: hovering a card, `scrollLeft` now advances
(`0 → 1216` over 4.5s, previously frozen); clicking the pause button still
stops it cold (`1216 → 1216`); the vertical-scroll-passes-through fix from
the previous entry is unaffected by this change.

**Known, accepted, not fixed: `hoveredId` can go stale while the belt moves
under a stationary cursor.** `mouseover` only fires on pointer movement, not
on content scrolling past a still cursor, so the pop highlight can keep
following the card first hovered even after the belt has carried it away from
the pointer, until the visitor's mouse next moves even slightly. This was
unreachable before — autoplay never moved while a card was hovered — and is
now possible for the first time. Not raised by the client and not fixed here;
worth knowing if it's ever reported as "the highlight followed the wrong card."

### 2026-08-24 (actually final) — Wheel handling on featured-products removed; the fix was the snap strictness, not the JS

**The dead-zone block (previous entry) is gone. There is no wheel-handling
code on this row at all now** — client, after confirming the block worked,
asked what the standard approach was. Netflix/Amazon-style product rails
don't intercept the wheel: a vertical scroll always scrolls the page, and
horizontal movement comes from drag, touch, a trackpad's native
`deltaX`, or (here) the arrow buttons. Recommended reverting to that, with
one change to make it actually reliable this time.

**The real fix was `scroll-snap-type: x mandatory` → `x proximity`, not any
JS.** All three previous attempts (hijack, block, and the "just let it
chain" one in between) were trying to solve the problem in the wheel handler.
The actual cause of "still glitchy" was `mandatory` snap: it grabs a gesture
that ends anywhere near a snap point regardless of why the gesture happened,
where `proximity` only pulls a scroll that was already *going to land* near
one. Verified directly, same reproduction as the earlier "still glitchy"
report: six wheel ticks of `deltaY=120` with `deltaX=3` (a vertical scroll
carrying a few pixels of realistic noise) — under `mandatory` this moved
neither the row nor the page at all; under `proximity`, identical input,
the page advances normally (`1676 → 1809`) and the row stays at `0`.

Also re-verified after the change: arrows still page the row (`0 → 395` on
click), and the seam-crossing/autoplay math from the earlier fixes is
unaffected by the snap-strictness change (0 bound violations sampled across
several autoplay laps) — snap strictness only governs where a *manually
released* scroll settles, not the programmatic `scrollBy`/`scrollLeft` paths
`page()`, `correctSeam` and `advance` use, none of which go through snap at
all.

### 2026-08-24 (this time for real) — Vertical scroll now blocked outright over the featured-products row

**"Let vertical scroll chain naturally to the page" (the previous entry) was
not enough** — client report: still glitchy scrolling over the cards, though
no longer wild. Root cause: real trackpad/wheel input is rarely perfectly
axis-aligned, and this row also carries `scroll-snap-type: x mandatory`.
Reproduced directly: a deltaY-dominant wheel event carrying a few pixels of
incidental deltaX noise moved *neither* the row nor the page — the browser's
snap machinery appears to claim the whole event for the row rather than
chaining the vertical component up, discarding it instead. Scrolling over the
row felt unreliable rather than visibly wild, which matches "still glitchy."

**Fixed per explicit instruction, not by chasing the chaining heuristic
further: a vertical-dominant wheel event over the row is now blocked
outright**, full stop — the visitor moves the pointer off the row to keep
scrolling the page. This trades away a real piece of default browser
behaviour (a "dead zone" that swallows the wheel is a known, historically
disliked pattern — embedded maps and PDF viewers are the usual offenders) for
predictability; flagged to the client rather than silently applied, and kept
because they asked for it after already trying the lighter alternative.

**This surfaced a real bug in the previous entry's own implementation: React's
`onWheel` prop cannot call `preventDefault()` at all.** React attaches
`wheel` passively at the root; a synthetic handler calling `preventDefault()`
is silently a no-op, and Chrome logs "Unable to preventDefault inside passive
event listener invocation" when it happens. `event.defaultPrevented` becomes
`true` — the flag is set — but the scroll proceeds anyway. The *previous*
entry's fix (letting vertical scroll pass through) never called
`preventDefault()`, so this bug was inert then; it would have silently
defeated the current one. Replaced with a real `addEventListener(el, "wheel",
handler, { passive: false })` in a `useEffect`, which is the only way to
actually cancel a wheel event from React.

**Verification hit a genuine wall, worth recording so it isn't re-litigated.**
Blocking a wheel event over a *non-scrollable* element works and was
confirmed directly: a plain fixed `<div>` with the identical non-passive
listener blocked a synthetic scroll cleanly (`2309 → 2309`). The *same*
listener, *same* verified-correct logic, over the actual row — which has
`overflow-x: auto` and `scroll-snap-type: x mandatory` — does not block a
CDP-synthesized wheel event, across four independent attempts: React's prop,
a native listener on the row, a native listener on `window` with a
containment check, and a raw `Input.dispatchMouseEvent` CDP call bypassing
Playwright's helper entirely. All four show the identical symptom —
`defaultPrevented` becomes `true`, the scroll happens anyway — which is the
signature of Chromium's compositor-thread "fast scroll" path for
overflow-scrollable containers not fully honouring a main-thread
`preventDefault()` when the *triggering* input is CDP-injected rather than
genuine hardware. The differential result (plain element: blocked; scrollable
element: not blocked, same code) is what rules out "the code is wrong" — a
bug in the handler would fail identically on both. This is a known category of
Playwright/Puppeteer limitation for custom-scrollable containers, not
something to keep chasing here. `{ passive: false }` `addEventListener` is the
industry-standard, correct way to cancel a wheel event, and is very likely to
behave correctly for genuine mouse/trackpad input in a real browser — but that
claim rests on the standard, not on this session's own testing, and is
flagged as such rather than reported as verified.

### 2026-08-24 (truly final) — Vertical scroll no longer hijacked by the featured-products row

**A plain mouse-wheel scroll down, with the cursor over a card, used to fling
the row sideways instead of scrolling the page — and block the page scroll
entirely.** This was the actual dominant cause of "moves wildly" reports,
distinct from (and larger than) the seam-math and stale-highlight bugs fixed
below: an `onWheel` handler converted *any* vertical wheel delta into a
horizontal `scrollBy` on the row and called `preventDefault()`, unconditionally,
whenever the pointer was over the track. So a visitor scrolling down the page
who happened to be scrolling with the cursor over a card never scrolled the
page at all while over that row — every wheel tick instead moved the row
sideways by that tick's `deltaY`, however large. Client repro was exact:
"glitches" only with the cursor on a card, never otherwise — that distinction
only makes sense if the handler firing (or not) is the switch, which pointed
straight at `onWheel`.

Removed outright, per instruction: "Lets just have left right scrolling on
the featured product affect it not scrolling up or down." Horizontal input —
trackpad two-finger swipe, shift+wheel, a mouse's horizontal tilt-wheel — was
never dependent on this handler (the handler's own comment said as much: "a
trackpad's own horizontal delta is left alone"), so nothing about removing it
can affect that path; only the vertical-hijack is gone.

Verified directly: cursor over a card, `mouse.wheel(0, 400)` (a real vertical
scroll) — row `scrollLeft` unchanged, page `scrollY` advanced by exactly the
wheel delta. Could not get a clean *positive* signal for genuine horizontal
wheel input in this harness — a synthetic `deltaX`-only wheel event fails to
move scrollLeft in headless Chrome even on an untouched `.hscroll` row on
`/products` that has never had any wheel handling of any kind, so that's a
limitation of simulating wheel input under CDP, not evidence about this
component. `scrollBy()` on the row still works (confirms nothing else broke),
and native trackpad/touch scrolling runs through the browser's own handling,
untouched by this change either way.

### 2026-08-24 (final) — Featured-products glitch root-caused; About gallery loses its controls

**The "moves wildly" report was a second, distinct bug** on top of the seam
math above, found by tracing `scrollLeft` frame-by-frame across a real,
autoplay-driven seam crossing on `home/FeaturedProducts`. The correction
itself was exact (`2037 → 395`, exactly one `oneSet`), but the "popped"
highlight lagged it by two to three animation frames — because `centeredId`
only got recomputed on the *next* scroll-driven `sync`, one frame later, and
that frame still named the pre-jump card, which the jump had just carried
off-screen. Net effect: the visually-centred card's outline and shadow
vanished for ~43ms, then reappeared on the correct card with its
`duration-300` transition restarting from flat. An instant 1600px teleport
plus a highlight that blinks off and re-grows is what read as a glitch, not
the position change alone. Fixed by splitting `sync` into `measure` (the pure
DOM read) and `sync` (measure, then arm the settle timer); `correctSeam` now
calls `measure()` itself, synchronously, in the same tick as the `scrollLeft`
write. Verified frame-by-frame: `popped` now changes in the *same* frame as
the jump, zero lag, on both the original reproduction and 95 sampled frames
after. Applied to `about/AboutGallery` too for consistency, even though nothing
there depends on element identity the way the pop highlight does.

**`about/AboutGallery` lost its arrows and pause button** (client). This is a
deliberate departure from WCAG 2.2.2, which asks that motion running longer
than five seconds be pausable — recorded rather than silently dropped, per
the file's own header comment. The dots remain, are still keyboard-reachable,
and still park the belt on hover/focus, which is what is left of a pause
mechanism; `prefers-reduced-motion` is unaffected. `page(direction)` became
`advance()` — no-argument, forward-only — since the removed "Previous" arrow
was its only caller of `direction === -1`; `goTo` (the dots) is unaffected,
since jumping to an arbitrary image was never a direction-based operation.

**The belt now runs regardless of scroll position** (client: "keep moving as
long as the page is open, not just when the section is visible"). The
`IntersectionObserver`-based `inView` gate is gone. In its place, this
component now has the *same* `visibilitychange` guard `home/FeaturedProducts`
already had and this one did not: a background browser **tab** still fires
timers (throttled, not stopped), so without a check, a genuinely backgrounded
tab would leave the belt drifting unseen. This is a different gate from the
one just removed — it reacts to the tab losing focus entirely, not to the
gallery scrolling out of the viewport — and was added specifically because
removing `inView` left nothing else guarding against that case.

Verified in two parts, because Playwright cannot genuinely background one of
two tabs in the same browser context — a second `newPage()` + `bringToFront()`
left the first page's `document.hidden` at `false` throughout, so that path
was not a real test of anything. What *is* verified: with the gallery scrolled
fully out of the viewport, `scrollLeft` still advanced over 6s (`161 → 1421`)
— the removed gate is confirmed gone. Separately, overriding `document.hidden`
and dispatching a real `visibilitychange` event — the exact signal a UA sends
a genuinely backgrounded tab — froze `scrollLeft` for 4s and resumed it after.
That confirms the wiring reacts correctly to the event; it does not by itself
confirm a real backgrounded tab produces that event in every case, which is
the part this harness cannot exercise.

### 2026-08-24 (later still) — Belt seam math fixed on both carousels

**`oneSet = el.scrollWidth / 2` was measurably wrong**, on `home/FeaturedProducts`
and `about/AboutGallery` alike, and is why both belts jolted at the wrap —
worse on every lap, reported by the client as "behaves wild... after first
loop" on both desktop and mobile. A doubled track of `2N` items has `2N-1`
gaps; halving `scrollWidth` splits the one gap at the seam unevenly across
the two copies rather than counting it once per side, so the "invisible"
reset consistently landed short of the real seam — measured at 8px on the
gallery, 8.5px on the product row. Both now call a `measureOneSet(el)` that
reads the DOM offset between item 0 and its duplicate directly, which is
exact regardless of gap, padding or border because it never has to know about
any of them. Verified: `measureOneSet` and the old `scrollWidth / 2` disagree
by exactly the predicted amount on both components, and after the fix a
correction leaves the identical set of images/cards on screen before and
after — confirmed by comparing the visible id sequence, not just the number.

**A manual swipe now gets corrected too, not just autoplay and the arrows.**
`page()`'s pre-step check only ever covered autoplay ticks and arrow clicks —
dragging the track directly never called `page()`, so a swipe or a wheel
scroll (`FeaturedProducts`' own `onWheel` handler included) that crossed the
seam had nothing pulling it back at all. `onScroll` now arms a 120ms settle
timer on every scroll event, cleared and re-armed by the next one, so the
correction only ever fires once scrolling has genuinely stopped — never
mid-gesture, which would fight a touch drag still in progress. Verified with
a simulated 8-step scroll burst 20ms apart (well under the 120ms window): no
correction mid-burst, then an exact, invisible correction ~120ms after the
last event.

**`onScroll` is throttled to one measurement per animation frame** on both
components. `FeaturedProducts`' handler scans every card with
`getBoundingClientRect()` to find the centred one, and native `scroll` events
fire far more often than the display updates — verified by patching
`getBoundingClientRect` and firing 50 scroll events in a tight synchronous
burst: 8 calls (one full pass) landed, not 400. This was very likely the
larger half of "not moving smoothly": that scan is real per-frame work, and
it was running many times a frame during a fast swipe.

**Belt position stays bounded across many laps**, checked by sampling
`scrollLeft` every 250ms for 10s of autoplay on both components: it never
exceeded `oneSet` plus one item's width (the legitimate peak between
corrections), and the settle-correction never fired mid-gesture in the burst
test above.

### 2026-08-24 (later) — About §03/§04 reworked

**The photo strip is a full-bleed endless belt.** Slides are ~60% of their old
width (client asked for 40% off) and the interval is 2s. The track sits
*outside* `Container` rather than using the usual `w-screen left-1/2
-mx-[50vw]` full-bleed trick — `100vw` measures the viewport *including* the
scrollbar, so that idiom overflows by the scrollbar's width on every desktop
browser that reserves one. `AboutGallery` puts its own controls back inside a
`Container` so they stay aligned with the text column.

**The belt renders the list twice and resets across the seam.** The client
asked for a true loop — first image following the last, never a rewind. The
scroll position is pulled back by one set-width whenever it drifts past the
seam; because the two copies are identical at that offset the reset cannot be
seen. Verified: `2522 → 430` (a drop of exactly `oneSet`) while the visible
images advanced by exactly one. Duplicates carry `inert`, not `aria-hidden`,
so they leave the tab order and the accessibility tree together.

**The reset is issued before the smooth step, never during one.** Doing it
mid-flight cancels the scroll already running and the belt stutters at the
seam. Same idiom as `home/FeaturedProducts`.

**`snap-*` came off the track.** Scroll snapping fights the seam reset — the
browser re-snaps to the nearest slide after the instant `scrollLeft`
assignment and the belt jerks at the wrap. Paging is by a measured stride
(`stride()` reads the gap between two slides' left edges), so snap was only
ever belt-and-braces. Do not put it back without re-testing the seam.

**Dots are `index % images.length`.** Past the seam the raw index counts into
the duplicate set, and there is no seventh dot to light.

**Arrows and pause sit above the strip, at its top right** (client), aligned
to the `Container` edge rather than the window's so they line up with the text
above even though the belt runs wider. They were overlaid on the photographs
first; above rather than over means they never cover a picture, and on a phone
— where one image now fills the frame — an overlay sat on the subject.

**One image per view below `sm`, several from it.** The mobile slide is
`w-full` of the flex track, not `100vw`: `vw` counts the scrollbar and
overflows wherever one is reserved. The edge fades are `sm`-and-up only —
over a single full-frame photograph they just wash its own edges rather than
suggesting more to come.

**`SocialProfileCard` renders a profile *preview*, not an embed.** The client
asked for "a screenshot of the actual profile". The file's header comment
records why it is not one — Instagram and LinkedIn have no profile embed at
all, Facebook's and X's widgets are §9-forbidden third-party cookie-setters,
and the accounts had no posts to show. Nothing on the card is invented, and
there are no follower or post counts anywhere, because those would have to be.
A grid of tiles stood in for posts for part of the day and the client had it
removed for exactly that reason: photographs arranged as a post grid read as
posts, and they were not.

**The card is not itself a link.** One "View page" button carries the
destination, under a heading naming the platform. An all-card anchor cannot
hold a button inside it — nested interactive elements are invalid and give one
destination two tab stops.

**§04 stacks in rows below `lg` and is one row of five from it.**
`SocialProfileCard` changes shape at the same breakpoint — horizontal in the
stacked form, vertical in the row — so the grid and the card have to move
together. The section drops the `max-w-2xl` that §01–§03 carry, because five
capped cards would be ~130px and the platform names would not fit; the
standfirst keeps its own measure so the prose still reads at a comfortable
length. The bio came off the card in the same change: one sentence about the
range runs to eight lines in a 170px column. `PROFILE_ORDER` still sets the
sequence.

**Two `min-width` traps, both fixed, both worth knowing.** The chrome bar's
URL is `truncate`d inside a flex row, which does nothing without `min-w-0` —
a flex item defaults to `min-width: auto` and refuses to shrink below its
content. Fixing that alone was *not* enough: the track containing it is sized
`auto` too, so it took its minimum from the same nowrap string. Both were
needed; either one missing put five pixels of horizontal scroll on a 390px
phone. Same family as the `minmax(0,1fr)` note on `ProductCatalogue`.

**`public/brand/vkon-avatar.png` is a copy of `src/app/icon.png`** — the
current round badge — because `app/icon.png` is a metadata route, not a static
asset to point `next/image` at.

### 2026-08-24 — About page restructured

**Four sections, renumbered: 01 About us, 02 Products, 03 Info, 04 Social
media.** Client request. Products moved up from 04, Instagram widened into
Social media, and Info is new.

**Vision & Goals is gone**, and with it the `CULTURE` and `GOALS` arrays and
the `IconBadge` and `BulletList` helpers that only it used. `TargetIcon`,
`HeartIcon`, `FlagIcon` and `CheckIcon` are no longer imported here — they
remain in `icons/ui` and are used elsewhere.

**Two paragraphs came out of §01**, both client-marked. Removing the first
orphaned two references to "this shift" further down; one of those sentences
(the lead-in to the three market cards) is the sentence those cards complete,
so it stayed in reworded, self-contained form. Recorded because it is a copy
edit that was *not* asked for and exists only to keep the removal grammatical
— see the note in the file.

**The breadcrumb came off `/about` and `/contact`** (client request). The
`breadcrumbJsonLd` block stays on both: it feeds the search result, not the
page, and dropping it would lose the trail Google already shows.

**Two new client components**, both in the table above. `StatCounter` animates
a figure from zero once, on first intersection, with the final value already
in the server-rendered HTML so it is correct without JavaScript and for a
crawler. `AboutGallery` is a scroll-snap strip — position is read back from
`scrollLeft` rather than driven by a transform, so swipe, wheel and keyboard
all keep the dots in step for free. Its wrap from last to first is an instant
jump; a smooth scroll the length of the strip reads as a glitch.

**Reduced motion in `AboutGallery` uses `useSyncExternalStore`**, not an
effect that calls `setState`. The effect form is what
`react-hooks/set-state-in-effect` rejects — the rule already has five
pre-existing violations in this repo (§10) and this deliberately does not add
a sixth.

**No new dependency.** The counter is `requestAnimationFrame`, the gallery is
`scrollTo` plus `IntersectionObserver`.

**`public/vkon-automation-brochure.pdf` is a placeholder** generated at
1.2KB by a throwaway script, so the §03 download button resolves instead of
404ing. It says so on its one page. Replace the file, keep the name, and
nothing in the code changes.

**The §03 gallery photographs are the site's own segment images**, not stock
pulled off the web: an image from a search carries an unknown licence, and a
commercial site is where that bill arrives. Swapping them touches only the
`GALLERY` array.

**`SOCIAL_COLOR` in `about/page.tsx` deliberately duplicates `Footer`'s
near-identical map.** One entry differs and has to: X is black here, on a
light surface, and off-white in the footer, on a dark band. Merged, one of the
two rows gets an invisible icon.

### 2026-08-23 (later) — Catalogue page

**"Every panel we build" became "Everything we build."** The old title covered
panels only, while the catalogue also holds cables, accessories, auto-start
units and home-automation lighting — the same under-selling the OG banner had.
The standfirst now names the ranges rather than describing panels.

**The masthead is `compact` and has no breadcrumb.** `PageHero` gained a
`compact` size for pages whose masthead is a label on the way to something
else; the full one pushed the first product most of a screen down, so the page
opened on prose about products instead of on products. "Home /" above a page
reached from the header's own Products link told a visitor nothing they did
not already have. `/protection`, where the masthead *is* the introduction,
keeps the roomy variant.

**Filters collapse behind a disclosure below `lg`, and become native
`<select>`s there.** Every option of all three groups used to render at once
as wrapped chips — a screenful of controls before the first product. Collapsed
by default now, and opening it gives one row per group instead of a wall. The
desktop rail is untouched: still on the left, still sticky, still the chip
list.

Two details worth keeping:

- *React state, not `<details>`.* The panel must be forced open at `lg`
  whatever the toggle says, and a `<details>` hides its own content in a way
  CSS cannot reliably override.
- *The two controls swap with `hidden`, never `aria-hidden`.* `display: none`
  takes the inactive one out of the tab order and the accessibility tree
  together. `aria-hidden` alone would leave a dozen keyboard-reachable options
  invisible to a screen reader — the pairing ARIA forbids, and the same trap
  the featured belt hit.

**A "Clear all" sits beside the result count**, and only when a filter is
active — a permanently visible one beside an unfiltered list is a dead
control. The mobile toggle carries a badge with the number of active filters,
since collapsed filters are otherwise invisible state.

Product cards were deliberately not touched.

### 2026-08-23 — Cart

**A cart, with no checkout behind it yet.** Add-to-cart on the product page, a
count in the header, and `/cart` listing what was picked with quantities. The
eventual goal is full e-commerce; this is the state layer for it, built so
adding payment later touches pages and not storage.

**`lib/cart.ts` mirrors `lib/recent.ts` — with one difference that matters.**
`recent.ts` subscribes to the `storage` event alone, which fires in *other*
tabs only; that is enough there because the write happens on a product page
and the read on the home page, two separate documents. A cart is read and
written in the same document, so a write must also tell its own tab. Writes
dispatch a `vkon-cart-change` event on `window` and subscribers listen for
both. Drop that and the header count silently stops moving when you press Add.

**Slugs and quantities are stored, never product data — and no prices.**
A cart holding names or prices would keep showing them after a product is
renamed, repriced or deleted. The page resolves slugs against the live
catalogue and drops what no longer exists; verified against a stored slug for
a deleted product, which vanishes rather than 404s. It also means adding real
prices later is a server concern, not a migration of everyone's stored cart.

**No totals are shown, because products carry no price field.** A total that
silently omitted tax or delivery would be worse than none. Until checkout
exists the cart's job is to carry a list to a human: the primary action sends
it to WhatsApp, which is how the business already takes orders.

**The add button becomes the quantity stepper once a product is in the
cart**, on the cards and the product page alike (client, 2026-08-23). The
stepper replacing the button *is* the confirmation — an earlier build flashed
"Added" for two seconds and reverted, which said the press landed but not what
the cart holds, and said nothing at all by the time the visitor looked back.
At a quantity of one the minus becomes a bin, because that press removes the
line either way and the icon should say so.

**The add button is green, against rule 3 in `globals.css`** (client request).
That rule reserves the accent for links, active state and small marks with
primary actions in near-black, so this is the one place that departs from it.
It uses `bg-accent text-surface`, the pairing `ui/Button`'s `accent` variant
already carries — white on the accent green measures 1.9:1 and would fail.

**`whitespace-nowrap` and `shrink-0` on that button are load-bearing.** On the
product page it sits in a flex row with two other buttons; without them it
shrank and the label wrapped to three lines — "Add / to / cart" — overflowing
onto the image behind it. Desktop only, because that is the breakpoint where
the row becomes a row, which is why it read as a desktop-only bug. `ui/Button`
has carried `whitespace-nowrap` all along for the same reason.

**Add-to-cart sits on the product cards too** — catalogue, featured and
recently viewed, all three being `ProductCard`. Two things had to be right for
a button to work there at all:

- *Both card orientations are stretched-link.* The title's
  `after:absolute after:inset-0` lays an invisible sheet over the whole card so
  any part of it navigates. A button under that sheet cannot be clicked — the
  overlay takes every press. The button carries `relative z-10` to sit above
  it, and `stopPropagation`, since a press that bubbles to the card navigates
  away and the visitor lands on the product page instead of staying put.
- *The featured belt's duplicate cards use `inert`, not `aria-hidden`.* Each
  card holds focusable things — a title link, now a button — and `aria-hidden`
  hides them from assistive technology while leaving them in the tab order,
  the one combination ARIA forbids. Verified by focusing each control inside a
  duplicate: 8 were reachable before, 0 after.

**`pageMetadata` gained `noIndex`**, and `/cart` is the first user. Its
content belongs to one visitor and differs for every other, so there is
nothing to rank. `sitemap.ts` is an explicit allow-list so the route stays out
of it automatically; the meta tag covers a crawler arriving by link.

### 2026-08-21 — Per-product SEO overrides

Products gained two optional columns, `seo_title` and `seo_description`
(`schema.sql`, plus `ALTER TABLE … ADD COLUMN IF NOT EXISTS` so an existing
database migrates on the next deploy's schema run). They surface as an **SEO**
panel in `ProductForm` and flow through the usual path — `Product` type,
`mapProductRow`, `WRITE_VALUES`/`writeParams` (now params `$17`/`$18`) and the
`createProduct` insert. The product page's `generateMetadata` uses them when
set and falls back to the product name and tagline when blank, so nothing
changes for products that leave them empty. The admin action trims and caps
them (70 / 200 chars). No dependency, no new component.

### 2026-08-21 — Brand intro splash on first visit

`layout/IntroSplash`, mounted in the `(site)` layout (not root — admin gets no
splash), covers the page on a fresh visit: the logo flips in on its Y axis at
centre, then flies up and lands on the header's real logo — spinning a full
turn on the way — while the cover fades to reveal the site behind it. The
landing is a measured hand-off: the header logo carries `data-brand-logo`, the
splash measures its box live and transitions `translate/scale` to match, so it
lands pixel-accurate at any breakpoint and the identical header logo is already
underneath when the splash unmounts. (The spin needs both transforms to share
one function list — `translate … perspective … rotateY … scale` — since
mismatched lists interpolate as matrices and a 360° matrix is identity, i.e. no
spin.)

Once per browser session via a `sessionStorage` flag: the layout already
persists across client navigation, so it mounts once per full load, and the
flag stops a hard refresh replaying it within the same session.

It covers rather than gates — the page renders underneath from first paint, so
content and crawlers are unaffected; the cover is a `fixed`, `aria-hidden`
overlay whose background fades to reveal the page and whose container
self-clears to `visibility: hidden` / `pointer-events: none` via a CSS
animation, so it never traps a click even if the component's timer never fires.
`prefers-reduced-motion` collapses the animation and shortens the timer, so
those visitors get no hold. No dependency: one client component, CSS keyframes,
the existing brand PNGs.

### 2026-08-21 — About page gained icons and a 3D tilt

The three markets ("In daily living / agriculture / industry") went from a
bordered bulleted list to a three-up grid of `about/TiltCard`s, each with a
themed hand-drawn icon (`HomeIcon` / `SproutIcon` / `FactoryIcon`, added to
`icons/ui`). `TiltCard` is the site's one genuinely decorative flourish: it
writes `--rx`/`--ry` from the pointer over the card and the `.tilt` utility in
globals.css turns those into a small 3D rotation. It runs on fine-pointer
devices only (`(hover: hover) and (pointer: fine)`, checked once) so a phone
renders a flat card and spends nothing, and the global reduced-motion rule
already flattens the transition. The vision/culture/goals headings carry
square (`rounded-[2px]`) accent icon badges — `TargetIcon` / `HeartIcon` /
`FlagIcon` — and the culture/goals bullets became accent check marks.

Kept inside the design language rather than departing from it: 2px corners
(the round badge stays reserved for the market cards' floating marks), accent
used only on the marks, copy still left-aligned, no new dependency (icons are
hand-drawn SVG, the tilt is CSS transforms). New scroll-reveal (`.reveal`) on
the market grid and the Instagram/Products cards.

### 2026-08-21 — Home page gained a "Featured products" row

New section between the sector browser and recently-viewed, fed by the
previously-unused `listFeaturedProducts`. It reuses the `hscroll` track idiom
but snaps `center` rather than `start`, and exactly one card is popped
(scaled and lifted) at a time — a heavier motion than the rest of the site's
plain hover lift, kept scoped to this one track rather than changed on
`ProductCard` itself. Whichever card's own centre is closest to the track's
centre is popped by default, measured on scroll and resize the same way
`sync` already measures for the paging arrows; a real mouse hover overrides
it — `hoveredId ?? centeredId` is the one popped class applied, gated so only
a genuinely hover-capable device (`(hover: hover) and (pointer: fine)`) trusts
`hoveredId` at all, since a touch tap can fire a stray `mouseenter` with no
matching `mouseleave` and stick the pop on whatever was first touched. The
track carries vertical padding rather than `overflow-visible` so the lifted
card has room to rise into without clipping — `overflow-x: auto` forces the
other axis to `auto` too, so `visible` was never actually available here.

`IntersectionObserver` against a narrowed root margin was tried first for the
centred-card check and dropped the same day: it only reports a change on
crossing one of a fixed set of ratio thresholds, so the centred card could go
stale for stretches of a scroll rather than tracking it continuously.

A wheel-driven scroll also turned out to leave a stale `hoveredId` in place —
it shifts a different card under a cursor that never itself moved, and
browsers do not re-fire `mouseenter`/`mouseleave` just because content moved
under a stationary pointer. The scroll handler clears `hoveredId` for exactly
that reason.

**Nothing pops until this section itself is in the viewport, and it un-pops on
scrolling away.** An `IntersectionObserver` on the section root (threshold
0.4) drives an `inView` flag gating the popped id — separate from the other
`IntersectionObserver`-shaped idea already rejected above for the centred-card
check itself; this one only ever needs a single boolean, so the ratio-
threshold gap that ruled it out there does not apply here. Arriving on the
page is not "reaching" a card, and scrolling on past it should let go of it —
an earlier build used a one-way `interacted` flag set by the first scroll or
hover instead, which never un-popped once it was true.

`RecentlyViewed` picked up the same treatment the same day: centred snap in
place of `snap-start`, the same one-popped-card-at-a-time state, the same
wheel handling and direct-measurement centring, and the same section-level
`inView` gate.

`FloatingContact` (the fixed call/WhatsApp buttons) and the footer's social
row also changed the same day. Each button now hovers to its own brand
colour via a `--hover-color` CSS variable (Tailwind's build-time class scan
cannot see a colour built from a prop, so an arbitrary class per button would
ship no rule), reversing the earlier "no brand colour, shared band tokens"
call.

`FloatingContact` briefly moved from `fixed` to `sticky` the same day, then
returned to `fixed`: the sticky version made the controls participate in the
footer's scroll boundary and visually line up with the copyright/social row.
It now renders after `Footer` in the site layout, outside that row and outside
the footer's containing block, so the buttons remain independent fixed
bottom-right controls. Its hover colours remain per-button through the
`--hover-color` CSS variable.

### 2026-08-20 — Catalogue is two independently scrolling rows, 1:1 imagery, recently-viewed reworked, subscribe panel bleeds to viewport edges

**The catalogue rows use vertical `ProductCard`s**, sized to match the
`RelatedProducts` carousel on product detail pages so a visitor going
catalogue → detail → back sees the same card proportions throughout. Widths
went from `88% / calc((100%-1rem)/2)` (mobile / sm, horizontal-strip cards)
to `82% / calc((100%-1.5rem)/2) / calc((100%-3rem)/3)` (mobile / sm / lg).
A brief tighter pass — 63/38/25% — was tried on 2026-08-19 and reverted the
same day when the client confirmed the similar-products proportions were the
target. The `HorizontalCard` variant of `ProductCard` is not deleted —
nothing else uses it today, but the compact strip is a useful shape and the
file already documents both orientations.

**Every category renders as two independently scrolling rows, at every
breakpoint**, filling column-first: card 2 under card 1, card 3 beside card
1, card 4 under card 3. Three cards show per row at `lg`, two at `sm`, one on
a phone. `ProductRow` is now a heading plus two `Track`s, where `Track` is a
self-contained scroller owning its own ref, scrollability state and arrow
pair — which is what makes the two independent with no coordination between
them.

**The arrows live on each row, not on the category heading.** A single pair
driving both rows would contradict the independence the split exists to
provide. Each pair hides when its own row already fits and disables at its
own ends.

Two earlier builds of this are worth not repeating. The first used one
`grid-flow-col grid-rows-2` track, which scrolled both rows together. The
second split the rows below `lg` but merged them back into a single row at
`lg` via `display: contents`, which worked but forced a sequential
first-half/second-half split (column-first would have needed `order`, and
that desyncs tab order from visual order). Two rows at all breakpoints made
both problems disappear — no `display: contents`, no duplicated markup, and
column-first ordering comes free.

**The second row is only rendered when it has something in it**, and that
condition is load-bearing. The grid build materialised every explicit track
whether or not an item landed in it, so single-product categories got an
empty second row plus its gap — dead space that read as a gap between one
category and the next heading. Six of the seven demo categories hold exactly
one product, so it was visible the whole way down the page. The flex build
keeps the guard for the same reason: an empty `Track` still renders its
margin.

**Every plate that shows product photography is 1:1, and the photography is
shot 1:1.** That pairing is the rule: catalogue card, product detail main
image, detail thumbnails and the recently-viewed strip all use
`aspect-square` with `object-cover`, so source and plate share a ratio and
nothing is ever cropped. Give any one of those plates a different aspect and
it silently starts cutting panels — invisible while the catalogue runs on
drawn placeholder art, obvious on real photography. **Upload spec: square,
1600×1600 preferred, 1200×1200 minimum.** Reaching this took several passes
(`object-contain` with padding → `cover` at 4:3 → `cover` at 1:1); the admin
thumbnails deliberately stayed `object-contain`, because the admin is where
you check what was actually uploaded and a crop there would hide a badly
framed shot until it was live.

**Recently viewed is an L-shaped card.** A floated fixed square image with
the sub-category and the specification list beside it, and the product name
and description clearing below via `clear-left` so they get the card's full
width. The build before this gave the image plate a width equal to the
card's height (`self-stretch aspect-square`), which crushed the text into
the remaining sliver on a phone.

**The spec list is a five-line block at every width**, filled from the detail
page's spec table, values only, falling back to `hpRanges` for products with
no spec rows. Fixed height rather than a cap, so what follows lines up across
a row; `leading-5` makes 6.25rem exactly five 20px lines, so the clip lands on
a line boundary. Values wrap like ordinary text, so a long one takes two lines
instead of overhanging the card.

**Where the list runs past five lines, three dots replace the trailing dot of
the last spec that fitted** — `· value···`, flush, no gap. `ProductCard` is a
client component for this one measurement: which spec ends the fifth line
depends on where the text wrapped, so only layout knows it.

Three details of that measurement each cost a wrong render:

- *Measure the trailing dot element, not the spec.* A spec's bounding rect is
  the union of its lines, so a value that wraps inside itself reports the
  wider line and the earlier top — the mark landed level with a line the value
  had not finished on. A `Range` over the contents is no better: its last rect
  is not the dot box, and lands early enough to cover the value's final
  letter. The dot is an `inline-block`, so its own rect is exact.
- *Clamp the mark, never step back a spec.* Where the last spec ends hard
  against the right edge, retreating to an earlier one puts the mark mid-line,
  tens of pixels adrift of the value it belongs to.
- *Use rects, not `offsetLeft`.* The block is `display: flex`, so it
  establishes a formatting context, refuses to overlap the float and is placed
  beside the image; its items' offsets carry that shift while `clientWidth`
  does not, and comparing them reports the first spec as overflowing every
  time.

It cannot oscillate: no spec is added or removed by the result, and the mark
is absolutely positioned, so placing it changes no geometry.

*Dots bracket the list and open every line.* Each spec carries a leading and
a trailing dot in fixed-width boxes, with the leading one pulled back by
exactly that width (`-ml-4` against `w-4`). Mid-line it lands on the previous
spec's trailing dot and the pair superimposes, reading as one; at a wrap it
falls clear and opens the new line. `gap-x-0` is load-bearing — any gap
breaks the superimposition and shows two dots. This exists because "a dot at
the start of each rendered line" is not something a CSS selector can express:
line breaking happens at layout, so the same separator has to render twice,
closing one line and opening the next.

**The fixed count replaced two attempts at fitting the list to the space, and
the reason both failed is worth keeping.** First a server-side character
budget, which had to be tuned to the narrowest card and so left visible empty
space on every wider one. Then measurement: `ProductCard` became a client
component, clipped the list to the image's height and worked out what fitted.
That one had a subtler fault — the block is `display: flex`, so it
establishes a formatting context, refuses to overlap the float and is placed
*beside* the image; its items' `offsetLeft` therefore carried that shift while
`clientWidth` did not, and comparing them reported the first spec as
overflowing every time. Even once corrected, any value wider than its column
had nowhere to go, because `whitespace-nowrap` gives it no line to fall to.
Letting text wrap dissolved the problem instead of solving it, and the card
went back to being a server component.

**`/about` was rebuilt on the client's own copy**, supplied 2026-08-20, and
the placeholder text it replaced is gone. The page now follows `/contact`'s
shape — a photographic masthead over `aboutus-background.jpg` carrying the
heading and one line, breadcrumb below the picture rather than on it, then
ordinary surface sections using the same narrow-`label-tech`-rail idiom as
the product detail page. `PageHero` is no longer used here. Sections run:
About us → Vision & Goals → Instagram → Explore our products → sign-up.
The copy is content, not prose to improve — the old text existed only
because there was nothing real to put here.

**The Instagram section is a profile card, not a live feed**, and that is a
constraint rather than a preference. A real feed needs Meta's embed script or
a third-party widget — both third-party requests setting cookies on arrival,
which §9 forbids before a visitor asks — or the Graph API, which needs a
Facebook app, a refreshing long-lived token and a dependency the runtime
policy has no room for. The card costs nothing, never breaks, and links out.
Revisit only if the client accepts the cookie trade, as they did for Maps.

**Header nav reads "About Us" and "Contact Us"** (client request). Labels
only — the routes stay `/about` and `/contact`, since those are indexed and
shared. Footer wording was left alone.

**Filter rail buttons picked up a mobile-only bug fix.** The `pl-3` on the
option buttons was gated to `lg:` — on mobile, where filters wrap into a
horizontal chip row, the option label sat flush against the 2-px accent
border. Padding is now applied on every breakpoint.

**The subscribe panel bleeds to the viewport edges** (client request). A
second copy of the panel photograph sits absolutely behind the section,
`fill sizes="100vw" blur-lg scale-105`, and shows through the container's
side padding and the section's top/bottom padding. The blur started at
`blur-3xl` on the first pass and was dialled down to `blur-lg` — the client
wanted the field still recognisable rather than smeared into a colour wash.
A translucent `bg-surface/40` sits over the bleed so it does not overpower
the neighbouring sections. The sharp panel with its three-layer scrim is
unchanged — it sits inside the Container as before, and reads as the
focused card on the blurred ground.

### 2026-08-19 (latest, after revert) — Canvas reverted, contact masthead trimmed, Google Maps overrides §9

**Canvas is back to the near-white ground.** The meadow tint added earlier the
same day made the whole page read as green rather than reading as white pages
with a green accent — the accent alone was doing the nature-cue better than a
tinted ground was. `--color-surface` returned to `#F7FAF8` and
`--color-surface-subtle` to `#EDF3EF`; the accent stayed on the new
`#23703D`, which now sits on the near-white ground at 6.4:1 (was 5.5:1 on the
darker meadow). The contact form's white card lost some of its "pop" as a
result — it is still bordered and shadowed so it still reads as a card, but
the effect is quieter. The EnquiryForm inputs kept `bg-surface-subtle`
because it now provides a slightly more visible tint against the white card
than the earlier `bg-surface` did.

**Contact masthead trimmed by ~25%.** Min-heights went from 16/20/24rem to
12/15/18rem, and a tagline was added under the H1. The scrim briefly came off
during this session and went back the same day: this photograph varies too
much top-to-bottom (pale sky, bright tractors, darker crops) for a white
headline to sit on it without cover. A text-shadow was tried in the no-scrim
interval; the scrim does the job more cleanly, so both scrim layers are back
as they were.

**A tagline sits under the H1.** "Call, WhatsApp or write below — all three
reach the same desk." Positions the three contact channels as equal at the
top of the page, and mirrors the copy under the form ("if the pump is down
today, call — that is always faster than a form").

**The map is Google Maps, overriding §9.** §9 forbids third-party embeds
that load before a visitor asks, because a Google Maps iframe sets advertising
cookies on arrival. Client asked for it anyway on 2026-08-19, and this entry
records the trade: on first arrival at `/contact`, the visitor's browser
talks to Google and stores its cookies whether or not they interact with the
map. The keyless `maps.google.com/maps?q=...&output=embed` URL avoids the
API-key dependency, so a deploy still does not rely on a billing account.
The docstring on `app/(site)/contact/page.tsx` records the same override
locally.

### 2026-08-19 (later, superseded by canvas revert above) — Meadow palette, similar-products carousel, centred nav, floating buttons moved right

**Surface tint shifted to meadow green** (client request). Canvas is now
`#EDF4E6` and `surface-subtle` `#E4EDDC`, both a step greener and darker than
before, so `surface-raised` (still pure white) reads as a lifted card by tone
as well as by shadow. The `accent` family moved with it — `#23703D` /
`#1A5A2E` / `#E1EEDA` — to keep it in the same hue species as the ground.
Every semantic-token consumer picked the shift up automatically because
components use `surface-*` and `accent-*` and nothing hard-codes the old hexes;
grep for `1f7a4c` before deciding otherwise. The measured contrast table at
the top of `globals.css` was updated with the new figures (accent 5.5 / muted
5.3 / body 7.4 / ink 16.4), but the DOM harness has not been re-run — do that
before shipping. Dark mode is unchanged.

**Related products became a horizontal carousel and narrowed to the same
sub-category only.** `src/components/product/RelatedProducts.tsx` is a new
client component that reuses the `hscroll` idiom from `SectorBrowser` — paged
arrows above, right-aligned, disabled at the ends, hidden when everything
fits. The two-tier widen-to-sector fallback that lived in the product page is
gone; if a sub-category holds a single product the block is absent, which is
honest. Heading is a flat "Similar products" — the old dynamic
`Others in [category]` / `More from [sector]` labelling went with the tier
logic. The 3-item cap was dropped along with the grid.

**Header nav is centred on the true page centre.** Restructured to three flex
tracks with `md:flex-1` on both the logo and controls, so the nav lands at
container-width/2 rather than halfway between logo and theme toggle (which
drifted with each label change). Mobile layout is unchanged — logo left,
theme + hamburger right via `ml-auto`.

**Floating call and WhatsApp moved to bottom right** (client request,
overriding the earlier "bottom left" note in the 2026-08-18 entry). The
tradeoff recorded there still applies in reverse: a chat widget or cookie
banner added later now conflicts with this position and should take the left
instead, or accept the stack.

### 2026-08-18 — Sign-up rebuilt, floating call and WhatsApp

**The sign-up is a dark block beside a taller photograph**, to a layout the
client supplied. The overlap is the device: two flat rectangles side by side
read as a table; one running past the other reads as a composition. The
overhang is `lg:-my-10` eating into the section's `lg:py-20` — reduce that
padding and the picture collides with whatever is above it.

**Everything on the block uses band tokens, including inside the pill.** The
obvious build — a white pill with `text-ink` in it, as the reference has —
breaks in dark mode, because `ink` inverts to near-white while the pill stays
light. `band` and `band-accent` no longer change between themes, so a pill built
from them is correct in both with no variant. The button is `text-band` on
`bg-band-accent`; white on that green is 1.9:1.

The image slot measures **704×533 at a 1440px viewport — 4:3**. Artwork for it
should be cut to that; `bg-cover` crops anything else.

**Floating call and WhatsApp, bottom left, desktop only.** The phone number left
the header's top right, where it was hostage to the header retracting on the way
down the page. Notes:

- **Desktop only is not an oversight.** A phone already has `MobileActionBar`;
  two floating circles on top of it would be four ways to do two things,
  covering content on the smallest screen. `hidden md:flex` here,
  `md:hidden` there.
- **Bottom left, not right** — the right is where a chat widget or cookie
  banner lands, and where the browser paints its link-target tooltip.
- **No WhatsApp brand green.** `MobileActionBar` already made that call. It is
  also a contrast trap: #25D366 carries a white glyph at 1.98:1, under the 3:1
  a meaningful icon needs. #1DA851 is the lightest WhatsApp green that clears
  it, if the brand colour is ever wanted.
- The wrapper is `pointer-events-none` with the buttons `pointer-events-auto`,
  so the gap between the two circles does not swallow clicks on the page.

### 2026-08-19 (later still) — Contact masthead, and the sign-up on three pages

**The contact photograph is a masthead, not a backdrop.** It ran behind the
whole page; it now occupies the top band carrying the headline and nothing
else, and everything below sits on an ordinary surface. `EnquiryForm` went back
to page tokens as a result — it had been converted to `band-*` when it sat over
artwork, and the note on the component records that the two must move together.

The breadcrumb moved below the masthead rather than being dropped. The client
asked for the image to carry the headline alone; a breadcrumb is navigation, and
removing it would leave the page with no route back except the header.

**The sign-up is on home, about and contact.** Pages place it themselves. It
rendered from inside `ContactStrip` until earlier the same day, which put it on
every page closing with contact details — including the catalogue and each
product page, where somebody is mid-task.

### 2026-08-19 (later) — Contact page reshaped, scrims lifted, related products narrowed

**The contact page is now the form and the location, over a photograph.** The
call / WhatsApp / email row across the top was removed at the client's request.
That costs a visitor nothing — those channels are on the floating buttons, the
mobile action bar and the footer — and it makes the page about the one thing it
is for.

**A live OpenStreetMap embed**, not Google and not deferred. §9 forbids
third-party embeds that load before a visitor asks, because a Google Maps iframe
sets advertising cookies on arrival; OSM is a tile server, not an ad network, so
there is nothing to defer. It also needs no API key, so a deploy does not depend
on a billing account. The pin is the centre of Kolar Gold Fields, not the works
— `site.ts` is still a placeholder, and a pin on an unconfirmed street is worse
than an honestly approximate one.

`EnquiryForm` moved onto band tokens throughout, because it now sits over
artwork. Dropping it back onto a pale section would render muted-grey labels on
near-white; the component says so.

**Scrims lifted on the hero and the sign-up.** The hero flat floor went 40 → 38
and its gradients 85/64/15 → 82/60/13; the sign-up went 55/25 → 44/18. The floor
is **pinned by one slide**: the commercial stairwell at 390px, where the body
copy spans the full width and crosses the lit staircase. At 33 that run measured
4.16:1 against the 4.5 it needs; 38 restores it to 4.73 (1.05×). Anything
lighter needs either different artwork or a per-segment scrim strength, which
does not exist yet.

**Related products no longer cross categories.** The third tier added earlier
today — fall through to the whole range — was removed the same day: "more from
the range" on a wardrobe light meant three submersible pump panels. Two tiers
now, and a category holding one product shows no section at all, which is
honest. Better an absent block than a misleading one.

**Three more harness faults, all of the same family: the sampler was reading
something that is not a background.**

1. Rects were in **viewport** space while the capture was the viewport, which
   held only while the measured section fitted on screen. On the contact page it
   does not, and `getImageData` past the canvas edge returns transparent black —
   luminance 0, which reads as a spectacular pass or failure depending on the
   text colour. Captures are now full-page with document-space rects, clamped to
   the bitmap.
2. The **floating buttons** render over the page, and in a full-page capture
   they land on whatever is at their viewport position — a white glyph was being
   read as the background of a label 800px down the document. Fixed overlays are
   hidden during capture. This fix existed in `hero.mjs` and had not propagated
   to the scripts derived from it, which is its own lesson.
3. The DOM auditor reported the sign-up panel as white-on-white, because `bgOf`
   walks ancestors for a background *colour* and a photograph is a sibling
   `<img>`. It now detects covering artwork structurally and defers those runs
   to the pixel samplers.

None of the three was a site defect. All three were hiding whether there was
one — which is the point of writing them down.

### 2026-08-19 — Contact page, related products everywhere, taxonomy renamed

**A contact page at `/contact`**, and with it the site's second unauthenticated
write path. Direct channels run across the top, the enquiry form sits below with
the address and hours beside it. That ordering is the design: this buyer has a
pump that has stopped, a form is the slowest way to reach anyone, and **nothing
here sends mail** — an enquiry waits in `enquiries` until somebody opens
`/admin/enquiries`. Putting the form first would quietly make the slowest
channel look like the intended one.

The form stores rather than emails because that is what the existing
architecture supports without a new dependency: the same shape as `subscribers`,
reusing `lib/rate-limit.ts` and the honeypot, no third-party key. §11 and
ADMIN.md §7.7 record the notification gap that follows.

**No map embed.** A Maps iframe is a third-party request setting cookies before
the visitor has done anything, which `ProductMedia` already refuses to do for
YouTube — and the address in `site.ts` is still `TODO(vkon)`, so a pin would be
confidently wrong. The address links out to a Maps search instead.

**Related products now appear on every product.** The rule was "same category",
and home automation is the only category with more than one product, so the
section rendered on exactly one range and nothing anywhere else. It now widens
in three tiers — same sub-category, then same category (sector), then the rest —
and the heading names what is actually on screen, because "Others in Cables"
above a lighting module is simply untrue.

**The taxonomy was renamed in the interface only.** What the code calls `sector`
is labelled **Category**, and what the code calls `category` is labelled
**Sub-category**. The query parameters were deliberately left alone: `?sector=`
and `?category=` are in links already shared and indexed, and renaming them
would break every one. Expect that split when reading `ProductCatalogue`.

**The sign-up is a home-page block again.** It was rendered from inside
`ContactStrip`, which put it on all five pages that close with one. Asking on
every page is what makes a newsletter prompt read as nagging.

**Two harness corrections, both of which had been hiding real signal:**

- The DOM contrast auditor reported four failures on the sign-up panel. False:
  that panel is now text over a photographic `<img>`, and `bgOf` walks ancestors
  for a background *colour*, so it found the page ground and concluded
  white-on-white. It now detects a covering positioned `<img>` structurally and
  defers those runs to the pixel sampler, which measures the panel at 1.38×.
- The hero pixel sampler then reported "Motor range covered" at 1.03. Also
  false, and more interesting: the **new floating buttons overlay that text at
  768px**, so the sampler was reading a button's fill as the background of the
  text it happens to cover. Fixed overlays are now hidden during capture. The
  overlap itself is real and inherent to a floating button — content passes
  under it — but it is an object you scroll past, not a background.

### 2026-08-18 — Neutral scrim, black band in both themes, sign-up above contact

Five client requests, plus one performance bug found while checking them.

**The hero scrim is neutral** (`#0E1113`, was the green `#0A1F16`). The green
cast was deliberate while the band was green; with the band neutral it read as a
colour filter on the photographs rather than a house style. Neutral is also
darker, so every hero contrast figure improved — tightest went 1.03× to 1.12×.

**`--color-band` is the same near-black in both themes.** This ends the
inversion §6 describes; that section now records what the inversion was buying
and what carries the load instead (the top hairline). Text gained room, because
the dark-mode fill got darker.

**The sign-up moved above the contact block**, and is rendered *by*
`ContactStrip` rather than by the layout. It sat between `<main>` and the footer,
which put it below contact on every page. Moving it meant either editing the
five pages that end with a `ContactStrip` — five places for one ordering rule to
drift — or stating the rule once. It is stated once.

**The sign-up card gained a photograph**, two panels from the starter range,
cropped to ~1.13 for its column. The full bench shot is 1.8 and `object-cover`
sliced four panels off mid-body.

**And the bug.** That decoration is desktop-only, and the first implementation
used `<Image fill>` in a `hidden lg:block` wrapper. Measured at a 390px
viewport, the browser requested **`w=3840`** — the largest variant of a hidden
decorative image, on the phone this site is built for. With no layout, `sizes`
cannot resolve and the browser takes the biggest candidate. It is now a CSS
background declared inside the media query, which is not fetched below `lg` at
all; verified by counting requests at both widths. §9 records the rule.

**Category counts moved before the name** in the sector panel, in a fixed-width
slot so the names still start on one vertical line.

### 2026-08-18 — Sector cards can carry their own crop

`SectorMeta` gained an optional `cardImage`, falling back to `image`. Sharing one
photograph between the hero and the card is still the default and still the
point — it is what ties the rotating hero to the cards a screen below it. But
the two framings want different things: **a hero is 1440px of establishing shot
and a card is 352px.** The agriculture frame is a wide vista whose left half is
morning mist over flat paddy — correct behind a headline, and at card size a
grey rectangle with an indistinct building in it, which reads as an
out-of-focus photograph rather than a distant one.

`agriculture-card.jpg` is a tighter crop of the same scene with the pump house
as the subject. The other two sectors still share their hero frame; the field
exists for when they stop surviving the shrink.

**Replacing artwork in place is cache-hostile**, which is worth stating because
it caused a false alarm here. `/segments/agriculture.jpg` was corrected in
place, and `cache-control: public, max-age=14400` on the optimized variants
means a browser that loaded the old one keeps it for four hours — the server was
serving the right file the whole time. New artwork under a new filename sidesteps
every cache layer at once, and is the safer habit.

### 2026-08-18 — Agriculture reframed, social profiles, menu counts dropped

**The agriculture frame was a third empty and nobody had noticed.** The generator
had drawn the photograph into only the right ~67% of a 16:9 canvas and filled
the left third with a soft grey gradient; a hard seam sat at x=911 (33.1%, 9.4×
the median column delta). An earlier repair smeared that third instead of
removing it, which was invisible under the hero's scrim and obvious on the
sector card, where the whole frame shows unscrimmed.

The fix is a crop to the real pixels — `x 917..2752`, height chosen to hold
1.792 — not a seam repair. Vertical detail across the frame went from ~0.30 in
the smeared region to 4.0–6.1 everywhere. **The lesson generalises: check a hero
frame on its card, not only in the hero.** The scrim hides a great deal.

**Social profiles.** `site.socials` became an ordered array of
`{key, label, href}`; `organizationJsonLd` reads the same array for `sameAs`, so
the footer and the structured data cannot disagree. Five brand marks were added
to `icons/ui.tsx` — filled rather than stroked, unlike every other icon in that
file, because they are other companies' logos and only read at their own
weights, and drawn without their enclosing tiles because the footer supplies the
circle.

Share tracking was stripped from every URL (`?igsh=`, `?utm_source=share_via`,
`?s=11`, `?mibextid=`) — artefacts of copying a link out of a phone app, which
should not be baked into every page of a public site. Each cleaned URL was
checked to resolve.

They sit on the **bottom bar**, not in the Company column: at `lg:grid-cols-5`
that column is ~230px and five 40px targets plus gaps need 240, so they wrapped
4-then-1 and read as a mistake.

**The products dropdown no longer shows product counts.** A menu is for getting
somewhere, and a number that changes whenever a product is saved is noise in a
list of seven links. The count is still passed in, because whether a category
has anything in it decides whether its row is a link at all.

### 2026-08-18 — Graphite band, light sign-up panel, real sector artwork

**Real hero photography for industrial and commercial** replaced the stand-ins.
Both are shot to the brief in this file — subject in the right third, left third
quiet — and both needed work before they could ship:

- The commercial frame carried a **generator watermark** on a stair tread. It is
  patched out with a feathered copy from the same tread further left.
- Both arrived as 2 MB PNGs and are committed as ~200 KB JPEGs at native
  resolution. The PNG originals are still in `public/segments/` alongside the
  older unused ones; that directory now holds ~22 MB that is baked into the
  Docker image and served by nothing.

Two contrast fixes followed, both driven by the new frames:

- **`commercial` gets `focus: "45% 50%"`.** That frame breaks the composition
  rule the default right-edge crop assumes — its subject, the lit staircase, is
  also the brightest thing in it, so a phone-width crop put white text over lit
  concrete at 3.76:1. At 45% the crop is the shadowed wall instead.
- **The horizontal gradient's mid stop went 55 → 64.** The industrial frame puts
  a bright overcast sky across the middle of the picture, exactly where the slide
  body sits at desktop width; it measured 4.37:1.

**A trap worth knowing: `next/image` caches optimized variants by URL, not by
file content.** Replacing `industrial.jpg` in place and rebuilding served the
*stand-in's* optimized output, and the contrast run reported numbers identical
to the previous artwork. `rm -rf .next/cache/images` is part of verifying an
artwork change locally. A Docker deploy builds fresh, so production is unaffected.

Follow-up to the entry below, all at the client's request, plus one bug each in
the site and in the test harness.

**The band is graphite: `#181D22` light / `#2A313A` dark.** It went through a
lighter green (`#175038`) first, which the client also rejected, so the entry
records where it landed rather than the intermediate step.

Two things are worth keeping from the attempt:

- **The band and its text tokens move together.** Lightening the band to a real
  green dropped `band-muted` to 3.67 and `band-accent` to 3.43 — both failures —
  so body, muted and accent all had to rise with it. Going neutral gave that
  contrast back.
- **`band-body` and `band-muted` kept the brighter values anyway.** They serve
  the hero over photographs as well as the flat band, and the hero is the
  binding constraint: reverting them to the pre-green greys cost the slide body
  0.4 and dropped it under 4.5 at phone width. On graphite the brighter pair
  costs nothing.

The dark-theme value is set by **separation from the page**, not by text
contrast. At the light theme's `#181D22` the dark footer sits at 1.14 against
the `#0E1113` ground and dissolves into it; `#2A313A` gives 1.44, matching what
the green band had.

**The scrim stays green** (`#0A1F16`) and is now the *only* green surface. That
is the point of the split: the photographs keep a green cast, the furniture
around them does not. Recouple it to `band` and the hero turns grey.

**`SubscribePanel` is a light card, not part of the footer.** It shared
`bg-band` with the footer and was divided from it by one hairline, which made
the end of the page a single green slab with a form embedded in it. It is now a
bordered card on `surface-raised`, on a `surface` band, above the green footer —
three distinct tones in a row — and on ordinary `surface`/`ink` tokens, so it
follows the theme like the rest of the page instead of staying dark in both.

**The products dropdown lists categories, not products.** With seven categories
it had become a wall of product names doing the catalogue's job badly, and it
grew every time a product was added. It is now one column per market listing
that market's categories with a count each. `MenuCategory` became `MenuSector`,
and the layout no longer ships product names to the browser at all.

**A real bug: the hero scrim had a hole at tablet width.** The flat floor
dropped at `sm` (640px) but the copy does not move into the left column until
`lg` (1024px), so between the two the body text spanned nearly the full width
and ran out past the horizontal gradient into the bright side of the frame.
Measured against rendered pixels at 768px, two slide bodies sat at 2.91:1 and
3.56:1 against the 4.5 they need. This predates the palette change — the
lighter `band-body` improved it slightly. The floor now lifts at `lg`, matching
the breakpoint the *layout* changes at, and is 40% below it. 390px and 1440px
render identically to before.

**And a bug in the measurement, which is why it went unseen.** The hero
contrast harness hides text and samples the photograph underneath. Two faults
made it report false passes:

1. It set `color: transparent` on **leaf elements only**. "Explore" sits in a
   `<Link>` that also holds an `<svg>`, and "1–40" in a `<dd>` that also holds a
   `<span>` — neither is a leaf, so their text stayed painted and every such run
   measured itself, reporting exactly 1.00.
2. `.link-cta` and the phone link both `transition: color` over 150ms, so the
   screenshot taken straight after hiding caught the glyphs mid-fade.

Both are fixed (hide every element; inject `transition: none !important`). Any
earlier "0 failures over artwork" figure in this log was measured with the
faulty harness and should not be trusted — the current run is 0 of 342, tightest
1.06×, and that one is trustworthy.

**Also:** `/admin` now warns when it is reached over plain HTTP on a non-local
host. `lib/auth.ts` sets `secure: true` in production, correctly — but it fails
*silently*: the browser accepts the login, discards the cookie, and the redirect
bounces straight back to the form, which reads as "my password is wrong". The
check is detection only and does not weaken the cookie.

### 2026-08-18 — Three markets above the categories, and a mailing list

Two changes, at the client's request.

**A sector level above the product categories.** The site now reads
agriculture / industrial / commercial at the top, with the five agricultural
categories (starters, solar, auto start, cable, accessories) sitting under
agriculture, a placeholder `industrial-panel` under industrial, and
`home-automation` under commercial.

The important decision is that **a sector is not a column.** `CategoryMeta`
gained `sector`, so the level exists entirely in `content/taxonomy.ts` and the
`products` table did not change. `sectorOf()` derives a product's market from
its category. The trade recorded in §8: a product cannot belong to two markets,
because a category cannot.

What moved with it:

- `content/segments.ts` — the hero rotates the three sectors, and `key` is typed
  `Sector` so the hero and the taxonomy cannot drift apart.
- `home/CategoryBrowser` → `home/SectorBrowser`. Cards are sectors; opening one
  lists its categories. The level shown here has to match the hero — a visitor
  who has just watched three markets rotate past reads the next section as those
  same three opened up, and five product categories there read as a different
  taxonomy entirely. A category with no products is listed but **not linked**,
  because the catalogue only offers filters that have products behind them.
- `ProductCatalogue` — a Market filter above Category. Picking a market narrows
  the category list to that market and clears a category (and rating) belonging
  to another; without that, `?sector=commercial&category=starter` is reachable
  by clicking two plausible things in sequence and shows nothing. The rating
  options are now derived from the products the other two filters already admit,
  for the same reason: filtered to Commercial, the full list offered HP ratings
  for a range of lighting modules that have none.
- `ProductsMenu` — columns carry their market name above the first column of
  each run, so seven headings read as three groups. The repeated element is kept
  and hidden rather than dropped, so every column heading stays on one baseline.
- `ProductForm` — the category `<select>` is grouped by market with `<optgroup>`.
  Flat, it gave no hint which market a category belonged to, and choosing wrongly
  files a product under the wrong card on the home page.
- Footer — "Markets" list added, and the grid went to `lg:grid-cols-5`. With
  three link lists after a two-column address block, four columns dropped the
  last list onto a second row under the address, reading as part of it.
- `public/segments/industrial.jpg` and `commercial.jpg` added. **Both are
  stand-ins** (copies of the solar and home-automation frames) so nothing 404s
  while the real artwork is generated. Sector cards share the hero photographs
  deliberately — one picture per market, in both places.
- `product/CategoryRow.tsx` deleted. `ProductRow` replaced it on 2026-08-17 and
  nothing had referenced it since.

**A mailing list.** New `subscribers` table, a `SubscribePanel` above the footer
on every page in the `(site)` group, and `/admin/subscribers` to read, export
and remove.

This adds the site's **first unauthenticated write path**, which is why §9 now
carries a rule about it. Three guards, in `app/(site)/actions.ts`: a honeypot
field that returns the ordinary success message so a bot gets no signal; a rate
limit of five per address per ten minutes; and one column of one type, reached
only by a value that passed `normaliseEmail`, through a parameterised query.

`lib/rate-limit.ts` is new and is **in-memory on purpose**. That is only sound
because the site deploys as one container behind the tunnel — on serverless each
instance would keep its own counter. §11 records that login should get the same
treatment for the same reason.

Duplicate sign-ups get the same message as new ones. "You are already
subscribed" would answer, for any address a stranger types, whether that person
is on the list.

Nothing sends mail. §11 records what that will require.

### 2026-08-12 — Progress marks: short, centred, left to right

The full-bleed bar became three short fixed-width marks (`w-10`, `sm:w-14`)
centred as a group, and the fill went back to travelling left to right
(`origin-left`). Measured: 3 marks of 56px spanning 626…814 of 1440 on desktop
and 40px spanning 125…265 of 390 on mobile — centred at both.

**The track had to change colour to survive the move.** At full width
`bg-band-line` was legible; as a 56px mark over a photograph it vanished, and
the control read as a single line with no hint that three slides exist. It is
`bg-band-ink/30` now (`/60` on hover) — a light tint rather than a dark one,
because the surface behind it is a picture, not the flat band.

**The hero lost 173px of height**, all from the bottom: the text block went to
`pb-14 sm:pb-16 lg:pb-20` against an unchanged `pt`, and the figures to
`pt-12 sm:pt-14`. Desktop 1037 → 864, mobile 995 → 874. Asymmetric on purpose —
the headline still needs air at the top.

Contrast re-checked afterwards, because changing hero height re-crops the
artwork behind the text: still 0 failures of 230 glyph runs, tightest 1.04×.

### 2026-08-12 — Progress bar: pause holds position, fill grows from the centre

**Pausing now freezes the bar where it stands.** It used to snap to full and
restart the slide from zero on resume, because the fill element was keyed on
`${i}-${index}-${running}` — flipping `running` tore it down and rebuilt it.
The key is the slide index alone now, and pausing only flips
`animation-play-state`, which CSS freezes mid-travel.

The timer had the same bug in JS form: a fresh `setTimeout(SLIDE_MS)` on every
resume gave the slide a full five seconds again. `remainingRef` carries the
balance — the effect cleanup subtracts however long the timer actually ran, and
a slide change resets it. That reset effect must stay **declared before** the
timer effect, or the new timer reads the old slide's remainder.

Measured: 2.0s in → 51%, paused at 53%, held 2.5s → still 53%, resumed → 53%
and climbing, slide advanced after the remainder rather than a fresh 5s.

**The fill grows from the centre outwards**, not left to right (the WAGO-style
edge fill became a Simple Energy-style centre fill on request). That is
`origin-center` on the element — the keyframes are plain `scaleX(0)` →
`scaleX(1)` and do not encode direction.

**The figures sit lower.** Padding went from `pt-12 pb-14` to `pt-20 pb-7`
(`sm:pt-24 sm:pb-9`), leaving 36px below the labels on desktop and 28px on
mobile rather than a dead band of image. Contrast re-checked after the height
change since it re-crops the artwork: still 0 of 230, tightest 1.04×.

### 2026-08-12 — Artwork runs behind the figures

The hero figures (motor range, protections, phases, supply band) used to sit in
a separately ruled band below the artwork. They now render inside `HeroRotator`
via a `footer` slot, so the photograph and its scrim continue behind them, and
the dividing rules are gone — over a picture those rules read as a wireframe
laid on top, so spacing separates the figures instead.

Two consequences that were not obvious:

- **The taller hero re-crops the artwork.** Mobile went from ~684px to ~995px,
  which drops the visible slice of a landscape frame from 32 % of its width to
  22 %. A brighter part of the solar image moved in behind the body copy and
  took six glyph runs below AA (worst 3.39 against 4.5).
- **Fixed by rebalancing that one image, not by more overlay.** The solar frame
  was a stop brighter than the other two across its whole sky; its exposure is
  now at 0.76. Adding scrim would have darkened all three to solve one image's
  problem, and the scrim had just been deliberately lightened.

Verified: 0 failures across 230 glyph runs — slides *and* all 132 figure runs —
both themes, both viewports, all three slides. **Tightest margin is 1.04×
required**, which is thin: the mobile body copy over the agriculture and solar
frames is the binding pair, and any further lightening of the scrim or
brightening of artwork will break it there first.

### 2026-08-12 — Fonts self-hosted, build no longer needs the network

A local `npm run build` failed with `Failed to fetch 'Inter' from Google Fonts`
and the same for IBM Plex Mono. The connection was up but slow — 5.7s to reach
fonts.googleapis.com — and `next/font/google` timed out.

That was worth more than a retry. `next/font/google` fetches at **build** time,
and `cicd/deploy.sh` builds inside Docker on the server, so the same slow link
would fail a deploy — after the console had already fast-forwarded the checkout,
leaving a failed deploy against a moved HEAD.

The three latin-subset woff2 files now live in `src/app/fonts/` (76 KB total:
Inter variable 47 KB, Plex Mono 400/500 at 14.4 KB each) and load through
`next/font/local`. These are the same files Google served, so runtime bytes and
rendering are unchanged — `next/font/local` still generates the metric-adjusted
fallback face that keeps CLS at zero.

Verified: build succeeds with HTTP(S)_PROXY pointed at a dead port, the page
issues no external requests, and all three faces report `loaded`.

To update a face later, download the new woff2 and replace the file — there is
no build step that will do it for you any more, which is the point.

### 2026-08-11 — Tinted ground, and horizontal product cards on the home page

**The light ground is no longer white.** `--color-surface` is `#F7FAF8`, a very
faint green cast, with `--color-surface-subtle` at `#EDF3EF`. This makes
`--color-surface-raised` (still pure `#FFFFFF`) mean something for the first
time: cards lift off the page by tone as well as by shadow, so the depth added
earlier does less work. `ProductCard` and the `/protection` cards moved to
`bg-surface-raised`.

Keep the tint this weak. Every light-mode figure in the contrast table at the
top of globals.css is quoted against the ground, and they were recomputed for
it — ink 18.0 → 17.1, body 8.6 → 8.2, muted 6.1 → 5.8, accent 5.3 → 5.1. All
still clear AA, but `muted` and `accent` have the least room, so a stronger
tint is what would break first. Re-audit if it ever changes.

**Home products are compact horizontal cards in a fixed grid.**
`ProductCard orientation="horizontal"` is a strip — fixed-width square image
plate on the left, text on the right — laid out
`sm:grid-cols-2 lg:grid-cols-3`, capped at `HOME_SLOTS` (6).

The columns are **fixed on purpose**. A category holding two products leaves
the remaining cells empty rather than stretching two cards across the full row,
which is what an auto-fit or flex layout would do. Empty cells are safe here
because the cards carry their own borders and the grid has a plain gap — the
`gap-px bg-line` trap in §9 is what makes empty cells paint grey.

The catalogue at `/products` keeps the scrolling track of tall cards. The two
layouts are doing different jobs: home is a survey of the range, the catalogue
is for browsing one category at a time.

### 2026-08-11 — Depth, category banners, and a working email link

**Two shadow tokens now exist**, which amends design rule 1. `--shadow-card` and
`--shadow-card-hover` are deliberately weak (4–9 % alpha) and belong on cards
only; sections still separate with rules and tinted bands. Dark mode overrides
them — a black shadow on a near-black surface does nothing, so the border
carries it there. Added on request: the light pages read as flat white canvas.

**Category leads are banners, not cards.** `CategoryRow lead="banner"` puts a
full-width tinted panel above the track carrying the description, the count and
the link into the filtered catalogue. As a card in the first cell it was the
same width and height as the product cards beside it, so it read as a product
with no photograph.

**`/protection` alternates section tone** (`bg-surface-subtle` / `bg-surface`)
because three consecutive light sections separated by a hairline read as one
white sheet. Its protection entries became real bordered cards with an icon
plate, and the grid dropped from `gap-10` rules to `gap-5` since each card now
carries its own border.

**`mailto:` silently fails on desktop.** This is the bug behind "the email works
on mobile but not on desktop": `mailto:` only does something when the OS has a
mail client registered, and anyone reading mail in a Gmail tab gets no
navigation and no error. There is no way to detect whether the handler fired, so
`home/CopyEmail` (client) keeps the link — correct where a client exists — and
adds a copy-to-clipboard button beside it. Verified: label goes Copy → Copied →
Copy, clipboard receives the address.

**Two wrapping fixes, both width starvation:**
- Contact strip icons moved from the value to the label. Inline with the value
  an icon eats ~24px of a third-width column, which is what split the address
  across two lines.
- The footer's brand column was `md:grid-cols-3` at 1 of 3 ≈ 160px against an
  address needing 214px, so it wrapped mid-word between 768 and 1023px only.
  Now `md:col-span-3 lg:col-span-2`.

Verified: email renders on one line at 390 / 640 / 768 / 900 / 1024 / 1280 /
1440 in both the contact strip and the footer; no sideways scroll and no JS
errors across all four routes, three widths, both themes.

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

The fix is an **edge stretch**: an 8 px sliver at the join is flipped and
resized across the whole left region, then lightly blurred. Flipping makes the
column left of the join identical to the column right of it, so continuity is
exact; stretching 8 px over ~900 px leaves no symmetry to notice.

This started as a *mirror* pad — reflecting the whole photo back — with the
blur ramped to zero at the join. That was wrong and visible: right beside the
seam sat a sharp mirrored copy of the scene, and the reflection read plainly as
a reflection. Blur ramped the wrong way is the trap; the join needs continuity,
not sharpness.

Note the boundary is not one column: `home-automation` had a 16 px flat stripe
between panel and photograph, so working from the apparent edge left a residue.
Find the first genuinely photographic column, not the first strong edge.

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

**The segment labels came off the progress bar.** It became a bare full-bleed
rule at the foot of the hero, divided into one `flex-1` button per segment.
(Superseded on 2026-08-12 — the marks are now short and centred. What survives
is that **nothing is hard-coded to three**: adding a segment adds a mark.)

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

### 2026-08-31 — Server-side fuzzy product search (pg_trgm)

Added PostgreSQL-native fuzzy search using the `pg_trgm` extension. Products
are now matched by trigram word-similarity rather than exact substring, so
typos and partial words return results ranked by a 0–1 match score.

- **`schema.sql`** — `CREATE EXTENSION IF NOT EXISTS pg_trgm` plus GIN trigram
  indexes on `name` and `tagline`.
- **`lib/db/products.ts`** — `fuzzySearchProducts()` query, weighted across
  name (1.0×), tagline (0.9×), hp_ranges (0.8×), description (0.6×), and
  features (0.5×), with an ILIKE fallback for exact substrings.
  `safeQuery` made generic so it serves both `ProductRow` and `FuzzyRow`.
- **`app/(site)/search-action.ts`** (NEW) — server action wrapping the fuzzy
  query. Rate-limited at 30 req/min per IP; fails silent (returns `[]`).
- **`HeaderSearch.tsx`** and **`ProductCatalogue.tsx`** — hybrid approach:
  instant client-side substring match as preview, server-side fuzzy results
  merged in after a 300ms debounce. Results ranked by server score;
  `HeaderSearch` shows a "% match" label next to each result.

No new runtime dependencies. `pg_trgm` ships with every standard PostgreSQL
installation including the project's own Docker image.

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
