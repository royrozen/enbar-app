-- Phase 6: a task already checked off this week stays checked (and locked)
-- for everyone who opens the machine, not just whoever checked it — but the
-- per-row SELECT policies on machine_period_log_tasks are own-visit-only
-- (v.profile_id = auth.uid()). Rather than widening read access on three
-- tables, this exposes exactly the one shared fact the checklist needs:
-- which of this machine's tasks were already checked in the given week, and
-- when. Gated on the same maintenance_access() predicate the insert
-- policies use, so it grants nothing to a user who couldn't already write
-- a visit for this machine.
CREATE OR REPLACE FUNCTION public.machine_week_checked_tasks(
  p_machine_id uuid,
  p_week_start date,
  p_week_end date
)
RETURNS TABLE(machine_period_task_id uuid, checked_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lt.machine_period_task_id, min(lt.created_at) AS checked_at
  FROM machine_period_log_tasks lt
  JOIN machine_period_logs l ON l.id = lt.log_id
  JOIN maintenance_visits v ON v.id = l.visit_id
  WHERE v.machine_id = p_machine_id
    AND lt.is_checked
    AND (v.created_at AT TIME ZONE 'Asia/Jerusalem')::date BETWEEN p_week_start AND p_week_end
    AND EXISTS (
      SELECT 1 FROM maintenance_access() a
      WHERE a.uid = auth.uid() AND a.has_access
    )
  GROUP BY lt.machine_period_task_id
$$;

GRANT EXECUTE ON FUNCTION public.machine_week_checked_tasks(uuid, date, date) TO authenticated;
