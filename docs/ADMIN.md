# The admin — how it works, and the rules for extending it

Companion to [ARCHITECTURE.md](ARCHITECTURE.md). That file describes the whole
site; this one is only the admin at `/admin`, written so that picking the work
up months from now does not mean re-deriving the decisions.

Everything in §1–§5 describes what is in the code today. §6 is a recipe. §7 is
opinion — decisions not yet made, with a recommendation for each.

---

## 1. What it does today

| Route | Purpose |
|---|---|
| `/admin` | Password form. Redirects to the product list once signed in. |
| `/admin/products` | Every product, published or not, with edit and delete. |
| `/admin/products/new` | Create. |
| `/admin/products/[id]` | Edit. |

One operator, one password, one thing to manage: **products**. Nothing else on
the site is editable without a code change — not the hero copy, not the
figures, not the category list, not the contact details.

Every admin route is `force-dynamic`. A cached admin page is a stale admin page.

---

## 2. Security model

The whole of it, in four points:

**One password, no user table.** `ADMIN_PASSWORD` in the server's `.env`,
compared with `timingSafeEqual` over SHA-256 digests so neither timing nor
length leaks. `lib/auth.ts`.

**The session is an HMAC-signed cookie**, `expiry.nonce.HMAC(expiry.nonce,
AUTH_SECRET)` — httpOnly, sameSite=lax, secure in production, 12 hours. There
is no session store; the signature is the proof.

**Missing configuration fails closed.** No `ADMIN_PASSWORD`, or an
`AUTH_SECRET` under 16 characters, and every login fails. It never degrades to
"allow everyone".

**`requireAdmin()` is the first statement of every mutating action.** This is
the actual boundary, not the page guards. Server actions are independently
addressable POST endpoints — a layout that checks auth before rendering does
nothing to protect them. `saveProductAction`, `deleteProductAction` and
`uploadImageAction` each call it first. `logoutAction` deliberately does not:
clearing your own cookie is not privileged.

> If you add an action that writes anything, `await requireAdmin()` goes on the
> first line. Not after parsing, not after a guard clause. First.

---

## 3. How a save actually flows

```
ProductForm (client)  ──useActionState──▶  saveProductAction
                                              │  requireAdmin()
                                              │  buildInput()   parse + validate
                                              │  slugExists()   collision check
                                              ▼
                                        createProduct / updateProduct
                                              │
                                        products table (one row)
                                              │
                            /products and / read it on the next request
```

**All input is re-validated server-side**, including `<select>` values and
hidden fields. The client form is a convenience, never a control:

| Field | Rule |
|---|---|
| `name` | Required. |
| `slug` | Re-slugified from the submitted value (or the name), max 80 chars, checked for collision against other rows. |
| `category` | Must be in `CATEGORY_KEYS`; anything else silently becomes `starter`. |
| `protections` | Filtered to known keys; unknown ones are dropped. |
| `videoUrl` | Must parse as YouTube or Vimeo, else rejected with a field error. |
| `sortOrder` | `Number.isFinite` or 0. |
| lists | `parseLines` — one per line, blanks dropped. |
| `spec` | `parseSpec` — `Label: value` per line, or `Label \| value`. |

**Uploads** are validated in `lib/storage.ts`: 8 MB limit, and only
`image/jpeg`, `image/png`, `image/webp`, `image/avif`. The `accept` attribute on
the input is a hint to the file picker, not a control. Files are written to
`UPLOAD_DIR` (default `data/uploads`), named from a SHA-256 of their contents
plus a random suffix, and served by `/media/[...path]`.

Each image stores its `pathname`, which is what lets `deleteProductAction`
remove the files as well as the row instead of orphaning them on disk.

---

## 4. Rules that must hold

Each of these encodes a bug that has already happened once, here or in
ARCHITECTURE §9.

**`requireAdmin()` first, in every mutating action.** §2 above.

**Product-facing routes stay `force-dynamic`.** ISR was tried and rejected:
`revalidatePath` marks a page stale but Next still serves the stale copy to the
*next* request while regenerating, so an admin who saved a product and
immediately opened the site saw the old version — which defeats the entire
point of a CMS. Reading Postgres per request costs one indexed query.

**Uploads never go in `public/`.** That directory is baked into the Docker
image at build time; anything written there at runtime vanishes on the next
deploy. `UPLOAD_DIR` points at a mounted volume.

**Fixed vocabularies live in code, not the database.** Categories and protection
keys are tied to icons and copy, so adding one is a code change either way.
`content/taxonomy.ts` is the source. Unknown keys are filtered at read time, so
removing one degrades instead of breaking a page.

**Admin content can break public layouts.** The catalogue and home grids assume
short values. A very long product name, or a figure like `1–40 HP three phase`,
will overflow a card at 390px. When adding a field, decide its maximum length
and say so on the form.

**Never commit in the deploy directory** (`~/project2/vkon.in` on the server).
The console treats the checked-out SHA as "what is deployed", so committing
there makes it report "up to date" while the container still runs the old
build.

---

## 5. Operating it

