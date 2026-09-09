# Enbar — Preventive Maintenance Module (Machines, Parts, Fault Reports) — PRD

**Status:** Draft, pending approval. Not yet implemented.
**Grounded against:** live Supabase schema (`enbar-bot`, ref `svsuntixvxwwuggtqsws`), current tables `team_leads`, `clients`, `projects`, `catalog_items`/`part_requests`, `exception_logs`, `employees`/`lunch_orders`, `profiles`. Naming and patterns below follow these existing conventions exactly (soft delete via `is_active` + `deleted_at`, `GENERATED ALWAYS AS IDENTITY` display numbers, per-parent trigger sequences, `status_updated_by` as a text label not a user reference).

---

## 1. Objective

Track preventive maintenance for factory machines (periodic checklists on a fixed schedule), maintain a per-machine parts catalog for reference, and let field workers report faults/breakages tied optionally to specific parts — all reachable from a QR code physically stuck on each machine, with results reviewable by the factory manager.

---

## 2. Scope

**In scope:**
- Maintenance period catalog (weekly/monthly/yearly/tri-yearly, extensible from admin)
- Maintenance task catalog (reusable across machines, extensible from admin)
- Maintenance worker roster (for sign-off, extensible from admin)
- Machines: CRUD, unique display number, auto-generated QR
- Per-machine assignment of one or more periods, each with its own fixed schedule and task list
- QR-triggered checklist flow with a DB-backed shared password gate
- Per-machine parts catalog (reference data, not transactional inventory)
- Fault/breakage reporting, optionally linked to one or more parts, with a status workflow
- Manager-side unified reporting screen (history / missed / faults) and machine/parts management

**Out of scope (this phase):**
- Photo evidence on completed maintenance checklists (explicitly declined)
- Real inventory tracking (quantity is a static descriptive field, does not decrement)
- Real push notifications/WhatsApp/email for reminders (admin-dashboard highlight only)
- Display numbers for exceptions/part orders (already deferred in the numbering PRD; unrelated to this module)
- Editing a submitted maintenance log after the fact (append-only, consistent with the rest of the app)
- Any change to existing auth/RLS phases already in flight for the rest of the app

---

## 3. Core model: machine × period, not just machine

The unit of tracking is **a machine paired with one maintenance period** (`machine_periods`), not the machine alone. A machine can carry several periods concurrently (e.g. weekly AND monthly AND yearly), each with its own task list and its own fixed due-date schedule. A period only advances to its next occurrence when **all** of its own tasks are checked off — a machine with 3 concurrent periods can have one "done" and two still due at the same time.

### Fixed schedule, not derived from completion
Each `machine_periods` row carries its own due date, computed from a fixed schedule (configured once per machine+period in admin), **not** recalculated from when the work was actually done. Early or late completion never shifts the underlying schedule — only full completion advances `next_due_date` to the schedule's next calendar occurrence.

