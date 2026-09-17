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
- `/admin` — products CMS, order inbox, mailing list, enquiry inbox
- Rotating hero over photography, sector browser, catalogue with three filters
- Mailing list sign-up (home page only) and contact enquiries, both storing to
  Postgres
- **Customer accounts** (2026-09-06) — register, sign in, Continue with Google,
  password reset, `/account` with order history and an address book, and a
  `/checkout` that turns the cart into an order. ARCHITECTURE.md §7a.
- **Live integrations** — Resend sends the welcome, reset and order mails
  (domain verified 2026-09-07); Google sign-in is configured and published.
- **Payment** (2026-09-07) — Razorpay, built and tested, **waiting on KYC and
  three env vars**. Until those are set the "Pay now" button does not render
  and orders settle by phone.
- `/privacy` and `/terms` — added because Google's OAuth verification requires
  a privacy policy link, and warranted anyway now that the site collects
  personal data.
- CI/CD: push to `main` on GitHub triggers the self-hosted deploy console

**[PAYMENTS.md](PAYMENTS.md)** covers what was built and what is still open;
the click-by-click account setup for Resend, Google and Razorpay is in
**[SETUP-GUIDE.md](SETUP-GUIDE.md)**. Every email the site sends, and the ones
still missing, is tracked in **[EMAILS.md](EMAILS.md)**.

> **The project was deleted and rebuilt on 2026-09-10.** Git history was
> intact and the account work survived on disk, so the recovery was a
> `git restore` to `11e500b` plus re-applying integration edits by hand. Two
> bugs fixed on 2026-09-07 came back with the partial restore and are now §9
> constraints. Four `/media/` product images and the gitignored
> `docs/Hosting.md`, `docs/cicd.md`, `docs/f2.pdf` and `cicd/` are permanently
> lost — git cannot restore them by design. See the change log.

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

`.env.local` holds `DATABASE_URL`, `ADMIN_PASSWORD`, `AUTH_SECRET`, and
optionally the Resend, Google and Razorpay values. It is not in git and never
should be. `.env.example` is the template.

**Accounts work locally with none of the optional keys set**, which is the
point of how they are wired. With no `RESEND_API_KEY` the welcome and reset
mails are printed to the terminal running `npm run dev` — confirmation link
included, and clickable from there. With no `GOOGLE_CLIENT_ID` the "Continue
with Google" button does not render, and the login page says so in development.
With no `RAZORPAY_*` the "Pay now" button does not render. None of those
absences breaks anything.

**Setting those keys up is [SETUP-GUIDE.md](SETUP-GUIDE.md)** — click by click,
including the two traps that waste an afternoon each: a Cloudflare DNS record
left *proxied* (orange cloud) makes Resend's domain verification fail forever
with no useful error, and a redirect URI differing from Google's console by one
character fails with `redirect_uri_mismatch`.

**Next.js reads env files once, at startup.** Changing `.env.local` and
reloading the page does nothing; restart the dev server.

To load the demo catalogue:

```bash
docker exec -i vkon-pg psql -v ON_ERROR_STOP=1 -U postgres -d vkon < scripts/seed-demo.sql
```

### Running the production build locally

`npm run build && npm run start`. **`start` is not `next start`** — it runs
`scripts/start-standalone.mjs`, because `next.config.ts` sets
`output: "standalone"` for the Dockerfile and `next start` prints

```
⚠ "next start" does not work with "output: standalone" configuration.
```

It *appears* to work — pages render — so the temptation is to ignore it, and
then "it worked locally" proves nothing about the container. The script does
what the Dockerfile does at lines 33-35 instead: copy `public/` and
`.next/static` beside the standalone `server.js` (which bundles neither), point
`UPLOAD_DIR` at the repo's own `data/uploads`, and run it. Skip that copy and
the site comes up with no CSS and no images, which reads as a broken build
rather than a missing step.

### Three traps that cost real time

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

**`pg_dump -t <table> --where="…"` can silently return zero rows.** Used to
back up three product rows before deleting them (2026-09-10); the command
exited clean but wrote an empty file, and it was not caught until after the
delete. Confirm a targeted dump actually has content (`wc -l`, or grep for a
value you expect) before trusting it as your only copy — an unconditional
`pg_dump -t <table> --data-only` with no `--where` is the safer default when
the row count is small enough not to matter.

---

## 4. Decisions that look odd until you know why

**Email arrived on 2026-09-06, and only for accounts.** `lib/mail.ts` sends the
welcome, password-reset, order-placed and payment-received messages through
Resend — over plain HTTPS, because SMTP is a socket protocol and would have
meant `nodemailer`, the first new runtime dependency since `pg`. Sign-in codes
and the shipped / out-for-delivery / delivered / cancelled emails followed;
**[EMAILS.md](EMAILS.md)** is the current list and the gaps.

