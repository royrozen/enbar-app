-- Phase 3-revision: yearly/triannual anchor is now picked as a single
-- calendar date (day+month together), so anchor_day's range no longer
-- needs monthly's day-alone 1-28 restriction.
ALTER TABLE machine_periods DROP CONSTRAINT machine_periods_anchor_day_check;
ALTER TABLE machine_periods ADD CONSTRAINT machine_periods_anchor_day_check
  CHECK (anchor_day >= 1 AND anchor_day <= 31);

-- Add a February-29-in-a-non-leap-year shift (-> March 1) to the
-- triannual/yearly branches, checked before the existing Saturday-shift.
-- Without this, make_date() throws for month=2/day=29 in a non-leap year.
CREATE OR REPLACE FUNCTION public.compute_next_due_date(
  p_schedule_kind text,
  p_current_due date,
  p_weekday integer DEFAULT NULL::integer,
  p_day_of_month integer DEFAULT NULL::integer,
  p_anchor_month integer DEFAULT NULL::integer,
  p_anchor_day integer DEFAULT NULL::integer,
  p_interval_years integer DEFAULT 1
)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  result date;
  v_year int;
BEGIN
  IF p_schedule_kind = 'weekly' THEN
    result := p_current_due + 7;
  ELSIF p_schedule_kind = 'monthly' THEN
    result := (date_trunc('month', p_current_due) + interval '1 month' + ((p_day_of_month - 1) || ' days')::interval)::date;
    IF EXTRACT(DOW FROM result) = 6 THEN
      result := result + 1;
    END IF;
  ELSIF p_schedule_kind = 'triannual' THEN
    v_year := EXTRACT(YEAR FROM p_current_due)::int;
    IF p_anchor_month = 2 AND p_anchor_day = 29
       AND NOT ((v_year % 4 = 0 AND v_year % 100 <> 0) OR v_year % 400 = 0) THEN
      result := make_date(v_year, 3, 1);
    ELSE
      result := make_date(v_year, p_anchor_month, p_anchor_day);
    END IF;
    WHILE result <= p_current_due LOOP
      result := (result + interval '4 months')::date;
    END LOOP;
    IF EXTRACT(DOW FROM result) = 6 THEN
      result := result + 1;
    END IF;
  ELSIF p_schedule_kind = 'yearly' THEN
    v_year := EXTRACT(YEAR FROM p_current_due)::int + p_interval_years;
    IF p_anchor_month = 2 AND p_anchor_day = 29
       AND NOT ((v_year % 4 = 0 AND v_year % 100 <> 0) OR v_year % 400 = 0) THEN
      result := make_date(v_year, 3, 1);
    ELSE
      result := make_date(v_year, p_anchor_month, p_anchor_day);
    END IF;
    IF EXTRACT(DOW FROM result) = 6 THEN
      result := result + 1;
    END IF;
  ELSE
    RAISE EXCEPTION 'unknown schedule_kind: %', p_schedule_kind;
  END IF;
  RETURN result;
END;
$function$;
