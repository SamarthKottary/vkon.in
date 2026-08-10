# vkon.in

Product catalogue and contact site for Vkon — electronic motor starters and
control panels for agricultural pumps.

Products are managed through an admin at **`/admin`**: name, description,
images, a video link, specification, features and protections. Saving publishes
immediately — no redeploy.

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Postgres.

Light and dark themes: the site follows the visitor's operating system setting,
and the sun/moon button in the header overrides it. The choice is remembered.

**How it is put together and why:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
— layering, design rules, the constraints that must not be broken, and a change
log. Read it before making structural changes.

---

## Running it locally

You need Postgres. Anything works — a local install, Docker, or a free Neon
database.

```bash
npm install
cp .env.example .env.local     # then fill it in, see below
npm run db:setup               # creates the products table (safe to re-run)
npm run db:seed                # optional: one demo product to look at
npm run dev                    # http://localhost:3000
```

A throwaway Postgres in Docker, if you want one:

```bash
docker run -d --name vkon-pg \
  -e POSTGRES_PASSWORD=vkondev -e POSTGRES_DB=vkon \
  -p 55433:5432 postgres:16-alpine
# DATABASE_URL=postgresql://postgres:vkondev@127.0.0.1:55433/vkon
```

### Environment

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. **On Vercel use the provider's pooled/pgbouncer string**, not the direct one. |
| `ADMIN_PASSWORD` | yes | The password you type at `/admin`. |
| `AUTH_SECRET` | yes | Signs the session cookie. 16+ chars. `openssl rand -base64 32`. Anyone who knows it can mint an admin session. |
| `POSTGRES_PASSWORD` | yes (Docker) | Password for the bundled database container. |
| `APP_PORT` | no | Host port bound on `127.0.0.1`, default 8120. |
| `SITE_URL` | no | Public origin for canonical URLs and structured data. |
| `DATABASE_SSL` | no | `require` or `disable`. Defaults to off, or whatever `?sslmode=` in the URL says. |

> Docker Compose interpolates `$` in `.env` values and will silently mangle a
> password containing one. Generate secrets with `openssl rand -hex 32`.

Scripts: `npm run dev | build | start | lint | db:setup | db:seed`.

---

## Using the admin

Go to `/admin`, enter `ADMIN_PASSWORD`, and you get a product list at
`/admin/products`.

**Adding a product.** Only the name is required; everything else is optional and
the page adapts to what you fill in.

- **Images** — upload them, or paste a URL. The first image is the one used on
  the catalogue card. Give each one alt text; it is what a screen reader and
  Google see. JPEG, PNG, WebP or AVIF, up to 8 MB. Resize large photos before
  uploading — nothing shrinks them for you. Uploads are stored on a Docker
  volume and survive every redeploy.
- **Video** — paste a YouTube or Vimeo link. Any share format works. The product
  page shows a poster with a play button and only loads the video after a click,
  so it costs a visitor nothing unless they want it.
- **Motor ratings / features** — one per line.
- **Specification** — one per line as `Label: value`, e.g. `Warranty: 6 months`.
- **Protection** — tick what applies; each one renders with its icon and a plain
  explanation on the product page.
- **Published** — untick to keep it as a draft, invisible on the site.
- **Featured** — show it on the home page.
- **Sort order** — lower numbers come first.

Changes are live the moment you save. Deleting a product also deletes its
uploaded images.

---

## Before this goes live

1. **Contact details** — `src/content/site.ts`. Phone, WhatsApp, email, address,
   hours. These also feed the structured data Google can show in search results,
   so do these first. `grep -rn "TODO(vkon)" src/` finds every placeholder.
2. **Delete the demo product** from `/admin` — it is clearly labelled, and its
   images are drawings, not photographs.
3. **Real product photography.** The largest single factor in how the site
   reads. Plain shots on a white background.
4. **About page copy** — the history and service sections are written generically
   because the real specifics are yours.
5. **Logo** — `src/components/icons/Logo.tsx` is a placeholder wordmark.

---

## Deploying

Self-hosted with Docker Compose behind a Cloudflare Tunnel, deployed by the
console. See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full step-by-step,
including DNS for `vkon.in`.

The short version, on the server:

```bash
cp .env.example .env && chmod 600 .env   # fill in the secrets
bash cicd/deploy.sh                      # build, migrate, restart
bash cicd/verify.sh                      # must print "healthy"
```

Two containers: `app` (bound to `127.0.0.1` only) and `db` (no host port at
all). Two volumes hold everything that must survive a deploy — `vkon-pgdata`
and `vkon-uploads`.

**Health:** `GET /api/health` round-trips to Postgres and returns 503 if it
cannot. Use it, not `/` — public pages deliberately fail soft, so the home page
returns 200 even with the database down.

---

## Measured

Lighthouse, mobile emulation with default throttling, against `npm run start`:

| Route | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| `/` | 96–99 | 100 | 100 | 100 |
| `/about` | 97 | 100 | 100 | 100 |
| `/products` | 99 | 100 | 100 | 100 |
| `/products/[slug]` | 99 | 100 | 100 | 100 |

CLS 0 on every page. Adding real product images will move these — keep them
optimised.

Text contrast is verified separately by walking the rendered DOM in **both
themes** and computing the real ratio for every text element: currently zero
WCAG AA failures across the site and the admin.

One run reported the product page's SEO at 92 for a missing meta description.
The tag is present in both the server HTML and the live DOM inside `<head>`
(verified independently), and it has not reproduced since — a timing artefact
of streamed metadata on a dynamic route, not a defect. Worth re-checking if you
see it again.

---

## A note on the source material

`docs/Poster.pdf` is a competitor's product sheet, used only to understand the
*category* — HP bands, protection types, the specification fields buyers expect.
None of their photography, copy or taglines appear here, and none should. The
underlying technical facts are not anyone's property; their words and pictures
are.
