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

## Phase 2 — Admin catalogs + employee access toggle

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

---

## Phase 3 — Machine management

```
## Objective
Build a new /manager/machines admin area: machine list, add/edit, per-machine period assignment, and QR generation/display, per PRD §7.2.

## Context
Search the codebase for the existing manager-area routing pattern and for an existing QR-generation dependency; if none exists, check package.json before adding one.

## Target State
/manager/machines lists machines with #{machine_no} (zero-padded), name, location, active toggle. Add/edit works. Within a machine's detail, periods can be attached with the correct anchor input per schedule_kind, and tasks can be attached per period. Saving a period assignment computes its initial next_due_date via the Phase 1 helper (Saturday-shift applied). A QR encoding the machine's UUID (never machine_no) is generated and displayed for printing immediately on machine creation.

## Scope
- Work only in: a new /manager/machines route and its components
- Do NOT touch: any existing manager route

## Constraints
- QR payload MUST be machines.id (uuid), never machine_no
- weekday options must only offer Sunday-Friday
- Check package.json before adding any new dependency
- Only make changes directly requested

## Acceptance Criteria
- [ ] Creating a machine immediately shows a printable QR
- [ ] Decoding that QR yields the machine's UUID, not its display number
- [ ] Weekly period attachment only allows Sunday-Friday as anchor day
- [ ] Monthly/yearly attachment shows the correct anchor input
- [ ] Tasks attached to a machine period persist and reload correctly

## Stop Conditions
Stop and ask before:
- Adding any new npm dependency
- Using machine_no anywhere in a URL, route param, or QR payload

## Progress
After each completed step: ✅ [what was done] — [file(s) affected]
```

🎯 Target: Claude Code · 💡 Unchanged from v1 — this phase wasn't affected by the auth-model correction.

**Session Strategy:** Continue — needs Phase 1 schema and Phase 2's admin-tab conventions.

---

## Phase 4 — Parts catalog

```
## Objective
Add a parts tab/screen per machine (list + add/edit) covering all fields in PRD §6.5, including photo upload to the machine-parts bucket.

## Context
Search the codebase for the existing photo-upload pattern used in the daily-report flow (client-side compression via browser-image-compression) and reuse it.

## Target State
Within a machine's detail, a parts tab lists machine_parts rows and supports add/edit with all PRD §6.5 fields, including a photo uploaded to the machine-parts bucket.

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
