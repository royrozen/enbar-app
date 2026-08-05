# Enbar Daily Work Reports — Factory Manager Report Creation & Report Ownership

**Status:** Draft for review
**Depends on:** Phase 1 — Authentication & Identity (`enbar-auth-phase1-prd.md`). This PRD assumes `profiles` and real per-account login already exist; it is not part of Phase 1 itself, but ships alongside or immediately after it.

## Overview & Goals

Today, only the `team_lead` profile can file a report (`/report/new`). A `factory_manager` can currently reach the same form only by an informal workaround: switching their `localStorage` profile flag to `team_lead` via the "החלף פרופיל" button — which works only because there are no real accounts and no per-person distinction today.

Phase 1 introduces real per-account roles bound to a `profiles` row. Once that ships, the profile-switch workaround disappears — a `factory_manager` account will no longer be able to become a `team_lead` account. Without deliberate action, the factory manager would lose a capability they have today (informally) — filing a report themselves.

Goal: give `factory_manager` first-class, explicit permission to create reports through the same `/report/new` form team leads use, with correct ownership and attribution, and no regression to the existing extras-approval safeguards.

## Non-Goals

- No changes to the report form's fields, validation, or submission behavior — the form itself is untouched; only who can reach it changes.
- No changes to the extras approval workflow's logic or its existing rule that "approved" is blocked until a signed document is uploaded.
- No RLS changes (still Phase 2 scope, per the Phase 1 PRD).
- Does not resolve whether the manager dashboard's "team lead" filter dropdown should also list the factory manager as a filterable reporter — flagged as an open question.

## User Stories

- As a factory manager, I can file a daily report myself, exactly like a team lead, using the same `/report/new` form.
- As a factory manager, my own filed reports appear in a separate "הדוחות שלי" view, distinct from the full `/manager` dashboard, so I don't have to search the entire report list for my own submissions.
- As a factory manager, if I file a report with an extras/change-order request, I should not be able to approve it myself without the client's signed document — same as any team lead's request.
- As a team lead, this change doesn't affect my own reporting flow or my "הדוחות שלי" view at all.

## Data Model Changes

The core decision: **report ownership moves from `team_leads` to `profiles`.** Today, `reports.team_lead_id → team_leads` is the only way to know who filed a report, and `team_leads` has no equivalent row for a factory manager — there's nowhere to store "this report belongs to the manager."

```sql
alter table profiles
  add column display_name text not null default '';
-- backfill: team leads get display_name = team_leads.name; factory manager gets a real name set by admin

alter table reports
  add column created_by uuid references profiles(id),
  alter column team_lead_id drop not null; -- only populated when the reporter is an actual team lead
```

(If Phase 1 has not yet added `reports.created_by uuid references auth.users(id)`, add it referencing `profiles(id)` directly instead, since `profiles.id = auth.users.id` 1:1.)

`created_by` becomes the canonical owner of every report going forward, regardless of role — it's what "my reports" filters on, and what the report list resolves a display name from via `profiles.display_name`. `team_lead_id` is retained only for backward-compatible per-team-lead analytics on the manager dashboard (it stays populated when the reporter is a team lead) and is `null` for manager-filed reports — it is no longer the source of truth for "who filed this."

Once `display_name` exists on `profiles` for every role, the report list and any "reported by" column can resolve a name for any reporter — team lead or manager — through one join, instead of assuming every report has a `team_leads` row.

## Screen Changes

- **`/report/new`**: becomes reachable by both `team_lead` and `factory_manager` roles. No change to the form itself.
- **New "הדוחות שלי" view for the factory manager**: a filtered list (same visual pattern as the team lead's `/home` list — date, project, photo count, issue flag, extras status badge) scoped to `created_by =` the logged-in manager, reachable from `/manager` (e.g. a new tab or link), not replacing the existing full dashboard.
- **`/manager` and `/manager/report/:id`**: unchanged in layout; the existing report list simply includes manager-filed reports alongside team-lead-filed ones, since they're just rows in the same `reports` table.

## Edge Cases

- **Self-filed extras request**: no new logic required. The existing rule — "approved" is blocked until a signed document (`extras_signed_path`) is uploaded — already prevents self-approval, because it's the client's physical signature that unlocks the status, not the acting profile. This applies identically whether the report's `created_by` is a team lead or the factory manager.
- **Manager deactivated**: same convention as team leads — `profiles.is_active = false` blocks login, historical reports stay visible and correctly attributed via `created_by`.
- **Existing reports (pre-migration)**: all currently have `team_lead_id` set and no `created_by`. Backfill `created_by` from the matching `profiles.team_lead_id` as part of the Phase 1 migration (or immediately after, if this ships as a fast-follow) — no report should be left with a null `created_by` once this ships.
- **Report detail view for a manager-filed report**: since the factory manager already has full access to `/manager/report/:id`, no new read-only detail screen is needed — they can review their own report the same way they review anyone else's.

## Open Questions

- Should the manager dashboard's existing "team lead" filter dropdown also include the factory manager as a filterable option (so reports can be filtered by "reported by," not just "team lead")? Left unresolved for now — the default view already includes all reports regardless.
- Should `display_name` be editable by the factory manager themselves, or admin-only (consistent with dashboard-based user management in Phase 1)?

## Acceptance Criteria

- [ ] `factory_manager` role can open `/report/new` and submit a report using the exact same form and validation as `team_lead`.
- [ ] A report filed by the factory manager has `created_by` set to their `profiles.id` and `team_lead_id` set to `null`.
- [ ] A report filed by a team lead has `created_by` set to their `profiles.id` and `team_lead_id` set to their linked `team_leads.id` (unchanged from today).
- [ ] The factory manager has a "הדוחות שלי" view listing only reports where `created_by` matches their own `profiles.id`.
- [ ] A report filed by the factory manager with a non-empty extras request cannot be marked "approved" until a signed document is uploaded — identical to team-lead-filed reports.
- [ ] All pre-existing reports have `created_by` correctly backfilled from their `team_lead_id` — none are left null.
- [ ] The team lead's own report form and "הדוחות שלי" view behave exactly as before this change.
