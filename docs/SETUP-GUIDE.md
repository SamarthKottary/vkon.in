# Setup guide — Resend, Google sign-in, Razorpay

Written 2026-09-07, **and kept up to date as each piece is done** — §0a is the
running status, so read that first and jump to whichever section is not yet
green.

Everything here is optional in the sense that the site runs without it, but
each thing you skip leaves a feature switched off, and §0 says exactly which.

Every value you collect goes into one of two files:

| File | Where | Used by |
|---|---|---|
| `.env.local` | your laptop, in the project folder | `npm run dev` |
| `.env` | the server, next to `docker-compose.yml` | the live site |

**Neither file is ever committed.** They are gitignored, and this repo is
public. If you paste a secret into a chat, an email or a screenshot, roll it
in the relevant dashboard — that is a two-minute job and there is no other fix.

---

## 0. What you get for each one

| Set up | Switches on | Skip it and… |
|---|---|---|
| **Resend** (§2) | Welcome email, password-reset link, order confirmation | Accounts still work, but nobody can reset a forgotten password. **Do this one.** |
| **Google** (§3) | The "Continue with Google" button | The button is hidden; email + password still works |
| **Razorpay** (§4) | Online payment | Orders are placed and settled on a phone call |

> **Why you cannot see "Continue with Google" right now:** it is hidden until
> `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. That is deliberate —
> a button that leads to a crash because a key is missing is worse than no
> button — and it is what §3 turns on. In development the login page prints a
> note saying so; that note never appears on the live site.

---

## 0a. Where things stand — 10 September 2026

| | Status | What is left |
|---|---|---|
| **Resend** (§2) | ✅ **Working** | Confirm `MAIL_FROM` is off the test sender (§2.4); add both values to the **server** `.env` (§2.5) |
| **Google sign-in** (§3) | 🟡 **Working locally** | Branding verification failed **because the site was down** — re-request once it is back (§3.6); add both values to the server `.env` |
| **Razorpay** (§4) | ⬜ **Code done, account not started** | Sign up as Individual and start KYC — the long pole, 1–3 days (§4.1–4.2) |
| **The server** | 🔴 **Intermittent** | `vkon.in` was returning HTTP 530 (tunnel cannot reach origin) and SSH is unreliable. See §0b. |

### Done so far

- **Resend** — account created, API key in `.env.local`, `vkon.in` verified.
  All three DNS records confirmed resolving publicly.
- **Google** — project, branding (name, logo, home page, authorised domain,
  developer contact), Audience set to External with a test user, the three
  basic scopes, OAuth client created, Client ID and secret in `.env.local`,
  sign-in **tested and working locally**, and the app **published**.
- **`/privacy` and `/terms` built** and linked in the site footer — Google's
  verification requires a privacy policy link, and the pages are warranted
  anyway now that the site collects names, addresses and phone numbers.
- **Razorpay integration written and tested** — 25 checks against fake secrets,
  since the signature verification needs no live account. Only the account
  itself is missing. [PAYMENTS.md §6](PAYMENTS.md).

### Do these next, in this order

1. **Get the server back up** — §0b. Most of the rest is blocked on it.
2. **Razorpay signup as Individual** — §4.1–4.2. Do this *first among the
   remaining tasks* even with the server down, because KYC takes 1–3 working
   days and nothing else you do shortens that wait.
3. **Re-request Google branding verification** — §3.6, once the site loads.
4. **Put every key on the server** and rebuild — §5. A correct `.env.local`
   does nothing for the live site.
5. **When KYC clears** — paste the three Razorpay values in, run the test-mode
   checks in [PAYMENTS.md §6](PAYMENTS.md), then one real ₹1 order.

---

## 0b. The server — check this first

`https://vkon.in` was returning **HTTP 530**, a Cloudflare Tunnel error meaning
Cloudflare cannot reach the origin. That takes the whole site down for every
visitor, not just for Google's crawler — and it is what failed the branding
verification in §3.6.

SSH is also unreliable (`ssh ptz` fails with `websocket: bad handshake`), and it
goes through the same Cloudflare Access path — so when both are down at once,
the machine itself is the likely cause rather than one container.

Diagnose by a route that does not depend on Cloudflare — a VPS provider's web
console, or physical/LAN access. Then:

```bash
docker ps                                     # containers running at all?
cd ~/project2/vkon.in && docker compose ps
docker compose logs --tail=50 cloudflared     # the tunnel connector
docker compose logs --tail=50 app
docker compose up -d                          # after a reboot, usually this
```

