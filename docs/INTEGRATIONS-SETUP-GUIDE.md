# Vkon.in — Integrations Setup Guide

> Production setup, step by step. The detailed background for each integration is in [SETUP-GUIDE.md](SETUP-GUIDE.md), [PAYMENTS.md](PAYMENTS.md) and [SHIPPING.md](SHIPPING.md).

**Google sign-in  ·  Resend email  ·  Shiprocket delivery  ·  Razorpay payments**

Prepared 15 September 2026, **updated 16 September**, for the live site `https://vkon.in`. Follow the steps in order — each one says exactly what to click, what to paste, and how to check it worked.

> ⚠️ **This file is in a public repository.** Every key and password below is a placeholder — never replace one with a real value here, and never commit `.env` or `.env.local`. The same guide exists as a Word document outside the repo.

## Contents

- Where things stand today
- Before you start: how keys reach the live site
- Step 1 — Put your laptop's code live
- Step 2 — Resend (email)
- Step 3 — Sign in with Google
- Step 4 — Shiprocket (delivery)
- Step 5 — Razorpay in test mode
- Step 6 — Razorpay live payments
- Final checklist
- Appendix A — Complete server .env template
- Appendix B — When something doesn't work

## Where things stand today

Checked on **16 September 2026** against the running server, not from memory — every key below was confirmed present inside the live container, and Razorpay was asked directly which webhooks it holds.

| Item | Status | What it means |
|---|---|---|
| Site `https://vkon.in` | Live | Back up since the server's Docker network fix on 15 Sep. |
| Resend (email) | **Done** | Key and `MAIL_FROM` are on the server. Email works — and the new sign-in code depends on it. |
| Google sign-in | **Done** | Both keys on the server. Branding verification is the only piece left (Step 3.6). |
| Shiprocket | **Done** | All six values on the server; live delivery rates show at checkout. |
| Razorpay — test mode | **Done and proved** | Test keys and a test webhook are live. Order `VK-0915-T5TQ` was marked paid **by the webhook**, so delivery and the signature check both work. |
| Razorpay — live mode | **Not started** | Needs website verification, then live keys and a **separate** live webhook. Step 6. |
| Product weights and sizes | Estimated | Every product has a plausible guess, not a measurement. Replace them (Step 4.4). |

> 💡 **The only thing standing between you and real payments** is Step 6 — Razorpay's website verification, then live keys and a live webhook. Everything else on this page is finished.

## Before you start: how keys reach the live site

- **Keys live in two separate files.** On your laptop: `.env.local` (for local testing). On the server: `~/project2/vkon.in/.env` (for the live site). Setting one never sets the other.
- **Never commit either file**, and never share a key in a document, chat or GitHub.
- **After any change to the server's `.env`, run `docker compose up -d app`** from `~/project2/vkon.in`. The site only reads `.env` when that command recreates it — editing the file alone changes nothing.
- **Code reaches the live site by itself.** Pushing to `main` makes the server fetch, rebuild, restart and update the database automatically. It takes a few minutes.
- **Never use the `$` character in a value** — Docker silently changes it. Make secrets with `openssl rand -hex 32`, which never produces one.
- **Every integration is optional.** A missing key hides that one feature; it never breaks the site. That also means a key that fails to arrive gives no error — which is why every step below has a check.

> ⚠️ **Don't touch the server's networking.** Leave `/etc/docker/daemon.json` alone and never remove IP addresses from Docker's network bridges. Your SSH access to the server depends on that setup — changing it can lock you out.

### How to edit the server's .env (used in every step)

1. In a terminal on your laptop, connect and open the file:

   ```bash
   ssh ptz
   cd ~/project2/vkon.in
   nano .env
   ```

2. Press **Ctrl+W**, type the setting's name (for example `RESEND_API_KEY`) and press **Enter**. If the line already exists, fill in the value after `=` on that line. If it doesn't, use the arrow keys to go to the last line and add it. **Never add the same name twice.**
3. Paste with **Ctrl+Shift+V**. Copy values exactly as shown — no spaces around `=`.
4. Save with **Ctrl+O** then **Enter**. Exit with **Ctrl+X**.
5. Recreate the app so it reads the new values:

   ```bash
   docker compose up -d app
   ```

