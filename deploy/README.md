# Deploy · 枫连 / MapleLink

Single-host Docker Compose stack behind Cloudflare. Runs postgres + redis +
backend + frontend-nginx. Nginx terminates TLS using a Cloudflare Origin
Certificate; Cloudflare's edge handles user-facing TLS, DDoS, and CDN.

## Prereqs

- Docker 24+ with Compose v2
- A VM or host with 2+ GB RAM
- Anthropic upstream key(s) ready to paste into the admin UI after first launch
- Domain on Cloudflare with proxy (orange cloud) enabled — `maplelink.club`

## First run

```bash
cd deploy
cp .env.example .env
# Fill in SESSION_SECRET (openssl rand -hex 32)
#         UPSTREAM_KEY_KMS (openssl rand -hex 32)
#         METRICS_TOKEN  (openssl rand -hex 16)

# Provide a TLS cert at certs/origin.{pem,key}. For local testing, generate
# a self-signed one (deploy.sh's bootstrap step does this automatically on a
# remote box):
mkdir -p certs
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout certs/origin.key -out certs/origin.pem \
  -days 3650 -subj '/CN=maplelink.club'

docker compose up -d --build
```

Stack startup order:
1. postgres, redis (healthchecks)
2. migrate (runs drizzle migrations, exits 0)
3. backend (port 8080 inside the network)
4. frontend (nginx on :80 + :443, proxies /api + /v1 to backend)

Smoke:
```bash
curl http://localhost/healthz                          # {"ok":true}
curl -k https://localhost/healthz                      # same, via TLS
curl http://localhost/api/public/stats
```

## Cloudflare setup

These steps go in the Cloudflare Dashboard. Do them in order — getting
SSL/TLS mode wrong is the most expensive mistake you can make (it would
expose API keys in plaintext between Cloudflare and your origin).

### 1. DNS

- `A` record `maplelink.club` → origin IP, **Proxy status: Proxied** (orange cloud)
- `CNAME` `www` → `maplelink.club`, also Proxied
- Recommended: add a Redirect Rule `www.maplelink.club/*` → `https://maplelink.club/$1` (301)
  so the apex is the canonical URL.

### 2. SSL/TLS

- Dashboard → SSL/TLS → Overview → set encryption mode to **Full (strict)**
- Dashboard → SSL/TLS → Edge Certificates → enable "Always Use HTTPS"
- Dashboard → SSL/TLS → Origin Server → "Create Certificate" → RSA 2048 → 15 years.
  Save the certificate as `deploy/certs/origin.pem` and the private key as
  `deploy/certs/origin.key` on the origin host. `chmod 600 deploy/certs/origin.key`.
- Restart the frontend to pick it up: `docker compose restart frontend`.

### 3. Disable features that break SDK traffic

- Security → Bot Fight Mode → **OFF** (or skip on `/v1/*` and `/api/*` via WAF
  Custom Rules). SDKs are non-browser HTTP clients and will be challenged otherwise.
- Speed → Optimization → Auto Minify / Rocket Loader → only matters for HTML/JS,
  but verify they don't apply to API responses.

### 4. Caching rules

- Caching → Cache Rules → add rule:
  - Match: `URI Path matches /v1/*` OR `URI Path matches /api/*`
  - Action: **Bypass cache**
- Caching → Cache Rules → optional rule for installer scripts (origin offload):
  - Match: `URI Path matches /api/install*`
  - Action: Eligible for cache, Edge TTL 5 minutes

### 5. Firewall — lock origin to Cloudflare IPs

If anyone can hit your origin IP directly on :80 or :443, they bypass
Cloudflare's WAF / DDoS / Bot Fight protection. Lock it down at the OS firewall:

```bash
# On the origin box:
sudo ./deploy/cf-firewall.sh
```

The script fetches the current Cloudflare IP list and installs UFW rules so
:80 and :443 only accept traffic from CF (SSH stays open from anywhere). It
is idempotent — re-run monthly to refresh ranges.

If your VM uses a cloud-provider firewall (AWS Security Group, GCP Firewall),
mirror the same allow-list there *in addition to* UFW.

## Bootstrap an admin

```bash
docker compose exec postgres psql -U postgres -d maplelink -c \
  "UPDATE users SET role='admin' WHERE email='YOUR_EMAIL'"
```

Then log in via the frontend, add an upstream key at `/admin/upstream-keys`, sync models.

## Common ops

- View logs: `docker compose logs -f backend`
- Restart only the app: `docker compose restart backend`
- Backup postgres: `docker compose exec postgres pg_dump -U postgres maplelink > backup.sql`
- Update to a new version: `git pull && docker compose up -d --build`
- Rotate Cloudflare Origin Cert: replace `certs/origin.{pem,key}`, then
  `docker compose restart frontend`.

## Security

- **Rotating `UPSTREAM_KEY_KMS` is a data migration, not a restart.** All stored
  upstream keys are encrypted under the current KMS key; changing it breaks
  decryption. If you must rotate, re-add all upstream keys via the admin UI
  after the change.
- **Expose `/metrics` only to your monitoring subnet.** The route is token-gated
  when `METRICS_TOKEN` is set; nginx forwards the Authorization header through.
  Add an IP allowlist in `frontend/nginx.conf` if `/metrics` is reachable from
  the public internet.
- **Never set Cloudflare SSL/TLS to "Flexible".** That mode encrypts CF↔user
  but uses plain HTTP for CF↔origin, exposing user API keys to anyone on the
  CF→origin network path. Always use **Full (strict)** with a CF Origin Cert.