Confirm the app answers locally before blaming the tunnel:

```bash
curl -s localhost:8120/api/health
```

> **The server also holds the only copies of `docs/Hosting.md`,
> `docs/cicd.md`, `docs/f2.pdf` and the `cicd/` directory**, which were lost in
> the 2026-09-10 deletion and are gitignored by design. Copy them back down
> while you are in there.

---

## 1. Before you start

Open a terminal in the project folder and check the file exists:

```bash
cd ~/Projects/vkon.in_webpage
cat .env.local
```

You should see three lines (`DATABASE_URL`, `ADMIN_PASSWORD`, `AUTH_SECRET`).
You will be **adding** lines to this file, never replacing it.

Open it in an editor:

```bash
nano .env.local        # or: code .env.local
```

Two rules for this file:

- **No spaces around the `=`.** `KEY=value`, never `KEY = value`.
- **No quotes**, unless the value itself contains a space. `MAIL_FROM` is the
  one value here that does.

**After any change to `.env.local` you must restart the dev server** — stop it
with `Ctrl-C` and run `npm run dev` again. Next.js reads env files once, at
startup. This catches everyone at least once: you paste a key, reload the page,
nothing changes, and you assume the key is wrong.

---

## 2. Resend — sending email

> ✅ **Done on your laptop** — account created, key in `.env.local`, `vkon.in`
> verified, all three DNS records confirmed resolving. **Two things remain:**
> check `MAIL_FROM` is off the test sender (§2.4), and put both values on the
> server (§2.5).

**Time: about 15 minutes, plus up to an hour of waiting for DNS.**

### 2.1 Create the account

1. Go to **https://resend.com** and click **Sign up**.
2. Sign up with the business email (the one you want to manage this from, not a
   personal address — whoever holds it controls password resets for the site).
3. Confirm the address from the email they send.

### 2.2 Get an API key

1. In the left sidebar, click **API Keys**.
2. Click **Create API Key**.
3. Fill it in:
   - **Name:** `vkon-production` (a name is just for you; it makes the key
     identifiable later)
   - **Permission:** **Sending access** — *not* Full access. This key only
     needs to send. If it leaks, "sending access" means somebody can send mail
     as you, which is bad; "full access" means they can also read your logs and
     create more keys, which is worse.
   - **Domain:** leave as **All domains** for now.
4. Click **Add**.
5. **Copy the key immediately.** It starts `re_` and is shown exactly once. If
   you lose it, delete it and make another — there is no way to see it again.

Add it to `.env.local`:

```bash
RESEND_API_KEY=re_paste_your_key_here
```

### 2.3 Test it before doing the DNS work

Resend gives every account a shared sender, `onboarding@resend.dev`, that works
with no setup **but can only deliver to the email address you signed up with**.
That makes it perfect for proving the key works and useless for real customers.

Add this line temporarily:

```bash
MAIL_FROM=Vkon Automation <onboarding@resend.dev>
```

Restart the dev server, then register an account **using your own signup email
address** at http://localhost:3000/account/login. Check your inbox. If the
welcome email arrives, the key is correct and you can move on.

If nothing arrives, look at the terminal running `npm run dev`:

- `[mail] not configured` → the key is not being read. Check for a typo in the
  variable name and that you restarted the server.
- `[mail] 401` → the key is wrong. Make a new one.
- `[mail] 403` → you are sending to an address that is not your signup address
  while using `onboarding@resend.dev`. Expected; continue to 2.4.

### 2.4 Verify vkon.in, so you can mail real customers

1. Sidebar → **Domains** → **Add Domain**.
2. Enter `vkon.in`. Choose the region closest to India (**ap-south-1 / Mumbai**
   if offered).
3. Resend shows **three DNS records**. They look roughly like this — **use the
   values from your own screen, not these**:

   | Type | Name | Value |
   |---|---|---|
   | MX | `send` | `feedback-smtp.ap-south-1.amazonses.com` (priority 10) |
   | TXT | `send` | `v=spf1 include:amazonses.com ~all` |
   | TXT | `resend._domainkey` | `p=MIGfMA0GCSq…` (a long key) |