6. Confirm the values reached the site. This prints the **names** of settings that have a value — **never the values themselves**:

   ```bash
   docker compose exec app printenv | grep -E '^(RESEND|MAIL|GOOGLE|RAZORPAY|SHIPROCKET)[A-Z_]*=.' | cut -d= -f1
   ```

   - A name missing from the output has no value inside the site yet.
   - Checking only that a name exists is not enough: the site's configuration declares every setting, so empty ones exist too.

### Recommended order

| # | Do this | Why this order |
|---|---|---|
| 1 | Put your laptop's code live | The Shiprocket code — and the fix that lets the site see Shiprocket keys at all — only exist on your laptop. |
| 2 | Resend | Without it, customers who forget their password are stuck. |
| 3 | Google sign-in | Quick: the Google side is already set up. |
| 4 | Shiprocket | Delivery must be priced before online payment goes live — there's no phone call left to agree the charge. |
| 5 | Razorpay test mode | Proves payments and the webhook on the live site using fake money. |
| 6 | Razorpay live | Only after Razorpay approves your KYC. |

---

## Step 1 — Put your laptop's code live

**Why:** these changes on your laptop had never left it — the whole Shiprocket integration, delivery options, product sizes, and a fix to `docker-compose.yml`. **Without that fix, Shiprocket keys added to the server would be ignored.**

1. On your laptop, make sure the code builds. Both must finish without errors:

   ```bash
   cd ~/Projects/vkon.in_webpage
   npx tsc --noEmit
   npm run build
   ```

2. Preview exactly what will be committed:

   ```bash
   git status
   git add -A --dry-run
   ```

   - Nothing named `.env` or `.env.local` may appear.
   - No private documents (the business plan PDF, hosting notes). The repository is public.
   - You should see `docker-compose.yml`, `src/lib/shiprocket.ts`, `src/lib/parcel.ts`, `docs/SHIPPING.md` and the other changes.

3. Commit and push:

   ```bash
   git add -A
   git commit -m "Shiprocket delivery: live rates, Standard/Express, product sizes; compose env fix"
   git push origin main
   ```

4. Wait a few minutes while the server rebuilds.

### Check it worked

