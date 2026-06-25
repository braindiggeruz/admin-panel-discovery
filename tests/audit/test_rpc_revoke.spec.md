# Test spec — FIND-001 REVOKE acceptance

## Goal

After applying `scripts/audit/repair_phase0_template.sql`, all three
admin SECURITY DEFINER RPCs must be callable by `service_role` only.

## Test commands

```bash
# (1) verify directly against production
./scripts/audit/probe_anon_rpc.sh
# expected: each POST returns HTTP 401 or 403 with body containing
# "permission denied for function admin_*"
```

## Acceptance criteria

1. `probe_anon_rpc.sh` shows no `HTTP/2 200`, no `409`, no `400 P0001`
   on any of the three RPCs.
2. `scripts/audit/diag_grants.sql` returns `acl_list = {service_role=EXECUTE}`
   for each function.
3. Authenticated admin flow through `/api/admin/players/:id/grant-coin`
   (and the other two endpoints) still succeeds end-to-end against staging.
4. `supabase/admin_sprint4.sql` is updated to include the REVOKE block
   so the next apply does not regress.

## Negative test (regression guard)

Re-deploy `admin_sprint4.sql` as-is to a throwaway environment. The
RPCs must STILL be callable only by `service_role` (because the
updated file now contains REVOKE statements). If they are callable
by `anon`/`authenticated`, the regression guard failed.
