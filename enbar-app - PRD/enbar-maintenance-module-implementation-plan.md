# Enbar Maintenance Module — Claude Code Implementation Plan (v2)

Generated with the prompt-master skill (Template M — Opus 4.7/4.8 task brief, Claude Code target). Companion to `enbar-maintenance-module-prd.md` v2. **v2 supersedes v1** — v1's Phase 5 (shared-password serverless gate) is removed; the app already has real phone-OTP auth, found by a Claude Code comprehension check against the actual codebase. Phase 5's slot is repurposed for role/auth provisioning instead.

**Standalone addendum (post-Phase-1, pre-Phase-2-completion):** `platform_admin` was widened from module-only scope to full app-wide super-admin — identical access to `factory_manager` everywhere in the app, not just this module. This was applied as its own migration (40 pre-existing `factory_manager`-only RLS policies across 16 tables, widened to also accept `platform_admin`, no other logic changed), tagged separately in git (e.g. `pre-platform-admin-superadmin`) from this plan's phase tags. It is a standing fact of the schema going forward — every phase below should assume `platform_admin` already has identical access to `factory_manager` on every existing table, not just the new module tables Phase 1 created.

**How to use this file:** run the phases in order, one Claude Code session at a time, all on a single feature branch (`feat/maintenance-module`) — never directly on `main`. After each phase, push the branch and let Vercel's automatic preview deployment build; do your own functional/UX click-through against that preview URL before starting the next phase, in addition to reviewing the phase's Acceptance Criteria report. The Supabase schema itself is applied directly to the live project (no separate database branch for this module — a deliberate scope choice: git branch + Vercel preview only, schema changes protected by git tags rather than DB-level isolation). Only merge the feature branch to `main` via PR after all 8 phases and a final end-to-end pass (real QR scan on a device, not just the preview click-through) are done. Create a git tag before Phase 1 (schema + role migration) and before Phase 5 (self-provisioning logic) — both touch shared, security-relevant surface.

**Preview-testing checkpoint (repeat after every phase):** push → wait for the Vercel preview to build → click through that phase's new screens/flows on the preview URL yourself → only then start the next phase's prompt. This is manual UX judgment (does it feel right, not just "does it pass automated criteria") and is in addition to, not a replacement for, each phase's own Acceptance Criteria.

> This prompt is for an agentic tool with real system access. Review the scope locks, forbidden actions, and stop conditions before pasting. Confirm file paths, directories, and permissions match the actual project.

---

## Phase map

| # | Phase | Touches |
|---|---|---|
| 1 | Database schema + role model | Supabase migration only (incl. `profiles`/`employees` alterations) |
| 2 | Admin catalogs + employee access toggle | `/manager/settings` (periods, tasks, employees tab) |
| 3 | Machine management | New `/manager/machines` area, QR generation |
| 4 | Parts catalog | Machine detail / parts tab |
| 5 | Auth & role provisioning | First-login `factory_worker` provisioning, access-check helper |
| 6 | Field checklist flow | New authenticated `/maintenance/:machineId` route |
| 7 | Fault report flow | New authenticated `/maintenance/:machineId/fault` route |
| 8 | Manager reports | New `/manager/maintenance` unified screen |

---

## Phase 1 — Database schema + role model

