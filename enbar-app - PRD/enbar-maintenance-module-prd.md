# Enbar — Preventive Maintenance Module (Machines, Parts, Fault Reports) — PRD

**Status:** Approved, v2. Supersedes v1 — v1 assumed the app was still on the shared-password/no-login model described in the reverse PRD; a Claude Code comprehension check (run against the actual codebase, not just the live Supabase schema) found that Auth Phase 1 is already complete: `/manager/*` uses real Supabase phone-OTP auth, and every existing table has moved to `authenticated`-only RLS with zero `anon` policies. This version is rebuilt on that reality, verified directly against `profiles` and `employees` via Supabase MCP.

**Grounded against:** live Supabase schema (`enbar-bot`, ref `svsuntixvxwwuggtqsws`), specifically `profiles` (`id, role, team_lead_id, phone, is_active, created_at, display_name`, `role` currently checked to `'team_lead'|'factory_manager'`) and `employees` (`id, name, phone, is_active, created_at, deleted_at` — used today only for the no-login lunch-ordering phone lookup, not linked to Auth). Other conventions (soft delete, `IDENTITY` display numbers, per-parent trigger sequences) verified in v1 and unchanged.

---

## 1. Objective

Track preventive maintenance for factory machines (periodic checklists on a fixed schedule), maintain a per-machine parts catalog for reference, and let field workers report faults/breakages tied optionally to specific parts — all reachable from a QR code physically stuck on each machine, gated by the app's real authentication (not a shared password), with results reviewable by the factory manager.

---

## 2. Role hierarchy

Four roles, all resolved from a real authenticated session (`profiles`, extended — see §4.0):

| Role | Who | Scope |
|---|---|---|
| `platform_admin` | Roy — system owner. New role, distinct from `factory_manager` for genuine audit trail. | **App-wide super-admin** — identical access to `factory_manager` across the entire application (not just this module). Widened via a standalone, app-wide RLS migration (40 policies across 16 tables — every existing `factory_manager`-only policy in the schema), separate from this module's own phases. |
| `factory_manager` | Existing role. | Admin (catalogs, machines, parts, per-employee access toggle), unified reports, can also sign as a worker — plus everything else this role already did elsewhere in the app |
| `team_lead` | Existing role ("מנהל צוות שטח" = the existing team lead role, confirmed same, not a new one). | Can sign maintenance checklists and fault reports |
| `factory_worker` | New role (renamed from an earlier draft's `maintenance_worker` — Roy's correction: these are general factory employees, not maintenance specialists, and currently sit at one flat level with no further sub-hierarchy). Linked to an `employees` roster row. | Can sign maintenance checklists and fault reports for machines, subject to the per-employee access toggle (§4.0) |

**`platform_admin`'s app-wide scope is a standalone architectural decision, not scoped to this module** — it was made mid-implementation (after Phase 1 shipped a narrower, module-only version) and applied as its own migration + git tag, independent of this plan's phase numbering. Anywhere else in this document that says "same scope as `factory_manager` in this module" should be read as "same scope as `factory_manager`, full stop" — this table is the current source of truth.

**Out of scope for this phase, flagged for later:** sub-contractor users (a fifth role/tier under `factory_worker`) — Roy has noted this as a future addition, not built now.

**Not part of this hierarchy:** the lunch-ordering feature's `employees` phone-lookup flow stays exactly as it is — no login, no change. Only the *maintenance module* requires real OTP authentication for factory workers; this is a deliberate difference in security bar between the two features on the same `employees` roster, not an oversight.

---

## 3. Scope

**In scope:**
- Maintenance period catalog (weekly/monthly/yearly/tri-yearly, extensible from admin)
- Maintenance task catalog (reusable across machines, extensible from admin)
- Machines: CRUD, unique display number, auto-generated QR
- Per-machine assignment of one or more periods, each with its own fixed schedule and task list
- QR-triggered checklist flow, gated by the app's real phone-OTP auth (no separate password)
- Per-employee maintenance-module access toggle, settable by `factory_manager`/`platform_admin` (default enabled)
- Per-machine parts catalog (reference data, not transactional inventory)
- Fault/breakage reporting, optionally linked to one or more parts, with a status workflow
- Manager-side unified reporting screen (history / missed / faults) and machine/parts management

