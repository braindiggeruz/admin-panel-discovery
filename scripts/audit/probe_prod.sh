#!/usr/bin/env bash
# ============================================================
# Shashki Royale · Admin Audit · Non-destructive production probes
# File:  scripts/audit/probe_prod.sh
#
# Re-runs the live HTTP probes used to generate ADMIN_AUDIT_EVIDENCE.md.
# Run this script:
#   - BEFORE Phase 0 to baseline.
#   - AFTER  Phase 0 to confirm the verdict has changed.
#
# This script:
#   * does NOT log in to /api/auth/login;
#   * does NOT POST to mutation endpoints;
#   * does NOT touch /rpc/admin_* (use probe_anon_rpc.sh for that).
# ============================================================
set -euo pipefail

ADMIN_URL="${ADMIN_URL:-https://shashki-royale-admin.pages.dev}"

echo "==> GET /api/health"
curl -s -i -m 10 "$ADMIN_URL/api/health" | sed -n '1,20p'
echo

echo "==> HEAD /"
curl -s -I -m 10 "$ADMIN_URL/" | sed -n '1,25p'
echo

echo "==> GET /api/auth/me (no token)  expect 401"
curl -s -i -m 10 "$ADMIN_URL/api/auth/me" | sed -n '1,5p'
echo

echo "==> GET /api/auth/me (malformed token)  expect 401"
curl -s -i -m 10 -H "Authorization: Bearer not.a.jwt" "$ADMIN_URL/api/auth/me" | sed -n '1,5p'
echo

echo "==> GET /api/admin/wallets/summary (no token)  expect 401"
curl -s -i -m 10 "$ADMIN_URL/api/admin/wallets/summary" | sed -n '1,5p'
echo

echo "==> Source map exposure  expect 404 after FIND-005 fix"
JS_PATH=$(curl -s -m 10 "$ADMIN_URL/" | grep -oE 'src="/assets/[^"]+\.js"' | head -1 | sed 's/src="//;s/"//')
[ -n "$JS_PATH" ] && curl -s -o /dev/null -w "  %{http_code}  $ADMIN_URL${JS_PATH}.map\n" -m 5 "$ADMIN_URL${JS_PATH}.map"
echo

echo "==> Login timing oracle probe  expect ~equal latency after FIND-007 fix"
for label in wrong_email:nobody@nowhere.tld wrong_password:owner@damkaroyal.app; do
  name="${label%%:*}"; email="${label##*:}"
  for i in 1 2 3; do
    T0=$(date +%s%N)
    curl -s -o /dev/null -m 10 -X POST "$ADMIN_URL/api/auth/login" \
      -H 'content-type: application/json' \
      -d "{\"email\":\"$email\",\"password\":\"WRONG_FOR_PROBE_ONLY\"}"
    T1=$(date +%s%N)
    echo "  $name #$i: $(( (T1-T0)/1000000 ))ms"
  done
done

echo "Done."
