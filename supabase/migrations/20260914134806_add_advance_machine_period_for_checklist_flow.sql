-- Phase 6 (field checklist flow): factory_worker has no UPDATE grant on
-- machine_periods (manager-only), so advancing next_due_date after a fully
-- completed period needs a narrow SECURITY DEFINER path, same shape as
-- resolve_own_employee(): it only ever acts on a log row the caller's own
-- session already inserted (ownership via maintenance_visits.profile_id),
-- and only when that log is already marked fully_completed — no arbitrary
-- machine_period_id can be targeted directly.
--
-- Superseded by 20260921120000_advance_machine_period_catches_up_overdue.sql,
-- which adds a catch-up loop for periods overdue by more than one cycle.
-- Kept here for historical accuracy of the migration sequence.
CREATE OR REPLACE FUNCTION public.advance_machine_period(p_log_id uuid)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_id uuid;
  v_schedule_kind text;
  v_weekday integer;
  v_day_of_month integer;
  v_anchor_month integer;
  v_anchor_day integer;
  v_interval_years integer;
  v_current_due date;
  v_new_due date;
BEGIN
  SELECT mp.id, per.schedule_kind, mp.weekday, mp.day_of_month,
         mp.anchor_month, mp.anchor_day, per.interval_years, mp.next_due_date
    INTO v_period_id, v_schedule_kind, v_weekday, v_day_of_month,
         v_anchor_month, v_anchor_day, v_interval_years, v_current_due
  FROM machine_period_logs l
  JOIN maintenance_visits v ON v.id = l.visit_id
  JOIN machine_periods mp ON mp.id = l.machine_period_id
  JOIN maintenance_periods per ON per.id = mp.period_id
  WHERE l.id = p_log_id
    AND v.profile_id = auth.uid()
    AND l.fully_completed = true;

  IF v_period_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_new_due := compute_next_due_date(
    v_schedule_kind, v_current_due, v_weekday, v_day_of_month,
    v_anchor_month, v_anchor_day, v_interval_years
  );

  UPDATE machine_periods SET next_due_date = v_new_due WHERE id = v_period_id;

  RETURN v_new_due;
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_machine_period(uuid) TO authenticated;
