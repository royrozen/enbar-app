-- Bugfix: the self-provisioning policy's employees lookup was a raw EXISTS
-- subquery, which is itself subject to employees' own RLS. A prospective
-- factory_worker has no SELECT policy on employees (only factory_manager/
-- platform_admin do), so the check always evaluated false regardless of
-- matching data. Same class of problem auth_profile() already solves for
-- profiles — wrap the employees lookup the same way (SECURITY DEFINER,
-- bypasses RLS internally, exposes only a boolean).
CREATE OR REPLACE FUNCTION public.employee_access_match(p_employee_id uuid, p_phone text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = p_employee_id
      AND e.is_active
      AND e.deleted_at IS NULL
      AND e.maintenance_access_enabled
      AND e.phone = p_phone
  )
$$;

ALTER POLICY "factory_worker self-provision" ON profiles
  WITH CHECK (
    id = auth.uid()
    AND role = 'factory_worker'
    AND employee_id IS NOT NULL
    AND employee_access_match(employee_id, auth.jwt() ->> 'phone')
  );
