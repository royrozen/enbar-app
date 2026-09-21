-- Phase 5: a factory_worker has no profiles row yet at first login, and
-- `employees` is manager-only SELECT — so the client has no way to look up
-- its own employee_id/name to build the self-provisioning INSERT. This
-- SECURITY DEFINER function resolves strictly the CALLER's own phone (taken
-- from their JWT, never a parameter, so it can't be used to probe other
-- phones) against the same active/enabled predicate the Phase 1
-- self-provisioning RLS policy already trusts via employee_access_match().
CREATE OR REPLACE FUNCTION public.resolve_own_employee()
RETURNS TABLE(employee_id uuid, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.name
  FROM employees e
  WHERE e.phone = (auth.jwt() ->> 'phone')
    AND e.is_active
    AND e.deleted_at IS NULL
    AND e.maintenance_access_enabled
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.resolve_own_employee() TO authenticated;
