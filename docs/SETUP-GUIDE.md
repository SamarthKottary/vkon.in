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
| **Resend** (§2) | Welcome email, password-reset link, order confirmation, **the sign-in code** | Accounts still work, but nobody can reset a forgotten password — and since 16 Sep the sign-in code is **skipped entirely**, because there is no way to deliver one. **Do this one.** |
| **Google** (§3) | The "Continue with Google" button | The button is hidden; email + password still works |
| **Razorpay** (§4) | Online payment | Orders are placed and settled on a phone call |
| **Shiprocket** (§5) | Live delivery rates at checkout, shipping labels, tracking | Delivery stays ₹0 and is agreed on the phone |

> **Why you cannot see "Continue with Google" right now:** it is hidden until
> `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. That is deliberate —
> a button that leads to a crash because a key is missing is worse than no
> button — and it is what §3 turns on. In development the login page prints a
> note saying so; that note never appears on the live site.

---

## 0a. Where things stand — 15 September 2026

| | Status | What is left |
|---|---|---|
| **Resend** (§2) | ✅ **Working** | Confirm `MAIL_FROM` is off the test sender (§2.4); add both values to the **server** `.env` (§2.5) |
| **Google sign-in** (§3) | 🟡 **Working locally** | Branding verification failed **because the site was down** — re-request once it is back (§3.6); add both values to the server `.env` |
| **Razorpay** (§4) | 🟡 **Account created (freelancer), code done** | Webhook (§4.4) is **unblocked** now the site is back up — put the keys in the server `.env` first |
| **Shiprocket** (§5) | 🟡 **Working locally** | KYC done, wallet funded, pickup address verified, API user created, live rates confirmed with `npm run shiprocket:check`. Left: deploy the code and keys to the server, then the webhook (§5.8) |
| **Product sizes** (§5.6) | 🟡 **Estimated, not measured** | Since 15 Sep every product has its own estimated packed weight and box size — identical on the laptop and the server. In `/admin/products` they look like real values but are guesses: replace them with packed measurements. The box moves the price more than the weight does |
| **The server** | ✅ **Back up** (15 Sep) | Was down for days because Docker had taken the college captive portal's subnet. Fixed permanently — §0b. Both webhooks can now be set up against the live URL |

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

1. ~~**Get the server back up**~~ — ✅ done 15 September. The cause and the permanent fix are in §0b.
2. ~~**Razorpay signup as Individual**~~ — ✅ account created (freelancer).
3. **Re-request Google branding verification** — §3.6. The site loads again, so this is unblocked.
4. **Put every key on the server** and rebuild — §5. A correct `.env.local`
   does nothing for the live site.
5. **When KYC clears** — paste the three Razorpay values in, run the test-mode
   checks in [PAYMENTS.md §6](PAYMENTS.md), then one real ₹1 order.

---

## 0b. The server — check this first

### What happened — fixed 15 September 2026

`https://vkon.in` returned **HTTP 530** for days — Cloudflare's "cannot reach the
origin" error, which also failed the branding verification in §3.6.

**The cause was a subnet collision, not a crash.** The server's college network
puts its captive-portal login page at `172.21.0.1`. Docker had handed vkon's
compose network the range `172.21.0.0/16`, so the server routed traffic for the
portal into its own Docker bridge instead of out to the college. The workaround
used — `sudo ip addr flush dev br-4847f771eba1` — made the portal reachable, but
it also removed the vkon containers' gateway. From then on the tunnel container
could not reach Cloudflare at all, while every container still reported
"healthy", because the health check only asks the app on its own port.

**The fix is permanent.** `/etc/docker/daemon.json` on the server now keeps
Docker out of the whole `172.16.0.0/12` range:

```json
{
  "bip": "10.201.0.1/24",
  "default-address-pools": [
    { "base": "10.200.0.0/16", "size": 24 }
  ]
}
```

vkon's network was recreated on `10.200.0.0/24`. Both new ranges were checked
with `traceroute` from the server and leave the campus through the ISP, so the
college does not use them. A database backup was taken first
(`~/backups/vkon-before-subnet-fix-20260915-065357.sql` on the server) and row
counts matched before and after.