4. Add each one in **Cloudflare** (the domain lives there):
   - Log in to Cloudflare → select **vkon.in** → **DNS** → **Records** →
     **Add record**.
   - Copy the Type, Name and Value across **exactly**.
   - **Set Proxy status to "DNS only" (grey cloud), not "Proxied" (orange).**
     A proxied record is rewritten by Cloudflare and the verification will
     never pass. This is the single most common reason domain verification
     fails.
   - For the DKIM record, the value is very long — paste it in one piece, with
     no line breaks and no trailing space.
5. Back in Resend, click **Verify DNS Records**. It usually takes 5–30 minutes.
   Click it again if it is still pending; nothing is wrong.

Once it says **Verified**, change `MAIL_FROM` to a real address:

```bash
MAIL_FROM=Vkon Automation <no-reply@vkon.in>
```

You do not need to create a mailbox for `no-reply@vkon.in` — nothing receives
mail there.

> **If you would rather customers could reply**, use an address you actually
> read, e.g. `MAIL_FROM=Vkon Automation <sales@vkon.in>`. Worth considering:
> people do reply to order confirmations, and a reply to `no-reply@` vanishes.

### 2.5 Put it on the server

SSH in, edit the server's `.env`, and add the same two lines:

```bash
ssh ptz
cd ~/project2/vkon.in
nano .env
```

```bash
RESEND_API_KEY=re_paste_your_key_here
MAIL_FROM=Vkon Automation <no-reply@vkon.in>
```

Then rebuild — **editing `.env` alone does nothing to a running container**:

```bash
docker compose build app && docker compose up -d app
```

Check it came up:

```bash
docker compose logs --tail=30 app
curl -s localhost:8120/api/health
```

---

## 3. Google — "Continue with Google"

> 🟡 **Working locally.** Project, branding, Audience (External + test user),
> the three scopes, OAuth client, and the app is **published**. Sign-in tested
> and working on `localhost`. **Two things remain:** branding verification
> (§3.6), and the two values are not on the server yet.

**Time: about 20 minutes.**

### 3.1 Create a project

1. Go to **https://console.cloud.google.com**.
2. Top bar → the project dropdown → **New Project**.
3. **Name:** `Vkon Automation`. Leave Organisation as is. **Create**.
4. Make sure the new project is selected in that dropdown before continuing —
   everything below applies to the *selected* project, and doing it in the
   wrong one is easy and confusing.

### 3.2 Configure the consent screen

This is what a customer sees when they press the button.

1. Left menu → **APIs & Services** → **OAuth consent screen**.
2. **User Type: External.** (Internal is only for Google Workspace
   organisations.) **Create**.
3. Fill in:
   - **App name:** `Vkon Automation` — this is shown to the user, so make it
     the name they will recognise.
   - **User support email:** your business email.
   - **App logo:** optional. Uploading one triggers a Google review that can
     take days; skip it for now.
   - **Application home page:** `https://vkon.in`
   - **Authorised domains:** `vkon.in`
   - **Developer contact information:** your email.
4. **Save and Continue.**
5. **Scopes** → **Add or Remove Scopes** → tick exactly three:
   `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid`.
   **Update** → **Save and Continue.**

   > Do not add anything else. Extra scopes push the app into Google's
   > verification review, which takes weeks, for data this site does not use.
6. **Test users** → **Add Users** → add your own Gmail address. **Save and
   Continue.**

### 3.3 Create the credentials

1. Left menu → **Credentials** → **Create Credentials** → **OAuth client ID**.
2. **Application type: Web application.**
3. **Name:** `vkon.in web`.
4. **Authorised JavaScript origins** — click **Add URI** twice:
   - `https://vkon.in`
   - `http://localhost:3000`
5. **Authorised redirect URIs** — click **Add URI** twice and enter these
   **exactly**, including `https` vs `http` and the `/api/auth/...` path:
   - `https://vkon.in/api/auth/google/callback`
   - `http://localhost:3000/api/auth/google/callback`

   > **This is where it goes wrong.** A single character out — a trailing
   > slash, `http` instead of `https`, `www.` — and sign-in fails with
   > `redirect_uri_mismatch`. The good news: Google's error page prints the URI
   > it received, so when it fails, read that and make the console match it
   > character for character.
6. **Create.** A dialog shows your **Client ID** and **Client secret**. Copy
   both. (You can reopen this later; unlike the Resend key, it is not
   one-time.)

### 3.4 Wire it up

In `.env.local`:

```bash
GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

> `GOOGLE_REDIRECT_URI` is **only** needed locally. Without it the site builds
> the callback URL from `SITE_URL`, which points at `https://vkon.in` — so a
> local sign-in would bounce you to the live site. On the server, leave it blank.

