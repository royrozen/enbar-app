-- advance_machine_period() advanced exactly one cycle from the period's
-- stored next_due_date, not from today. For a period overdue by more than one
-- full cycle that leaves it still overdue after being completed: a weekly
-- period untouched for three weeks moves from "3 weeks late" to "2 weeks
-- late", and would need three more completed visits to catch up.
--
-- Roll forward until the next due date is actually in the future. The catch-up
-- lives here rather than in compute_next_due_date(), which is IMMUTABLE and
-- must not read the clock — it is also used by the admin UI to seed a brand
-- new assignment, where advancing past today would be wrong.
--
-- Every branch of compute_next_due_date() returns a date strictly greater than
-- the one passed in, so the loop terminates; the counter is a guard against a
-- future branch breaking that assumption and hanging a connection.
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
  v_guard integer := 0;
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

  WHILE v_new_due <= CURRENT_DATE LOOP
    v_guard := v_guard + 1;
    IF v_guard > 1000 THEN
      RAISE EXCEPTION 'advance_machine_period: % did not reach a future date from %',
        v_schedule_kind, v_current_due;
    END IF;
    v_new_due := compute_next_due_date(
      v_schedule_kind, v_new_due, v_weekday, v_day_of_month,
      v_anchor_month, v_anchor_day, v_interval_years
    );
  END LOOP;

  UPDATE machine_periods SET next_due_date = v_new_due WHERE id = v_period_id;

  RETURN v_new_due;
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_machine_period(uuid) TO authenticated;