Anchor field used depends on the period's `schedule_kind`:
- **weekly** → a day of the week (Sunday–Friday only — the factory's work week; see D2)
- **monthly** → a day of the month (1–28, to avoid short-month ambiguity)
- **yearly** (incl. tri-yearly, via `interval_years`) → an exact month+day anchor date

### "Missed" is derived, not a stored flag
Because `next_due_date` only moves forward on full completion, **"missed" = `next_due_date` is in the past**. No separate status field or cron job needed — the same computed field powers "what's due this week," "what's overdue," and the manager's missed-machines report. There is no grace period: a period becomes missed the day after its due date if not fully closed (confirmed decision).

### Merged checklist, independently-closing periods
When a worker scans a machine's QR, the checklist shows **every period whose due date falls within the current calendar week** (Sunday–Friday), merged into one screen but **visually grouped by period** (e.g. a "שבועי" section and a "חודשי" section), so the worker understands they're also covering a task that isn't strictly due yet. On submission:
- Each period is evaluated independently: if *all* of its tasks were checked, that period's `next_due_date` advances to its next scheduled occurrence.
- A period with any unchecked task keeps its current `next_due_date` unchanged — it remains due/becomes missed on its own schedule, regardless of what happened with the other periods in the same visit.

### "This week"
Calendar week (Sunday–Friday, matching actual factory work days — see D2 on the Saturday edge case), not a rolling 7-day window.

---

## 4. Data model

All new tables follow the app's existing conventions: `uuid` primary keys (`gen_random_uuid()`), `is_active boolean default true` + nullable `deleted_at` for soft-delete (no hard deletes anywhere, consistent with `team_leads`/`clients`/`catalog_items`), `created_at timestamptz default now()`.

### 4.1 Catalogs (admin-extensible)

```sql
CREATE TABLE maintenance_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                          -- e.g. 'שבועי', 'חודשי', 'שנתי', 'תלת שנתי'
  schedule_kind text NOT NULL CHECK (schedule_kind IN ('weekly','monthly','yearly')),
  interval_years integer NOT NULL DEFAULT 1,    -- only meaningful when schedule_kind = 'yearly' (3 = tri-yearly)
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE maintenance_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE maintenance_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 4.2 Machines

```sql
CREATE TABLE machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_no integer GENERATED ALWAYS AS IDENTITY (START WITH 1) UNIQUE,
  name text NOT NULL,
  location text,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

`machine_no` is a plain global `IDENTITY` integer (same pattern as `client_no`/`report_no`), displayed zero-padded (`001`, `002`) by the frontend formatter — the padding is presentational, not stored. **The QR code encodes `machines.id` (the UUID), never `machine_no`** — consistent with the numbering PRD's guardrail that display numbers never build a route/storage identifier (see D4).

### 4.3 Machine ↔ period assignment

```sql
CREATE TABLE machine_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid NOT NULL REFERENCES machines(id),
  period_id uuid NOT NULL REFERENCES maintenance_periods(id),
  weekday integer CHECK (weekday BETWEEN 0 AND 5),      -- 0=Sunday..5=Friday, set when schedule_kind='weekly'
  day_of_month integer CHECK (day_of_month BETWEEN 1 AND 28), -- set when schedule_kind='monthly'
  anchor_month integer CHECK (anchor_month BETWEEN 1 AND 12), -- set when schedule_kind='yearly'
  anchor_day integer CHECK (anchor_day BETWEEN 1 AND 28),     -- set when schedule_kind='yearly'
  next_due_date date NOT NULL,                          -- advances only on full completion; drives due/missed/this-week
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (machine_id, period_id)
);

CREATE TABLE machine_period_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_period_id uuid NOT NULL REFERENCES machine_periods(id),
  task_id uuid NOT NULL REFERENCES maintenance_tasks(id),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (machine_period_id, task_id)
);
```

### 4.4 Visit history (append-only)

```sql
CREATE TABLE maintenance_visits (            -- one row per QR submission
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid NOT NULL REFERENCES machines(id),
  worker_id uuid NOT NULL REFERENCES maintenance_workers(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE machine_period_logs (           -- one row per period touched in that visit
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES maintenance_visits(id),
  machine_period_id uuid NOT NULL REFERENCES machine_periods(id),
  due_date_snapshot date NOT NULL,           -- next_due_date at the moment of this visit
  fully_completed boolean NOT NULL,          -- true only if every task below was checked
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE machine_period_log_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id uuid NOT NULL REFERENCES machine_period_logs(id),
  task_id uuid NOT NULL REFERENCES maintenance_tasks(id),
  is_checked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Application logic on submit: for each touched `machine_period`, insert a `machine_period_logs` row with `fully_completed` set from whether every task was checked; if `fully_completed = true`, update that `machine_periods.next_due_date` to its next scheduled occurrence. Untouched/incomplete periods are left as-is.

### 4.5 Parts catalog (per machine, static reference data)

```sql
CREATE TABLE machine_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid NOT NULL REFERENCES machines(id),
  part_seq integer,                          -- per-machine sequence, trigger-assigned
  part_no text UNIQUE,                       -- '{machine_no zero-padded}_{part_seq}', e.g. '001_1'
  name text NOT NULL,
  store_name text,
  store_phone text,
  store_sku text,
  purchase_price numeric,
  purchase_date date,
  shelf_location text,
  quantity integer,                          -- descriptive only, never decremented (confirmed decision)
  photo_storage_path text,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_part_no() RETURNS TRIGGER AS $$
DECLARE
  next_seq INTEGER;
  m_no INTEGER;
BEGIN
  PERFORM 1 FROM machines WHERE id = NEW.machine_id FOR UPDATE;
  SELECT machine_no INTO m_no FROM machines WHERE id = NEW.machine_id;
  SELECT COALESCE(MAX(part_seq), 0) + 1 INTO next_seq FROM machine_parts WHERE machine_id = NEW.machine_id;
  NEW.part_seq := next_seq;
  NEW.part_no := to_char(m_no, 'FM000') || '_' || next_seq;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_part_no BEFORE INSERT ON machine_parts
  FOR EACH ROW EXECUTE FUNCTION set_part_no();
```

Same locking pattern as the existing `set_project_code()` trigger (numbering PRD §5) — serializes concurrent part inserts under the same machine.

### 4.6 Fault / breakage reports

```sql
CREATE TABLE fault_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fault_no integer GENERATED ALWAYS AS IDENTITY (START WITH 1) UNIQUE,
  machine_id uuid NOT NULL REFERENCES machines(id),
  description text NOT NULL,
  photo_storage_path text,
  severity text NOT NULL CHECK (severity IN ('low','medium','high','urgent')),
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','awaiting_part','part_ordered','in_progress','resolved','rejected')),
  status_updated_by text,                    -- label, same pattern as exception_logs.status_updated_by
  reminder_date date,                        -- optional; relevant while status is awaiting_part/part_ordered
  reported_by uuid REFERENCES maintenance_workers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fault_report_parts (             -- optional, multi
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fault_report_id uuid NOT NULL REFERENCES fault_reports(id),
  part_id uuid NOT NULL REFERENCES machine_parts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fault_report_id, part_id)
);
```

**Numbering:** `fault_no` is a plain global identity (like `report_no`), always unique regardless of how many parts are linked or whether none are. Display combines it with the machine for context: **"תקלה #58 — מכונה 001"**. Linked part numbers (if any) are shown as separate context inside the report, not folded into the identifier (see the reasoning under D4 — a composite `machine_no_part_no` cannot represent zero or multiple linked parts, or a second fault on the same part, without collision).

**Status flow** (merged per Roy's request — "בבדיקה"/"בטיפול" collapsed into one step):

| Status | Meaning |
|---|---|
| `new` | Submitted from the field, not yet reviewed |
| `awaiting_part` | Reviewed; a part is needed and not yet ordered |
| `part_ordered` | Ordered from the supplier, awaiting arrival |
| `in_progress` | Being worked on (review/repair merged into one stage) |
| `resolved` | Fixed and closed |
| `rejected` | No action needed (duplicate, mistake, not relevant) |

**Reminder:** `reminder_date`, settable while status is `awaiting_part` or `part_ordered`, meant as a prompt to call the store back. This phase surfaces it only as a visual highlight on the manager's fault-reports tab when the date has arrived/passed — **no outbound notification exists anywhere in the app today**, and none is added here (explicit decision; real WhatsApp/email reminders are a flagged future phase).

---

## 5. Screens

### 5.1 Admin — catalogs (`/manager/settings`, new tabs alongside existing ones)
Three simple list+add tabs, no edit, deactivate-only toggle (same convention as clients/projects/team leads today):
- **מחזורי טיפול** — name, schedule kind, interval (for yearly-kind).
- **משימות תחזוקה** — name only.
- **עובדי תחזוקה** — name only.
- Plus a field to set/rotate the maintenance QR shared password (see §6) — write-only from the UI's perspective; never displays the current value back.

### 5.2 Admin — machines (`/manager/machines`, new area)
- List of machines (`#{machine_no}` zero-padded, name, location, active toggle).
- Add/edit machine: name, location.
- Per-machine period assignment: add a period from the catalog, set its schedule anchor (day-of-week / day-of-month / month+day depending on `schedule_kind`), and pick which tasks from the global catalog apply to that period on this machine.
- QR display: generated from `machines.id`, shown for printing the moment a machine is created (confirmed requirement).