Restart the dev server. The button appears on
http://localhost:3000/account/login, and the development note disappears.

Test it: press **Continue with Google**, pick your account, and you should land
back on `/account` signed in.

On the server, add to `.env` (**no** `GOOGLE_REDIRECT_URI`):

```bash
GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your_secret_here
```

and rebuild as in §2.5.

### 3.5 Publish the app — ✅ done

While the consent screen is in **Testing**, only the test users you listed can
sign in — everyone else gets "access blocked". Publishing is what makes the
button usable by real customers.

**Audience** tab → **Publish App** → confirm.

With only the three basic scopes there is no *scope* verification review;
publishing is immediate. There is a separate, lighter **branding** check — §3.6.

### 3.6 Branding verification — ⬜ blocked on the server

After publishing, the **Verification centre** tab shows two statuses:

- **Data access status** — "Verification is not required since your app is not
  requesting any sensitive or restricted scopes." ✅ Expected; nothing to do.
- **Branding status** — ⚠️ not yet verified.

This is Google confirming you own the domain, so it can show your app name and
logo on the consent screen rather than a plainer version. It does **not** block
sign-in.

**The first attempt failed, and every finding was one symptom:** the site was
down. Google reported the homepage and privacy policy as "unresponsive", the
privacy page as having "insufficient content", the homepage as "behind a login
page" and as not explaining the app's purpose. A crawler hitting a Cloudflare
530 error page reports exactly that. None of it was a content problem.

**What to do, in order:**

1. Fix the server — §0b. Confirm `https://vkon.in` and `https://vkon.in/privacy`
   both load in a browser.
2. On the **Branding** page, make sure both link fields are filled in:
   - Application privacy policy link: `https://vkon.in/privacy`
   - Application Terms of Service link: `https://vkon.in/terms`

   Both pages exist and are linked from the site footer. They were built
   precisely because this check requires them.
3. **Verification centre** → **I have fixed the issues** → **Request
   reverification for your branding**.

One finding may be genuine rather than a symptom, and is worth checking once
the site is up: *"The app name 'Vkon Automation' does not match the app name on
your homepage."* The site's visible wordmark renders as **Vkon** with
**AUTOMATION** beneath it, which a crawler may not read as the single string
"Vkon Automation". If reverification fails again on that point alone, that is
the one to look at.

### 3.7 If something goes wrong

| Symptom | Cause |
|---|---|
| `redirect_uri_mismatch` | §3.3 step 5. Read the URI in Google's error and match the console to it exactly. |
| "Access blocked: app not verified" | Still in Testing and you are not a test user. §3.5. |
| Button not showing | Env vars not set, or the server was not restarted. |
| Back on the sign-in page with `?error=google` | Wrong client secret. Check the server terminal for `[google] token exchange 401`. |

---

## 4. Razorpay — taking payment

> ⬜ **Account not started. The code is finished.** The integration was built
> and tested on 2026-09-07 against fake secrets — 25 checks, all passing (see
> [PAYMENTS.md §6](PAYMENTS.md)). The only missing piece is a real account.
>
> **Start §4.1–4.2 now, even with the server down** — KYC takes 1–3 working
> days and nothing else you do shortens that wait.

> **Read this first.** The *code* for payment is **not written yet** — see
> [PAYMENTS.md](PAYMENTS.md) for what it involves. Setting the account up now
> is still the right move, because **KYC approval takes 1–3 working days** and
> that is the part you cannot rush. Do §4.1–4.2 now, and the keys will be
> waiting when the integration is built.

### 4.1 Which entity you are signing up as

**Decided 2026-09-07: an individual / freelancer account for now**, switching
to a company account once Vkon Automation is registered. Read §4.8 before you
start — the switch later is a *new account*, not an upgrade, and that has
consequences worth knowing up front.

Documents for an **individual / freelancer** account (lighter than a company):

- **PAN card** — your own
- **Aadhaar** — for identity and address
- **Bank proof** — a cancelled cheque or bank statement header for an account
  **in your own name**, showing account number and IFSC
- **GST certificate** — only if you have one. Not required to open the account
  as an individual; see §4.6, because whether you have one changes what the
  website is allowed to charge.