**Change the admin password.** Edit `ADMIN_PASSWORD` in the server's `.env`,
then use **Force rebuild** in the deploy console — *not* Pull & Deploy. There is
no new commit, so a pull reports "up to date" and does nothing; the container
has to be recreated to read the new value. Existing sessions survive, because
the cookie is signed with `AUTH_SECRET`, not the password. Change `AUTH_SECRET`
too if you want to sign everyone out.

**`POSTGRES_PASSWORD` is not the same.** Postgres only applies it when it
initialises an empty data directory. Changing it later changes what the app
sends but not what the database expects, and every query fails. See
DEPLOYMENT.md → Troubleshooting for the `ALTER USER` recipe.

---

## 6. Recipe: adding a new editable field

Worked example — adding a `warranty` string to products. Seven files, in order:

1. **`src/lib/db/schema.sql`** — add the column. The file is applied
   idempotently, so use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
2. **`src/lib/types.ts`** — add it to `Product`. `ProductInput` is
   `Omit<Product, "id" | "createdAt" | "updatedAt">`, so it follows for free.
3. **`src/lib/db/products.ts`** — three places: the `ProductRow` type,
   `mapProductRow` (the single snake_case → camelCase bridge), and
   `writeParams` plus the column lists in `createProduct` / `updateProduct`.
4. **`src/app/admin/products/ProductForm.tsx`** — add the input, `name` matching
   what you will read from `FormData`.
5. **`src/app/admin/actions.ts`** — parse and validate it in `buildInput`.
   Anything with a constrained set of values gets checked against that set here,
   not only in the form.
6. **Render it** wherever it belongs on the public side.
7. **Run the migration on the server**: the deploy script applies `schema.sql`,
   so a normal deploy picks it up — but confirm, because an `ADD COLUMN` that
   silently fails leaves the app querying a column that does not exist.

Then check the three things that bite:

- Does an empty value render sensibly? Most fields will be blank on every
  existing row the moment you ship.
- Does a long value break the layout at 390px?
- Does it need to appear in `productJsonLd` in `lib/seo.ts`?

---

## 7. Open decisions, with recommendations

Nothing here is built. Each is written so the reasoning survives.

### 7.1 Make the hero figures editable — *recommended*

The four figures under the hero (`1–40 HP`, `12`, `3 phase`, `280–440 V`) are
hardcoded in `components/home/Hero.tsx`. One of them, the 280–440 V supply band,
is still **unverified** — it came off a competitor's poster during the first
build. Making these editable is what lets that be corrected without a deploy.

**Model each figure as two fields: `value` and an optional `unit`.** Not one
combined string, and not an automatic split.

The value is set large in near-white; the unit small and softer. That difference
is doing real work — the number is the scannable thing, the unit is a qualifier
— and it is the same idiom as the HP ranges on product cards and the spec
tables. Setting `1–40 HP` uniformly makes it one undifferentiated string.

An automatic split (on the last space, say) looks clever and breaks immediately:
`12` has no unit at all, and any value containing a space breaks it.

Two refinements worth taking at the same time:

- **Drop the colour difference, keep the size difference.** Between `#FFFFFF`
  and `#C3C9CF` at 16px the colour shift is barely visible and adds a second
  variable for nothing; the size step does the work. Fewer variables is a
  simpler mental model for whoever edits it.
- **Guard the length.** Four figures share one row. Cap the value and warn on
  the field, or a long entry will break the hero at 390px.

Storage: a `site_figures` table is overkill for four rows that are really page
content. A single-row `settings` table with a JSONB column, or a `site_content`
key/value table, is the lighter fit — but note that anything editable also has
to be *validated*, and there is currently no validation path for non-product
content.

### 7.2 More than one admin — *recommended approach: Cloudflare Access*

There is one password today. Three ways to add a second person:

| Approach | Cost | What it gives |
|---|---|---|
| **Cloudflare Access in front of `/admin`** | ~20 min, no code | Per-person identity, MFA, instant revocation, an audit log. Free to 50 users, and the client's Cloudflare account already exists. |
| Several passwords in `.env` | ~30 min | Two people can log in. No idea which one did anything. |
| Real user table with hashed passwords | a day+ | Proper accounts — and a login system to keep secure forever. |

The first is the recommendation. It gives genuine per-person accounts without
writing a line of auth code, which for a two-person operation is the right
trade. The existing password stays as a second factor behind it.

### 7.3 Login rate limiting — *known gap*

Not implemented. In-memory counters are per-instance and near useless once
there is more than one; doing it properly needs a shared store. With a long
password this is an accepted risk. Cloudflare Access (7.2) removes the exposure
entirely, which is a better use of the same effort.

### 7.4 Database backups — *known gap, and the most serious one*

Nothing backs up `vkon-pgdata`. Every product, every description, every uploaded
image reference lives in one Docker volume with no copy. A nightly `pg_dump`
plus a copy of `UPLOAD_DIR` is an hour of work and is worth doing before the
catalogue has real content in it, not after.

### 7.5 An audit trail — *not recommended yet*

Tempting, pointless with one operator. Revisit if 7.2 lands and there are
several people, at which point Cloudflare Access already logs who reached the
admin and the only thing missing is what they changed.

---

## Change log

**2026-08-12** — Created. Describes the admin as built, and records the open
decisions discussed while building the public site.
