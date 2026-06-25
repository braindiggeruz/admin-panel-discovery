# Test spec — FIND-007 login timing oracle fix

## Goal

The `/api/auth/login` endpoint must not reveal whether an email is a
valid admin email through response timing.

## Test command

```bash
ADMIN_URL=https://shashki-royale-admin.pages.dev
for label in wrong_email:nobody@nowhere.tld wrong_password:owner@damkaroyal.app; do
  name="${label%%:*}"; email="${label##*:}"
  for i in 1 2 3 4 5; do
    T0=$(date +%s%N)
    curl -s -o /dev/null -m 10 -X POST "$ADMIN_URL/api/auth/login" \
      -H 'content-type: application/json' \
      -d "{\"email\":\"$email\",\"password\":\"WRONG\"}"
    T1=$(date +%s%N)
    echo "$name #$i: $(( (T1-T0)/1000000 ))ms"
  done
done
```

## Acceptance criteria

- Mean latency for `wrong_email` minus mean latency for
  `wrong_password` is **≤ 50 ms** (network jitter band).
- No branch in code short-circuits PBKDF2 verification before the
  email check.
