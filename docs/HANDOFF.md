# Handoff — vkon.in

Written 2026-08-19 for whoever picks this up next, in a fresh session or a fresh
head. It is the orientation layer only: **[ARCHITECTURE.md](ARCHITECTURE.md)**
is the reference and **[ADMIN.md](ADMIN.md)** covers `/admin`. Read this first,
then those two, then the code.

---

## 1. What this is

A marketing and catalogue site for **Vkon Automation**, an Indian manufacturer of
electronic motor starters and control panels for agricultural pumps.

The buyer is a farmer or a rural electrical dealer, usually on a mid-range
Android phone on a weak connection, who wants three things quickly: *does this
fit my pump's HP?*, *what does it protect against?*, and *how do I reach you?*
Every performance decision in the repo comes back to that sentence.

**Stack:** Next.js 16.2.12 (App Router) · React 19 · TypeScript strict ·
Tailwind CSS v4 (CSS-first, no config file) · Postgres via `pg`.

**Runtime dependencies are deliberately `next`, `react`, `react-dom`, `pg` and
nothing else.** Adding one is a decision to record in ARCHITECTURE.md, not a
default. Several features here are shaped by that constraint — see §4.

---

## 2. Where things stand

Working and verified:

- Home, `/products`, `/products/[slug]`, `/about`, `/protection`, `/contact`
- `/admin` — products CMS, mailing list, enquiry inbox
- Rotating hero over photography, sector browser, catalogue with three filters
- Mailing list sign-up (home page only) and contact enquiries, both storing to
  Postgres
- CI/CD: push to `main` on GitHub triggers the self-hosted deploy console

The catalogue currently holds **8 DEMO products** with drawn placeholder
artwork (`scripts/seed-demo.sql`). Every name starts with `DEMO`. Delete them
from `/admin` once real products exist.

### The taxonomy, which trips people

Two levels, and only one is stored:

```
Category (code: "sector")      Agriculture · Industrial · Commercial
  └─ Sub-category (code: "category")   Motor Starters · Solar · Cables · …
       └─ Product                       one row in `products`
```

A product row stores its **sub-category** and nothing else; the category is
derived by `sectorOf()` from `content/taxonomy.ts`. That is why adding the upper
level needed no migration.

**The user-facing words and the code words differ, deliberately.** The client
renamed the labels on 2026-08-19; the query parameters `?sector=` and
`?category=` were left alone because they are in links already shared and
indexed. Expect `sector` in code to read "Category" on screen.

**A product cannot belong to two categories**, because a sub-category cannot.
Changing that is a real schema change.

---

## 3. Running it locally

```bash
npm install
docker start vkon-pg          # local Postgres, port 55433
npm run db:setup              # local only — see §6 for the server
npm run dev                   # http://localhost:3000
```

`.env.local` holds `DATABASE_URL`, `ADMIN_PASSWORD`, `AUTH_SECRET`. It is not in
git and never should be. `.env.example` is the template.

To load the demo catalogue:

```bash
docker exec -i vkon-pg psql -v ON_ERROR_STOP=1 -U postgres -d vkon < scripts/seed-demo.sql
```

### Two traps that cost real time

**`/admin` silently fails to sign in over anything but `localhost` or https.**
The session cookie is `Secure`, so a browser drops it on plain HTTP to any other
host — including the LAN IP `next start` prints beside the localhost URL. The
password is accepted, the redirect fires, and you land back on the form looking
like the password is wrong. `/admin` now detects and explains this. Use
`http://localhost:3000/admin`.

**`next/image` caches optimized variants by URL, not by file content.**
Replacing an image in place and rebuilding serves the *old* rendering. Run
`rm -rf .next/cache/images` after any artwork change, or the change appears not
to have happened. A Docker deploy builds fresh, so production is unaffected.

---

## 4. Decisions that look odd until you know why

**Nothing in this codebase sends email.** The mailing list and the enquiry inbox
both store and display. That is not an oversight — it is the dependency policy
meeting the absence of a mail provider. It has a cost, recorded in ADMIN.md
§7.6–7.7: **an enquiry sits unseen until somebody opens `/admin/enquiries`.**
The contact page's channel ordering is the mitigation.

**Product-driven routes are `force-dynamic`, never ISR.** `revalidatePath`
marks a page stale but Next still serves the stale copy to the next request, so
an admin who saved a product and immediately opened the site saw the old one.

**Fonts are committed woff2 files**, not `next/font/google`. Google Fonts is
fetched at *build* time, which made the Docker build inside `deploy.sh` fail on
a slow connection — after the deploy had already pulled the commit.

**`requireAdmin()` is the first statement of every mutating admin action.**
Server actions are independently addressable POST endpoints; page guards do not
protect them.

**`app/(site)/actions.ts` is the only unauthenticated write path**, and every
action in it carries a honeypot, a rate limit and bounded validated values.
Anything added there is reachable by anyone as a bare POST.

**The band no longer inverts between themes** (client request, 2026-08-18), so
a band's *fill* no longer separates it from the page in dark mode — its top
hairline does. Any new band needs a border.

ARCHITECTURE.md §9 is the full list. Each entry encodes a bug that has already
happened once.

---

## 5. The verification harness

