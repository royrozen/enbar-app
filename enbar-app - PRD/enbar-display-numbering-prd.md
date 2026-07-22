# Enbar — Human-Readable Display Numbers (Clients, Projects, Reports, Exceptions) — PRD

**Version 2 — supersedes the previous version of this document.** Scope expanded to include exceptions records in this phase (previously deferred), and the PDF-surface requirement corrected based on the actual current implementation: there is no PDF tied to the `reports` table — only the exceptions PDF and the parts-order print sheet exist.

**Scope:** add human-readable identifiers for clients, projects, reports, and exceptions, for display in the UI, PDFs, and verbal/WhatsApp communication — **without** replacing the existing UUID primary keys. This is additive: no existing FK, storage path, or table's primary key type changes.

---

## 1. Feature objective

Give people a short, sayable, writable identifier for a client, project, report, or exception record — e.g. "לקוח #7", project code `7-P-2`, "דוח #245", "חריגה #12" — so team leads and the factory manager can reference records over the phone, in WhatsApp, or on a printed/signed form, instead of a UUID. Internal joins, foreign keys, and storage paths continue to use UUIDs exactly as today.

---

## 2. Decision: display numbers, not primary-key replacement

Four reasons this is additive rather than a PK swap:

1. **Storage security depends on unguessable paths today.** Storage buckets (`report-photos`, `signed-approvals`, `exception-docs`) are public-read with no authentication (reverse-PRD §7: "anyone with a storage path can view the file without authentication"). UUIDs in those paths are practically unguessable; small sequential IDs in the same role would let anyone enumerate and browse other clients' photos and signed documents. Display numbers must never be used to construct a storage path.
2. **Migration blast radius.** Every FK in the live schema (`reports.project_id`, `reports.team_lead_id`, `report_photos.report_id`, `part_requests.*`, the exceptions table) points at these UUIDs, and the database now holds real production data. Changing PK types is a high-risk, whole-schema migration for a readability want, not a functional need.
3. **No-reuse requirement is easier to satisfy with a separate counter.** The app never hard-deletes (deactivate only). A display number must never be reassigned to a different record after deactivation; a monotonically increasing `IDENTITY` column enforces this trivially, independent of PK concerns.
4. **Zero regression risk.** Existing code paths (queries, RLS, joins, the parts/exceptions features just built) keep working unmodified.

---

## 3. Scope of new identifiers

| Entity | New column | Format | Scope of the counter |
|---|---|---|---|
| `clients` | `client_no` | integer, e.g. `7` | Global, `GENERATED ALWAYS AS IDENTITY` |
| `projects` | `project_seq` (internal) + `project_code` (display) | `project_code` = `{client_no}-P-{project_seq}` e.g. `7-P-2` | `project_seq` counts per client, starting at 1 |
| `reports` | `report_no` | integer, e.g. `245` | Global, `GENERATED ALWAYS AS IDENTITY` |
| exceptions log table *(confirm actual table name in code before implementing)* | `exception_no` | integer, e.g. `12` | Global, `GENERATED ALWAYS AS IDENTITY` |

`project_code` is computed (via trigger — see §5) from `client_no` and the per-client `project_seq`; it is never edited manually.

**Change from v1 of this PRD:** exceptions numbering is now IN SCOPE for this phase (previously deferred to a follow-up). This is a single `ALTER TABLE ADD COLUMN` on the existing exceptions log table — **no new table is created.**

**Still deferred to a follow-up decision, not built in this phase:** display numbers for part orders. Recommend applying the same pattern once this phase is validated.

---

## 4. Where display numbers appear

- **Clients tab (admin):** client card header shows "לקוח #{client_no}" alongside the name.
- **Projects under a client (admin):** each project row shows its `project_code` alongside the project name.
- **Report lists** (team lead home, manager dashboard, historical reports screen): each row shows "#{report_no}" alongside date/project.
- **Exceptions:** each exceptions-log entry (list rows and detail view) shows "#{exception_no}".
- **PDFs — corrected from v1:** there is currently no PDF generated from the `reports` table itself; only two PDFs exist:
  - **Exceptions PDF** (sent to the client via SignWell for signature): prints `exception_no` (e.g. "חריגה #12") and `project_code` in the header, alongside existing fields. `report_no` does **not** appear here — the exceptions record is not tied to a `reports` row in the current implementation.
  - **Parts order print sheet:** prints `project_code` in the header, alongside existing fields. No part-order display number this phase (deferred, see §3).
  - `report_no` currently has **no PDF surface** — it is UI-only (report lists, dashboard, filters) until/unless a daily-report PDF is built in the future.
