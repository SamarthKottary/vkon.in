# Deploying vkon.in

From an empty GitHub repo to `https://vkon.in` live, on your own server, with
push-to-deploy.

Assumes the deploy console from `docs/Hosting.md` is already installed and its
agent is running. Where that doc says `~/project2` and user `ptz`, substitute
your own paths.

**Time:** about 45 minutes, most of it waiting for DNS and the first build.

---

## Before you start

Have these to hand:

- [ ] The GitHub repo you created — `vkon.in`
- [ ] SSH access to the server, as the user that owns the deploy projects
- [ ] The domain `vkon.in` in a Cloudflare account
- [ ] The deploy console URL and login

Generate the four secrets now and paste them somewhere safe — you will need
them in Step 4:

```bash
openssl rand -hex 24     # POSTGRES_PASSWORD
openssl rand -hex 32     # AUTH_SECRET
openssl rand -hex 32     # webhook secret
# and pick a strong ADMIN_PASSWORD
```

> **Never use a value containing `$`.** Docker Compose interpolates it and
> silently mangles the value — the trap in `docs/Hosting.md` §7.1. Hex output
> from the commands above is always safe.

---

## Step 1 — Push the code

From this machine (your authoring copy — **not** the server):

```bash
cd ~/Projects/vkon.in_webpage

git init                                   # already done if .git exists
git add -A
git commit -m "vkon.in — catalogue, admin, dark mode, self-hosted deploy"

git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/vkon.in.git
git push -u origin main
```

If the remote already exists: `git remote set-url origin https://github.com/YOUR_USERNAME/vkon.in.git`

**What is deliberately not pushed:** `cicd/` (see Step 5), `.env`,
`docs/Hosting.md`, `docs/cicd.md` and `docs/Poster.pdf`. The two host docs
contain your Cloudflare tunnel UUIDs and internal hostnames, so they must not
reach a public repo. If the repo is private and you want them tracked, delete
those three lines from the bottom of `.gitignore`.

---

## Step 2 — Clone onto the server

The clone must be a **direct child** of a scanned root — one level deep, no
nesting. Check where that is:

```bash
grep -n "PROJECT_ROOTS" ~/project2/nivixsa-cicd/agent/cicd_agent.py
```

Then:

```bash
cd ~/project2
git -c credential.helper= clone https://github.com/YOUR_USERNAME/vkon.in.git
cd vkon.in
```

Private repo? Set up a read-only deploy key first — `docs/cicd.md` →
*Private repos*. The agent can never use your account-wide token, by design.

---

## Step 3 — Pick a port

The app binds to `127.0.0.1` only; the tunnel is what exposes it. Confirm 8120
is free:

```bash
ss -ltn | grep 8120 || echo "8120 is free"
```

If it is taken, choose another and use it consistently in Steps 4, 5 and 6.

---

## Step 4 — Provision secrets

```bash
cd ~/project2/vkon.in
cp .env.example .env
nano .env
chmod 600 .env
```

Fill in:

```ini
POSTGRES_PASSWORD=<openssl rand -hex 24>
ADMIN_PASSWORD=<your strong password, no $>
AUTH_SECRET=<openssl rand -hex 32>
APP_PORT=8120
SITE_URL=https://vkon.in
```

`.env` is gitignored and lives only on the server. Every future deploy reuses
it — the agent only fast-forwards, it never wipes the working directory.

---

## Step 5 — Create the deploy contract

`cicd/` is gitignored, so it does not arrive with the clone. That is the
security control: if `deploy.sh` were in the repo, anyone who could push could
change what your server executes. Copy it across from this machine:

```bash
# from your laptop
scp -r ~/Projects/vkon.in_webpage/cicd USER@SERVER:~/project2/vkon.in/
```

Then on the server, fix the permissions and fill in the config:

```bash
cd ~/project2/vkon.in
chmod 755 cicd/deploy.sh cicd/verify.sh
chmod 600 cicd/config.json
nano cicd/config.json
```

