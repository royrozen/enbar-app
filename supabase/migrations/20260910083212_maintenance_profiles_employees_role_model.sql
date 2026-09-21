-- PRD §4.0 — extend profiles role model, add employee link, employees access toggle
ALTER TABLE profiles
  DROP CONSTRAINT profiles_role_check,
  ADD CONSTRAINT profiles_role_check
    CHECK (role = ANY (ARRAY['team_lead','factory_manager','factory_worker','platform_admin']::text[])),
  ADD COLUMN employee_id uuid REFERENCES employees(id);

ALTER TABLE profiles
  DROP CONSTRAINT team_lead_link_required,
  ADD CONSTRAINT role_link_required CHECK (
    ((role = 'team_lead') AND (team_lead_id IS NOT NULL) AND (employee_id IS NULL)) OR
    ((role = 'factory_worker') AND (employee_id IS NOT NULL) AND (team_lead_id IS NULL)) OR
    ((role IN ('factory_manager','platform_admin')) AND (team_lead_id IS NULL) AND (employee_id IS NULL))
  );

ALTER TABLE employees
  ADD COLUMN maintenance_access_enabled boolean NOT NULL DEFAULT true;

-- Self-provisioning INSERT policy (PRD §4.0) — the ONLY new client-writable
-- path into profiles; role pinned to factory_worker, employees match checked
-- entirely inside the policy, not left to the application layer.
CREATE POLICY "factory_worker self-provision" ON profiles
  FOR INSERT
  WITH CHECK (
    id = auth.uid()
    AND role = 'factory_worker'
    AND employee_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = employee_id
        AND e.is_active
        AND e.deleted_at IS NULL
        AND e.maintenance_access_enabled
        AND e.phone = (auth.jwt() ->> 'phone')
    )
  );

-- Extend the existing manager-update policy to cover the two new roles
-- (found missing in the comprehension check) — additive only, factory_manager
-- rows themselves stay out of scope for this policy, as before.
ALTER POLICY "manager update team_lead profiles" ON profiles
  USING (
    (SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager'
    AND role IN ('team_lead','factory_worker','platform_admin')
  )
  WITH CHECK (
    (SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager'
    AND role IN ('team_lead','factory_worker','platform_admin')
  );