### 5.3 Admin — parts (`/manager/machines/:id/parts` or a tab within the machine screen)
- List of parts for the machine (`part_no`, name, quantity, shelf location).
- Add/edit: all fields from §4.5, including photo upload.

### 5.4 Field — QR entry (`/maintenance/:machineId`, public route)
- First visit in a browser tab: password prompt (see §6). Session-persisted — scanning a different machine's QR in the same tab does not re-prompt.
- Machine header (name, `#{machine_no}`, location).
- Merged checklist, grouped by period name, each task a checkbox; only periods due within the current calendar week are shown.
- Signature: select from `עובדי תחזוקה` roster (not free text — confirmed decision).
- Submit button: allowed with partial completion; closes only the periods that ended up fully checked.
- A separate, always-visible **"דיווח תקלה / שבר"** button/link on the same machine screen (independent of the checklist — a fault can be reported at any time, not just during a scheduled visit).

### 5.5 Field — fault report (`/maintenance/:machineId/fault`, public route, same password session)
- Description (required text), photo (optional), severity/urgency single combined scale (נמוכה / בינונית / גבוהה / דחוף — confirmed decision, not two separate dimensions).
- Optional multi-select of parts from this machine's catalog, autocomplete-as-you-type (confirmed decision).
- Reporter: selected from the `עובדי תחזוקה` roster, same as the checklist signature.
- Submit → `status = 'new'`.