- **Filters/search** (manager dashboard, historical reports): allow filtering or jumping to a report by `report_no`, in addition to existing project/date/team-lead filters.

Display numbers are **never** used to build a Storage path, a route parameter for data fetching, or any URL — all internal lookups continue to use the UUID `id`.

---

## 5. Data model changes

```sql
-- Clients: simple global identity column
ALTER TABLE clients
  ADD COLUMN client_no INTEGER GENERATED ALWAYS AS IDENTITY (START WITH 1) UNIQUE;

-- Reports: simple global identity column
ALTER TABLE reports
  ADD COLUMN report_no INTEGER GENERATED ALWAYS AS IDENTITY (START WITH 1) UNIQUE;

-- Exceptions log: simple global identity column on the EXISTING table
-- (confirm actual table name before running — placeholder name used below)
ALTER TABLE exceptions
  ADD COLUMN exception_no INTEGER GENERATED ALWAYS AS IDENTITY (START WITH 1) UNIQUE;

-- Projects: per-client sequence, enforced without race conditions
ALTER TABLE projects
  ADD COLUMN project_seq INTEGER,
  ADD COLUMN project_code TEXT UNIQUE;

-- Trigger: on insert, lock the parent client row, compute the next
-- per-client sequence value, and set project_seq + project_code atomically.
CREATE OR REPLACE FUNCTION set_project_code() RETURNS TRIGGER AS $$
DECLARE
  next_seq INTEGER;
  c_no INTEGER;
BEGIN
  -- lock the client row to serialize concurrent project inserts for the same client
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
```

- `IDENTITY` columns are DB-level atomic — safe under concurrent inserts from multiple browser tabs, no application-level locking needed for `client_no` / `report_no` / `exception_no`.
- The `projects` trigger uses `SELECT ... FOR UPDATE` on the parent client row specifically to serialize the two-step "read max, write next" sequence per client — this is the one place true concurrency risk exists (two team leads/admins adding a project under the *same* client at the same instant).
- **Backfill:** existing rows in `clients`, `reports`, and the exceptions table get their identity column populated by insertion order (`created_at`) when the column is added; existing `projects` rows get `project_seq`/`project_code` computed once via a one-time backfill script using the same per-client-ordering logic as the trigger.
- **No changes** to any existing primary key, foreign key, RLS policy, or storage bucket/path logic.

---

## 6. Cross-cutting behaviors

- **No reuse:** `IDENTITY` columns never reuse a number, including after a client/project/report/exception is deactivated — consistent with the app's existing no-hard-delete convention.
- **Read-only in UI:** display numbers are never manually editable — no admin field to set or change them.
- **RTL/formatting:** numbers render left-to-right as usual for digit runs inside the RTL layout (matches how worker counts/quantities already render); `project_code` (e.g. `7-P-2`) displays as one unbroken token. Any display number appearing inside a PDF text run (exceptions PDF, parts order sheet) is verified through the existing `rtl.js` handling, same as any other Hebrew-adjacent text.
- **Filters:** report lookup by `report_no` is an additive filter option, not a replacement for existing project/date/team-lead filters.

---

## 7. Conflicts & decisions needed

- **D1 — Exceptions table name:** implementation must confirm the actual table name backing the exceptions/יומן חריגים workflow in the current code before running the migration (placeholder `exceptions` used in §5). If exceptions data still lives on `reports.extras_*` columns rather than a standalone table, the column addition target changes accordingly — confirm before writing the migration.
- **D2 — Scope of this phase (updated from v1):** clients, projects, reports, **and exceptions** are in scope this phase. Part orders remain deferred to a follow-up, same trigger pattern, to keep this migration's blast radius small.
- **D3 — Project code format confirmation:** the format `{client_no}-P-{project_seq}` (e.g. `7-P-2`) was specified by the product owner. Confirm no separator/casing preference before implementation (e.g. `P` vs `p`, dash vs nothing).
- **D4 — Historical numbering starting point:** backfill assigns numbers by `created_at` order for all four identity columns. Confirm this ordering is acceptable.
- **D5 — Storage-path guardrail:** display numbers must never be introduced into any Storage bucket path or public URL, to avoid making buckets enumerable. This PRD treats that as a hard constraint, not a preference.

---

## 8. Out of scope

Replacing any UUID primary key; renumbering on deactivation/reactivation; display numbers for part orders (deferred, see D2); a standalone daily-report PDF (report_no remains UI-only until one exists); any change to RLS policies, storage bucket structure, or existing route parameters (`:id` continues to mean the UUID everywhere).