**The mailing list still sends nothing** (ADMIN.md §7.6). New orders and
enquiries are emailed to support@vkon.in since 2026-09-17 — EMAILS.md A and G.

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
account + checkout:  8 routes x 3 widths x 2 themes, 0 contrast, 0 h-scroll
admin orders +       2 widths x 2 themes, 0 contrast, 0 h-scroll
password checklist
privacy + terms:     2 widths x 2 themes, 0 contrast, 0 h-scroll
payment:             25 checks against FAKE secrets — no Razorpay account needed
```

**Payment is testable without a Razorpay account**, and that is worth knowing
before assuming otherwise: `verify` and `webhook` do purely local HMAC work, so
setting fake `RAZORPAY_*` values in `.env.local` and computing the signatures
yourself exercises every security path end to end. Only
`/api/payment/create` actually calls out to Razorpay. PAYMENTS.md §6.

**Three harness traps, beyond the five below.** First: the account run reports
"overflow" on 21 elements on every page, and it is the harness — they are the
closed cart drawer, parked off-screen by `justify-end` on a `fixed` parent, and
the same 21 appear on pages that predate all of it. `document.scrollWidth` is
the assertion that matters. Second: **`colorScheme` in the Playwright context
does nothing here** — `ThemeScript` reads `localStorage` and defaults to light
regardless of `prefers-color-scheme`, so a dark run must seed
`localStorage['vkon-theme']`. A whole set of "dark" screenshots came back
byte-identical to the light ones before that was spotted. Third: the DOM
auditor's colour parser understood only `rgb(1, 2, 3)`; a modern
`rgb(1 2 3 / .5)` returned `null` and threw inside alpha-compositing, killing
an entire run with no findings reported.

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

**A key in the server's `.env` does nothing unless `docker-compose.yml` lists
it.** The `app` service's `environment:` block is an allowlist, and every
integration degrades silently when its key is missing, so a forgotten name
shows up only as a feature that works on the laptop and is absent live. After
editing `.env`, `docker compose up -d app` recreates the container with the new
values. ARCHITECTURE §9.

**The server's Docker must stay out of `172.16.0.0/12`.** The machine sits on a
college network whose captive portal is `172.21.0.1`. When Docker gave vkon's
compose network `172.21.0.0/16`, traffic for the portal was routed into the
Docker bridge; the workaround used — flushing the bridge's IP — fixed the
portal but broke the containers' gateway, and vkon.in returned 530 until
2026-09-15.
`/etc/docker/daemon.json` on the server now puts new networks in `10.200.0.0/16`
and `docker0` on `10.201.0.1/24`. Three things follow:

- **`ssh ptz` depends on it.** SSH rides the host `cloudflared.service` tunnel,
  which needs the server's internet, which needs the portal. Reintroducing the
  collision can lock you out of the machine.
- **The file governs new networks only.** The other projects on the box —
  `cadio-mqtt-dashboard` on `172.19`, `nivixsa-cicd` on `172.20` — kept their old
  ranges. They don't collide with the portal today, but they are in the same
  `/12` the college uses.
- **Restarting dockerd restarts every project's containers**, not just vkon's.
  To move a network, `docker compose down` (never `-v`) *before* the restart, so
  there is no old network for Docker to restore.

SETUP-GUIDE.md §0b has the full account and the recovery checks.

**This GitHub repo is PUBLIC.** `docs/Hosting.md`, `docs/cicd.md`,
`docs/f2.pdf` (the client's business plan — pricing, salaries, a named client's
contract value), `cicd/`, `.env*` and `*.txt` are all gitignored for that
reason. Check `git add -A --dry-run` before committing; that list exists because
`f2.pdf` was once swept in by exactly that command.

---

## 7. What is outstanding

Ordered by how much it would hurt to leave.

1. **No database backup.** The Postgres volume is the only copy of the
   catalogue, the mailing list, every enquiry — and now every customer account
   and order. This got materially worse once accounts existed: losing the
   volume used to lose recreatable content, and now loses other people's
   purchase records. A nightly `pg_dump` off the machine is an hour of work.
   ADMIN.md §7.4.
2. **Nobody is *told* when an order or an enquiry arrives.** Both inboxes exist
   and both must be looked at. Now that `lib/mail.ts` exists, closing either is
   a `sendMail` call. **Do the order one before payment goes live** — a missed
   order stops being a missed sale and becomes a customer who has paid and
   heard nothing. ADMIN.md §7.7–7.8.
3. **`docs/Hosting.md`, `docs/cicd.md`, `docs/f2.pdf` and `cicd/` are missing**
   after the 2026-09-10 deletion. All four are gitignored by design — they hold
   Cloudflare tunnel UUIDs, internal hostnames and the client's business plan —
   so git cannot restore them. `cicd/` is a security control, not housekeeping.
   Recover them from the server.
4. **Company details are placeholder.** `grep -rn "TODO(vkon)" src/` — the
   founding year (`2010`, conflicts with the plan), the `280–440 V` supply
   band, and the solar/cables/accessories category copy. The address and map
   pin are real since 2026-09-17 (the Razorpay KYC address, near Sahyadri
   College, Mangaluru 575007).
5. *(Done 2026-09-17: the map pin is the works, from the plus code.)*
6. **8 DEMO products** still in the catalogue.
7. **The favicon is still the old circular badge.** A wordmark does not survive
   32px; it needs its own mark, probably just the red "o".
8. **No rate limiting on the *admin* login.** The customer sign-in is limited;
   `/admin` still is not, and it is now a copy of four lines. ADMIN.md §7.3.
9. **GST is always CGST+SGST, and delivery is not priced.** Both fine while
   payment is settled on a call; both must be settled before it is not.
   PAYMENTS.md §7.
10. **No staging environment, no audit trail, English only, no automated tests.**

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