```
## Objective
Create all database tables, triggers, and RLS policies for the new preventive-maintenance module per enbar-maintenance-module-prd.md §6 and §8, extend profiles/employees per §4.0, and add the self-provisioning RLS INSERT policy on profiles described there (this is the highest-risk single policy in this phase — a client-writable path into an existing, currently read-only-from-the-client table).

## Context
Search the codebase and the connected Supabase project (via MCP) for existing conventions before writing any DDL: how team_leads/clients/catalog_items are structured (soft delete via is_active+deleted_at, created_at defaults, GENERATED ALWAYS AS IDENTITY columns, the set_project_code() trigger pattern), AND how profiles/team_lead_id/team_lead_link_required already work today (this is the pattern employee_id/factory_worker mirrors). Also confirm current RLS reality directly via pg_policies before writing any policy — do not assume permissive-anon; the live app is authenticated-only with zero anon policies on existing tables, and this module must match that, not diverge from it.

## Target State
All tables in PRD §6 exist: maintenance_periods, maintenance_tasks, machines, machine_periods, machine_period_tasks, maintenance_visits, machine_period_logs, machine_period_log_tasks, machine_parts, fault_reports, fault_report_parts. The set_part_no() trigger is installed. A next-due-date helper function implements the Saturday-shift rule for monthly/yearly kinds. profiles.role_check is extended to include 'factory_worker' and 'platform_admin', profiles gains employee_id (FK to employees, mirroring team_lead_id's constraint shape), employees gains maintenance_access_enabled (default true). A new RLS INSERT policy on profiles allows a self-provisioning insert (per PRD §4.0) ONLY when: the inserted id equals auth.uid(), role='factory_worker', and there exists an active employees row whose phone matches the JWT's phone AND maintenance_access_enabled=true, with the inserted employee_id pointing at that same row — this is the ONLY new way a client can write to profiles; no other new INSERT/UPDATE path on profiles is added. The existing manager-update-team_lead-profiles policy is also extended to cover factory_worker and platform_admin rows (found missing in the comprehension check — a manager currently cannot update/deactivate a factory_worker profile without this). RLS on every new module table is authenticated-only, with role-based policies per PRD §8. Two new public Storage buckets exist: machine-parts and fault-reports.

## Scope
- Work only in: Supabase migrations (via the Supabase MCP apply_migration tool)
- Do NOT touch: any existing table's data. profiles and employees get ALTER TABLE + new/extended RLS policies only, never a data change to existing rows.

## Constraints
- Match existing naming/typing conventions exactly
- weekday CHECK must be 0-5 only (no Saturday)
- RLS must be authenticated-only — do not write a single anon-permissive policy on any new table
- The factory_worker write-access policy on module tables must check employees.maintenance_access_enabled through the profiles.employee_id join, not just employees.is_active
- The new profiles INSERT policy must be scoped as narrowly as described above — it must not become a general "anyone can insert their own profile" policy; role must be pinned to 'factory_worker' and the employees match must be checked inside the policy itself, not left to the application layer
- Only make changes directly requested — no columns/tables/abstractions beyond the PRD

## Acceptance Criteria
- [ ] Supabase:list_tables (verbose) shows all 11 new tables with correct columns, PKs, FKs
- [ ] profiles_role_check now accepts 'factory_worker' and 'platform_admin' and rejects anything else
- [ ] Inserting a profiles row with role='factory_worker' and employee_id NULL is rejected by the new constraint
- [ ] As an authenticated test user whose JWT phone matches an active employees row with maintenance_access_enabled=true: inserting a profiles row with role='factory_worker', id=their own auth.uid(), employee_id=that row succeeds
- [ ] The same insert FAILS when: the phone matches no employees row, the matching employees row is inactive, maintenance_access_enabled=false on it, or employee_id doesn't match the row the phone belongs to
- [ ] A test user cannot insert a profiles row for role='team_lead', 'factory_manager', or 'platform_admin', nor for an id other than their own auth.uid(), via this new policy
- [ ] A factory_manager-role test session can now update a factory_worker profile's is_active (previously would have failed against the unextended policy)
- [ ] Inserting two machine_parts rows for the same machine produces sequential part_no values with no race condition under concurrent inserts
- [ ] The next-due-date helper correctly shifts a monthly/yearly Saturday date to Sunday, leaves weekly dates untouched
- [ ] A direct anon-role query against any new table is rejected (verify via pg_policies or an anon-role test query)
- [ ] A factory_worker whose linked employee has maintenance_access_enabled=false cannot insert a maintenance_visits/fault_reports row (verify via a role-scoped test query)
- [ ] machine-parts and fault-reports Storage buckets exist and are public-read

## Stop Conditions
Stop and ask before:
- Writing any anon-permissive RLS policy on a new table
- Modifying any existing table's data or an existing table's RLS policy
- Naming a table/column differently from PRD §6

## Progress
After each completed step: ✅ [what was done] — [table/object affected]
```

🎯 Target: Claude Code · 💡 Makes the authenticated-only requirement a hard, independently-testable acceptance criterion instead of prose, since this is exactly the assumption that was wrong in v1 and needs to not regress.

**Session Strategy:** New session — schema-only, no prior context needed.

---

## Phase 2 — Admin catalogs + employee access toggle *(SUPERSEDED — see Phase 2-revision below)*

```
## Objective
Add two new admin catalog tabs (מחזורי טיפול, משימות תחזוקה) to /manager/settings, and add a per-employee maintenance-access toggle to the EXISTING employees tab, per PRD §7.1.

## Context
Search the codebase for how the existing /manager/settings tabs (לקוחות, פרויקטים, ראשי צוות) are implemented (list+add, deactivate-only) and match that for the two new tabs. Separately, find the existing employees tab (used for the lunch-ordering roster) and add the access toggle there — do not build a parallel employees screen.

## Target State
Two new tabs exist (periods, tasks) with add + deactivate/reactivate working. The existing employees tab gains a "גישה למודול תחזוקה" toggle per row (employees.maintenance_access_enabled), restricted to factory_manager/platform_admin.

## Scope
- Work only in: /manager/settings and its existing employees tab
- Do NOT touch: any other admin screen

## Constraints
- Reuse existing form/list components where the existing tabs already match
- No maintenance-worker roster tab, no QR-password field — neither exists in v2
- Only make changes directly requested

## Acceptance Criteria
- [ ] Both new catalog tabs render, list active rows, support add + deactivate/reactivate
- [ ] The employees tab shows and persists the new toggle per employee
- [ ] The toggle is only interactable by factory_manager/platform_admin sessions

## Stop Conditions
Stop and ask before:
- Adding edit or hard-delete capability
- Building a separate maintenance-worker roster screen (removed in v2 — do not resurrect it)

## Progress
After each completed step: ✅ [what was done] — [file(s) affected]
```

🎯 Target: Claude Code · 💡 Explicitly forbids rebuilding the v1 roster tab that v2 deliberately removed, since it's the kind of thing an agentic session might "helpfully" restore if it only skims the PRD.

**Session Strategy:** Continue — needs Phase 1's table names and the existing employees-tab component.

**This phase already ran and shipped (מחזורי טיפול tab, standalone catalogs).** Two decisions made after it shipped correct it: (1) periods are no longer admin-manageable at all, (2) a new `תלת שנתי` frequency was added with a redefined meaning. The correction is its own phase below — do not re-run this block as written.

---

## Phase 2-revision — Remove periods admin UI, add the triannual frequency, restructure navigation