> **Never strip a Docker bridge's IP to reach the portal again, and never
> delete that file.** `ssh ptz` itself travels through a Cloudflare tunnel that
> needs the server's internet, which needs the portal. Recreating the collision
> can lock you out of the machine the next time the portal asks for a login.
>
> To move a compose project's network: `docker compose down` — **never
> `down -v`**, which deletes the database volume — *before* restarting Docker,
> so the restart has no old network to put back. The file only affects **new**
> networks; the other projects on the machine still sit on `172.19` and
> `172.20`. HANDOFF.md §6 has the rest.

### If it goes down again

Check for the collision first — it looks exactly like a dead server:

```bash
ip route | grep -E '^172\.21'                # anything here means it's back
curl -s -o /dev/null -w '%{http_code}\n' http://172.21.0.1:8090/   # portal: 200
```

Then the containers. Diagnose by a route that does not depend on Cloudflare if
SSH is down too — physical or LAN access:

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
4. **Active Events:** tick `payment.captured`, `payment.failed` and `refund.processed`.
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

### 4.7 Delivery charges — ✅ superseded by §5 (Shiprocket), 12 September 2026

> **This decision has been acted on.** Delivery is now priced live at checkout
> through Shiprocket — see **§5** and [SHIPPING.md](SHIPPING.md). Of the three
> options below, the third was taken. The rest of this section is kept because
> it records why, and because options 1 and 2 remain the fallback if the
> courier API is ever unavailable.

#### The original decision, 7 September 2026

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

## 5. Shiprocket — delivery rates, labels and tracking

**What this switches on:** a real delivery charge at checkout instead of
"Quoted on our call", a "Book shipment" button in `/admin/orders`, and a
tracking link on the customer's order page.

**Skip it and** everything works exactly as it does today — delivery stays ₹0
and is agreed on the phone. Nothing breaks; the features simply do not appear.

The code is done and tested. What follows is the account work.

> **Read this first.** Delivery rates depend on **weight**, and no product has
> one entered yet. Until you enter them (§5.6), every quote assumes **2 kg per
> item**, which is a guess. It is deliberately a *generous* guess — see
> [SHIPPING.md §3](SHIPPING.md) for why guessing low costs you money and
> guessing high only over-quotes the customer.

### 5.1 Which account to sign up as

Same question as Razorpay §4.1, and the same answer: sign up as **Individual /
Sole Proprietor** now, with your own PAN and Aadhaar. Shiprocket does not
require a registered company.

**What "convert later" actually means depends on what you register**, and the
dividing line is the PAN — exactly as it is for Razorpay (§4.8):

- **Sole proprietorship** — not a separate legal person in Indian law; it
  shares *your* PAN. Nothing has to move. You add the GSTIN and trading name to
  the same account and carry on. This is a genuine edit.
- **Private Limited or LLP** — a separate legal person with its own PAN. The
  account's KYC PAN then has to change, and **that is not a settings edit.**
  Whether Shiprocket updates it in place or requires a fresh account is their
  policy call, not something to assume — ask their support in writing and keep
  the reply.

**The website side is trivial either way**: swap the four `SHIPROCKET_*`
values in `.env`, rebuild, done. Nothing in the database refers to the
Shiprocket account, and past orders keep the AWBs they already have.

Two things to be clear-eyed about while running as an individual:

1. **COD remittances land in your personal bank account** and are your personal
   income as far as the bank is concerned, until you cut over. Same caveat as
   Razorpay §4.8 — get your accountant's view.
2. **Without a GSTIN you cannot claim input credit on shipping.** Courier
   charges carry 18% GST, so on ₹100 of freight you are absorbing ₹18 that a
   GST-registered business would set off. On low volumes that is noise; it is
   worth revisiting when it is not.

### 5.2 Create the account

1. Go to **https://www.shiprocket.in** and **Sign Up**.
2. Use the business email (`support@vkon.in`) and a strong password.
3. Verify the email and mobile number they send codes to.
4. Choose the **free** plan. There is no monthly fee on the entry plan — you
   pay per shipment, and rates are shown before you book anything.

### 5.3 Complete KYC, and fund the wallet

**This is the long pole — allow 1–3 working days**, same as Razorpay.

