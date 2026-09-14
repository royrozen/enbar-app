# HANDOFF

Written 2026-09-14, for a reader with zero prior context.

## Branches
- `fix/settings-desktop-layout` — **merged to `main`**. Desktop split-console
  redesign, part-detail expand, QR print popup, machine search, select-arrow
  CSS fix, CLAUDE.md auth doc fix.
- `fix/period-anchor-datepicker` — **merged to `main`**. Phase 3-revision:
  yearly/triannual anchor is now a date picker, `anchor_day` loosened to
  1-31, Feb-29 shift rule.
- `feat/factory-worker-self-provisioning` — **new, built and verified at the
  DB/RLS level, not yet merged.** Phase 5 (see below). Blocked on a real
  phone-OTP login test that only Roy can run.

## Where things stand
### Phase 5 — factory_worker self-provisioning (this session, current branch)
Per PRD §4.0: when a `factory_worker` logs in via OTP for the first time,
there's no `profiles` row for them. Previously `AuthContext.jsx` treated any
missing profile as an error and signed the user out. This phase makes the
app attempt to create that row itself first:

- **`src/lib/auth.js`** — `provisionFactoryWorker(session)`: calls the new
  `resolve_own_employee()` RPC, and if it resolves an employee, attempts
  `INSERT INTO profiles (id, role, phone, employee_id, display_name)`
  under the user's own session. Returns `false` on any Postgres rejection.
- **`src/lib/AuthContext.jsx`** — `loadProfile()` now tries
  `provisionFactoryWorker` once when `fetchProfile` comes back empty, then
  re-fetches. Falls through to the existing "אין לך הרשאה..." error/sign-out
  path unchanged if provisioning didn't succeed — no new error copy was
  added, the existing message already fits.
- **New DB function `resolve_own_employee()`** (SECURITY DEFINER, migration
  `add_resolve_own_employee_for_self_provisioning`, applied to
  `enbar-Webapp-dev`): **not in the original phase spec, but necessary** —
  `employees` is manager-only `SELECT` (see `pg_policies`), so a
  not-yet-provisioned session has no way to look up its own `employee_id`/
  name to build the insert. This function derives everything from
  `auth.jwt() ->> 'phone'` internally (never a parameter), so it can only
  ever resolve the caller's own phone, mirroring the exact predicate
  `employee_access_match()` already uses for the Phase 1 RLS gate. No new
  RLS policy was added to `employees` itself — this was the narrower option.
- **`src/lib/maintenanceAccess.js`** (new) — `getModuleAccess(profile)`,
  the small shared helper for Phase 6/7. For `role !== 'factory_worker'`
  returns `{ role, hasAccess: null }` (this module doesn't define other
  roles' access policy — not this phase's call to make). For
  `factory_worker`, live-calls the existing `employee_access_match()` RPC
  (already `GRANT EXECUTE`d to `authenticated`) — no caching, no new schema
  needed for this half.

### Verification done this session for Phase 5
All at the DB level, simulating the exact insert/RPC shapes the client code
produces (`SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', ...)`
against a real `auth.users` row):
- Eligible phone (matching, active, access-enabled employee) → insert
  succeeds, `resolve_own_employee()` correctly resolves `employee_id` +
  `display_name`.
- Unmatched phone (no `employees` row at all) → insert rejected by RLS
  (`42501: new row violates row-level security policy`).
- Matched employee with `maintenance_access_enabled = false` →
  `resolve_own_employee()` returns zero rows, so `employee_id` is null and
  the insert is rejected the same way.
- Live re-check, no caching: provisioned a test profile, called
  `employee_access_match()` (false, access was off), flipped
  `maintenance_access_enabled` to `true`, called again in the same
  session — flipped to `true` immediately, no logout involved. This is
  exactly what `getModuleAccess()` wraps.
- All test rows (the temp profile, the unverified `auth.users` row created
  by a failed OTP-send attempt during testing) were deleted afterward — dev
  DB is clean. The one real employee phone Roy set up for testing
  (`0503332121`, לב קושב) was left with `maintenance_access_enabled = true`,
  its intended state.
- `npm run build` clean.

**NOT verified — needs Roy specifically:** an actual phone-OTP login
click-through. This agent tried logging in as `0503332121` with the OTP
`123456` (the one working test code known from earlier in this session) and
it was rejected — that code is apparently whitelisted only for
`0503338181`, not this new number. An agent session can't receive real SMS,
so Roy needs to run the real login himself (or share a working test OTP for
that number) before this branch can be trusted end-to-end and merged.

## Test credentials (local dev only)
Real Supabase phone-OTP login: phone `0503338181`, OTP `123456` — this one
already has an existing `factory_manager` profile, so it will **never**
exercise the new self-provisioning path (it short-circuits at the first
`fetchProfile`). To test Phase 5 itself, log in as `0503332121` (לב קושב) —
OTP unknown to this agent, real SMS or a configured test code needed.

## What's next
1. Roy runs a real OTP login as `0503332121` and confirms: profile gets
   created, session proceeds normally (currently lands on `/manager` per
   existing `Login.jsx` redirect logic — see note below).
2. If that works: push branch → `gh pr create` → merge, same flow as the
   previous two branches.
3. Phase 6 — field checklist flow (new `/maintenance/:machineId` route) is
   next after that. It's the natural place to also fix the routing gap
   noted below, since it's the phase that actually defines where a
   `factory_worker` should land.
4. `fault-reports` Storage bucket still has no `storage.objects` RLS
   policies (same gap `machine-parts` had, fixed in Phase 4) — Phase 7's job.

## The one thing to remember
**A successfully-provisioned `factory_worker` currently lands on `/manager`**
(`Login.jsx`'s redirect is `profile.role === 'team_lead' ? '/home' : '/manager'`,
and `RequireManager` doesn't exclude `factory_worker`) — there is no
`factory_worker`-specific route yet since Phase 6 hasn't been built. This
is a known, expected gap, not a bug in this phase: Phase 5's own spec scope
was self-provisioning only, and guessing at Phase 6's eventual routing now
would be over-building. Don't be surprised if a first successful worker
login looks like it landed somewhere odd — that's expected until Phase 6.

Also: `resolve_own_employee()` (this phase's one schema addition beyond the
spec) is now part of the app's permanent security surface, same trust level
as `employee_access_match()` — if either is ever revisited, revisit them
together, they encode the same access predicate in two different shapes
(one for "find my employee row", one for "check my employee row").