```json
{
  "name": "Vkon.in",
  "branch": "main",
  "health_url": "http://127.0.0.1:8120/api/health",
  "site_url": "https://vkon.in",
  "repo_url": "https://github.com/YOUR_USERNAME/vkon.in",
  "webhook_secret": "<openssl rand -hex 32>",
  "timeout": 1800
}
```

> `health_url` must be `/api/health`, **not** `/`. Public pages fail soft, so
> the home page returns 200 even with the database completely down — probing it
> would mark a broken deploy healthy. This is not hypothetical; it happened
> during development.

**Keep a copy of `cicd/` somewhere.** Git will not back it up.

---

## Step 6 — First deploy, by hand

Do this once manually. If it does not work by hand it will not work from the
console, and you would be debugging two things at once.

```bash
cd ~/project2/vkon.in
bash cicd/deploy.sh     # builds, waits for Postgres, applies the schema, restarts
bash cicd/verify.sh     # must end with "[verify] healthy"
```

Expect ~2–4 minutes for the first build (cold cache), ~40s after that.

Check it yourself:

```bash
curl -s http://127.0.0.1:8120/api/health
# {"status":"ok","database":"ok","products":0,"latencyMs":2}
```

Optionally add the demo product to see something on the page:

```bash
docker compose exec -T db psql -U vkon -d vkon -c "select count(*) from products;"
```

If `deploy.sh` fails, the message says which step. `docker compose logs app`
and `docker compose logs db` have the detail.

---

## Step 7 — Cloudflare Tunnel

This is what puts it on the internet. **Do not touch the existing tunnels** —
`docs/Hosting.md` §2 lists three that must be left alone.

1. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel**
2. Choose **Cloudflared**, name it `vkon`, **Save**
3. Copy the token — the long string after `--token` in the install command
4. **Public Hostname** tab → **Add a public hostname**:

   | Field | Value |
   |---|---|
   | Subdomain | *(leave empty)* |
   | Domain | `vkon.in` |
   | Path | *(leave empty)* |
   | Type | `HTTP` |
   | URL | `127.0.0.1:8120` |

5. Add a second hostname for `www`: Subdomain `www`, same Type and URL.

Cloudflare creates the DNS records itself — **do not add them by hand.**

Then run the connector on the server:

```bash
sudo cloudflared service install <PASTE_TOKEN>
sudo systemctl status cloudflared
```

> If `cloudflared` is already installed for another tunnel, do **not** re-run
> `service install` — it would replace the existing connector. Instead run this
> tunnel as a second, separately-named service, or add it to that tunnel's
> config file. Getting this wrong takes down the PTZ tunnel.

---

## Step 8 — Domain settings

For `vkon.in` in the Cloudflare dashboard:

1. **DNS** — confirm two records exist, both **Proxied** (orange cloud):
   `vkon.in` and `www.vkon.in`, created by the tunnel in Step 7.
2. If the domain is not on Cloudflare yet: add the site, then change the
   nameservers at your registrar to the two Cloudflare gives you. Propagation
   is usually under an hour, occasionally up to 24.
3. **SSL/TLS → Overview** → set the mode to **Full**.
   *Not* Flexible: that leaves Cloudflare→server traffic unencrypted. Not
   Full (strict) either, since the tunnel terminates TLS at Cloudflare and the
   origin is plain HTTP on loopback.
4. **SSL/TLS → Edge Certificates** → turn **Always Use HTTPS** on.
5. **Rules → Redirect Rules** → add `www.vkon.in/*` → `https://vkon.in/$1`,
   301, so you have one canonical hostname.

Verify:

```bash
curl -sI https://vkon.in | head -3
curl -s  https://vkon.in/api/health
```

---

## Step 9 — Put it under the console

The project appears as a tab within 60 seconds of `cicd/` existing.