Under **Settings → Company Setup → KYC**, you will need:

- **PAN card** (yours, as the proprietor)
- **Aadhaar** (or another address proof)
- **A cancelled cheque or bank statement** for the account that refunds and
  COD remittances go to
- **GSTIN** if you have one. You can proceed without it — Shiprocket allows a
  declaration instead — but the invoices they raise will then not carry your
  GST.

Nothing below works until KYC is approved.

#### The wallet — Shiprocket is prepaid

**Shipping charges come out of a wallet balance, not an invoice at month end.**
An empty wallet means AWB assignment fails, which shows up here as a shipment
that gets created but never gets a tracking number — the exact state
`bookShipment` returns a null AWB for.

Top it up under **Billing → Recharge Wallet**. A few hundred rupees covers
several parcels; the rate shown at checkout is roughly what gets deducted when
the label is generated.

Worth knowing before the first busy week: if the balance runs out, orders still
get *placed* on the site normally — customers are unaffected — but "Book
shipment" will stop producing AWBs until it is topped up.

> **Ignore "Connect My Store" on their dashboard.** That is for Shopify /
> WooCommerce and similar, where Shiprocket pulls orders from the platform.
> This site pushes orders to them directly through the API
> (`/orders/create/adhoc`), which needs no channel connection. The "Get
> Started" checklist will keep showing 2 of 3 until the first order exists;
> booking one from `/admin/orders` (§5.9) completes it.

### 5.4 Register the pickup address

**This is the one people get wrong, and it is the origin every rate is
calculated from.**

1. **Settings → Pickup Addresses → Add New Address.**
2. Enter the address parcels actually go **out** from. Not the office, not the
   registered address — the place a courier will physically collect from.
3. It has a **nickname**, which you choose. Do not assume it is `Primary` —
   the badge that says PRIMARY on that screen is a *role*, not the nickname,
   and the two are frequently different. Read the bold text in the first
   column; that is the nickname.
4. Note the **PIN code** and the **exact nickname**; you need both below, and
   the nickname has to match character for character. Confirm it with
   `npm run shiprocket:check`, which lists every registered address and marks
   the one your `.env.local` matches.

```bash
SHIPROCKET_PICKUP_PINCODE=563122
SHIPROCKET_PICKUP_LOCATION=Primary
```

> If the nickname is wrong, booking fails with a message about the pickup
> location and nothing else works. It is the first thing to check if §5.7
> fails.

### 5.5 Create the API user

**These are not your dashboard login.** Shiprocket wants a separate API user,
and using your own login will not work.

1. **Settings → API → Configure → Create an API User.**
2. **The email must be different from the one you log in with.** Shiprocket
   enforces this and says so on the dialog. It does not have to be a real
   inbox. A distinct address also makes it obvious in logs which credentials
   are in use — e.g. `api@vkon.in`.
3. **Tick the API modules.** The dialog will not save without them, and an API
   user with the wrong ones logs in fine and then fails on the call you
   actually need. What this site uses:

   | Module | Needed? | What breaks without it |
   |---|---|---|
   | **Orders (create, update)** | **Yes** | `POST /orders/create/adhoc` — booking a shipment |
   | **Courier** | **Yes** | `/courier/serviceability` (every checkout quote) **and** `/courier/assign/awb` (the tracking number) |
   | **Shipments** | **Yes** | Shipment-level calls; tick it rather than find out mid-booking |
   | **Settings** | Recommended | `npm run shiprocket:check` cannot list your pickup addresses |
   | **Listings** | No | Nothing here reads a product catalogue from Shiprocket |

4. **Leave "Allowed IPs for PII Access" blank** unless you have a static IP.
   Filling it in locks the API to those addresses — your laptop's IP changes,
   and the server's would have to be added separately.
5. Set a password. **Copy it now** — it is not shown again.

```bash
SHIPROCKET_EMAIL=the_api_user_email
SHIPROCKET_PASSWORD=the_password_you_just_set
```

Put all four values so far in `.env.local`, then restart `npm run dev`.

### 5.6 Measure the products

Open each product in `/admin/products` and fill in **Shipping weight (grams)**
and **Packed size (cm)**.