```
## Objective
Correct Phase 2's already-shipped output per three decisions made after it ran: (1) remove the מחזורי טיפול admin tab entirely — periods become fixed/seeded, never admin-editable; (2) add a new schedule_kind 'triannual' (תלת שנתי, 3x/year, every 4 months) and rename the existing once-per-3-years cadence to אחת לשלוש שנים so the two aren't ambiguous; (3) restructure navigation so machines, parts, and tasks all live under one new parent tab, תחזוקת מכונות, with sub-tabs מכונות and משימות תחזוקה — instead of a separate periods tab and (in the not-yet-built Phase 3) a standalone /manager/machines route.

## Context
Read PRD §6.1, §7.1-7.3, and §9's three newest resolved-decision bullets in full before starting — this phase exists specifically because those sections changed after Phase 2 shipped. Find whatever component Phase 2 built for the מחזורי טיפול tab (list+add UI) and remove it entirely, not just hide it.

## Target State
- maintenance_periods' schedule_kind CHECK now includes 'triannual'. The table is seeded with exactly four rows: שבועי (weekly), חודשי (monthly), תלת שנתי (triannual), אחת לשלוש שנים (yearly, interval_years=3) — if the earlier phase already seeded a differently-named or differently-defined row for the 3-year cadence, it is renamed/corrected, not duplicated.
- The next-due-date helper function (from Phase 1) gains a branch for schedule_kind='triannual': computes the next occurrence as anchor_month + 4 months (wrapping year, using day_of_month as the day), applying the same Saturday-shift rule as monthly/yearly.
- The מחזורי טיפול admin tab/component is deleted. No UI anywhere lets an admin add, edit, or deactivate a period catalog row.
- /manager/settings gains one new top-level tab, תחזוקת מכונות, containing two sub-tabs: מכונות (empty for now — Phase 3 builds its content) and משימות תחזוקה (Phase 2's existing tasks tab, relocated under this new parent, behavior unchanged).
- The employees-tab access toggle (Phase 2, already shipped) is untouched — it doesn't move, it was never part of this restructuring.

## Scope
- Work only in: maintenance_periods' schema/seed data, the Phase 1 next-due-date helper function, and /manager/settings' tab structure (removing the periods tab, adding the תחזוקת מכונות parent + its two sub-tabs)
- Do NOT touch: the employees tab/toggle, any other existing admin tab, machine_periods/machine_period_tasks (Phase 3/4 haven't built their UI yet, but don't touch their table structure here either)

## Constraints
- Create a git tag before this migration (e.g. pre-period-catalog-revision) — it alters an already-seeded table's CHECK constraint and data
- Do not leave a dangling/hidden version of the periods tab — delete the component, don't just remove it from navigation
- Only make changes directly requested

## Acceptance Criteria
- [ ] maintenance_periods contains exactly the four rows described above, correctly named and configured, verified via a direct query
- [ ] No admin UI path exists to add, edit, or deactivate a maintenance_periods row (confirm by reading the relevant components, not just clicking around)
- [ ] The next-due-date helper correctly computes a triannual occurrence 4 months after a given anchor, with the Saturday-shift rule applied
- [ ] /manager/settings shows תחזוקת מכונות as a top-level tab with מכונות and משימות תחזוקה as its sub-tabs; משימות תחזוקה behaves exactly as it did before the move
- [ ] The employees tab and its access toggle are unaffected

## Stop Conditions
Stop and ask before:
- Choosing a different seed set than the four rows listed above
- Leaving any admin-facing way to modify maintenance_periods

## Progress
After each completed step: ✅ [what was done] — [file/table affected]
```

🎯 Target: Claude Code · 💡 Treats this explicitly as a correction to already-shipped work, not a fresh feature — naming the exact component to delete and the exact seed data to end up with, so the session doesn't have to infer either from the PRD's prose alone.

**Session Strategy:** Continue — needs Phase 1's schema/helper function and Phase 2's shipped tab code to correct.

---

## Phase 2-revision-2 — Delete אחת לשלוש שנים, restore שנתי

```
## Objective
Correct Phase 2-revision's already-shipped seed data: Roy has decided the module does not need a "once every 3 years" period at all — delete the אחת לשלוש שנים row outright, not just keep it renamed. Separately, restore a plain שנתי (once-a-year, interval_years=1) row, which was correctly part of Roy's original four-period list (שבועי/חודשי/שנתי/תלת שנתי) but was accidentally dropped from the PRD during an earlier edit and therefore never got seeded.

## Context
Read PRD §6.1, §7.1, and §9's newest resolved-decision bullet before starting — they now describe the final four-row catalog as שבועי / חודשי / שנתי / תלת שנתי, with no 3-year variant at all. Phase 2-revision (already run) seeded אחת לשלוש שנים (schedule_kind='yearly', interval_years=3) instead of a plain שנתי (interval_years=1) — that's the specific row to delete and replace.

## Target State
maintenance_periods contains exactly four rows: שבועי (weekly), חודשי (monthly), שנתי (yearly, interval_years=1), תלת שנתי (triannual). The אחת לשלוש שנים / interval_years=3 row no longer exists. If any machine_periods row was already assigned to the deleted period (unlikely this early, but check), stop and ask rather than deleting it silently — a period assignment with real due-date history is not the same kind of change as an unused catalog row.

## Scope
- Work only in: maintenance_periods' seed data (delete one row, insert one replacement)
- Do NOT touch: the schedule_kind CHECK constraint, the next-due-date helper, any admin UI (none of that changes for this correction — 'yearly' already exists as a schedule_kind, only the seeded row's interval_years and name change)

## Constraints
- If any machine_periods row already references the אחת לשלוש שנים catalog row, stop and ask before deleting anything
- Only make changes directly requested
- No admin UI change needed or wanted — this is a data-only correction

## Acceptance Criteria
- [ ] maintenance_periods contains exactly the four rows described above, verified via a direct query
- [ ] No machine_periods row references a now-deleted period (checked before deleting, not after)
- [ ] No schema, helper function, or UI change was made — this phase touches seed data only

## Stop Conditions
Stop and ask before:
- Deleting a period row that has any machine_periods rows referencing it

## Progress
After each completed step: ✅ [what was done] — [table affected]
```

