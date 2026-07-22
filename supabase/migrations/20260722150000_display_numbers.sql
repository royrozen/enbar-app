-- Human-readable display numbers for clients, reports, projects, and
-- exception logs. Additive only — no existing primary key, foreign key,
-- RLS policy, or storage path changes. Display numbers must never be used
-- to build a storage path or URL (enforced in application code, not here).
--
-- Backfill is done explicitly via ROW_NUMBER() ordered by created_at before
-- converting each column to GENERATED ALWAYS AS IDENTITY, rather than
-- relying on ALTER TABLE's own (unspecified) backfill order for existing
-- rows.

-- ── clients.client_no ────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN client_no INTEGER;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn FROM clients
)
UPDATE clients SET client_no = ordered.rn
FROM ordered WHERE clients.id = ordered.id;

ALTER TABLE clients ALTER COLUMN client_no SET NOT NULL;
ALTER TABLE clients ADD CONSTRAINT clients_client_no_key UNIQUE (client_no);
ALTER TABLE clients ALTER COLUMN client_no ADD GENERATED ALWAYS AS IDENTITY (START WITH 1);
SELECT setval(pg_get_serial_sequence('clients', 'client_no'),
  GREATEST((SELECT MAX(client_no) FROM clients), 1), true);

-- ── reports.report_no ────────────────────────────────────────────────
ALTER TABLE reports ADD COLUMN report_no INTEGER;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn FROM reports
)
UPDATE reports SET report_no = ordered.rn
FROM ordered WHERE reports.id = ordered.id;

ALTER TABLE reports ALTER COLUMN report_no SET NOT NULL;
ALTER TABLE reports ADD CONSTRAINT reports_report_no_key UNIQUE (report_no);
ALTER TABLE reports ALTER COLUMN report_no ADD GENERATED ALWAYS AS IDENTITY (START WITH 1);
SELECT setval(pg_get_serial_sequence('reports', 'report_no'),
  GREATEST((SELECT MAX(report_no) FROM reports), 1), true);

-- ── exception_logs.exception_no ──────────────────────────────────────
-- In scope per PRD v2 (previously deferred in v1). Table name confirmed
-- against the live schema and app code: exception_logs (not the PRD's
-- placeholder "exceptions").
ALTER TABLE exception_logs ADD COLUMN exception_no INTEGER;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn FROM exception_logs
)
UPDATE exception_logs SET exception_no = ordered.rn
FROM ordered WHERE exception_logs.id = ordered.id;

ALTER TABLE exception_logs ALTER COLUMN exception_no SET NOT NULL;
ALTER TABLE exception_logs ADD CONSTRAINT exception_logs_exception_no_key UNIQUE (exception_no);
ALTER TABLE exception_logs ALTER COLUMN exception_no ADD GENERATED ALWAYS AS IDENTITY (START WITH 1);
SELECT setval(pg_get_serial_sequence('exception_logs', 'exception_no'),
  GREATEST((SELECT MAX(exception_no) FROM exception_logs), 1), true);

-- ── projects.project_seq / project_code ──────────────────────────────
-- Per-client sequence (depends on clients.client_no above being populated
-- first). project_code = '{client_no}-P-{project_seq}', e.g. '7-P-2'.
ALTER TABLE projects ADD COLUMN project_seq INTEGER;
ALTER TABLE projects ADD COLUMN project_code TEXT;

WITH ordered AS (
  SELECT p.id, ROW_NUMBER() OVER (PARTITION BY p.client_id ORDER BY p.created_at, p.id) AS seq,
         c.client_no
  FROM projects p JOIN clients c ON c.id = p.client_id
)
UPDATE projects SET project_seq = ordered.seq, project_code = ordered.client_no || '-P-' || ordered.seq
FROM ordered WHERE projects.id = ordered.id;

ALTER TABLE projects ALTER COLUMN project_seq SET NOT NULL;
ALTER TABLE projects ALTER COLUMN project_code SET NOT NULL;
ALTER TABLE projects ADD CONSTRAINT projects_project_code_key UNIQUE (project_code);

-- Trigger for all future inserts — locks the parent client row so two
-- concurrent project inserts under the same client can't compute the same
-- next sequence number.
CREATE OR REPLACE FUNCTION set_project_code() RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_project_code
  BEFORE INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION set_project_code();