```bash
python3 -c "
import json
for p in json.load(open('$HOME/project2/nivixsa-cicd/control/projects.json'))['projects']:
    print(f\"{p['id']:20} eligible={p['eligible']}  {p['reason'] or p['branch']}\")"
```

Not eligible? The **Projects** tab states exactly why. The usual causes are a
missing `cicd/deploy.sh`, a group- or world-writable script (`chmod 755`), or
the clone not being a direct child of a scanned root.

For the first console deploy press **Force rebuild**, not Pull & Deploy — a
checkout already in sync reports "up to date" and does nothing.

---

## Step 10 — Push-to-deploy

Without a webhook, new commits are only noticed when the agent restarts.

GitHub repo → **Settings → Webhooks → Add webhook**:

| Field | Value |
|---|---|
| Payload URL | the URL shown on the project's tab in the console |
| Content type | `application/json` |
| Secret | the `webhook_secret` from `cicd/config.json` |
| Events | *Let me select individual events* → tick **only** Pushes |

GitHub sends a test ping immediately; a green tick means it is live.

Optionally set the project to **auto deploy** in the console so a push goes
live without a button press.

---

## Step 11 — Make it yours

The site is live but still carries placeholder content:

```bash
grep -rn "TODO(vkon)" src/
```

In priority order:

1. **`src/content/site.ts`** — phone, WhatsApp, email, address, hours. These
   feed the structured data Google can show directly in search results.
2. **Delete the demo product** at `https://vkon.in/admin`.
3. **Add real products** with real photography.
4. **About page copy** — written generically because the specifics are yours.

Commit those from **this** machine and push. Never commit in
`~/project2/vkon.in` — the console treats the checked-out SHA as "what is
deployed", so committing there makes it report "up to date" while the running
container is still built from the previous commit.

---

## Everyday operations

```bash
cd ~/project2/vkon.in

docker compose ps
docker compose logs -f app
curl -s http://127.0.0.1:8120/api/health

bash cicd/deploy.sh          # manual build + restart
bash cicd/verify.sh          # health gate
docker compose restart app   # no rebuild
```

**Back up the database.** The `vkon-pgdata` volume is the only copy of your
catalogue. Nothing does this for you yet:

```bash
docker compose exec -T db pg_dump -U vkon vkon | gzip > ~/backups/vkon-$(date +%F).sql.gz
```

Worth a nightly cron, with the output going somewhere off this machine.

Uploaded images live in the `vkon-uploads` volume:

```bash
docker run --rm -v vkonin_vkon-uploads:/src -v ~/backups:/dst alpine \
  tar czf /dst/vkon-uploads-$(date +%F).tar.gz -C /src .
```

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `deploy.sh`: "`.env` is missing" | Step 4 |
| Build fails on `npm ci` | `package-lock.json` out of sync — commit it |
| `verify.sh`: "database unhealthy" | `docker compose logs db`. If it says *does not support SSL*, set `DATABASE_SSL=disable` in `.env` |
| Site loads, catalogue always empty | The database is unreachable and reads are failing soft. Check `/api/health` — it will say so |
| Admin login always fails | `ADMIN_PASSWORD` or `AUTH_SECRET` empty or contains `$`. Regenerate with `openssl rand -hex 32`, then `docker compose up -d --force-recreate app` |
| Uploads vanish after deploy | The `vkon-uploads` volume is not mounted — check `docker compose config` |
| `vkon.in` shows Cloudflare error 1033 | The tunnel has no connector: `sudo systemctl status cloudflared` |
| `vkon.in` shows error 502 | The tunnel is up but the app is not. `docker compose ps`, then the logs |
| Console says "up to date" but the site is stale | Use **Force rebuild**. `deploy` skips the build when git is already in sync |
| Deploy fails at `merge` | Something was committed in the deploy directory, or a local edit conflicts. Fix by hand; the agent never force-resets |
