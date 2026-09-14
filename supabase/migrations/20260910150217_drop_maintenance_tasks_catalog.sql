-- Phase 2-revision-3: tasks are machine-owned, not a shared catalog.
-- machine_period_tasks/machine_period_log_tasks were empty (Phase 3 hasn't
-- shipped), verified before altering.

ALTER TABLE machine_period_log_tasks
  DROP CONSTRAINT machine_period_log_tasks_task_id_fkey,
  DROP COLUMN task_id,
  ADD COLUMN machine_period_task_id uuid NOT NULL REFERENCES machine_period_tasks(id);

ALTER TABLE machine_period_tasks
  DROP CONSTRAINT machine_period_tasks_task_id_fkey,
  DROP COLUMN task_id,
  ADD COLUMN task_name text NOT NULL;

DROP TABLE maintenance_tasks;
