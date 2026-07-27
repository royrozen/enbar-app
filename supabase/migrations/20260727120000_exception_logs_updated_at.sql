-- exception_logs had no way to tell WHEN a record was last edited (only
-- created_at, plus status_updated_by which records WHO but not WHEN).
-- Standard Postgres auto-updating timestamp pattern: a BEFORE UPDATE
-- trigger stamps updated_at on every row change, no application code needed.
ALTER TABLE exception_logs ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_exception_logs_updated_at
  BEFORE UPDATE ON exception_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
