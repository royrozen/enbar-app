-- PRD §5 — pure, testable Saturday-shift next-due-date calculator
CREATE OR REPLACE FUNCTION public.compute_next_due_date(
  p_schedule_kind text,
  p_current_due date,
  p_weekday integer DEFAULT NULL,
  p_day_of_month integer DEFAULT NULL,
  p_anchor_month integer DEFAULT NULL,
  p_anchor_day integer DEFAULT NULL,
  p_interval_years integer DEFAULT 1
) RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result date;
BEGIN
  IF p_schedule_kind = 'weekly' THEN
    result := p_current_due + 7;
  ELSIF p_schedule_kind = 'monthly' THEN
    result := (date_trunc('month', p_current_due) + interval '1 month' + ((p_day_of_month - 1) || ' days')::interval)::date;
    IF EXTRACT(DOW FROM result) = 6 THEN
      result := result + 1;
    END IF;
  ELSIF p_schedule_kind = 'yearly' THEN
    result := make_date((EXTRACT(YEAR FROM p_current_due)::int + p_interval_years), p_anchor_month, p_anchor_day);
    IF EXTRACT(DOW FROM result) = 6 THEN
      result := result + 1;
    END IF;
  ELSE
    RAISE EXCEPTION 'unknown schedule_kind: %', p_schedule_kind;
  END IF;
  RETURN result;
END;
$$;

-- §8 access-gate helper for module write policies: team_lead/factory_manager/
-- platform_admin always have access; factory_worker only while their linked
-- employees row has maintenance_access_enabled = true (checked live, not cached).
CREATE OR REPLACE FUNCTION public.maintenance_access()
RETURNS TABLE(role text, uid uuid, has_access boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select p.role, p.id,
    case
      when p.role = 'factory_worker' then exists (
        select 1 from employees e
        where e.id = p.employee_id and e.is_active and e.deleted_at is null and e.maintenance_access_enabled
      )
      when p.role in ('team_lead','factory_manager','platform_admin') then true
      else false
    end
  from profiles p where p.id = auth.uid() and p.is_active
$$;

-- §6.1 catalogs
CREATE TABLE maintenance_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  schedule_kind text NOT NULL CHECK (schedule_kind IN ('weekly','monthly','yearly')),
  interval_years integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE maintenance_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- §6.2 machines
CREATE TABLE machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_no integer GENERATED ALWAYS AS IDENTITY (START WITH 1) UNIQUE,
  name text NOT NULL,
  location text,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- §6.3 machine <-> period assignment
CREATE TABLE machine_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid NOT NULL REFERENCES machines(id),
  period_id uuid NOT NULL REFERENCES maintenance_periods(id),
  weekday integer CHECK (weekday BETWEEN 0 AND 5),
  day_of_month integer CHECK (day_of_month BETWEEN 1 AND 28),
  anchor_month integer CHECK (anchor_month BETWEEN 1 AND 12),
  anchor_day integer CHECK (anchor_day BETWEEN 1 AND 28),
  next_due_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (machine_id, period_id)
);

CREATE TABLE machine_period_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_period_id uuid NOT NULL REFERENCES machine_periods(id),
  task_id uuid NOT NULL REFERENCES maintenance_tasks(id),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (machine_period_id, task_id)
);

-- RLS — authenticated-only throughout; factory_manager/platform_admin manage,
-- any authenticated session may read active rows (mirrors the existing
-- "team_lead select active catalog_items" convention).
ALTER TABLE maintenance_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_period_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manager select all maintenance_periods" ON maintenance_periods FOR SELECT
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "manager insert maintenance_periods" ON maintenance_periods FOR INSERT
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "manager update maintenance_periods" ON maintenance_periods FOR UPDATE
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'))
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "authenticated select active maintenance_periods" ON maintenance_periods FOR SELECT
  USING (is_active AND deleted_at IS NULL);

CREATE POLICY "manager select all maintenance_tasks" ON maintenance_tasks FOR SELECT
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "manager insert maintenance_tasks" ON maintenance_tasks FOR INSERT
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "manager update maintenance_tasks" ON maintenance_tasks FOR UPDATE
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'))
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "authenticated select active maintenance_tasks" ON maintenance_tasks FOR SELECT
  USING (is_active AND deleted_at IS NULL);

CREATE POLICY "manager select all machines" ON machines FOR SELECT
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "manager insert machines" ON machines FOR INSERT
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "manager update machines" ON machines FOR UPDATE
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'))
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "authenticated select active machines" ON machines FOR SELECT
  USING (is_active AND deleted_at IS NULL);

CREATE POLICY "manager select all machine_periods" ON machine_periods FOR SELECT
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "manager insert machine_periods" ON machine_periods FOR INSERT
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "manager update machine_periods" ON machine_periods FOR UPDATE
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'))
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "authenticated select active machine_periods" ON machine_periods FOR SELECT
  USING (is_active AND deleted_at IS NULL);

CREATE POLICY "manager select all machine_period_tasks" ON machine_period_tasks FOR SELECT
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "manager insert machine_period_tasks" ON machine_period_tasks FOR INSERT
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "manager update machine_period_tasks" ON machine_period_tasks FOR UPDATE
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'))
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "manager delete machine_period_tasks" ON machine_period_tasks FOR DELETE
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) IN ('factory_manager','platform_admin'));
CREATE POLICY "authenticated select machine_period_tasks" ON machine_period_tasks FOR SELECT
  USING (true);
