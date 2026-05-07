#!/usr/bin/env bash
#
# Add a Cloudflare WAF "skip" rule for /v1/* so that Anthropic SDK clients
# (User-Agent: Anthropic/JS, anthropic-dangerous-direct-browser-access, etc.)
# reach the origin instead of being blocked by Cloudflare managed rules.
#
# Root cause: Cloudflare Bot Fight Mode / WAF Managed Rules classify the
# Anthropic JS SDK User-Agent as a threat and return 403 before the request
# ever reaches our nginx/backend.
#
# This script creates a Custom Rule in the http_request_firewall_custom phase
# with action=skip (skips all WAF managed rules) for requests whose path starts
# with /v1/.  It is safe: the rule only affects the WAF layer; Cloudflare's
# DDoS protection and rate-limiting remain active.
#
# Usage:
#   export CF_API_TOKEN="<your-token>"   # Zone:Edit permission required
#   export CF_ZONE_ID="<your-zone-id>"   # Dashboard → your domain → Zone ID
#   ./cf-waf-skip.sh
#
# One-liner to get your Zone ID (if you have a token already):
#   curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
#     "https://api.cloudflare.com/client/v4/zones?name=maplelink.club" \
#     | python3 -m json.tool | grep '"id"' | head -1

set -euo pipefail

CF_API="${CF_API_TOKEN:-}"
CF_ZONE="${CF_ZONE_ID:-}"

if [[ -z "$CF_API" || -z "$CF_ZONE" ]]; then
  echo "ERROR: Set CF_API_TOKEN and CF_ZONE_ID before running." >&2
  echo ""
  echo "  export CF_API_TOKEN=\"<token-with-Zone:Edit>\"" >&2
  echo "  export CF_ZONE_ID=\"<zone-id-from-dashboard>\"" >&2
  echo ""
  echo "Get Zone ID:" >&2
  echo "  curl -s -H \"Authorization: Bearer \$CF_API_TOKEN\" \\" >&2
  echo "    \"https://api.cloudflare.com/client/v4/zones?name=maplelink.club\" \\" >&2
  echo "    | python3 -m json.tool | grep '\"id\"' | head -1" >&2
  exit 1
fi

BASE="https://api.cloudflare.com/client/v4"
PHASE="http_request_firewall_custom"

echo "==> Fetching current WAF custom ruleset for zone $CF_ZONE ..."
CURRENT=$(curl -s \
  -H "Authorization: Bearer $CF_API" \
  -H "Content-Type: application/json" \
  "$BASE/zones/$CF_ZONE/rulesets/phases/$PHASE/entrypoint")

SUCCESS=$(echo "$CURRENT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success','false'))")
if [[ "$SUCCESS" != "True" ]]; then
  # 404 means the phase ruleset doesn't exist yet — that's fine, we'll create it
  CODE=$(echo "$CURRENT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('errors',[{}])[0].get('code',''))" 2>/dev/null || echo "")
  if [[ "$CODE" != "10040" ]]; then   # 10040 = ruleset not found
    echo "ERROR: unexpected response:" >&2
    echo "$CURRENT" >&2
    exit 1
  fi
  echo "==> No existing custom ruleset; will create one."
  EXISTING_RULES="[]"
else
  EXISTING_RULES=$(echo "$CURRENT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['result'].get('rules',[])))")
fi

# Check if our rule already exists (by description)
ALREADY=$(echo "$EXISTING_RULES" | python3 -c "
import sys,json
rules = json.load(sys.stdin)
print(any(r.get('description','') == 'skip-waf-v1-api' for r in rules))
")
if [[ "$ALREADY" == "True" ]]; then
  echo "==> WAF skip rule already exists. Nothing to do."
  exit 0
fi

# Prepend the skip rule (evaluated first = highest priority)
NEW_RULES=$(echo "$EXISTING_RULES" | python3 -c "
import sys,json
existing = json.load(sys.stdin)
skip_rule = {
  'action': 'skip',
  'action_parameters': {
    'ruleset': 'current'
  },
  'expression': 'http.request.uri.path starts_with \"/v1/\"',
  'description': 'skip-waf-v1-api',
  'enabled': True
}
# Prepend so it runs before any block rules
print(json.dumps([skip_rule] + existing))
")

echo "==> Applying updated ruleset (skip rule prepended) ..."
RESULT=$(curl -s -X PUT \
  -H "Authorization: Bearer $CF_API" \
  -H "Content-Type: application/json" \
  "$BASE/zones/$CF_ZONE/rulesets/phases/$PHASE/entrypoint" \
  -d "{\"rules\": $NEW_RULES}")

SUCCESS=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success','false'))")
if [[ "$SUCCESS" != "True" ]]; then
  echo "ERROR: failed to update ruleset:" >&2
  echo "$RESULT" | python3 -m json.tool >&2
  exit 1
fi

echo ""
echo "==> Done! WAF skip rule created for /v1/* ."
echo ""
echo "Test (should get 401 from backend, not 403 from Cloudflare):"
echo "  curl -s -w '\\nHTTP: %{http_code}\\n' -X POST https://www.maplelink.club/v1/messages \\"
echo "    -H 'User-Agent: Anthropic/JS 0.90.0' \\"
echo "    -H 'anthropic-dangerous-direct-browser-access: true' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"model\":\"claude-sonnet-4-6\",\"max_tokens\":10,\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}'"
