-- §6.4 visit history (append-only)
CREATE TABLE maintenance_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid NOT NULL REFERENCES machines(id),
  profile_id uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE machine_period_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES maintenance_visits(id),
  machine_period_id uuid NOT NULL REFERENCES machine_periods(id),
  due_date_snapshot date NOT NULL,
  fully_completed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE machine_period_log_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id uuid NOT NULL REFERENCES machine_period_logs(id),
  task_id uuid NOT NULL REFERENCES maintenance_tasks(id),
  is_checked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- §6.5 parts catalog (per machine, static reference data)
CREATE TABLE machine_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid NOT NULL REFERENCES machines(id),
  part_seq integer,
  part_no text UNIQUE,
  name text NOT NULL,
  store_name text,
  store_phone text,
  store_sku text,
  purchase_price numeric,
  purchase_date date,
  shelf_location text,
  quantity integer,
  photo_storage_path text,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_part_no() RETURNS TRIGGER AS $$
DECLARE
  next_seq INTEGER;
  m_no INTEGER;
BEGIN
  PERFORM 1 FROM machines WHERE id = NEW.machine_id FOR UPDATE;
  SELECT machine_no INTO m_no FROM machines WHERE id = NEW.machine_id;
  SELECT COALESCE(MAX(part_seq), 0) + 1 INTO next_seq FROM machine_parts WHERE machine_id = NEW.machine_id;
  NEW.part_seq := next_seq;
  NEW.part_no := to_char(m_no, 'FM000') || '_' || next_seq;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_part_no BEFORE INSERT ON machine_parts
  FOR EACH ROW EXECUTE FUNCTION set_part_no();

-- §6.6 fault / breakage reports
CREATE TABLE fault_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fault_no integer GENERATED ALWAYS AS IDENTITY (START WITH 1) UNIQUE,
  machine_id uuid NOT NULL REFERENCES machines(id),
  description text NOT NULL,
  photo_storage_path text,
  severity text NOT NULL CHECK (severity IN ('low','medium','high','urgent')),
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','awaiting_part','part_ordered','in_progress','resolved','rejected')),
  status_updated_by text,
  reminder_date date,
  reported_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fault_report_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fault_report_id uuid NOT NULL REFERENCES fault_reports(id),
  part_id uuid NOT NULL REFERENCES machine_parts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fault_report_id, part_id)
);

-- RLS
ALTER TABLE maintenance_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_period_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_period_log_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fault_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE fault_report_parts ENABLE ROW LEVEL SECURITY;

-- machine_parts: manager manages, any authenticated session reads active rows
-- (needed for the fault-report parts picker, §7.5)
CREATE POLICY "manager select all machine_parts" ON machine_parts FOR SELECT
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "manager insert machine_parts" ON machine_parts FOR INSERT
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "manager update machine_parts" ON machine_parts FOR UPDATE
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'))
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "authenticated select active machine_parts" ON machine_parts FOR SELECT
  USING (is_active AND deleted_at IS NULL);

-- maintenance_visits: insert gated by maintenance_access(); append-only (no update/delete policy)
CREATE POLICY "worker insert own maintenance_visits" ON maintenance_visits FOR INSERT
  WITH CHECK (
    profile_id = auth.uid()
    AND EXISTS (SELECT 1 FROM maintenance_access() a WHERE a.uid = auth.uid() AND a.has_access)
  );
CREATE POLICY "manager select all maintenance_visits" ON maintenance_visits FOR SELECT
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "own select maintenance_visits" ON maintenance_visits FOR SELECT
  USING (profile_id = auth.uid());

-- machine_period_logs: insert only against a visit the caller owns; append-only
CREATE POLICY "worker insert own machine_period_logs" ON machine_period_logs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM maintenance_visits v WHERE v.id = visit_id AND v.profile_id = auth.uid()));
CREATE POLICY "manager select all machine_period_logs" ON machine_period_logs FOR SELECT
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "own select machine_period_logs" ON machine_period_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM maintenance_visits v WHERE v.id = visit_id AND v.profile_id = auth.uid()));

-- machine_period_log_tasks: insert only against a log the caller owns (via visit); append-only
CREATE POLICY "worker insert own machine_period_log_tasks" ON machine_period_log_tasks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM machine_period_logs l
    JOIN maintenance_visits v ON v.id = l.visit_id
    WHERE l.id = log_id AND v.profile_id = auth.uid()
  ));
CREATE POLICY "manager select all machine_period_log_tasks" ON machine_period_log_tasks FOR SELECT
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "own select machine_period_log_tasks" ON machine_period_log_tasks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM machine_period_logs l
    JOIN maintenance_visits v ON v.id = l.visit_id
    WHERE l.id = log_id AND v.profile_id = auth.uid()
  ));

-- fault_reports: insert gated by maintenance_access(); only manager updates status/reminder
CREATE POLICY "worker insert own fault_reports" ON fault_reports FOR INSERT
  WITH CHECK (
    reported_by = auth.uid()
    AND EXISTS (SELECT 1 FROM maintenance_access() a WHERE a.uid = auth.uid() AND a.has_access)
  );
CREATE POLICY "manager select all fault_reports" ON fault_reports FOR SELECT
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "own select fault_reports" ON fault_reports FOR SELECT
  USING (reported_by = auth.uid());
CREATE POLICY "manager update fault_reports" ON fault_reports FOR UPDATE
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'))
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));

-- fault_report_parts: insert only against a fault_reports row the caller owns
CREATE POLICY "worker insert own fault_report_parts" ON fault_report_parts FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM fault_reports fr WHERE fr.id = fault_report_id AND fr.reported_by = auth.uid()));
CREATE POLICY "manager select all fault_report_parts" ON fault_report_parts FOR SELECT
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "own select fault_report_parts" ON fault_report_parts FOR SELECT
  USING (EXISTS (SELECT 1 FROM fault_reports fr WHERE fr.id = fault_report_id AND fr.reported_by = auth.uid()));

-- storage buckets (§9 — two new, public-read, not a reuse of report-photos)
INSERT INTO storage.buckets (id, name, public) VALUES
  ('machine-parts', 'machine-parts', true),
  ('fault-reports', 'fault-reports', true);