**Out of scope (this phase):**
- Photo evidence on completed maintenance checklists (explicitly declined)
- Real inventory tracking (quantity is a static descriptive field, does not decrement)
- Real push notifications/WhatsApp/email for reminders (admin-dashboard highlight only)
- Display numbers for exceptions/part orders (already deferred in the numbering PRD; unrelated to this module)
- Editing a submitted maintenance log after the fact (append-only, consistent with the rest of the app)
- Sub-contractor role/tier (flagged for a future phase — §2)
- A standalone `maintenance_workers` roster table — superseded by real auth identity (v1 had this; removed in v2)
- A shared/DB-backed QR password — superseded by real auth (v1 had this; removed in v2)

---

## 4.0 Identity & access model

`profiles` is extended rather than replaced:

```sql
ALTER TABLE profiles
  DROP CONSTRAINT profiles_role_check,
  ADD CONSTRAINT profiles_role_check
    CHECK (role = ANY (ARRAY['team_lead','factory_manager','factory_worker','platform_admin']::text[])),
  ADD COLUMN employee_id uuid REFERENCES employees(id);

ALTER TABLE profiles
  DROP CONSTRAINT team_lead_link_required,
  ADD CONSTRAINT role_link_required CHECK (
    ((role = 'team_lead') AND (team_lead_id IS NOT NULL) AND (employee_id IS NULL)) OR
    ((role = 'factory_worker') AND (employee_id IS NOT NULL) AND (team_lead_id IS NULL)) OR
    ((role IN ('factory_manager','platform_admin')) AND (team_lead_id IS NULL) AND (employee_id IS NULL))
  );

ALTER TABLE employees
  ADD COLUMN maintenance_access_enabled boolean NOT NULL DEFAULT true;
```

**First-login provisioning for factory workers — self-provisioning via RLS, no admin action and no service-role step.** Supabase Auth already assigns `auth.uid()` automatically the moment OTP succeeds — this is true today for `team_lead`/`factory_manager` too; there is no special provisioning mechanism anywhere in the app to extend (confirmed against the live code — `fetchProfile` only reads, it never inserts). The mechanism, entirely new but minimal:

1. On login, the app checks whether a `profiles` row exists for `auth.uid()`. If yes, done.
2. If not, the app itself attempts `INSERT INTO profiles (id, role, employee_id, display_name) VALUES (auth.uid(), 'factory_worker', <matched employee>, <employee name>)`, using the user's own ordinary (low-privilege) session — not service-role, not an Admin API call, not an admin-triggered step.
3. A new RLS `INSERT` policy on `profiles` is the actual gate: it permits this insert **only** when `id = auth.uid()`, `role = 'factory_worker'`, and there exists an active `employees` row whose `phone` matches the JWT's phone **and** whose `maintenance_access_enabled = true`, with `employee_id` pointing at that same row. Any mismatch (unregistered phone, inactive employee, or the toggle off) makes Postgres reject the insert — the app then shows a clear "access not enabled" message. No separate admin checkbox, no pre-creation step.
4. `profiles` stays thin for this role — just `id`, `role`, `employee_id`, `display_name` (copied once at insert time for display convenience). Name, phone, and the access toggle itself live only in `employees`; nothing is duplicated as a source of truth.
5. Disabling the toggle later does **not** retroactively delete or deactivate an already-created `profiles` row — instead, every other write this module makes from a `factory_worker` session re-checks `employees.maintenance_access_enabled` live (§8), so access is cut off for new actions immediately even though the identity row persists.

