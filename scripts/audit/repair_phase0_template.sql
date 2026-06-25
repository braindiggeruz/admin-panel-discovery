-- ============================================================
-- Shashki Royale · Admin Audit · Phase-0 REPAIR TEMPLATE
-- File:  scripts/audit/repair_phase0_template.sql
--
-- !!! THIS FILE IS A TEMPLATE. DO NOT auto-apply.                !!!
-- !!! Review every statement, then run via Supabase SQL Editor   !!!
-- !!! manually as the operator with service_role context.        !!!
--
-- Closes FIND-001 (anonymous RPC abuse) and FIND-035 (Sprint 4
-- migration grants EXECUTE without REVOKE).
-- ============================================================

-- (0) Snapshot — recommend a logical backup BEFORE applying.

-- (1) Revoke EXECUTE from every role that should not call admin_*
REVOKE ALL ON FUNCTION public.admin_grant_coin(uuid, numeric, text, text)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_grant_coin(uuid, numeric, text, text)     FROM anon;
REVOKE ALL ON FUNCTION public.admin_grant_coin(uuid, numeric, text, text)     FROM authenticated;

REVOKE ALL ON FUNCTION public.admin_refund_stake(uuid, text, text)            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_refund_stake(uuid, text, text)            FROM anon;
REVOKE ALL ON FUNCTION public.admin_refund_stake(uuid, text, text)            FROM authenticated;

REVOKE ALL ON FUNCTION public.admin_set_suspension(uuid, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_suspension(uuid, integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_set_suspension(uuid, integer, text, text) FROM authenticated;

-- (2) Regrant ONLY to service_role
GRANT EXECUTE ON FUNCTION public.admin_grant_coin(uuid, numeric, text, text)     TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_refund_stake(uuid, text, text)            TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_suspension(uuid, integer, text, text) TO service_role;

-- (3) Reload PostgREST schema cache so OpenAPI reflects new grants
NOTIFY pgrst, 'reload schema';

-- (4) Verification — run after applying, expect three rows with
--     acl_list = {service_role=EXECUTE} ONLY.
SELECT
  p.proname,
  pg_get_function_arguments(p.oid) AS args,
  array(
    SELECT format('%s=%s', acl.grantee::regrole::text, acl.privilege_type)
    FROM aclexplode(p.proacl) acl
  ) AS acl_list
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('admin_grant_coin','admin_refund_stake','admin_set_suspension')
ORDER BY p.proname;

-- (5) Re-run the anon-RPC probes against production. Expected:
--     HTTP 401 / 403 with "permission denied for function ...".
--     See scripts/audit/probe_anon_rpc.sh.