🎯 Target: Claude Code · 💡 Explicitly separates "delete a catalog row" from "delete a catalog row something already depends on" as a stop condition, since Phase 3 (machine period assignment) hasn't run yet but this phase shouldn't assume that — it should check, not assume.

**Session Strategy:** Continue — needs Phase 2-revision's seed data to correct. Run before Phase 3, since Phase 3 will offer the period list to admins for the first time.

---

## Phase 2-revision-3 — Remove maintenance_tasks catalog, make tasks machine-owned

```
## Objective
Correct Phase 1's schema and Phase 2/Phase 2-revision's shipped UI per a third decision: tasks are not a shared, foreign-keyed catalog. After reviewing Roy's real machine/task mapping (a CSV of the actual 21 machines and their tasks), a task exists only in the context of one machine's period assignment. Drop the maintenance_tasks table entirely; machine_period_tasks.task_id (FK) becomes machine_period_tasks.task_name (plain text). Remove the משימות תחזוקה tab/component (already relocated once in Phase 2-revision) entirely — there is no standalone task-management destination anymore, in any form. Collapse the now-single-child תחזוקת מכונות parent-tab-with-sub-tabs structure into one flat tab (the machines list itself, no nested sub-tab bar).

## Context
Read PRD §6.1, §6.3, §7.1, and §9's two newest resolved-decision bullets before starting. Check whether any machine_period_tasks rows exist yet referencing maintenance_tasks (Phase 3 hasn't shipped, so this is likely empty, but confirm rather than assume before altering the column).

## Target State
- maintenance_tasks table is dropped.
- machine_period_tasks.task_id (uuid FK) is replaced with task_name (text, NOT NULL) — same table, column swapped, not a new table.
- machine_period_log_tasks.task_id is replaced with machine_period_task_id (FK to machine_period_tasks(id) instead of maintenance_tasks(id)) — this table already changed in Phase 1's original design to reference the catalog; it now references the machine-owned row directly.
- The משימות תחזוקה tab/component is deleted (not hidden) from wherever Phase 2-revision left it.
- תחזוקת מכונות becomes a single flat admin tab with no sub-tab navigation — it shows the machines list directly. (Phase 3, not yet built, will populate this tab's actual content; this phase only needs to remove the now-empty sub-tab shell, if Phase 2-revision already built one.)

## Scope
- Work only in: maintenance_tasks/machine_period_tasks/machine_period_log_tasks schema, and whatever tab/shell component currently renders תחזוקת מכונות's sub-tab navigation
- Do NOT touch: the employees tab/toggle, machine_periods, maintenance_periods, or any other existing table/screen

## Constraints
- Create a git tag before this migration (e.g. pre-task-model-revision) — it drops a table
- If any machine_period_tasks or machine_period_log_tasks row already exists referencing the old FK structure, stop and ask rather than deleting data silently
- Only make changes directly requested

## Acceptance Criteria
- [ ] maintenance_tasks no longer exists, verified via Supabase:list_tables
- [ ] machine_period_tasks has a task_name text column, no task_id column
- [ ] machine_period_log_tasks references machine_period_tasks(id), not any remaining maintenance_tasks row
- [ ] No component anywhere in the app renders a standalone task-management screen or a משימות תחזוקה tab
- [ ] תחזוקת מכונות renders as a single flat tab, no sub-tab bar with only one entry

## Stop Conditions
Stop and ask before:
- Deleting any existing machine_period_tasks/machine_period_log_tasks data
- Leaving any admin-facing path to manage tasks independent of a machine

## Progress
After each completed step: ✅ [what was done] — [table/file affected]
```

🎯 Target: Claude Code · 💡 Treats the column swap (task_id → task_name) as a real schema migration with a data-safety check, not a cosmetic rename — since machine_period_log_tasks' FK target also has to move in the same pass or it'll point at a table that no longer exists.

**Session Strategy:** Continue — needs Phase 1's schema and whatever Phase 2-revision built for the tab shell. Run before Phase 3.

---

## Phase 3 — Machine management + real data import