1. From your laptop:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://vkon.in/api/shipping/webhook
   ```

   - **401** — deployed. (The route exists and correctly refuses a request with no token.)
   - **404** — not deployed yet. Wait a few more minutes.

2. On the server, confirm the new commit and the new database columns:

   ```bash
   ssh ptz
   cd ~/project2/vkon.in
   git log -1 --oneline
   docker compose exec -T db psql -U vkon -d vkon -tAc "select count(*) from information_schema.columns where table_name='products' and column_name in ('weight_grams','length_cm','breadth_cm','height_cm')"
   ```

   - The commit should be the one you just pushed.
   - The count should be **4**.

> 💡 **If nothing changed after 10 minutes,** run the deploy by hand on the server. It does exactly what the automatic deploy does — build, restart, apply the database schema:

```bash
cd ~/project2/vkon.in
git pull --ff-only
./cicd/deploy.sh
```

---

## Step 2 — Resend (email)

> ✅ **Already done:** Resend account created, `vkon.in` verified (three DNS records in Cloudflare), and email working on your laptop.

**What's left:** put the key on the server, with a sender address on your own domain.

### 2.1  Confirm the domain is verified

1. Go to **https://resend.com** → **Domains**.
2. `vkon.in` must show **Verified**. If it shows anything else, open it and click **Verify DNS Records**; it can take up to 30 minutes.

### 2.2  Get the API key

Either copy the `RESEND_API_KEY` value from your laptop's `.env.local`, **or** make a dedicated key for the live site (recommended — you can then revoke one without breaking the other):

1. Resend → **API Keys** → **Create API Key**.
2. **Name:** `vkon-production`.  **Permission:** **Sending access** (not Full access).  **Domain:** `vkon.in`.
3. Click **Add** and **copy the key immediately** — it starts `re_` and is shown only once.

### 2.3  Add it to the server

Edit the server's `.env` (see "How to edit the server's .env") and add:

```bash
RESEND_API_KEY=re_your_key_here
MAIL_FROM=Vkon Automation <no-reply@vkon.in>
```

- `MAIL_FROM` **must** use `@vkon.in`. The test sender `onboarding@resend.dev` can only deliver to your own address.
- Want customers to be able to reply? Use a mailbox you actually read, e.g. `Vkon Automation <sales@vkon.in>`.

Then run `docker compose up -d app`.

### 2.4  Test it

1. Open **https://vkon.in/account/login** → **Register**, using an email address you can check (not one you've registered before).
2. A welcome email should arrive within a minute. **Check spam** if it doesn't.
3. Sign out, click **Forgotten your password?**, enter the same address — a reset link should arrive.

If no email arrives, check the site's log on the server:

```bash
cd ~/project2/vkon.in
docker compose logs --tail=100 app | grep "\[mail\]"
```

| Log shows | Meaning | Fix |
|---|---|---|
| `[mail] not configured` | The key never reached the site | Check the name is spelled exactly, then `docker compose up -d app` |
| `[mail] 401` | Key is wrong or was deleted | Create a new key (2.2) |
| `[mail] 403` or `422` | Resend refused the sender or recipient | `MAIL_FROM` must be an `@vkon.in` address and the domain must show Verified |
| Nothing at all | No email was attempted | Make sure you finished registering / submitted the reset form |

---

## Step 3 — Sign in with Google

> ✅ **Already done:** Google Cloud project, consent screen (published), OAuth client with both redirect addresses, and sign-in working on your laptop.

**What's left:** put the two values on the server, then re-request branding verification — it failed only because the site was down.

### 3.1  Check the redirect address

1. Go to **https://console.cloud.google.com** and select the **Vkon Automation** project (top bar).
2. Open **Google Auth Platform → Clients** (older console: **APIs & Services → Credentials**) and click the web client (e.g. `vkon.in web`).
3. Under **Authorised redirect URIs**, this must be present, character for character:

   ```bash
   https://vkon.in/api/auth/google/callback
   ```

4. Under **Authorised JavaScript origins**: `https://vkon.in`.
5. If you changed anything, click **Save** and allow a few minutes for Google to apply it.
6. Copy the **Client ID** and **Client secret** from this page (they're also in your laptop's `.env.local`).

### 3.2  Add them to the server

```bash
GOOGLE_CLIENT_ID=1234567890-xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
```

> ⚠️ **Do NOT add GOOGLE_REDIRECT_URI on the server.** That setting is only for your laptop, where it points Google back at `localhost`. On the server the site builds the correct `https://vkon.in/...` address itself.

Then run `docker compose up -d app`.

### 3.3  Test it

1. Quick check from your laptop — the address printed should start with `https://accounts.google.com`:

   ```bash
   curl -s -o /dev/null -w "%{redirect_url}\n" https://vkon.in/api/auth/google/start
   ```

   - If it ends in `?error=google`, the keys didn't reach the site — use the printenv check.

2. Open **https://vkon.in/account/login** — **Continue with Google** should now appear.
3. Click it, choose your account — you should land on your account page, signed in.

### 3.4  Re-request branding verification

This lets Google show your app name and logo on the sign-in screen. It does **not** block sign-in. The first attempt failed only because Google's checker found the site down.

1. First, confirm in a browser that **https://vkon.in**, **https://vkon.in/privacy** and **https://vkon.in/terms** all load.
2. **Google Auth Platform → Branding** — check these fields, then **Save**:

   - App name: `Vkon Automation`
   - Application home page: `https://vkon.in`
   - Application privacy policy link: `https://vkon.in/privacy`
   - Application terms of service link: `https://vkon.in/terms`
   - Authorised domain: `vkon.in`

3. **Verification centre** → **I have fixed the issues** → request reverification for branding.

> 💡 **If it fails again on the app name only:** Google may not read the site's logo ("Vkon" with "AUTOMATION" underneath) as the text "Vkon Automation". That's the one finding that could be genuine — reply with that detail and it can be adjusted.

