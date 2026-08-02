-- PROD alignment A1: display-number identity columns + exception_logs
-- audit columns, ported verbatim from DEV's live schema (introspected via
-- Supabase MCP, function bodies pulled with pg_get_functiondef — not
-- reconstructed). PROD has 0 rows in every table, so no backfill needed.

alter table clients add column client_no integer generated always as identity;
alter table clients add constraint clients_client_no_key unique (client_no);

alter table projects add column project_seq integer;
alter table projects add column project_code text;

create or replace function set_project_code()
 returns trigger
 language plpgsql
as $function$
DECLARE
  next_seq INTEGER;
  c_no INTEGER;
BEGIN
  PERFORM 1 FROM clients WHERE id = NEW.client_id FOR UPDATE;
  SELECT client_no INTO c_no FROM clients WHERE id = NEW.client_id;
  SELECT COALESCE(MAX(project_seq), 0) + 1 INTO next_seq
  FROM projects WHERE client_id = NEW.client_id;
  NEW.project_seq := next_seq;
  NEW.project_code := c_no || '-P-' || next_seq;
  RETURN NEW;
END;
$function$;

create trigger trg_set_project_code before insert on projects
  for each row execute function set_project_code();

alter table projects alter column project_seq set not null;
alter table projects alter column project_code set not null;
alter table projects add constraint projects_project_code_key unique (project_code);

alter table reports add column report_no integer generated always as identity;
alter table reports add constraint reports_report_no_key unique (report_no);
alter table reports add column created_by uuid references auth.users(id);

alter table exception_logs add column exception_no integer generated always as identity;
alter table exception_logs add constraint exception_logs_exception_no_key unique (exception_no);
alter table exception_logs add column updated_at timestamptz not null default now();
alter table exception_logs add column signwell_document_id text;

create or replace function set_updated_at()
 returns trigger
 language plpgsql
as $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

create trigger trg_exception_logs_updated_at before update on exception_logs
  for each row execute function set_updated_at();