For reference, a **company** account (what you'll need later) additionally
wants the company PAN, the GST certificate, business address proof, and the
director's ID.

> **The single most common rejection**: the name on the PAN and the name on the
> bank account do not match. Since you are signing up as an individual, both
> should be your own name — make sure the bank account you give is genuinely in
> your name and not a business or joint account with a different holder.

### 4.2 Create the account

1. Go to **https://razorpay.com** → **Sign Up**.
2. Use the business email and the business phone number.
3. **Business type:** pick **Individual** (Razorpay may label it
   "Individual / Freelancer"). Pick honestly — it determines which documents
   they ask for, and claiming a company you have not registered will fail KYC
   against your PAN.
4. **Business category:** *Ecommerce* → *Electronics / Industrial Equipment*.
5. Upload the documents from §4.1.
6. Enter the settlement bank account. **Money from the website lands here**, so
   check the account number and IFSC twice.
7. Submit and wait. You will get an email when it is approved.

While waiting, everything below works in **Test mode**.

### 4.3 Get the test keys

1. Log in to the Razorpay dashboard.
2. Top right, make sure the toggle says **Test Mode**.
3. **Settings** → **API Keys** → **Generate Test Key**.
4. You get a **Key ID** (`rzp_test_…`) and a **Key Secret**. **The secret is
   shown once** — copy it now.

```bash
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_test_secret
```

> **Key ID vs Key Secret.** The **ID** is public and is meant to go to the
> browser — that is normal and not a leak. The **secret** never leaves the
> server. Do not swap them.

### 4.4 Set up the webhook

A webhook is Razorpay's servers telling your server "this payment succeeded",
independently of the customer's browser. **It is not optional**: on rural mobile
data, a customer's phone dropping the connection during a UPI payment is
routine, and without the webhook their money would move while the order stayed
marked unpaid.

1. **Settings** → **Webhooks** → **Add New Webhook**.
2. **Webhook URL:** `https://vkon.in/api/payment/webhook`
3. **Secret:** make one up — a long random string — and save it somewhere.
   Generate one with:
   ```bash
   openssl rand -hex 32
   ```
   This is **not** the same as the API secret.
4. **Active Events:** tick `payment.captured` and `payment.failed`.
5. **Create Webhook.**

```bash
RAZORPAY_WEBHOOK_SECRET=the_random_string_you_just_made
```

> The webhook URL must be publicly reachable, so it only works against the live
> site, not `localhost`. That is fine — the browser path is what you test
> locally, and the webhook is tested on the server by replaying it from
> Razorpay's dashboard.

### 4.5 Going live, later

Once KYC is approved:

1. Switch the dashboard to **Live Mode** and generate **live** keys
   (`rzp_live_…`).
2. Replace both values in the server's `.env` and rebuild.
3. Re-create the webhook in Live Mode — **test-mode webhooks do not carry over.**
4. **Put one real ₹1 order through it yourself** before telling anyone the site
   takes payment. Check the money reaches the bank account.

### 4.6 GST — decided: leave as is for now

The website charges **CGST 9% + SGST 9%** on every order, hardcoded in
`src/lib/pricing.ts` and shown as line items in the cart and at checkout.

**Decision, 2026-09-07: leave the site as it is** and revisit later. Recorded
here so it is a known deferral rather than an oversight.

Two things to come back to:

- **You may only charge GST if you hold a GSTIN.** Selling as an unregistered
  individual and adding those two lines is not permitted. Nothing has gone
  wrong so far because payment is not live and no money moves — but the day a
  gateway goes live, the site starts collecting 18% on your behalf. If you end
  up selling unregistered, the tax lines must come off. Make it a config
  switch, not a deletion.
- **The rates are CGST+SGST for *every* order**, which is only correct for a
  delivery inside the seller's own state. An inter-state sale is a single 18%
  IGST line. The delivery state is stored on every order, so making it
  conditional is a change in `lib/pricing.ts` alone — but what it *should* be
  is a question for your accountant. [PAYMENTS.md §7](PAYMENTS.md).

### 4.7 Delivery charges — decided: leave until a courier integration

Checkout says "Quoted on our call" and charges **nothing** for delivery. That
works while you ring every customer to settle payment anyway.

**Decision, 2026-09-07: leave unpriced** and handle it alongside a real
delivery integration (India Post / DTDC / Delhivery). Be clear-eyed that this
is the item that genuinely breaks when payment goes live: there is then no call
in which to agree the charge, and the delivery cost comes out of your margin.

Cheapest answers first, when you get to it:

1. **A flat rate per state**, or free above an order threshold. One table, no
   integration, and the usual answer for a catalogue this size.
2. **Weight-banded**, which needs a weight on each product — a new column and
   an admin field.
3. **A courier API** for live rates. Real integration work.

`orders.shipping` already exists in paise and is already included in `total`,
so whichever you pick is a pricing change rather than a structural one.

### 4.8 Switching to a company account later

**A Razorpay account is tied to a legal entity, and you cannot convert one
entity into another.** What "switch later" means depends on what gets
registered:

- **Private Limited or LLP** — a separate legal person, with its own PAN, bank
  account and GSTIN. You open a **second, brand-new Razorpay account**, redo
  KYC from scratch, and get new keys. Nothing migrates: settlement history and
  transaction records stay with the old account.
- **Sole proprietorship** — *not* a separate legal entity in Indian law; it
  shares your PAN. Razorpay may let you **update** the existing account's KYC
  with the new documents instead of opening a fresh one.

Two consequences worth planning around:

1. **Money collected in the meantime settles to your personal bank account**
   and is your personal income as far as the bank and Razorpay are concerned —
   not the company's revenue — until the day you cut over. Get your
   accountant's view before relying on this.
2. **The cutover itself is trivial on the website's side**: replace
   `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `.env`, rebuild, and every
   payment after that point goes to the new account. Re-create the webhook
   (§4.4) under the new account too — webhooks do not carry over.

---

## 5. The finished files

`.env.local` on your laptop — the Resend and Google values are set, Razorpay
is not yet:

```bash
DATABASE_URL=postgresql://postgres:password@127.0.0.1:55433/vkon
ADMIN_PASSWORD=your-dev-password
AUTH_SECRET=your-dev-secret-at-least-16-chars

RESEND_API_KEY=re_xxxxxxxx
MAIL_FROM=Vkon Automation <no-reply@vkon.in>

GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

`.env` on the server — **none of the Resend, Google or Razorpay values are on
the server yet**, which is why the live site has no Google button. Note there
is **no** `GOOGLE_REDIRECT_URI` here, plus the extra values that only exist on
the server:

```bash
POSTGRES_PASSWORD=...
ADMIN_PASSWORD=...
AUTH_SECRET=...
APP_PORT=8120
SITE_URL=https://vkon.in
TUNNEL_TOKEN=...
COMPOSE_PROFILES=tunnel

RESEND_API_KEY=re_xxxxxxxx
MAIL_FROM=Vkon Automation <no-reply@vkon.in>

GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx

# Once payment is built:
RAZORPAY_KEY_ID=rzp_live_xxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxx
```

Then, on the server, every time:

```bash
docker compose build app && docker compose up -d app
```

> **`.env` is not baked into the image, but the running container only reads it
> at startup.** Editing the file changes nothing until you rebuild. A deploy
> that "did not pick up the new key" is almost always this.

---

## 6. Checklist

Ticked as of 10 September 2026.

- [x] Resend account created, API key in `.env.local` — **not yet on the server**
- [x] `vkon.in` verified in Resend (three DNS records, confirmed resolving)
- [ ] `MAIL_FROM` switched off `onboarding@resend.dev` to a `@vkon.in` address — **check**
- [x] Registered a test account and received the welcome email
- [ ] Requested a password reset and received the link
- [x] Google Cloud project, consent screen, OAuth client created
- [x] **Both** redirect URIs added, exactly
- [x] "Continue with Google" appears and signs you in locally
- [x] Consent screen **published**
- [ ] **Server back up** — §0b (blocks most of what follows)
- [ ] Branding verification re-requested and passing — §3.6
- [ ] `docs/Hosting.md`, `docs/cicd.md`, `docs/f2.pdf`, `cicd/` copied back
      from the server (lost 2026-09-10; gitignored, so git cannot restore them)
- [ ] Server `.env` updated and `docker compose build app && up -d app` run
- [ ] Razorpay signup submitted as **Individual** with documents (KYC 1–3 days)
- [ ] Razorpay webhook created with its own secret
- [x] GST decision made — **leave as CGST+SGST for now**, revisit later (§4.6)
- [x] Delivery-charge decision made — **leave unpriced** until a courier
      integration (§4.7)
- [ ] Read §4.8 so the eventual company switch holds no surprises
- [ ] Razorpay test-mode payment put through end to end — [PAYMENTS.md §6](PAYMENTS.md)
- [ ] One real ₹1 order in live mode before announcing payment