| Problem | Cause and fix |
|---|---|
| `redirect_uri_mismatch` | The redirect address in 3.1 doesn't match exactly. Google's error page shows the address it received — copy that into the console. |
| "Access blocked: app not verified" | The consent screen is back in Testing. **Audience → Publish app**. |
| No Google button | Keys didn't reach the site. Use the printenv check, then `docker compose up -d app`. |
| Returns to sign-in with `?error=google` after choosing an account | Client secret is wrong. Check the log: `docker compose logs --tail=100 app \| grep "\[google\]"` |

---

## Step 4 — Shiprocket (delivery)

> ✅ **Already done:** Account created (individual), KYC approved, wallet recharged, pickup address `work` verified, API user created with the right modules, and live rates confirmed from your laptop.

**What's left:** Step 1 must be done first. Then put the keys on the server, create the tracking webhook, and measure your products.

### 4.1  Add the keys to the server

Copy the first four from your laptop's `.env.local`. Make the webhook token new:

```bash
openssl rand -hex 32
```

| Name | Value |
|---|---|
| `SHIPROCKET_EMAIL` | The **API user's** email (Settings → API) — **not** your dashboard login |
| `SHIPROCKET_PASSWORD` | The API user's password |
| `SHIPROCKET_PICKUP_PINCODE` | The pickup address's PIN code (Shiprocket → Settings → Pickup Addresses) |
| `SHIPROCKET_PICKUP_LOCATION` | `work` — the pickup nickname, exactly |
| `SHIPROCKET_WEBHOOK_TOKEN` | The value `openssl` just printed. **Save it** — you need it again in 4.3 |
| `SHIPROCKET_NOTIFY_EMAIL` | Optional: where the courier sends its own delivery notices |

Then `docker compose up -d app`, and confirm the site has **values** for them — this should print **5** (or 6 with the notify email):

```bash
docker compose exec app printenv | grep -cE '^SHIPROCKET_[A-Z_]*=.'
```

> ⚠️ **If it prints 0,** either Step 1 isn't live yet — the file that passes these settings to the site is part of that commit — or the lines aren't in `.env`, or the app wasn't recreated with `docker compose up -d app`.

### 4.2  Test live rates

1. Optional — confirm the account itself from your laptop:

   ```bash
   cd ~/Projects/vkon.in_webpage
   npm run shiprocket:check
   ```

2. On **https://vkon.in**, add a product to the cart, sign in, and go to **Checkout**.
3. Pick an address with a real PIN code. The **Delivery** line should show **Standard** and/or **Express** with prices and days — not "Quoted on our call".

### 4.3  Create the tracking webhook

This makes a customer's order page update itself as the parcel moves, and emails the customer when it ships, is out for delivery, and is delivered. Without it, nothing updates until you press **Refresh tracking** on the order in `/admin/orders`.

