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
      layout.tsx            Header, Footer, SubscribePanel, MobileActionBar, JSON-LD
      actions.ts            PUBLIC server actions — the mailing-list sign-up
      page.tsx              home
      about/page.tsx
      products/page.tsx     catalogue
      products/[slug]/      detail
    admin/
      layout.tsx            admin chrome, reads auth state
      page.tsx              login
      LoginForm.tsx
      actions.ts            ALL admin server actions — the security boundary
      products/             list, ProductForm, new/, [id]/
      subscribers/          mailing list: read, export, remove
    not-found.tsx           renders its own chrome (outside the (site) group)
    globals.css             design tokens + the contrast table
    sitemap.ts robots.ts opengraph-image.tsx icon.svg

  components/
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
    db/          client.ts, products.ts, subscribers.ts, schema.sql
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
| `home/HeroRotator` | Slide timer, pause control, reduced-motion opt-out |
| `home/SectorBrowser` | Open card, measured paging arrows |
| `home/RecentlyViewed` | Reads localStorage via `useSyncExternalStore` |
| `product/ProductCatalogue` | `useSearchParams` filter state |
| `product/ProductRow` | Measured paging arrows over a scroll track |
| `product/ProductMedia` | Selected media, deferred video embed |
| `product/RecordView` | Writes the viewed slug to localStorage |
| `home/CopyEmail` | Clipboard, with a mailto fallback |
| `admin/LoginForm` | `useActionState` |
| `admin/products/ProductForm` + `DeleteProductButton` | Form state, uploads, confirm step |
| `admin/subscribers/SubscriberTools` + `DeleteSubscriberButton` | Clipboard, CSV, confirm step |

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

**Nothing in this codebase sends email.** The site collects addresses and
exports them. Wiring up a sender brings obligations that are not met today —
see §11.

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

**`app/(site)/actions.ts` is the one unauthenticated write path, and it stays
that way.** Anything added there is reachable by anyone on the internet as a
bare POST. The sign-up that lives there is guarded by a honeypot, a rate limit
and the fact that the only visitor-supplied value reaching Postgres is an email
that passed `normaliseEmail`. A new public action must justify itself against
all three, or belong in the admin file instead.

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
Measure with the harness in the change log before changing it — and note the
binding case is the commercial slide, which is currently stand-in artwork.

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
