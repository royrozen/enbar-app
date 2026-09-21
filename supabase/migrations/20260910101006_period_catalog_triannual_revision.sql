-- Phase 2-revision: add 'triannual' schedule_kind, seed fixed 4-row catalog.
-- maintenance_periods confirmed empty live (no admin ever added real data via
-- the shipped tab), so this is a clean seed, not a rename/merge.

ALTER TABLE maintenance_periods
  DROP CONSTRAINT maintenance_periods_schedule_kind_check,
  ADD CONSTRAINT maintenance_periods_schedule_kind_check
    CHECK (schedule_kind = ANY (ARRAY['weekly'::text,'monthly'::text,'triannual'::text,'yearly'::text]));

INSERT INTO maintenance_periods (name, schedule_kind, interval_years, sort_order) VALUES
  ('שבועי', 'weekly', 1, 1),
  ('חודשי', 'monthly', 1, 2),
  ('תלת שנתי', 'triannual', 1, 3),
  ('אחת לשלוש שנים', 'yearly', 3, 4);

-- Saturday-shift helper: add the triannual branch (advance 4 months from
-- current due date, using day_of_month for the day — same shape as the
-- monthly branch, just a 4-month step instead of 1).
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
  ELSIF p_schedule_kind = 'triannual' THEN
    result := (date_trunc('month', p_current_due) + interval '4 months' + ((p_day_of_month - 1) || ' days')::interval)::date;
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