1. In the Shiprocket dashboard, open **Settings** and find **Webhooks** (it's under **API** or **Additional Settings**, depending on your dashboard version).
2. **URL:**

   ```bash
   https://vkon.in/api/shipping/webhook
   ```

3. **Token / x-api-key:** the same value as `SHIPROCKET_WEBHOOK_TOKEN`.
4. Save.

Check from your laptop (replace `YOUR_TOKEN`):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://vkon.in/api/shipping/webhook -H "x-api-key: YOUR_TOKEN" -H "Content-Type: application/json" -d '{}'
```

- **200** — the token matches.
- **401** — the token in `.env` and the one you used don't match, or the app wasn't recreated.

### 4.4  Measure your products

Every product already has an **estimated** packed weight and box size, entered on 15 September so quotes are realistic. They are guesses, not measurements, and in the admin they look exactly like real values — replace them. **The box size changes the price more than the weight**: couriers charge a large, light box as if it were heavy.

1. Open **https://vkon.in/admin** → **Products** → each product.
2. **Shipping weight (grams):** the packed weight, box included (a 3.5 kg starter in foam is about `3800`).
3. **Packed size (cm):** length × breadth × height of the box. Fill in **all three or none**.
4. Save.

### 4.5  Book your first shipment

1. **Admin → Orders** → find the order → **Book shipment**.
2. The order shows the courier and an **AWB** tracking number, with a tracking link. The customer sees the same on their order page.
3. In the Shiprocket dashboard, print the label and schedule the pickup.

> ⚠️ **Keep the wallet topped up.** Shiprocket is prepaid. If the balance runs out, orders still come in normally but booking can't get a tracking number — you'll see "created but no AWB was assigned". Recharge under **Billing → Recharge Wallet**.

| Problem | Cause and fix |
|---|---|
| Live checkout says "Quoted on our call", laptop shows rates | Keys not reaching the site — run the `grep -c '^SHIPROCKET_'` check. |
| "Quoted on our call" for one address only | No courier serves that PIN code. Normal for some remote areas — delivery is agreed on the call. |
| Booking fails mentioning the pickup location | `SHIPROCKET_PICKUP_LOCATION` must exactly match the nickname `work`. |
| Shipment created but no AWB | Wallet empty, or no courier available — assign one in the Shiprocket dashboard. |
| Login fails (403) in `npm run shiprocket:check` | Using the dashboard login instead of the API user. |

---

## Step 5 — Razorpay in test mode

> ✅ **Already done:** Razorpay account created as an individual (freelancer). The payment code is built and tested.

**Goal:** prove payments work end to end on the live site, including the webhook, using fake money. Test mode works even before KYC approval.

### 5.1  Get test keys

1. Log in to **https://dashboard.razorpay.com**.
2. Switch the mode toggle (top of the dashboard) to **Test Mode**.
3. Open **API Keys** (under **Settings** or **Account & Settings**) → **Generate Test Key**.
4. Copy the **Key ID** (starts `rzp_test_`) and the **Key Secret** — **the secret is shown only once**.

### 5.2  Create the webhook (still in Test Mode)

The webhook is Razorpay telling your server a payment succeeded, even if the customer's phone loses its connection mid-payment. **It's not optional.**

1. Make a webhook secret — a **different** value from the API secret:

   ```bash
   openssl rand -hex 32
   ```

2. Dashboard → **Webhooks** → **Add New Webhook**.
3. **Webhook URL:**

   ```bash
   https://vkon.in/api/payment/webhook
   ```

4. **Secret:** the value you just made.
5. **Active events:** tick `payment.captured`, `payment.failed`, `refund.processed` and `refund.failed`.
6. **Create Webhook**.

### 5.3  Add all three to the server

```bash
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_test_key_secret
RAZORPAY_WEBHOOK_SECRET=the_webhook_secret_you_made
```

- The **Key ID** is public by design — it's sent to the customer's browser. The two **secrets** never leave the server.
- Don't mix up the API secret and the webhook secret.

Then `docker compose up -d app`. Check from your laptop:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://vkon.in/api/payment/webhook
```

- **401** — configured, and correctly rejecting an unsigned request.
- **503** — the keys haven't reached the site.

### 5.4  Test payments

1. On **https://vkon.in**, place an order and open it from **My account → Orders**. A **Pay now** button should appear.

   - Test mode needs **no wallet, no added funds and no website verification** — the money is fake. Website verification is for live payments (Step 6).

2. **Success:** pay with an **Indian** test card — Visa `4100 2800 0000 1007`, any future expiry date, any CVV — then press **Continue** (choose **Maybe later** if it offers to save the card). **There is no OTP.** A separate small window opens instead: "Welcome to Razorpay Software Private Ltd Bank — This is just a demo bank page", with **Success** and **Failure** buttons. Press **Success**. If nothing seems to happen, that window may have opened behind your browser.

   - The order should become **Paid** and **Confirmed**, and a payment email should arrive.
   - **Don't use `4111 1111 1111 1111`** or any other international test card — the account accepts Indian cards only, and Razorpay refuses it with "this business accepts domestic (Indian) card payments only".
   - **UPI can't be tested in test mode.** NPCI retired typing in a UPI ID ("UPI Collect") on 28 February 2026, so Razorpay shows only a QR code, and a test-mode QR can't be paid from a real UPI app. The card tests cover the site's side — a payment is handled the same way whatever the method. UPI gets its first real check in Step 6, with a small live payment.

3. **Failure:** place another order, pay with the same card, and press **Failure** on the demo bank page. Razorpay's window says "Payment could not be completed" and offers to retry — close it. Reload the order page after a few seconds (Razorpay's webhook updates it): it must show **Payment failed**, with **Pay now** still there. Press **Pay now**, choose **Success** this time, and the order must become **Paid**.
4. **Abandon:** place an order, open the payment window, and close it. The order must still exist, unpaid, with **Pay now** still available.

