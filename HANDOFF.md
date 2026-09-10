# HANDOFF

Written 2026-09-10, for a reader with zero prior context.

## Branch
`feat/maintenance-tracking` — not merged to `main`. All work below lives here.

## Where things stand
Building the **maintenance module** (machine × maintenance-period tracking,
QR-triggered checklists, per-machine parts catalog, fault/breakage reporting).
Following `enbar-app - PRD/enbar-maintenance-module-implementation-plan.md`,
one phase per session. **Phases 1, 2, and a Phase 2-revision are done and
approved.** Phase 3 is next.

Read `enbar-app - PRD/enbar-maintenance-module-prd.md` (v2, current) and the
implementation plan (same folder) before touching anything — both are the
authoritative spec, already updated for every decision made mid-build.

### What shipped
- **Phase 1** — full DB schema for the module (11 tables), RLS, `profiles`/
  `employees` extended for the new `factory_worker`/`platform_admin` roles,
  self-provisioning RLS policy, `compute_next_due_date()` helper,
  `set_part_no()` trigger, two Storage buckets. Tag: `pre-maintenance-schema`.
- **App-wide `platform_admin` superadmin** — a standalone migration (not part
  of the module's own phases) widening 40 pre-existing RLS policies across 16
  tables, plus the `/manager/settings` route guard, so `platform_admin` has
  identical access to `factory_manager` everywhere in the app. Tag:
  `pre-platform-admin-superadmin`.
- **Phase 2** — admin catalog tabs + the per-employee
  `maintenance_access_enabled` toggle on the existing employees tab.
- **Phase 2-revision** — corrected Phase 2's shipped output per three later
  decisions (see "the one thing to remember" below). Tag:
  `pre-period-catalog-revision`.

All of this is committed and pushed to `feat/maintenance-tracking`.

## What's verified vs. not
- **Verified:** every DB object (tables, constraints, RLS policies, helper
  functions, triggers, storage buckets) — via direct `pg_policies`/schema
  queries and role-simulated test transactions (real Postgres role switches +
  spoofed JWT claims, always inside a rolled-back transaction, zero
  persistent footprint). Every phase's own Acceptance Criteria was checked
  this way, individually, with evidence — not assumed from the migration
  text. `npm run build` passes clean after every frontend change.
- **NOT verified:** actual browser click-through. This agent session cannot
  complete a real phone-OTP login (no SMS delivery here), so nothing in
  `/manager/settings` has been clicked through in a live browser — only
  proven correct at the build + database layer. **Before Phase 3 (or anytime
  you want real confidence), open the Vercel preview for this branch and
  click through Phase 2/2-revision's admin screens yourself**: the employees
  tab's new toggle, and the `תחזוקת מכונות` parent tab with its `מכונות`
  (stub) and `משימות תחזוקה` sub-tabs.

## What's next
**Phase 3 — machine management.** Run it from
`enbar-app - PRD/enbar-maintenance-module-implementation-plan.md`, the
"Phase 3" block. It builds the `מכונות` sub-tab (currently a stub component,
`MachinesStubSection`, inside `src/pages/ManagerSettings.jsx`): machine list,
add/edit, per-machine period assignment, QR generation/display. Needs Phase
1's schema and Phase 2-revision's `MachineMaintenanceTab` structure already
in place (they are).

## The one thing to remember
**Maintenance periods are fixed, not admin-editable.** `maintenance_periods`
holds exactly 4 seeded rows (שבועי, חודשי, תלת שנתי, אחת לשלוש שנים) and
there is no admin UI anywhere to add, edit, or deactivate one — that tab
existed after Phase 2 and was deliberately deleted in Phase 2-revision. If a
future phase's UI needs to let someone pick a period, it must be a picker
over those 4 fixed rows, never an "add period" action. Adding a 5th frequency
later is a migration + a new `compute_next_due_date()` branch, not an in-app
feature.

Also worth knowing: `תלת שנתי` was redefined mid-project — it now means
**3 times a year** (`schedule_kind = 'triannual'`), not "once every 3 years."
The once-per-3-years cadence was renamed to `אחת לשלוש שנים` to avoid
confusion. Don't conflate the two if you see `תלת שנתי` referenced in old
context.
