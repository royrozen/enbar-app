# HANDOFF

Written 2026-09-15, for a reader with zero prior context.

## Branches
- `feat/factory-worker-self-provisioning` — **merged to `main`** (PR #4). Phase 5:
  factory_worker self-provisioning on first OTP login. Roy ran the real
  phone-OTP login himself on 2026-09-15 and it worked — the `profiles` row
  was created with `role=factory_worker`, the right `employee_id`, and the
  employee's name as `display_name`. That was the one thing the previous
  handoff listed as unverified; it is now verified.
- `feat/maintenance-checklist-flow` — **current branch, built and working,
  not yet pushed or merged.** Phase 6 (see below).

## Where things stand
### Phase 6 — field checklist flow (this session, current branch)
New route `/maintenance/:machineId` (`src/pages/Maintenance.jsx`), per PRD
§7.3. What it does:

- Machine header (`#{machine_no}` zero-padded, name, location).
- Shows only the machine's periods whose `next_due_date` falls inside the
  current calendar week (Sunday-Friday), grouped by period name with the
  due date shown next to it (e.g. `שבועי — 17/09/2026`). One checkbox per
  `machine_period_tasks` row.
- **No worker/name picker anywhere** — this is explicitly forbidden by the
  phase spec; identity comes from the session (`maintenance_visits.profile_id`).
- Submit writes one `maintenance_visits` row, then per due period a
  `machine_period_logs` row (`fully_completed` only when every task in that
  period is checked) and one `machine_period_log_tasks` row per task.
  Only fully-completed periods advance their `next_due_date`.
- An always-visible `דיווח תקלה / שבר` link. **Its destination doesn't exist
  yet** — Phase 7 builds `/maintenance/:machineId/fault`, so today clicking
  it hits App.jsx's catch-all `*` route and lands on the login screen. This
  is expected, not a bug; the phase spec requires the link to be present.

### Two DB functions added this phase (both beyond the literal phase spec, both necessary)
Same judgement call as Phase 5's `resolve_own_employee()`: a narrow
SECURITY DEFINER function was the smaller option than widening RLS.

1. **`advance_machine_period(p_log_id uuid)`** — `machine_periods` UPDATE is
   manager-only, so a factory_worker has no way to roll a period's
   `next_due_date` forward after completing it. This resolves everything
   from a log row the caller's own visit produced (ownership via
   `maintenance_visits.profile_id = auth.uid()`) and only acts when that log
   is already `fully_completed`; it can't be pointed at an arbitrary
   `machine_period_id`.
2. **`machine_week_checked_tasks(machine_id, week_start, week_end)`** — the
   SELECT policies on `machine_period_log_tasks`/`machine_period_logs`/
   `maintenance_visits` are own-visit-only, so a task checked by worker A on
   Monday would be invisible to worker B on Thursday. This returns only the
   task ids already checked in the given week for that machine plus when,
   gated on the same `maintenance_access()` predicate the INSERT policies
   already use — so it grants nothing to anyone who couldn't already write a
   visit for that machine.

### Behaviour worth knowing: already-done tasks are locked
A task checked off earlier this week renders **checked, disabled, and dated**
(`✓ 14/09/2026`). Roy asked for this explicitly. It replaced an earlier
localStorage draft of *unsubmitted* checkbox state, which he rejected —
**only submitted work persists; nothing is saved until Submit.** Don't
reintroduce a draft.

### Two incidental fixes in this phase
- `RequireProfile` (App.jsx) now passes the intercepted path as
  `location.state.from`, and `Login.jsx` returns there after OTP instead of
  always going to the role's default home. Phase 6's acceptance criteria
  require a signed-out QR scan to come back to the same machine. Note this
  only covers the in-app intercept — a hard browser refresh drops React
  Router's history state, so that path still falls back to the default home.
- The Sunday-Friday week range is now built from local date parts rather
  than `toISOString()`, which was putting an evening visit on the previous
  UTC day.

### Verification done this session
- `advance_machine_period`: advances correctly on a fully-completed log
  (weekly 2026-09-17 → 2026-09-24), returns NULL for an incomplete log, and
  returns NULL when a different `auth.uid()` tries to advance someone else's
  log. All role-simulated (`SET LOCAL ROLE authenticated` + `request.jwt.claims`)
  inside transactions that were rolled back — dev DB unchanged.
- `machine_week_checked_tasks`: returns the right task ids + timestamps for
  the week, and zero rows for a user without maintenance access.
- `npm run build` clean.
- **Roy confirmed the real UI in his own logged-in browser** — the checklist
  renders, and after his 2026-09-14 submission (5 of 6 weekly tasks checked
  on machine #001 קו ייצור) those five now show locked with their date.

## Test credentials (local dev only)
- `0503338181` / OTP `123456` — existing `factory_manager`, so it never
  exercises the factory_worker paths.
- `0503332121` (לב קושב) — the real factory_worker test account. Real SMS,
  no fixed test code; **only Roy can run this login**, an agent session
  can't receive SMS. Its `profiles` row now exists, so it no longer
  exercises self-provisioning either.

## What's next
1. Push `feat/maintenance-checklist-flow` → `gh pr create` → merge, same
   flow as the last two branches.
2. Phase 7 — fault report flow (`/maintenance/:machineId/fault`). This also
   gives the existing checklist link a real destination. Note the
   `fault-reports` Storage bucket still has **no `storage.objects` RLS
   policies** (the same gap `machine-parts` had, fixed in Phase 4) — photo
   uploads there will fail silently until that's fixed, so do it as part of
   Phase 7.
3. Phase 8 — manager reports. There is currently no manager-facing UI for
   any of this: managers have SELECT-all RLS on the visit/log tables but
   nothing renders them, so submitted checklists are only visible via a
   direct DB query. Roy asked about this explicitly, so it's wanted.

## The one thing to remember
There are now **four** SECURITY DEFINER functions carrying the maintenance
module's access rules: `maintenance_access()`, `employee_access_match()`,
`resolve_own_employee()`, and this phase's `machine_week_checked_tasks()`
(plus `advance_machine_period()`, which enforces ownership rather than
module access). They encode overlapping predicates in different shapes. If
one is ever revisited, read all of them together — changing the access rule
in one place and not the others is the obvious way to put a hole in this.