### 5.5  Check the webhook is really being delivered

> ⚠️ **There is no delivery log to look at.** Razorpay does not give merchants a per-webhook delivery history — the Webhooks screen lists the webhook and nothing else. An earlier version of this guide told you to open one; that was wrong, and it is why you could not find it. The proof has to come from the site instead.

**And a webhook that works writes nothing to the site's log.** Only failures are logged, so an empty log is what success looks like. Do not read it as "the webhook never arrived".

**The site records which path settled each order**, which is the evidence you actually want. When the webhook marks an order paid it writes the word `webhook` where the browser would have written a signature:

1. On the server, ask which orders were settled by which path:

   ```bash
   ssh ptz
   cd ~/project2/vkon.in
   docker compose exec -T db psql -U vkon -d vkon -c "select order_number, payment_status, case when payment_signature = 'webhook' then 'webhook' else 'browser' end as settled_by, paid_at from orders where payment_status = 'paid' order by created_at desc limit 5"
   ```

2. To prove the webhook can do it **alone**, place an order, press Success on the demo bank page, and **close the tab immediately** — before the page returns to the site. The browser then never reports back, so only the webhook can mark it paid.

   - Wait about ten seconds, reopen the order from **My account → Orders**, and it must read **Paid**.
   - Run the query above: that order should say `webhook`.

**Already confirmed on this account.** Order `VK-0915-T5TQ`, paid on 15 September, was marked paid by the webhook rather than the browser — so delivery, the signature check and the database write are all working in test mode.

You can also confirm the webhook exists and which events it sends without the dashboard, using your own keys:

1. From the server (prints the URL and events, never a secret):

   ```bash
   cd ~/project2/vkon.in
   docker compose exec -T app node -e "const e=process.env,a='Basic '+Buffer.from(e.RAZORPAY_KEY_ID+':'+e.RAZORPAY_KEY_SECRET).toString('base64');fetch('https://api.razorpay.com/v1/webhooks',{headers:{Authorization:a}}).then(r=>r.json()).then(b=>b.items.forEach(w=>console.log(w.url,'|',w.service,'|active:',w.disabled_at===0,'|',Object.keys(w.events).filter(k=>w.events[k]).join(','))))"
   ```

It should print your `https://vkon.in/api/payment/webhook`, `api-test`, `active: true`, and `payment.captured,payment.failed,refund.processed,refund.failed`.

| Problem | Cause and fix |
|---|---|
| No Pay now button | Keys didn't reach the site — use the printenv check. |
| Order paid, but `settled_by` always says `browser` | Not a fault on its own — the browser usually wins the race. Use the close-the-tab test above to isolate the webhook. |
| Site logs `[webhook] signature rejected` | `RAZORPAY_WEBHOOK_SECRET` on the server doesn't match the secret typed into the dashboard webhook. Retype both. |
| Endpoint returns 503 | Keys missing on the server, or the app wasn't recreated. |
| Payment succeeded but the order stays unpaid | Check the site log for a `[webhook]` line: `docker compose logs --tail=100 app`. No line at all means nothing arrived — confirm the webhook's URL with the command above. |

---

## Step 6 — Razorpay live payments

Everything so far has been play money. This is the switch to real payments, and it is four separate things: getting Razorpay to approve you, generating **live** keys, creating a **live** webhook, and putting all three on the server.