`team_lead`/`factory_manager`/`platform_admin` profiles continue to be provisioned exactly the way they are today (manually, out of scope of this module to change).

**Per-employee access toggle (built now, not deferred):** `employees.maintenance_access_enabled`, default `true` — everything open by default. `factory_manager`/`platform_admin` can flip it off per employee from admin (§7.1). This single flag is both the self-provisioning gate (step 3 above) and the ongoing per-write check (§8) — there is no second, separate admin-facing flag.

**Identity everywhere in this module comes from the session, never a manual picker.** `auth.uid()` → `profiles.id` → `profiles.display_name` is the source of truth for "who did this" (visit sign-off, fault report submitter, status-change stamp) — no dropdown, no free text, no separate roster table.

---

## 5. Core model: machine × period, not just machine

The unit of tracking is **a machine paired with one maintenance period** (`machine_periods`), not the machine alone. A machine can carry several periods concurrently (e.g. weekly AND monthly AND yearly), each with its own task list and its own fixed due-date schedule. A period only advances to its next occurrence when **all** of its own tasks are checked off — a machine with 3 concurrent periods can have one "done" and two still due at the same time.

### Fixed schedule, not derived from completion
Each `machine_periods` row carries its own due date, computed from a fixed schedule (configured once per machine+period in admin), **not** recalculated from when the work was actually done. Early or late completion never shifts the underlying schedule — only full completion advances `next_due_date` to the schedule's next calendar occurrence.

