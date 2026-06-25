#!/usr/bin/env bash
# ============================================================
# Shashki Royale · Admin Audit · FIND-001 confirmation probe
# File:  scripts/audit/probe_anon_rpc.sh
#
# Confirms whether the three admin_* SECURITY DEFINER RPCs are
# callable by an anonymous client using the publishable anon
# key embedded in the production browser bundle.
#
# BEFORE Phase 0 REVOKE  → expects HTTP 200/400/409 (FUNCTION EXECUTED)
# AFTER  Phase 0 REVOKE  → expects HTTP 401/403 with
#                          "permission denied for function ..."
#
# All three probes use FAKE uuids (00000000-0000-0000-0000-000000000000)
# so even before the fix they are no-ops (no real player is touched).
# ============================================================
set -euo pipefail

ADMIN_URL="${ADMIN_URL:-https://shashki-royale-admin.pages.dev}"
SUPA="${SUPA:-https://jsykbnkbrwwsxcdurzcw.supabase.co}"

INDEX=$(curl -s -m 10 "$ADMIN_URL/")
JS_PATH=$(echo "$INDEX" | grep -oE 'src="/assets/[^"]+\.js"' | head -1 | sed 's/src="//;s/"//')
JS_BODY=$(curl -s -m 15 "$ADMIN_URL$JS_PATH")
ANON=$(echo "$JS_BODY" | grep -oE 'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' | head -1)
if [ -z "$ANON" ]; then
  echo "Could not extract anon key from $ADMIN_URL$JS_PATH"
  exit 2
fi
echo "Anon key length: ${#ANON}"
echo

probe () {
  local fn=$1; shift
  local body=$1; shift
  echo "==> POST /rest/v1/rpc/$fn"
  curl -s -i -m 10 -X POST "$SUPA/rest/v1/rpc/$fn" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
    -d "$body" | sed -n '1p;/^{/,/^$/p' | head -20
  echo
}

probe admin_grant_coin     '{"p_profile_id":"00000000-0000-0000-0000-000000000000","p_amount":1,"p_reason":"audit_probe","p_actor":"audit"}'
probe admin_refund_stake   '{"p_stake_id":"00000000-0000-0000-0000-000000000000","p_reason":"audit_probe","p_actor":"audit"}'
probe admin_set_suspension '{"p_profile_id":"00000000-0000-0000-0000-000000000000","p_hours":0,"p_reason":"audit_probe","p_actor":"audit"}'

echo "If you see HTTP 200/400/409 above, FIND-001 is OPEN."
echo "If you see HTTP 401/403 with 'permission denied for function', FIND-001 is CLOSED."