> ⚠️ **Never run half-switched.** Test keys with a live webhook, or live keys with the test webhook secret, both look like they work. Razorpay's own warning for leaving test keys in place: customers see a payment success screen but no payment is captured or settled. Change all three values together, in one edit.

### 6.1  Website verification and KYC

Live keys are gated. Razorpay: **"To generate API keys in Live Mode, you must provide the website details where you will collect payments."** This is the **Verify Now** card you have already seen on the dashboard — the one that says *Verification required*. Test mode never needed it; live mode does.

1. On the dashboard, open the **Accept payments on Website** card and press **Verify Now**, or go to **Account & Settings → Website and app settings**.
2. Give them `https://vkon.in` and the pages they ask to see. The site already has everything they check for:

   - Contact details — `https://vkon.in/contact`
   - Privacy policy — `https://vkon.in/privacy`
   - Terms — `https://vkon.in/terms`
   - Refund and shipping policy — say plainly how delivery is charged and how a refund is handled; add it to the Terms page if they ask for a separate link.

3. Complete KYC if it is still open: PAN, bank account, and address proof for the individual/freelancer account.
4. Wait. Razorpay quote **three working days** for the website check. You get an email, and the dashboard stops showing *Verification required*.

### 6.2  Generate the live keys

1. Switch the dashboard from **Test Mode** to **Live Mode** using the toggle at the top.
2. **Account & Settings → API Keys → Generate Key**.
3. Copy both values now. The Key Id starts `rzp_live_`.

   - **The secret is shown once.** Razorpay only ever displays the Key Id again — if you lose the secret you must regenerate the pair, which invalidates the old one.
   - Put them somewhere safe before leaving the page. Not in this document, not in a chat.

### 6.3  Create the live webhook

**Webhooks do not carry over between modes.** Razorpay keeps separate webhooks for Test and Live, so the one from 5.2 does nothing for real payments. Create a second one while the dashboard is still in Live Mode.

1. **Account & Settings → Webhooks → Add New Webhook** (with the dashboard in **Live Mode**).
2. Fill it in exactly as in 5.2:

   - **Webhook URL** — `https://vkon.in/api/payment/webhook`
   - **Secret** — make a fresh one with `openssl rand -hex 32`. It may be the same string as the test one, but it must be typed in here as well.
   - **Active events** — tick `payment.captured`, `payment.failed`, `refund.processed` and `refund.failed`, and nothing else.

   > **Already created the live webhook with fewer events?** Open it, tick `refund.processed` and `refund.failed` as well, and save. Without `refund.processed`, a refund stays "Refund processing" in `/admin/orders` until someone presses **Check with Razorpay**, and refunds made in the Razorpay dashboard are not recorded on the order; without `refund.failed`, a refund the bank rejects stays "processing" instead of the Refund button coming back.

### 6.4  Put the three live values on the server

1. Edit the server `.env` (the same way as every other step) and replace all three at once:

   ```bash
   ssh ptz
   cd ~/project2/vkon.in
   nano .env
   
   # RAZORPAY_KEY_ID=rzp_live_...
   # RAZORPAY_KEY_SECRET=...
   # RAZORPAY_WEBHOOK_SECRET=...   <- the LIVE webhook's secret
   ```

2. Recreate the app and confirm the site is on live keys:

   ```bash
   docker compose up -d app
   docker compose exec app printenv | grep -c '^RAZORPAY_[A-Z_]*=.'
   docker compose exec app sh -c 'echo $RAZORPAY_KEY_ID | cut -c1-9'
   ```

3. The count must be **3**, and the last command must print `rzp_live_`. If it prints `rzp_test_`, the edit did not take.

### 6.5  One real payment, then a refund

1. Add a temporary low-value product in `/admin/products` — ₹1 plus GST and delivery — and publish it.
2. Buy it yourself, with a real card or UPI. **UPI gets its first genuine test here**, since test mode cannot exercise it (5.4).
3. Check it end to end:

   - The order shows **Paid** and **Confirmed**, and the receipt email arrives.
   - The payment appears in the Razorpay dashboard under **Transactions**.
   - Run the `settled_by` query from 5.5 — it proves the **live** webhook is delivering, not just the browser.