Anchor field used depends on the period's `schedule_kind`:
- **weekly** → a day of the week (Sunday–Friday only — the factory's work week)
- **monthly** → a day of the month (1–28, to avoid short-month ambiguity)
- **triannual** (`תלת שנתי` — 3 times a year, every 4 months) → an anchor month + day of month; the next two occurrences are 4 and 8 months later, wrapping the year
- **yearly** (`שנתי` — once a year, `interval_years = 1`) → an exact month+day anchor date

**Saturday shift rule:** weekly periods can't land on Saturday at all (the weekday picker only offers Sunday–Friday). For monthly, triannual, and yearly periods, if the computed due date falls on a Saturday, it shifts forward to the following Sunday — applied every time `next_due_date` is computed, both on initial assignment and on every advance-on-completion.

### "Missed" is derived, not a stored flag
Because `next_due_date` only moves forward on full completion, **"missed" = `next_due_date` is in the past**. No separate status field or cron job needed — the same computed field powers "what's due this week," "what's overdue," and the manager's missed-machines report. There is no grace period: a period becomes missed the day after its due date if not fully closed.

### Merged checklist, independently-closing periods
When a worker scans a machine's QR, the checklist shows **every period whose due date falls within the current calendar week** (Sunday–Friday), merged into one screen but **visually grouped by period** (e.g. a "שבועי" section and a "חודשי" section), so the worker understands they're also covering a task that isn't strictly due yet. On submission:
- Each period is evaluated independently: if *all* of its tasks were checked, that period's `next_due_date` advances to its next scheduled occurrence.
- A period with any unchecked task keeps its current `next_due_date` unchanged — it remains due/becomes missed on its own schedule, regardless of what happened with the other periods in the same visit.

### "This week"
Calendar week (Sunday–Friday, matching actual factory work days), not a rolling 7-day window.

---

## 6. Data model

New tables follow the app's existing conventions: `uuid` primary keys (`gen_random_uuid()`), `is_active boolean default true` + nullable `deleted_at` for soft-delete, `created_at timestamptz default now()`.

### 6.1 Catalogs

```sql
CREATE TABLE maintenance_periods (           -- fixed/seeded, NOT admin-manageable (see §7.1)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                          -- 'שבועי', 'חודשי', 'שנתי', 'תלת שנתי' (3x/year)
  schedule_kind text NOT NULL CHECK (schedule_kind IN ('weekly','monthly','triannual','yearly')),
  interval_years integer NOT NULL DEFAULT 1,    -- kept for schema flexibility; the only seeded yearly-kind row uses 1 (no 3-year variant anymore — Roy deleted it)
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Seeded once via migration with the four rows above. No admin UI reads/writes this table's
-- catalog rows (Roy's explicit decision — see §7.1). Adding a fifth frequency in the future
-- means a new migration + a new next-due-date helper branch, not an in-app action.

CREATE TABLE maintenance_tasks (              -- admin-extensible (unchanged)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

(No `maintenance_workers` table — superseded by §4.0's real auth identity.)

### 6.2 Machines

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

`machine_no` is a plain global `IDENTITY` integer, displayed zero-padded (`001`, `002`) by the frontend formatter. **The QR code encodes `machines.id` (the UUID), never `machine_no`** — display numbers never build a route/storage identifier (consistent with the existing numbering PRD's guardrail).

### 6.3 Machine ↔ period assignment

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

Adding a new period type to the catalog is never auto-assigned to any machine — always manual, per machine, including its schedule anchor.

### 6.4 Visit history (append-only, identity from session)

```sql
CREATE TABLE maintenance_visits (            -- one row per QR submission
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid NOT NULL REFERENCES machines(id),
  profile_id uuid NOT NULL REFERENCES profiles(id),   -- auth.uid() at submit time, never a manual picker
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

Application logic on submit: for each touched `machine_period`, insert a `machine_period_logs` row with `fully_completed` set from whether every task was checked; if `fully_completed = true`, update that `machine_periods.next_due_date` to its next scheduled occurrence (applying the Saturday-shift rule). Untouched/incomplete periods are left as-is.

### 6.5 Parts catalog (per machine, static reference data)

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
  quantity integer,                          -- descriptive only, never decremented
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

Same locking pattern as the existing `set_project_code()` trigger — serializes concurrent part inserts under the same machine.

### 6.6 Fault / breakage reports

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
  status_updated_by text,                    -- text snapshot of profiles.display_name at the time of change (not a live FK — survives role/name changes, same shape as exception_logs.status_updated_by but sourced correctly)
  reminder_date date,                        -- optional; relevant while status is awaiting_part/part_ordered
  reported_by uuid NOT NULL REFERENCES profiles(id),  -- auth.uid() at submit time, never a manual picker
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

**Numbering:** `fault_no` is a plain global identity, always unique regardless of how many parts are linked or whether none are. Display combines it with the machine for context: **"תקלה #58 — מכונה 001"**. Linked part numbers (if any) are shown as separate context inside the report, not folded into the identifier.

**Status flow** (בבדיקה/בטיפול merged into one step, per Roy's request):

| Status | Meaning |
|---|---|
| `new` | Submitted from the field, not yet reviewed |
| `awaiting_part` | Reviewed; a part is needed and not yet ordered |
| `part_ordered` | Ordered from the supplier, awaiting arrival |
| `in_progress` | Being worked on (review/repair merged into one stage) |
| `resolved` | Fixed and closed |
| `rejected` | No action needed (duplicate, mistake, not relevant) |

**Reminder:** `reminder_date`, settable while status is `awaiting_part` or `part_ordered`, meant as a prompt to call the store back. This phase surfaces it only as a visual highlight on the manager's fault-reports tab when the date has arrived/passed — no outbound notification exists anywhere in the app today, and none is added here.

---

## 7. Screens

### 7.1 Admin — תחזוקת מכונות (new top-level tab under `/manager/settings`, parent of two sub-tabs)
This replaces what was three separate ideas (a standalone periods tab, a standalone `/manager/machines` area, and a machine-nested parts tab) with **one parent tab** grouping everything machine-maintenance-related — Roy's explicit restructuring.

- **מכונות** (sub-tab) — list of machines (`#{machine_no}` zero-padded, name, location, active toggle), add/edit, per-machine period assignment (pick from the fixed period list — see below — set its schedule anchor, and pick tasks from the task catalog for that period on this machine), and QR display for printing. Parts live inside a specific machine's own detail view (drill in from this list), not as a separate flat sub-tab — a part only makes sense in the context of one machine.
- **משימות תחזוקה** (sub-tab) — name only. List+add, deactivate-only. Still admin-extensible (unchanged from before).
- **No מחזורי טיפול sub-tab.** Periods are fixed/seeded (§6.1) — Roy's explicit decision to remove admin management of this catalog entirely. The four periods (`שבועי`, `חודשי`, `שנתי`, `תלת שנתי`) are chosen from a fixed list wherever a period needs to be picked (e.g. assigning a period to a machine), never added/edited/deactivated through any screen.
- **New control on the existing עובדים (employees) tab (unrelated to תחזוקת מכונות, stays where it is):** a per-employee toggle "גישה למודול תחזוקה" (`maintenance_access_enabled`), default on. `factory_manager`/`platform_admin` only.
- (No QR-password field — removed in v2, replaced by real auth.)

### 7.2 Admin — parts (within a machine's own detail view, under תחזוקת מכונות → מכונות)
- List of parts for the machine (`part_no`, name, quantity, shelf location).
- Add/edit: all fields from §6.5, including photo upload.

### 7.3 Field — QR entry (`/maintenance/:machineId`, requires auth)
- Scanning the QR opens this route. If there's no active session, the app's existing phone-OTP login intercepts first (same mechanism `/manager/*` already uses) — first-time factory workers are auto-provisioned per §4.0; anyone whose `employees.maintenance_access_enabled` is off, or whose phone isn't a registered active employee, sees a clear "access not enabled" message instead of the checklist.
- Machine header (name, `#{machine_no}`, location).
- Merged checklist, grouped by period name, each task a checkbox; only periods due within the current calendar week are shown.
- **No manual sign-off picker** — the submitting `profiles.display_name` is attached automatically from the session.
- Submit button: allowed with partial completion; closes only the periods that ended up fully checked.
- A separate, always-visible **"דיווח תקלה / שבר"** button/link on the same machine screen.

### 7.4 Field — fault report (`/maintenance/:machineId/fault`, same session)
- Description (required text), photo (optional), severity/urgency single combined scale (נמוכה / בינונית / גבוהה / דחוף).
- Optional multi-select of parts from this machine's catalog, autocomplete-as-you-type.
- **No manual reporter picker** — `reported_by` is the session's `profiles.id`.
- Submit → `status = 'new'`.

### 7.5 Manager — unified reports (`/manager/maintenance`, new area, `factory_manager`/`platform_admin`)
One screen, tabs/filters for three views:
- **היסטוריה** — completed visits (`maintenance_visits` joined to their period logs and `profiles.display_name`), filterable by machine/period/worker/date range.
- **פוספסו** — machines/periods where `next_due_date` is in the past (derived, no stored flag).
- **תקלות** — fault reports list with status filter; opening one shows the full detail plus status-change controls and the reminder-date field, with `status_updated_by` stamped from the acting profile's real `display_name`. Reports with a `reminder_date` that has arrived are visually highlighted.

---

## 8. Security

RLS on every new table is **`authenticated`-only**, matching the rest of the app's actual current state (not the permissive-`anon` pattern a draft of this PRD mistakenly assumed before the live schema/code was checked directly). No shared password, no service-role workaround, no RPC bypass layer — a real Supabase Auth session (OTP) is required end to end, exactly like `/manager/*` today. Within that, role- and access-based policies apply:
- `factory_worker` can insert their own `maintenance_visits`/`machine_period_logs`/`fault_reports` rows only while `employees.maintenance_access_enabled = true` for their linked employee row.
- `team_lead`, `factory_manager`, `platform_admin` can also submit checklists/fault reports (§2).
- `factory_manager`/`platform_admin` can read/write the admin and reporting tables.

---

## 9. Resolved decisions

- **RLS posture — corrected.** `authenticated`-only across the board, not permissive-`anon`. The original assumption (based on documentation that described Auth Phase 1 as "in progress") was wrong; the live code shows it's complete. No separate hardening pass needed later — this module ships already-hardened.
- **Saturday edge case.** Weekly periods can't land on Saturday (weekday check 0–5 only). Monthly, triannual, and yearly periods whose computed date falls on Saturday shift to the following Sunday.
- **New machine → period assignment is manual.** Confirmed — no auto-assignment when a new period type is added to the catalog.
- **Storage/route guardrail.** `machine_no`/`part_no`/`fault_no` are display-only, never used in a QR URL, storage path, or route parameter. The QR always encodes `machines.id`.
- **Storage buckets.** Two new dedicated public buckets, `machine-parts` and `fault-reports`, not a reuse of `report-photos`.
- **Sign-off identity.** Real auth session (`profiles.display_name`), not a manual roster picker — this also fixes the `status_updated_by` dead-code pattern found in `exception_logs`/`PartOrderCard.jsx` (was deriving from an unused `localStorage` key that always resolved to "לא ידוע"); this module sources it correctly from the start.
- **Role naming.** `factory_worker`, not `maintenance_worker` — these are general factory employees (one flat tier today), not maintenance specialists.
- **Per-employee access toggle.** Built now (not deferred), default enabled, editable by `factory_manager`/`platform_admin` from the existing employees admin tab.
- **`platform_admin` scope, corrected mid-implementation.** Originally scoped to this module only; changed to full app-wide super-admin (identical to `factory_manager` everywhere) once the narrower version's gaps became visible during Phase 2. Applied as a standalone RLS migration widening every pre-existing `factory_manager`-only policy in the schema (40 policies, 16 tables — `catalog_items`, `clients`, `employees`, `exception_logs`, `exception_photos`, `lunch_menu_items`, `lunch_orders`, `lunch_settings`, `part_orders`, `part_requests`, `profiles`, `projects`, `report_photos`, `reports`, `signature_requests`, `team_leads`), tagged separately in git from this module's own phase tags.
- **Periods catalog is fixed, not admin-manageable — corrected after Phase 2 shipped.** Originally an admin-editable list+add tab (like tasks). Roy's decision: remove it entirely. `maintenance_periods` is now seeded once via migration with four fixed rows and never exposed to any admin CRUD screen. Adding a fifth frequency later is a developer/migration action, not an in-app one.
- **New frequency: `תלת שנתי` = 3 times a year, not "once every 3 years."** This is a genuine redefinition — the term was originally used (in Roy's own first message and the original schema) for a once-per-3-years cadence. That cadence was briefly renamed to `אחת לשלוש שנים` to resolve the ambiguity, then **deleted outright** on Roy's later instruction — it isn't a period the module needs. `תלת שנתי` is reserved going forward for the 3x/year (~every 4 months) cadence, its own `schedule_kind` (`'triannual'`), reusing the `anchor_month`/`day_of_month` fields with occurrences every 4 months. The final fixed catalog is four rows: `שבועי`, `חודשי`, `שנתי` (plain once-a-year — restored after being accidentally dropped from an earlier edit of this document), `תלת שנתי`.
- **Admin navigation restructured — corrected after Phase 2 shipped.** What was three separate ideas (a periods tab, a standalone `/manager/machines` area, a machine-nested parts tab) is now one parent tab, **תחזוקת מכונות**, with two sub-tabs: **מכונות** (machines, with parts reachable inside each machine's own detail — not a separate flat sub-tab) and **משימות תחזוקה** (tasks, unchanged). The employees-tab access toggle stays where it is, unrelated to this restructuring.

## 10. Out of scope (explicit)

Photo evidence on completed maintenance checklists; transactional/decrementing part inventory; real push/WhatsApp/email reminders; editing a submitted maintenance log; display numbers for exceptions/part orders; sub-contractor role/tier (flagged for later); any change to the lunch-ordering feature's no-login flow.