Enter the **packed** figures — the box, the padding, everything the courier
handles. A 3.5 kg starter in a box with foam is `3800`, not `3500`.

**The box matters more than the weight.** Couriers bill the greater of actual
weight and *volumetric* weight (`L × B × H ÷ 5000`). Measured on the live API,
the same 2 kg parcel cost ₹128 in a 15 cm box and **₹1,443** in a 60 cm one —
and only one courier would take the big one, against six for the small. A panel
in a large, mostly-empty carton is charged as if it were heavy.

Leaving both blank is allowed. Each product then uses the estimate for its
category — see the table in [SHIPPING.md §3](SHIPPING.md). Those estimates are
plausible, not accurate:

| Category | Assumed until you measure |
|---|---|
| accessory | 0.5 kg, 16×12×8 cm |
| home-automation | 0.7 kg, 20×14×8 cm |
| auto-start | 2.5 kg, 24×18×12 cm |
| starter | 3.5 kg, 28×20×14 cm |
| solar | 5 kg, 35×26×18 cm |
| cable | 6 kg, 30×30×14 cm |
| industrial-panel | 15 kg, 60×45×25 cm |

> **Dimensions are all three or none.** The form rejects a partial set rather
> than combining a measured length with an estimated width, which would
> describe a box nobody owns. Weight and size fall back independently, so
> weighing something without measuring it is still worth doing.

### 5.7 Test a quote — from your laptop, no server needed

**This is the part that does *not* need the site to be live.** Quoting is an
outbound call, so it works from `localhost` exactly as it will in production —
unlike either webhook.

Fastest check, once the four values are in `.env.local`:

```bash
npm run shiprocket:check           # quotes to Bengaluru (560001)
npm run shiprocket:check 110001    # or any PIN code you like
```

It does the same two API calls checkout does and prints what came back: whether
the login worked, which pickup addresses exist and whether the nickname and PIN
in your `.env.local` match one of them, and the actual courier rates for a 2 kg
parcel. It ends by naming the figure checkout would charge.

Run that before touching the website — it turns "checkout still says quoted on
our call" into a specific answer.

Then confirm it end to end:

1. Add a product to the cart and go to `/checkout`.
2. Pick a shipping address with a real PIN code.
3. The **Delivery** line should change from "Quoted on our call" to either a
   single priced service, or a choice between **Standard** and **Express** with
   prices and estimates in days — and the **Total** should follow whichever is
   selected.

If it still says "Quoted on our call", the causes in order of likelihood are:

| Cause | How to tell |
|---|---|
| KYC not approved yet | Shiprocket dashboard shows it pending; `shiprocket:check` logs in but returns no couriers |
| Used the dashboard login, not an API user | `shiprocket:check` → `Login failed — HTTP 403` |
| Pickup address not registered | `shiprocket:check` → "No pickup address registered" |
| Nickname does not match | `shiprocket:check` → "None is nicknamed …" |
| Genuinely unserviceable PIN | `shiprocket:check <pin>` → "No courier serves …" |

The server log is the other place to look; every failure path in the running
site writes a line beginning `[shiprocket]`.

### 5.8 Set up the tracking webhook

This is Shiprocket telling your server that a parcel moved, so the customer's
order page updates itself.

1. Invent a secret and keep it:
   ```bash
   openssl rand -hex 32
   ```
2. **Settings → API → Webhooks** in Shiprocket.
3. **Webhook URL:** `https://vkon.in/api/shipping/webhook`
4. Paste the secret into their **token / x-api-key** field.
5. Save, and put the same value in your `.env`:
   ```bash
   SHIPROCKET_WEBHOOK_TOKEN=the_random_string_you_just_made
   ```

> **This needs the live site — `localhost` will not do**, exactly like the
> Razorpay webhook (§4.4). Shiprocket has to be able to reach the URL from the
> internet.
>
> **The handler itself is already proven.** It was tested locally by firing
> real requests at it — shipped, delivered, repeat deliveries, unknown
> statuses, unknown tracking numbers, bad tokens and malformed bodies — so when
> the server is back, the only untested part is Shiprocket reaching it. See
> [SHIPPING.md §5](SHIPPING.md).