4. **Refund it** from the Razorpay dashboard, and unpublish or delete the temporary product.
5. Settlement of real payments reaches your bank account on Razorpay's own cycle — typically T+2 working days for a new account. Check **Settlements** a couple of days later.

> 💡 **When the company is registered:** a Private Limited or LLP needs a **new** Razorpay account with fresh KYC — the individual account can't be converted. The website side is just swapping these three values and recreating the webhook. For Shiprocket, ask their support in writing whether the KYC can be updated in place.

## Final checklist

| ☐ | Task |
|---|---|
| ☐ | Step 1 — Laptop code pushed; shipping webhook returns 401; 4 new product columns on the server |
| ☐ | Step 2 — Resend key and `@vkon.in` sender on the server; welcome email and reset email received |
| ☐ | Step 3 — Google keys on the server; Continue with Google works on vkon.in |
| ☐ | Step 3 — Branding verification re-requested |
| ☐ | Step 4 — Shiprocket keys on the server; delivery options show at live checkout |
| ☐ | Step 4 — Tracking webhook created; token check returns 200 |
| ☐ | Step 4 — Every product measured: real packed weight and box size replacing the estimates |
| ☐ | Step 5 — Razorpay test keys + webhook on the server; success, failure and abandon tested |
| ☐ | Step 5 — Webhook proved on its own with the close-the-tab test; `settled_by` reads `webhook` |
| ☐ | Step 6 — Website verification passed and KYC approved |
| ☐ | Step 6 — Live keys generated; server prints `rzp_live_`; live webhook created with its own secret |
| ☐ | Step 6 — One real payment taken, proved by `settled_by`, then refunded |

---

## Appendix A — Complete server .env template

The server's `.env` lives at `~/project2/vkon.in/.env`. **The first block is already set — don't change it.** In particular, changing `POSTGRES_PASSWORD` breaks the database connection.

```bash
# --- Already set on the server: leave as is ---
POSTGRES_PASSWORD=...
ADMIN_PASSWORD=...
AUTH_SECRET=...
APP_PORT=8120
SITE_URL=https://vkon.in
TUNNEL_TOKEN=...
COMPOSE_PROFILES=tunnel

# --- Step 2: Resend ---
RESEND_API_KEY=re_...
MAIL_FROM=Vkon Automation <no-reply@vkon.in>

# --- Step 3: Google (no GOOGLE_REDIRECT_URI on the server) ---
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

# --- Step 4: Shiprocket ---
SHIPROCKET_EMAIL=api_user_email
SHIPROCKET_PASSWORD=...
SHIPROCKET_PICKUP_PINCODE=xxxxxx
SHIPROCKET_PICKUP_LOCATION=work
SHIPROCKET_WEBHOOK_TOKEN=...
SHIPROCKET_NOTIFY_EMAIL=

# --- Steps 5-6: Razorpay (test keys, then live keys) ---
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

After saving: `docker compose up -d app`. Keep the file private on the server:

```bash
chmod 600 ~/project2/vkon.in/.env
```

## Appendix B — When something doesn't work

| What you see | Most likely cause | What to do |
|---|---|---|
| Works on the laptop, missing on the live site | The key isn't in the server's `.env`, or the app wasn't recreated | Add it, run `docker compose up -d app`, then the printenv check |
| Added the key but it still doesn't appear | Name misspelled, or added twice | Open `.env`, search with Ctrl+W, keep exactly one correct line |
| A secret value looks different inside the site | The value contains `$` | Make a new secret with `openssl rand -hex 32` |
| Whole site shows an error (530) | Server or tunnel down | `ssh ptz`, then `cd ~/project2/vkon.in && docker compose ps` |
| Code change not live after pushing | Automatic deploy didn't run | Run the manual deploy at the end of Step 1 |

### Useful commands on the server

```bash
ssh ptz
cd ~/project2/vkon.in

docker compose ps                       # are the containers running?
docker compose up -d app                # apply .env changes
docker compose logs --tail=100 app      # the site's recent log
curl -s localhost:8120/api/health       # does the site answer on the server?
```