There are no automated tests in the repo. Verification is a set of Playwright
scripts kept in the session scratchpad, driving system Chrome via
`node_modules/playwright-core`. **They are not committed** — rebuild them from
this section if you need them. The method matters more than the files.

Three checks, run against `npm run build && npx next start`:

| Check | What it does |
|---|---|
| DOM contrast + overflow | Walks every text node across routes × widths × themes, computes contrast from computed styles, flags horizontal overflow |
| Text over artwork | Hides text, screenshots, samples the real pixels under each glyph rect |
| Flow tests | Drives the forms and asserts against the database |

**The pixel sampler has bitten me five separate times, always the same way: it
measured something that was not the background.** If you rebuild it, build in
all five fixes or you will rediscover them:

1. **Hide every element, not just leaves.** "Explore" sits in a link that also
   holds an `<svg>`; a leaf-only pass leaves its text painted and the run
   measures itself, scoring exactly `1.00` — which looks like a catastrophic
   failure and is nothing.
2. **Disable transitions before capturing.** Several elements animate `color`
   over 150ms, so a screenshot taken straight after hiding catches them
   mid-fade.
3. **Use full-page capture with document-space rects.** Viewport capture works
   only while the measured section fits on screen; past the canvas edge
   `getImageData` returns transparent black.
4. **Hide `position: fixed` overlays.** The floating call/WhatsApp buttons
   render over the page and, in a full-page capture, land on whatever is at
   their viewport position.
5. **A ratio at or near 1.00 is almost always the harness, not the site.**
   Treat it as a bug in the measurement until proven otherwise.

The DOM auditor has a matching trap: it walks ancestors for a background
*colour*, so text over a photographic `<img>` reads as white-on-white. It must
detect covering artwork and defer those runs to the pixel sampler.

Current figures, for comparison after a change:

```
DOM contrast:        3020 runs, 7 routes x 3 widths x 2 themes, 0 findings
hero over artwork:   0 of 342, tightest 1.05x
sign-up panel:       0 of 30,  tightest 1.36x
contact page:        0 of 108, tightest 1.34x
```

**The hero's tightest margin is 1.05× and it is pinned by one slide** — the
commercial stairwell at 390px, where the body copy crosses the lit staircase.
Lightening the scrim further breaks it. Re-measure before touching those values.

---

## 6. Deployment

Push to `main` → GitHub webhook → self-hosted deploy console → `cicd/deploy.sh`
→ Docker build → `verify.sh`. The console and its config live **on the server
only** and are gitignored: if `deploy.sh` were in the repo, push access would
equal code execution on the host.

**After deploying a schema change, apply it — but not with `npm run db:setup`.**
That script is for local development only. The app runs in Docker, the host
checkout has no `node_modules`, and the script cannot import `pg`:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'pg'
```

The database has no host port either, so the migration goes through the
container. From the deploy directory:

```bash
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U vkon -d vkon < src/lib/db/schema.sql
```

Every statement in `schema.sql` is `CREATE ... IF NOT EXISTS` and nothing drops
or rewrites data, so it is safe to re-run. The same route applies to
`scripts/seed-demo.sql`.

A forgotten migration is **quiet, not loud**: `subscribers` and `enquiries` both
fail soft, so the forms say "unavailable, please call" and the admin lists come
back empty rather than erroring. Check after deploying a schema change.

**This GitHub repo is PUBLIC.** `docs/Hosting.md`, `docs/cicd.md`,
`docs/f2.pdf` (the client's business plan — pricing, salaries, a named client's
contract value), `cicd/`, `.env*` and `*.txt` are all gitignored for that
reason. Check `git add -A --dry-run` before committing; that list exists because
`f2.pdf` was once swept in by exactly that command.

---

## 7. What is outstanding

Ordered by how much it would hurt to leave.

1. **No database backup.** The Postgres volume is the only copy of the
   catalogue, the mailing list and every enquiry. A nightly `pg_dump` off the
   machine is an hour of work. ADMIN.md §7.4.
2. **Nobody is told when an enquiry arrives.** ADMIN.md §7.7.
3. **Company details are placeholder.** `grep -rn "TODO(vkon)" src/` — the
   address, the founding year (`2010`, conflicts with the plan), the `280–440 V`
   supply band, and the solar/cables/accessories category copy.
4. **The map pin is a town, not the works**, and follows the address above.
5. **8 DEMO products** still in the catalogue.
6. **The favicon is still the old circular badge.** A wordmark does not survive
   32px; it needs its own mark, probably just the red "o".
7. **No login rate limiting**, though `lib/rate-limit.ts` now exists and makes
   it a four-line change. ADMIN.md §7.3.
8. **No staging environment, no audit trail, English only, no automated tests.**

---

## 8. Working with this client

- **Do not commit or push unless asked.** Work is left in the working tree; the
  client batches commits himself.
- Feedback arrives as several small changes at once, often revisiting something
  settled a day earlier. Expect to re-tune contrast after any colour or artwork
  change, and re-measure rather than assume.
- The band colour has been changed four times (near-black → deep green → mid
  green → graphite). Palette changes cascade into the hero, because `band-body`
  and `band-muted` serve both the flat bands and the text over photographs.
