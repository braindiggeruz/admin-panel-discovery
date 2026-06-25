-- ============================================================
-- Shashki Royale · Admin Audit · Read-only diagnostic
-- File:  scripts/audit/diag_grants.sql
-- Goal:  Verify FIND-001 — list which roles have EXECUTE on the
--        Sprint 4 admin_* functions in production.
-- Touches: NOTHING. Read-only.
-- ============================================================

SELECT
  n.nspname                       AS schema,
  p.proname                       AS function,
  pg_get_function_identity_arguments(p.oid) AS args,
  r.rolname                       AS grantee,
  has_function_privilege(r.oid, p.oid, 'EXECUTE') AS can_execute,
  p.prosecdef                     AS security_definer,
  pg_get_userbyid(p.proowner)     AS owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN pg_roles r
WHERE p.proname IN ('admin_grant_coin','admin_refund_stake','admin_set_suspension')
  AND r.rolname IN ('anon','authenticated','service_role','postgres','PUBLIC')
ORDER BY p.proname, r.rolname;

-- Equivalent textual probe:
SELECT
  p.proname,
  pg_get_function_arguments(p.oid) AS args,
  array(
    SELECT format('%s=%s', acl.grantee::regrole::text, acl.privilege_type)
    FROM aclexplode(p.proacl) acl
  ) AS acl_list,
  p.prosecdef AS sec_def,
  p.proconfig AS settings,
  pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('admin_grant_coin','admin_refund_stake','admin_set_suspension')
ORDER BY p.proname;

-- Expected after Phase 0 fix: acl_list contains ONLY service_role=EXECUTE.
-- If PUBLIC=EXECUTE appears, FIND-001 is still open.