### 5.6 Manager — unified reports (`/manager/maintenance`, new area, `factory_manager` profile + existing manager password gate)
One screen, tabs/filters for the three views (confirmed decision — a single merged screen, not three separate ones):
- **היסטוריה** — completed visits (`maintenance_visits` joined to their period logs), filterable by machine/period/worker/date range.
- **פוספסו** — machines/periods where `next_due_date` is in the past (derived, no stored flag — see §3).
- **תקלות** — fault reports list with status filter; opening one shows the full detail plus status-change controls and the reminder-date field. Reports with a `reminder_date` that has arrived are visually highlighted (see §4.6).

---

## 6. Security: the maintenance QR password

Explicit requirement from Roy: **DB-backed, admin-editable, not a client-bundled string** — this is a stricter model than the existing `/manager/*` password gate (`VITE_ADMIN_PASSWORD`, currently shipped in the client JS bundle, per the reverse PRD §2). Because the app is otherwise browser-direct-to-Supabase with a public anon key, storing the password hash in a table is not sufficient by itself if the anon key can read that table directly.

Required design:
- A settings table (or a dedicated `maintenance_settings` singleton row, same shape as the existing `lunch_settings` table) holds a **hashed** password. RLS explicitly denies `anon` `SELECT` on this table — the one deliberate exception to this module's otherwise-permissive Phase 1 RLS (see D1).
- A Vercel serverless function (the app already has this layer for secrets/third-party calls, per the architecture doc) receives the entered password, compares it server-side against the hash using the service-role key, and returns a pass/fail plus a short-lived session token.
- The client stores that token in `sessionStorage` (same UX as today's manager gate — one entry per browser tab, no re-prompt when moving between machines) but the token is issued by the server, not a hardcoded string compared in the client.
- The admin sets/rotates the password from `/manager/settings` (§5.1) through the same serverless layer, never storing or displaying the plaintext after submission.

---

## 7. Decisions needed (D1–D5)

- **D1 — RLS posture for this module's tables.** The rest of the app is still on permissive `anon` RLS (Auth Phase 1 — phone OTP — is in progress but not complete; Phase 2 RLS hardening is a separate, already-planned effort per the project overview). Recommendation: build this module on the same permissive-anon pattern as everything else *except* the password table (§6), so it rides the same Phase 2 hardening pass later rather than needing a second one. Confirm before implementation.
- **D2 — Saturday edge case.** Work week is Sunday–Friday. The weekly-schedule day-picker in admin should simply not offer Saturday as an option (`weekday` check already excludes it, 0–5 only). Confirm this is sufficient, or whether a monthly/yearly anchor could still land on a Saturday and needs an explicit shift rule.
- **D3 — New machine → period assignment is manual.** Adding a new period type to the global catalog (e.g. a future "יומי") does not auto-apply to any machine; each machine's periods are assigned individually in admin, including their schedule anchor. Confirm this matches expectation.
- **D4 — Storage/route guardrail.** Consistent with the existing numbering PRD: `machine_no`, `part_no`, and `fault_no` are display-only and must never be used to build a QR URL, storage path, or route parameter. The QR continues to encode `machines.id` (UUID). This is also why `fault_no` is a plain global identity rather than a `machine_no_part_no` composite (§4.6).
- **D5 — Storage buckets.** New dedicated public buckets `machine-parts` (part photos) and `fault-reports` (fault photos), following the existing per-feature bucket convention (`report-photos`, `signed-approvals`), rather than reusing an existing bucket. Confirm.

---

## 8. Out of scope (explicit)

Photo evidence on completed maintenance checklists; transactional/decrementing part inventory; real push/WhatsApp/email reminders; editing a submitted maintenance log; display numbers for exceptions/part orders; any change to the existing team-lead/factory-manager auth rollout already in progress.
