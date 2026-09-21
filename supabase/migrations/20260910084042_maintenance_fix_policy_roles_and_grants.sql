-- Bugfix found during Phase 1 verification: every policy created in this
-- phase was written without a TO clause, which defaults to PUBLIC — making
-- them technically anon-reachable despite the PRD's authenticated-only
-- requirement (confirmed live: anon could read a test row from `machines`).
-- Scope them to authenticated, matching the existing app-wide convention
-- (verified: catalog_items' policies are correctly {authenticated}).

ALTER POLICY "factory_worker self-provision" ON profiles TO authenticated;

ALTER POLICY "authenticated select active maintenance_periods" ON maintenance_periods TO authenticated;
ALTER POLICY "manager insert maintenance_periods" ON maintenance_periods TO authenticated;
ALTER POLICY "manager select all maintenance_periods" ON maintenance_periods TO authenticated;
ALTER POLICY "manager update maintenance_periods" ON maintenance_periods TO authenticated;

ALTER POLICY "authenticated select active maintenance_tasks" ON maintenance_tasks TO authenticated;
ALTER POLICY "manager insert maintenance_tasks" ON maintenance_tasks TO authenticated;
ALTER POLICY "manager select all maintenance_tasks" ON maintenance_tasks TO authenticated;
ALTER POLICY "manager update maintenance_tasks" ON maintenance_tasks TO authenticated;

ALTER POLICY "authenticated select active machines" ON machines TO authenticated;
ALTER POLICY "manager insert machines" ON machines TO authenticated;
ALTER POLICY "manager select all machines" ON machines TO authenticated;
ALTER POLICY "manager update machines" ON machines TO authenticated;

ALTER POLICY "authenticated select active machine_periods" ON machine_periods TO authenticated;
ALTER POLICY "manager insert machine_periods" ON machine_periods TO authenticated;
ALTER POLICY "manager select all machine_periods" ON machine_periods TO authenticated;
ALTER POLICY "manager update machine_periods" ON machine_periods TO authenticated;

ALTER POLICY "authenticated select machine_period_tasks" ON machine_period_tasks TO authenticated;
ALTER POLICY "manager delete machine_period_tasks" ON machine_period_tasks TO authenticated;
ALTER POLICY "manager insert machine_period_tasks" ON machine_period_tasks TO authenticated;
ALTER POLICY "manager select all machine_period_tasks" ON machine_period_tasks TO authenticated;
ALTER POLICY "manager update machine_period_tasks" ON machine_period_tasks TO authenticated;

ALTER POLICY "authenticated select active machine_parts" ON machine_parts TO authenticated;
ALTER POLICY "manager insert machine_parts" ON machine_parts TO authenticated;
ALTER POLICY "manager select all machine_parts" ON machine_parts TO authenticated;
ALTER POLICY "manager update machine_parts" ON machine_parts TO authenticated;

ALTER POLICY "manager select all maintenance_visits" ON maintenance_visits TO authenticated;
ALTER POLICY "own select maintenance_visits" ON maintenance_visits TO authenticated;
ALTER POLICY "worker insert own maintenance_visits" ON maintenance_visits TO authenticated;

ALTER POLICY "manager select all machine_period_logs" ON machine_period_logs TO authenticated;
ALTER POLICY "own select machine_period_logs" ON machine_period_logs TO authenticated;
ALTER POLICY "worker insert own machine_period_logs" ON machine_period_logs TO authenticated;

ALTER POLICY "manager select all machine_period_log_tasks" ON machine_period_log_tasks TO authenticated;
ALTER POLICY "own select machine_period_log_tasks" ON machine_period_log_tasks TO authenticated;
ALTER POLICY "worker insert own machine_period_log_tasks" ON machine_period_log_tasks TO authenticated;

ALTER POLICY "manager select all fault_reports" ON fault_reports TO authenticated;
ALTER POLICY "manager update fault_reports" ON fault_reports TO authenticated;
ALTER POLICY "own select fault_reports" ON fault_reports TO authenticated;
ALTER POLICY "worker insert own fault_reports" ON fault_reports TO authenticated;

ALTER POLICY "manager select all fault_report_parts" ON fault_report_parts TO authenticated;
ALTER POLICY "own select fault_report_parts" ON fault_report_parts TO authenticated;
ALTER POLICY "worker insert own fault_report_parts" ON fault_report_parts TO authenticated;

-- Bugfix: Postgres does not extend a table's existing column-level grants to
-- a column added later via ALTER TABLE. employees uses column-level grants
-- (verified live), so maintenance_access_enabled had zero privileges for
-- anon/authenticated — silently breaking the self-provisioning policy's own
-- read of it. Mirror the grant shape already used for employees.is_active.
GRANT SELECT (maintenance_access_enabled) ON employees TO anon, authenticated;
GRANT UPDATE (maintenance_access_enabled) ON employees TO authenticated;