```
## Objective
Build the תחזוקת מכונות tab (a single flat tab, not a sub-tab — see Phase 2-revision-3): machine list, add/edit, per-machine period assignment with inline task management, and QR generation/display, per PRD §7.1. Also import Roy's real 21-machine dataset (מיפוי_מכונות_Enbar_-_מכונות.csv — Roy will attach or place this file for you; if it isn't present, stop and ask for it rather than inventing placeholder machines) as this phase's seed data, instead of Roy typing all 21 in by hand afterward.

## Context
Search the codebase for the existing manager-area tab pattern and for an existing QR-generation dependency; if none exists, check package.json before adding one. Period selection must read from the fixed four-row maintenance_periods list (Phase 2-revision) — there is no "add a period" action. Task entry is inline per machine period: a text input with autocomplete suggesting values already used elsewhere (SELECT DISTINCT task_name FROM machine_period_tasks) — there is no separate task-picker screen or shared catalog to select from (Phase 2-revision-3 removed that model entirely).

The CSV's columns are: מספר מכונה, שם מכונה, חלקים (a comma-separated free-text list, not structured — only present for some machines), תקופת טיפול (period name per task row — שבועי/חודשי/תלת שנתי, one of the fixed four), משימות (the task text for that machine+period). Each machine has one row per task, with machine/parts columns only filled on the task's first row for that machine (blank on subsequent rows for the same machine — carry the last-seen machine down when parsing).

**Known gap: the CSV has no schedule anchor (no specific weekday/day-of-month/month+day) for any machine.** Import each machine_periods row with a placeholder anchor — weekday=0 (Sunday) for weekly, day_of_month=1 for monthly, anchor_month=1/anchor_day=1 for yearly/triannual — and compute next_due_date from that placeholder via the Phase 1 helper. This is a deliberate placeholder, not a guess at Roy's real intent: he will correct each machine's actual anchor by hand afterward through the UI this phase builds. List every machine+period you imported with a placeholder anchor in your final report so Roy knows exactly what still needs a real value.

## Target State
תחזוקת מכונות lists machines with #{machine_no} (zero-padded), name, location, active toggle. Add/edit works. Within a machine's detail, one of the four fixed periods can be attached, with the correct anchor input shown per its schedule_kind (weekday picker for weekly, day-of-month for monthly, month+day for triannual and yearly). Tasks for that period are added directly as text, with autocomplete suggesting existing task_name values typed for other machines — selecting a suggestion just fills the text, it does not create any link or reference. Saving a period assignment computes its initial next_due_date via the Phase 1/Phase 2-revision helper (Saturday-shift applied, triannual branch included). A QR encoding the machine's UUID (never machine_no) is generated and displayed for printing immediately on machine creation.

Separately: all 21 real machines from the CSV exist in the database, in machine_no order matching the CSV's מספר מכונה column (insert in CSV order so the IDENTITY column assigns matching numbers — verify this held, don't assume it), each with its real name, its real parts (as machine_parts rows with only `name` populated — the CSV has no price/SKU/store data, leave those fields null), its real period assignments (with placeholder anchors per above), and its real tasks as machine_period_tasks.task_name text, exactly as written in the CSV.

## Scope
- Work only in: the תחזוקת מכונות tab (flat, no sub-tab route), and a one-time data-import migration/script for the CSV
- Do NOT touch: any other existing manager route or tab

## Constraints
- QR payload MUST be machines.id (uuid), never machine_no
- weekday options must only offer Sunday-Friday
- No UI action to add/edit/deactivate a period — periods are picked from the fixed four, never created
- No standalone task list/picker screen — tasks are only ever added while editing a specific machine's period, as plain text
- Do not invent schedule anchors beyond the stated placeholder rule — no guessing a "likely" day for any specific machine
- Check package.json before adding any new dependency
- Only make changes directly requested

## Acceptance Criteria
- [ ] Creating a machine immediately shows a printable QR
- [ ] Decoding that QR yields the machine's UUID, not its display number
- [ ] Weekly period attachment only allows Sunday-Friday as anchor day
- [ ] Monthly/triannual/yearly attachment shows the correct anchor input for each
- [ ] The period picker offers exactly the four fixed rows, with no way to add a fifth
- [ ] Adding a task under one machine's period does not appear as a selectable/linked item under any other machine — only as an autocomplete text suggestion
- [ ] Editing a task's text on one machine does not change the same-looking text on another machine's row
- [ ] Tasks attached to a machine period persist and reload correctly
- [ ] All 21 CSV machines exist, with machine_no matching the CSV's מספר מכונה column, verified via a direct query
- [ ] Every task and part from the CSV was imported with the exact original text, spot-checked across at least 5 machines
- [ ] The report lists every machine+period that received a placeholder anchor (this will be all of them) so Roy knows what to fix by hand

## Stop Conditions
Stop and ask before:
- Adding any new npm dependency
- Using machine_no anywhere in a URL, route param, or QR payload
- Building any standalone task-management screen or shared task-picker
- Proceeding with the import if the CSV file isn't actually available to you

## Progress
After each completed step: ✅ [what was done] — [file(s) affected]
```

🎯 Target: Claude Code · 💡 Separates "build the screen" from "import real data" as two halves of one phase's acceptance criteria, and makes the placeholder-anchor gap an explicit, reported fact rather than a silent guess — since inventing a plausible-looking schedule for 21 real machines would be worse than an obvious placeholder Roy knows to fix.

**Session Strategy:** Continue — needs Phase 1 schema, Phase 2-revision-3's corrected task model, and the fixed period list. Make sure the CSV file is actually accessible to this Claude Code session (attached or placed in the repo) before pasting this prompt.

---

## Phase 4 — Parts catalog

