-- Adds a business date to exception_logs, mirroring reports.report_date, so
-- exceptions can be backdated and get a per-project/per-day "already logged"
-- indicator (enbar-backdated-reports-prd.md D1). Backfilled to created_at's
-- date for existing rows since that's the closest available truth.
--
-- trg_exception_logs_lock (20260728140000_rls_phase2_authorization.sql)
-- blocks any UPDATE on an already-approved row, including this backfill —
-- disable it for the backfill only, since adding a new column isn't the
-- content mutation that trigger exists to prevent.
alter table public.exception_logs add column work_date date;

alter table public.exception_logs disable trigger trg_exception_logs_lock;
update public.exception_logs set work_date = created_at::date;
alter table public.exception_logs enable trigger trg_exception_logs_lock;

alter table public.exception_logs alter column work_date set not null;
