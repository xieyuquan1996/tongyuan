#!/usr/bin/env bash
#
# Lock the origin server's UFW firewall so :80 and :443 only accept traffic
# from Cloudflare IP ranges. Without this, an attacker who learns the origin
# IP can bypass Cloudflare's WAF / DDoS / Bot Fight by hitting the server
# directly.
#
# Run this ON THE ORIGIN BOX, not from your laptop.
#
#   curl -fsSL https://raw.githubusercontent.com/<you>/maplelink/main/deploy/cf-firewall.sh | sudo bash
#   # or, if you've scp'd the script over:
#   sudo ./cf-firewall.sh
#
# Idempotent: re-running refreshes rules to match the current CF IP list.
# Re-run monthly (or wire into cron) — Cloudflare changes IP ranges rarely
# but it does happen.
#
# Required: ufw, curl. Tested on Ubuntu 22.04 / 24.04 (Lightsail default).

set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "ERROR: must run as root (sudo)." >&2
  exit 1
fi

if ! command -v ufw >/dev/null 2>&1; then
  echo "==> installing ufw..."
  apt-get update -qq
  apt-get install -y ufw
fi

CF_V4_URL="https://www.cloudflare.com/ips-v4"
CF_V6_URL="https://www.cloudflare.com/ips-v6"

echo "==> fetching current Cloudflare IP ranges..."
V4="$(curl -fsSL "$CF_V4_URL")"
V6="$(curl -fsSL "$CF_V6_URL")"

if [[ -z "$V4" || -z "$V6" ]]; then
  echo "ERROR: failed to fetch CF IP lists; aborting." >&2
  exit 1
fi

echo "==> wiping old maplelink-cf rules..."
# UFW doesn't tag rules; we identify them by comment via 'ufw status numbered'
# and delete in reverse order.
mapfile -t LINES < <(ufw status numbered | grep 'maplelink-cf' | awk -F'[][]' '{print $2}' | sort -rn)
for n in "${LINES[@]}"; do
  yes | ufw delete "$n" >/dev/null
done

echo "==> installing fresh rules..."
# 22 (SSH) — keep open from anywhere; lock down via key auth or jumphost.
ufw allow 22/tcp comment 'maplelink-cf ssh'

while IFS= read -r cidr; do
  [[ -z "$cidr" ]] && continue
  ufw allow from "$cidr" to any port 80  proto tcp comment 'maplelink-cf http'  >/dev/null
  ufw allow from "$cidr" to any port 443 proto tcp comment 'maplelink-cf https' >/dev/null
done <<< "$V4"

while IFS= read -r cidr; do
  [[ -z "$cidr" ]] && continue
  ufw allow from "$cidr" to any port 80  proto tcp comment 'maplelink-cf http'  >/dev/null
  ufw allow from "$cidr" to any port 443 proto tcp comment 'maplelink-cf https' >/dev/null
done <<< "$V6"

# Default deny inbound — anything not matched above is dropped.
ufw default deny incoming
ufw default allow outgoing

# Enable (idempotent — won't error if already enabled)
ufw --force enable

echo ""
echo "==> done. summary:"
ufw status verbose | head -30
echo ""
echo "Verify from outside CF (should fail):"
echo "  curl --connect-timeout 5 http://<origin-ip>/healthz"
echo "Verify via CF (should succeed):"
echo "  curl https://maplelink.club/healthz"