```
## Objective
Add a parts tab/screen per machine (list + add/edit) covering all fields in PRD §6.5, including photo upload to the machine-parts bucket.

## Context
Search the codebase for the existing photo-upload pattern used in the daily-report flow (client-side compression via browser-image-compression) and reuse it. Note: Phase 3's CSV import already created machine_parts rows for machines that had a חלקים column — name populated, every other field null. This phase's UI must let those rows be edited to fill in the rest (store, price, SKU, photo, etc.), not just support adding brand-new parts.

## Target State
Within a machine's detail, a parts tab lists machine_parts rows (including the name-only rows Phase 3 already imported) and supports add/edit with all PRD §6.5 fields, including a photo uploaded to the machine-parts bucket.

## Scope
- Work only in: the machine detail area built in Phase 3
- Do NOT touch: the existing report-photos upload path itself

## Constraints
- quantity is descriptive only — no decrement/alert logic
- Only make changes directly requested

## Acceptance Criteria
- [ ] Adding a part auto-assigns a sequential part_no with no manual input
- [ ] Photo upload compresses client-side before upload, matching existing report-photo behavior
- [ ] Parts list reflects deactivation correctly

## Stop Conditions
Stop and ask before:
- Adding any quantity-decrement or stock-alert logic
- Modifying the existing report-photo upload code path

## Progress
After each completed step: ✅ [what was done] — [file(s) affected]
```

🎯 Target: Claude Code · 💡 Unchanged from v1.

**Session Strategy:** Continue — needs Phase 3's machine detail structure.

---

## Phase 3-revision — Date picker for yearly/triannual anchor, loosen anchor_day, February 29 shift

```
## Objective
Correct the yearly/triannual schedule-anchor UI shipped in Phase 3: two unlabeled number inputs (day, month) read as a duplicate-field bug in the live app. Replace with a single native date input; discard the picker's year, keep only month+day. Loosen machine_periods.anchor_day's CHECK from 1–28 to 1–31 (it was copied from monthly's day-alone logic, which doesn't apply here — yearly/triannual always pick day+month together as one real calendar date). Add a February-29-in-a-non-leap-year shift rule to the next-due-date helper (→ March 1), the one edge case a date picker can't resolve by itself.

## Context
Read PRD §5 (the two new shift-rule paragraphs) and §9's newest resolved-decision bullet before starting. **Coordinate with whatever branch currently owns the machine-detail component** — if a separate desktop-layout branch is mid-flight and hasn't merged to main yet, confirm with Roy this phase should run after that merge, not in parallel against the same files.

## Target State
The yearly/triannual anchor input in the machine-period-assignment UI is a single date picker, not two number boxes. Selecting a date stores only its month and day (anchor_month, anchor_day) — the year is never persisted anywhere. machine_periods.anchor_day's CHECK now allows 1–31. The next-due-date helper's yearly/triannual branch, when the anchor is month=2/day=29 and the target year is not a leap year, computes the occurrence as March 1 of that year instead — checked before the existing Saturday-shift rule (the two rules don't compound in a single computation).

## Scope
- Work only in: the yearly/triannual anchor input component, machine_periods' anchor_day CHECK constraint, and the next-due-date helper function
- Do NOT touch: the weekly/monthly anchor inputs, day_of_month's existing 1–28 CHECK, any already-set real anchor values (loosening a range doesn't require migrating existing 1–28 data — it's still valid under 1–31)

## Constraints
- The date picker's year must never be read, stored, or used in any computation — only month and day
- Only make changes directly requested

## Acceptance Criteria
- [ ] The yearly/triannual anchor UI is one date picker, not two number inputs
- [ ] Picking a date and saving persists only month+day; re-opening the form shows the same month+day regardless of what year was shown in the picker
- [ ] anchor_day now accepts 31, rejects 32+ and 0
- [ ] A yearly/triannual period anchored on Feb 29, computed for a non-leap target year, resolves to March 1 of that year
- [ ] Existing machine_periods rows with anchor_day 1–28 are unaffected (no data migration needed, verified by re-reading a few real rows Roy already set)
- [ ] Monthly's day_of_month input and its 1–28 CHECK are untouched

## Stop Conditions
Stop and ask before:
- Touching the monthly anchor input or its CHECK
- Proceeding if a separate branch has uncommitted changes to the same component

## Progress
After each completed step: ✅ [what was done] — [file/table affected]
```

🎯 Target: Claude Code · 💡 Explicitly makes branch-collision awareness a stop condition, not just a note, since this phase's own scope overlaps a real in-flight branch Roy is currently reviewing.

**Session Strategy:** Continue — needs Phase 3's machine detail structure and the next-due-date helper. Run only after the desktop-layout branch is merged.

---

## Phase 5 — Client-side self-provisioning + access-check helper

