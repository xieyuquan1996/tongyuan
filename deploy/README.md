# Deploy · Claude Relay

Single-host Docker Compose stack. Runs postgres + redis + backend + frontend-nginx.

## Prereqs

- Docker 24+ with Compose v2
- A VM or host with 2+ GB RAM
- Anthropic upstream key(s) ready to paste into the admin UI after first launch

## First run

```bash
cd deploy
cp .env.example .env
# Fill in SESSION_SECRET (openssl rand -hex 32)
#         UPSTREAM_KEY_KMS (openssl rand -hex 32)
#         METRICS_TOKEN  (openssl rand -hex 16)
docker compose up -d --build
```

The stack comes up in this order:
1. postgres, redis (healthchecks)
2. migrate (runs drizzle migrations, exits 0)
3. backend (port 8080 inside the network)
4. frontend (nginx on :80, proxies /api + /v1 to backend)

Smoke:
```bash
curl http://localhost/healthz       # {"ok":true}
curl http://localhost/api/public/stats
```

## Bootstrap an admin

```bash
docker compose exec postgres psql -U postgres -d claude_link -c \
  "UPDATE users SET role='admin' WHERE email='YOUR_EMAIL'"
```

Then log in via the frontend, add an upstream key at `/admin/upstream-keys`, sync models.

## Common ops

- View logs: `docker compose logs -f backend`
- Restart only the app: `docker compose restart backend`
- Backup postgres: `docker compose exec postgres pg_dump -U postgres claude_link > backup.sql`
- Update to a new version: `git pull && docker compose up -d --build`

## Security

- **Rotating `UPSTREAM_KEY_KMS` is a data migration, not a restart.** All stored upstream keys are encrypted under the current KMS key; changing it breaks decryption. If you must rotate, re-add all upstream keys via the admin UI after the change.
- **Expose `/metrics` only to your monitoring subnet.** The route is token-gated when `METRICS_TOKEN` is set; nginx forwards the Authorization header through. Add an IP allowlist in `frontend/nginx.conf` if `/metrics` is reachable from the public internet.
- **Use a reverse proxy with TLS in front.** This compose listens on plain HTTP. Put Caddy / Traefik / cloud LB in front for TLS termination.