### 5.9 Book your first shipment

1. Place a test order on the site.
2. Open `/admin/orders`, find it, and press **Book shipment**.
3. On success the card shows the courier and an **AWB** number, with a tracking
   link. The customer sees the same thing on their own order page.
4. Print the label from the Shiprocket dashboard and schedule the pickup there.

If it fails, the banner says which of the three likely causes it was —
unconfigured, already booked, or refused — and the server log has Shiprocket's
own message.

---

## 6. The finished files

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

`.env` on the server — **as of 15 September no integration keys are on the
server at all**: no Resend, Google, Razorpay or Shiprocket values. That is why
the live site sends no email and shows neither a Google button nor a Pay
button. Note there is **no** `GOOGLE_REDIRECT_URI` here, plus the extra values
that only exist on the server:

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

# Razorpay — test keys first, live keys once KYC clears (§4.5):
RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxx

# Shiprocket (§5):
SHIPROCKET_EMAIL=the_api_user_email
SHIPROCKET_PASSWORD=xxxxxxxx
SHIPROCKET_PICKUP_PINCODE=xxxxxx
SHIPROCKET_PICKUP_LOCATION=work
SHIPROCKET_WEBHOOK_TOKEN=xxxxxxxx
```

> **`docker-compose.yml` hands variables to the app from an allowlist.** A
> value in `.env` whose name is not listed under `app:` → `environment:` never
> reaches the site, and the site behaves as if it were unset — no error
> anywhere. The `SHIPROCKET_*` names were missing from that list until
> 15 September; adding keys to `.env` before that fix would have done nothing.
> Any new integration needs its names added there too.

After changing **only `.env`**, recreate the app so it reads the new values —
no rebuild needed:

```bash
cd ~/project2/vkon.in && docker compose up -d app
```

> **The running container only reads `.env` when it is created.** Editing the
> file changes nothing until that command runs. A key that "did not take" is
> almost always this.

**Code changes deploy themselves.** A push to `main` triggers the deploy
console on the server, which fast-forwards the checkout and runs
`cicd/deploy.sh`: it builds the image, restarts the stack and applies
`schema.sql`. There is no manual build step for code.

---

## 7. Checklist

Ticked as of 15 September 2026.

- [x] Resend account created, API key in `.env.local` — **not yet on the server**
- [x] `vkon.in` verified in Resend (three DNS records, confirmed resolving)
- [ ] `MAIL_FROM` switched off `onboarding@resend.dev` to a `@vkon.in` address — **check**
- [x] Registered a test account and received the welcome email
- [ ] Requested a password reset and received the link
- [x] Google Cloud project, consent screen, OAuth client created
- [x] **Both** redirect URIs added, exactly
- [x] "Continue with Google" appears and signs you in locally
- [x] Consent screen **published**
- [x] **Server back up** — 15 September; Docker subnet collision fixed (§0b)
- [ ] Laptop's uncommitted Shiprocket work committed and pushed (deploys itself)
- [ ] Branding verification re-requested and passing — §3.6
- [ ] `docs/Hosting.md`, `docs/cicd.md`, `docs/f2.pdf`, `cicd/` copied back
      from the server (lost 2026-09-10; gitignored, so git cannot restore them)
- [ ] Server `.env` updated and `docker compose build app && up -d app` run
- [ ] Razorpay signup submitted as **Individual** with documents (KYC 1–3 days)
- [ ] Razorpay webhook created with its own secret
- [x] GST decision made — **leave as CGST+SGST for now**, revisit later (§4.6)
- [x] Delivery priced live through Shiprocket (§5) — supersedes the
      7 September "leave unpriced" decision
- [ ] Shiprocket keys on the server; delivery options showing on vkon.in
- [ ] Shiprocket tracking webhook created (§5.8)
- [x] Server products priced and matched to the laptop; test products removed (15 Sep)
- [ ] Products measured — real weight and box size replacing the 15 Sep estimates (§5.6)
- [ ] Read §4.8 so the eventual company switch holds no surprises
- [ ] Razorpay test-mode payment put through end to end — [PAYMENTS.md §6](PAYMENTS.md)
- [ ] One real ₹1 order in live mode before announcing payment