```
## Objective
Build the client-side piece of factory_worker self-provisioning per PRD §4.0 — a thin helper used by Phase 6/7's routes. This REPLACES v1's Phase 5 (a shared-password serverless gate) entirely — do not build a password gate, an Admin-API call, or any service-role code path here; the actual gate is the Phase 1 RLS INSERT policy on profiles, not this phase. This is deliberately a small phase: there is no server function to write, no admin action to wire up, and no new secret to manage.

## Context
Search the codebase for the existing phone-OTP login flow and session/profile-fetch logic (how AuthContext currently loads a profiles row after login) — this helper slots into that same flow, it does not replace it. Read PRD §4.0 in full before writing anything; the mechanism is intentionally minimal and it's easy to over-build this phase by adding steps the RLS policy already handles.

## Target State
After OTP login, if no profiles row exists yet for auth.uid(), the app attempts a single INSERT (role='factory_worker', id=auth.uid(), employee_id=<looked up from employees by matching phone>, display_name=<that employee's name>) using the user's own ordinary session. If Phase 1's RLS policy accepts it, the row now exists and the session proceeds normally. If Postgres rejects the insert (phone not in employees, inactive, or maintenance_access_enabled=false), the app catches that and shows a clear "access not enabled" message instead of retrying, looping, or falling back to any other access path. A small shared helper (used by Phase 6/7) exposes, for the current session: the resolved role, and for factory_worker, whether they currently have module access (re-checked live via a read against employees.maintenance_access_enabled through their profiles.employee_id — not just whether the profiles row exists, since access can be revoked after the row is created).

## Scope
- Work only in: the existing OTP-login/session flow (extend, do not replace) and a new small shared access-check helper for Phase 6/7 to call
- Do NOT touch: the team_lead/factory_manager login path itself, beyond confirming the new factory_worker branch doesn't interfere with it
- Do NOT write any server/serverless function, Admin API call, or service-role code — everything in this phase runs under the ordinary user session

## Constraints
- Do not build a password gate, shared secret, admin-triggered provisioning step, or session token separate from Supabase Auth's own session
- The insert attempt relies entirely on Phase 1's RLS policy for validation — do not duplicate that validation logic in the client and treat it as authoritative (the client-side check is only for a fast, friendly error message)
- Only make changes directly requested

## Acceptance Criteria
- [ ] A first-time login from a phone matching an active, access-enabled employees row results in a profiles row being created and the session proceeding to the checklist
- [ ] A first-time login from a phone with no matching employees row, or one with maintenance_access_enabled=false, shows the "access not enabled" message and does not proceed
- [ ] The access-check helper re-reads employees.maintenance_access_enabled live on each call rather than caching it for the life of the session (so a mid-day toggle-off takes effect without requiring logout)
- [ ] No new password/token/secret-comparison mechanism, server function, or service-role usage exists anywhere in this phase's diff

## Stop Conditions
Stop and ask before:
- Building any password or shared-secret gate, or any server-side/service-role provisioning step
- Adding validation logic to the client that duplicates or overrides the Phase 1 RLS policy's decision

## Progress
After each completed step: ✅ [what was done] — [file(s) affected]
```

🎯 Target: Claude Code · 💡 Explicitly caps this phase's size — the risk here isn't a missing password gate anymore (that idea is dead), it's an agentic session over-building a server-side provisioning layer that the RLS policy already makes unnecessary.

**Session Strategy:** New session — touches auth flow, isolate from UI-building context. Verify Phase 1 is fully applied and its profiles-insert acceptance criteria pass before starting this one — this phase is not meaningfully testable without that policy already in place.

---

## Phase 6 — Field checklist flow

```
## Objective
Build the authenticated /maintenance/:machineId route per PRD §7.4: real-auth gate (Phase 5's provisioning + access check), machine header, merged this-week checklist grouped by period, automatic session-based sign-off, independent per-period closing on submit.

## Context
Search the codebase for the existing /report/new form's submission pattern (client-side validation, submit status messaging) for UX consistency, and for how the existing OTP-login redirect works for unauthenticated visits to /manager/* — this route should intercept the same way.

## Target State
An unauthenticated visit to /maintenance/:machineId redirects into the existing OTP login; on return, Phase 5's access-check runs — if "not enabled," show a clear message, not the checklist. Otherwise, the worker sees only periods whose next_due_date falls in the current calendar week, grouped visually by period, with task checkboxes. There is NO worker/name selector — profile_id is attached automatically from the session. Submitting: for each period with every task checked, insert a machine_period_logs row (fully_completed=true) and advance next_due_date via the Phase 1 helper; for periods with any unchecked task, insert a log row (fully_completed=false) and leave next_due_date untouched. A visible "דיווח תקלה / שבר" link/button is always present.

## Scope
- Work only in: a new /maintenance/:machineId route and its components
- Do NOT touch: /report/new, any team-lead route, or the OTP login flow itself (call into it, don't modify it)

## Constraints
- No manual worker-selection UI of any kind — this is a v1 leftover, explicitly removed
- "This week" = calendar week Sunday-Friday
- A period only advances next_due_date when 100% of its tasks are checked
- No photo capture on this checklist
- Only make changes directly requested

## Acceptance Criteria
- [ ] Visiting this route while unauthenticated redirects to OTP login and returns to the same machine afterward
- [ ] A factory_worker with maintenance_access_enabled=false sees a clear blocked message, not the checklist
- [ ] A machine with two periods due in the same week shows both, visually separated, in one screen
- [ ] Checking all tasks in one period and none in another, then submitting, advances only the fully-checked period
- [ ] No dropdown, autocomplete, or text field for selecting "who is signing" exists anywhere in this route
- [ ] The fault-report link is visible and reachable independent of checklist completion state

## Stop Conditions
Stop and ask before:
- Adding any manual identity-selection control
- Adding photo capture to this flow

## Progress
After each completed step: ✅ [what was done] — [file(s) affected]
```

🎯 Target: Claude Code · 💡 Calls out the removed worker-picker explicitly as a forbidden addition, since "add a dropdown to select who's signing" is a very plausible agentic misread of "confirm identity" if it isn't told that identity is now automatic.

