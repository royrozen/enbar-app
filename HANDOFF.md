# HANDOFF

Written 2026-09-14, for a reader with zero prior context.

## Branches
- `fix/settings-desktop-layout` — **merged to `main`** (PR #2). Desktop
  split-console redesign of `תחזוקת מכונות`, part-detail expand, QR print
  popup, machine search, select-arrow CSS fix, CLAUDE.md auth doc fix.
- `fix/period-anchor-datepicker` — **new, built and verified, not yet
  reviewed by Roy or merged.** Phase 3-revision (see below). Branched off
  the now-current `main`.

## Where things stand
### Phase 3-revision — anchor date picker (this session, current branch)
The yearly/triannual schedule-anchor UI shipped in Phase 3 was two unlabeled
number inputs (day, month) that read as a duplicate-field bug in the live
app. This phase (spec'd earlier this session in the PRD/implementation-plan,
now built):
- **UI** (`src/pages/ManagerSettings.jsx`, `AddPeriodForm`): the two number
  inputs replaced with a single `<input type="date">`. A module constant
  `ANCHOR_PICKER_YEAR = 2024` (a leap year) is used only so Feb 29 is always
  selectable in the picker — the displayed year is discarded on every
  `onChange`, never read or stored. Weekly/monthly inputs untouched.
- **DB** (applied directly to the `enbar-Webapp-dev` Supabase project,
  `svsuntixvxwwuggtqsws`, via migration `loosen_anchor_day_and_feb29_shift`):
  `machine_periods.anchor_day`'s CHECK loosened from `1-28` to `1-31`
  (`day_of_month`'s own `1-28` CHECK, used by monthly, is untouched — separate
  constraint). `compute_next_due_date()`'s `triannual`/`yearly` branches gained
  a Feb-29-in-a-non-leap-year guard (→ March 1, checked before the existing
  Saturday-shift) — without it, `make_date()` throws for month=2/day=29 in a
  non-leap year, which would have crashed the RPC call.
- **No migration file committed to the repo** — this project doesn't appear
  to keep a `supabase/migrations` directory checked in (schema changes so
  far have all gone through direct MCP `apply_migration` calls against the
  dev project). Worth confirming with Roy whether that's intentional or
  whether migrations should start being tracked in-repo.

### Verification done this session for Phase 3-revision
- Direct SQL: `machine_periods_anchor_day_check` confirmed now `1-31`,
  `day_of_month`'s constraint confirmed still `1-28`. `compute_next_due_date`
  tested directly for: Feb 29 anchor + non-leap target year (→ correctly
  shifts to March 1), Feb 29 anchor + leap target year (→ lands exactly on
  Feb 29), a normal yearly case (unaffected), triannual with a Feb 29 anchor,
  and a monthly sanity check (unaffected). All matched expected output.
  Existing real `machine_periods` rows (anchor_day=1) spot-checked unaffected.
- Live click-through (Playwright, real phone-OTP login): added a new "שנתי"
  period via the date picker, set it to Feb 29 2024 (display year only),
  submitted, confirmed the resulting row in the DB has `anchor_month=2,
  anchor_day=29, next_due_date=2027-03-01` (today's dev-environment date is
  2026-09-14, so year+1=2027, non-leap → shifted correctly) — matches the
  direct-SQL result exactly. Screenshotted the picker on both desktop
  (`תלת שנתי` and `שנתי`) and mobile (no horizontal overflow, no console
  errors). Test period rows were deleted from the dev DB after each check —
  nothing test-related was left behind in real data.
- **NOT verified:** Roy hasn't reviewed this in his own browser. No PR opened
  yet for `fix/period-anchor-datepicker`.

### Also this session, before Phase 3-revision (now merged, see CHANGELOG.md)
`fix/settings-desktop-layout` shipped the `תחזוקת מכונות` desktop split
console (after an initial 2-column card-grid concept was rejected and
rebuilt with the `frontend-design` skill), part-detail expand-on-click,
a QR-print popup replacing the old inline canvas, a machine search box, and
two bug fixes (a `.manager-desktop select.input` CSS specificity issue
overlapping dropdown text, and a stale auth section in CLAUDE.md). Full
detail in CHANGELOG.md's `[Unreleased]` section — not repeated here since
it's already merged and this document is about current/next state, not
history.

One thing noticed but not authored by this agent: `src/index.css`'s
`.manager-desktop` compact-sizing rules got wrapped in
`@media (min-width: 1024px)` by an edit made outside this session (likely
Roy, directly in his editor) — this landed inside the same merged PR since
it was already in the working tree. Worth Roy double-checking it did what
he intended (scopes those compact styles to desktop only, where previously
they applied even on mobile).

## Test credentials (local dev only)
Real Supabase phone-OTP login, no bypass exists: phone `0503338181`, OTP
`123456`. `npm run dev`, then `/manager/settings` → `תחזוקת מכונות`.

## What's next
1. Roy reviews `fix/period-anchor-datepicker` in his own browser — add a
   yearly or triannual period, confirm the date picker feels right, confirm
   a normal (non-Feb-29) case still works end to end.
2. If approved: PR + merge to `main` (same flow as `fix/settings-desktop-layout`:
   push branch → `gh pr create` → `gh pr merge`).
3. Decide whether Supabase schema migrations should start being tracked as
   files in this repo (see note above) — not decided or acted on this session.
4. Separately: Phase 5 (client-side self-provisioning) is still the next
   *un-started* backend phase — see TODO.md "Next".

## The one thing to remember
`fix/period-anchor-datepicker`'s DB migration is **already applied to the
dev Supabase project**, independent of the branch's git/PR state — the code
and the database are not merged/deployed atomically. If this branch is
rejected and needs reverting, the DB side needs its own explicit rollback
(restore `anchor_day`'s CHECK to `1-28` and revert `compute_next_due_date`
to the pre-Feb-29-guard version), it won't happen automatically from a
`git revert`.
