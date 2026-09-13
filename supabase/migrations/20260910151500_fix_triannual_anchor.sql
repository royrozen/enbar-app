-- compute_next_due_date's triannual branch read p_day_of_month (copy-pasted
-- from the monthly branch) instead of p_anchor_month/p_anchor_day, contradicting
-- the PRD's month+day anchor input design for triannual (same as yearly).
-- Rolls forward from anchor_month/anchor_day in 4-month steps.

CREATE OR REPLACE FUNCTION public.compute_next_due_date(p_schedule_kind text, p_current_due date, p_weekday integer DEFAULT NULL::integer, p_day_of_month integer DEFAULT NULL::integer, p_anchor_month integer DEFAULT NULL::integer, p_anchor_day integer DEFAULT NULL::integer, p_interval_years integer DEFAULT 1)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
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
  ELSIF p_schedule_kind = 'triannual' THEN
    result := make_date(EXTRACT(YEAR FROM p_current_due)::int, p_anchor_month, p_anchor_day);
    WHILE result <= p_current_due LOOP
      result := (result + interval '4 months')::date;
    END LOOP;
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
$function$;