**Session Strategy:** Continue — needs Phase 1 schema and Phase 5's access-check helper.

---

## Phase 7 — Fault report flow

```
## Objective
Build the authenticated /maintenance/:machineId/fault route per PRD §7.5: description, optional photo, combined severity scale, optional multi-part autocomplete link, automatic session-based reporter identity.

## Context
Search the codebase for an existing autocomplete/multi-select pattern to reuse for the parts multi-select (note: v1's comprehension check found existing pickers are plain <select>, single-select only — this will need a small genuine extension, not a literal reuse), and for the existing photo-compression upload path.

## Target State
A worker can open this route from the machine screen (Phase 6) at any time (same auth/access-check gate as Phase 6). A required description, an optional photo (uploaded to the fault-reports bucket), a single severity value (low/medium/high/urgent), and an optional multi-select search over this machine's own parts. reported_by is set automatically from the session — no picker. Submitting creates a fault_reports row with status='new' and, if any parts were selected, fault_report_parts rows.

## Scope
- Work only in: a new /maintenance/:machineId/fault route and its components
- Do NOT touch: the Phase 6 checklist route beyond adding the link to it

## Constraints
- Severity is one combined scale, not two separate fields
- Parts linkage is optional, zero/one/many
- No reporter-selection UI of any kind
- Only make changes directly requested

## Acceptance Criteria
- [ ] Submitting with zero parts selected succeeds and creates no fault_report_parts rows
- [ ] Submitting with 2+ parts selected creates one fault_report_parts row per part
- [ ] The parts autocomplete only searches this machine's own machine_parts rows
- [ ] New fault reports default to status='new', reported_by = the session's profile
- [ ] No reporter-selection dropdown/field exists anywhere in this route

## Stop Conditions
Stop and ask before:
- Splitting severity into two fields
- Allowing parts from a different machine to be linked
- Adding any manual reporter-selection control

## Progress
After each completed step: ✅ [what was done] — [file(s) affected]
```

🎯 Target: Claude Code · 💡 Flags the autocomplete gap honestly (found by the earlier comprehension check) so the session doesn't waste time hunting for a component that doesn't exist, and locks the same no-picker rule as Phase 6.

**Session Strategy:** Continue — needs Phase 6's machine-screen context and Phase 4's parts data.

---

## Phase 8 — Manager reports

```
## Objective
Build the unified /manager/maintenance screen per PRD §7.6: three tabs/filters (history, missed, faults) plus fault status management with reminder-date highlighting, sourcing all "who did this" display from real profiles.display_name.

## Context
Search the codebase for src/pages/ExceptionView.jsx's status-stepping UI (NOT ManagerReport.jsx, which is a plain viewer with no status controls — confirmed by direct code inspection) as the reference pattern for the fault-report detail's status controls. Note that ExceptionView.jsx/PartOrderCard.jsx currently derive their status_updated_by from PROFILES[getProfile()] (src/lib/profile.js), which is dead code — setProfile() has no callers since ProfilePicker.jsx was removed, so it always resolves to "לא ידוע". Do not copy that pattern. This module's status_updated_by must be sourced from the real authenticated session's profiles.display_name.

## Target State
One screen under /manager/maintenance with tab/filter navigation between: (1) history — completed visits joined to their period logs and profiles.display_name, filterable by machine/period/worker/date range; (2) missed — machine_periods where next_due_date is in the past, computed live; (3) faults — fault_reports list filterable by status, opening to a detail view modeled on ExceptionView.jsx's status-stepping UI (new -> awaiting_part -> part_ordered -> in_progress -> resolved/rejected) and a reminder_date field, with status_updated_by correctly stamped from the acting session's real display_name. Fault reports whose reminder_date has arrived or passed are visually highlighted.

## Scope
- Work only in: a new /manager/maintenance route and its components
- Do NOT touch: the existing /manager dashboard, ManagerReport.jsx, or ExceptionView.jsx itself (model the pattern, don't modify the source)

## Constraints
- "Missed" must be computed from machine_periods.next_due_date < current_date at query time — no stored missed/overdue boolean column
- status_updated_by must use the real session's profiles.display_name, not any localStorage-derived value
- Reminder highlighting is visual only — no outbound notification
- Only make changes directly requested

## Acceptance Criteria
- [ ] The missed tab correctly reflects a machine_periods row the moment its next_due_date passes
- [ ] Changing a fault report's status persists and stamps status_updated_by with the real acting profile's display_name (verify it is NOT "לא ידוע" for a properly authenticated test session)
- [ ] A fault report with a past-due reminder_date is visually distinguishable in the faults list
- [ ] No new outbound notification code exists anywhere in this phase's diff
- [ ] History tab correctly displays the real display_name for each logged visit, not a placeholder

## Stop Conditions
Stop and ask before:
- Adding a stored "missed" flag or any scheduled job
- Adding any notification-sending code
- Copying the PROFILES[getProfile()] pattern for status_updated_by

## Progress
After each completed step: ✅ [what was done] — [file(s) affected]
```

🎯 Target: Claude Code · 💡 Corrects the wrong file reference from the earlier comprehension check and explicitly forbids reproducing the dead-code identity pattern it found, turning both findings into acceptance criteria instead of just prose warnings.

**Session Strategy:** Continue — final phase, needs all prior schema and the ExceptionView.jsx status-stepping reference pattern.
