# Enbar Daily Work Reports — Phase 2: Authorization & RLS

**Status:** Draft for review
**Scope:** Replace Supabase's current permissive, `anon`-only RLS policies (subsequently widened to also cover `authenticated` in the Phase 1 follow-up, but still unconditionally permissive — `using (true)` everywhere) with real role-based policies enforced at the database level. Assumes Phase 1 (Supabase Auth phone OTP, `profiles` table, `auth.uid()`-based report attribution) is complete and unchanged by this PRD.

**Schema note:** the original planning doc's `reports.extras_*` columns (`extras_status`, `extras_edited`, `extras_decided_by`, `extras_signed_path`) were removed from `reports` before this phase and replaced by a standalone `exception_logs` table (`status`, `status_updated_by`, `pdf_path`, `signed_path`) plus `exception_photos`. This PRD's manager-only-column requirement targets `exception_logs`, which is where that constraint now actually lives. `part_requests`/`part_orders`/`catalog_items` schemas are included below from direct project visibility.

## Overview & Goals

Today every table's RLS policy is `using (true)` for `anon, authenticated` — any session, or even no session at all (just the public anon key, embedded in the client bundle), can read or write any row in any table. Restricting `authenticated` alone doesn't close the anon hole: Postgres OR's multiple permissive policies together, so an old `anon`-permissive policy left in place lets anyone bypass every new restriction by simply not logging in. Goals:
- Enforce row ownership: a team lead can only see and act on their own reports, exception logs, and part orders.
- Enforce role via `profiles.role`, looked up server-side from `auth.uid()` — never trusted from the client.
- **Revoke `anon` entirely** on every table in scope: drop the existing `anon, authenticated` policies rather than layering `authenticated`-only ones on top, leaving `anon` with zero matching policy (default-deny). No legitimate screen reads or writes these tables without a session since Phase 1 — login itself doesn't touch them.
- Lock `exception_logs` once `status = 'approved'`, and block that transition without `signed_path` — for everyone, not a role split.
- No behavior change for legitimate use — only bypassing the UI, or bypassing login altogether, starts failing.

## Non-Goals

- Storage bucket policies stay as-is (public-read buckets) — Phase 3, called out as a known residual risk: a signed PDF's public URL is still viewable by anyone who has the path, even after this phase.
- No new "permission denied" UI beyond a generic Hebrew error toast/banner reusing existing error-state conventions.
- No changes to `api/_lib/signwell.js` / `api/webhooks/signwell.js` — those use the service-role key server-side and are unaffected by anon/authenticated RLS.
- No PK/FK/storage-path changes.
- `deploy_files` is deliberately untouched and out of scope: it's read by the build-time prebuild script (`scripts/gen-fonts.mjs`) using the anon key with no browser session at all, so it's the one table that legitimately still needs an `anon` policy. Don't sweep it into the "revoke anon" pass below.

## Policy Matrix

`team_lead` scope is always "rows belonging to the profile's linked `team_lead_id`" (looked up via `profiles` on `auth.uid()`), never `auth.uid()` directly against these tables, since none of them store the user id except `reports.created_by` (added Phase 1, audit-only, not used for ownership checks below — `team_lead_id` remains authoritative).

| Table | team_lead SELECT | team_lead INSERT | team_lead UPDATE | factory_manager SELECT | factory_manager INSERT | factory_manager UPDATE |
|---|---|---|---|---|---|---|
| `profiles` | own row only | — | — | all rows | — | — |
| `team_leads` | own linked row | — | — | all | ✓ | ✓ (incl. deactivate) |
| `clients` | active, not deleted | — | — | all | ✓ | ✓ |
| `projects` | active, not deleted | — | — | all | ✓ | ✓ |
| `reports` | own (`team_lead_id`) | own, `created_by=auth.uid()` | own | all | — | — |
| `report_photos` | via own report | via own report | — | all | — | — |
| `exception_logs` | own | own | own, **until `status='approved'`** | all | — | all, **until `status='approved'`** |
| `exception_photos` | via own exception | via own exception | — | all | — | — |
| `part_orders` | own | own | own, **while `status='pending'`** | all | — | all |
| `part_requests` | via own order | via own order | via own order, while pending | all | — | all |
| `catalog_items` | active only | — | — | all | ✓ | ✓ |

No `DELETE` policy on any table for any role — matches the app's no-hard-delete convention.

## Column-Level Protections

Row ownership alone isn't enough for `exception_logs.status`: it must never become `'approved'` except together with `signed_path`, and once `approved`, the row must lock for **everyone**. Shared invariant, not a role split — enforced with a trigger:

```sql
create or replace function enforce_exception_lock() returns trigger as $$
begin
  if old.status = 'approved' then
    raise exception 'exception_logs row is locked once approved';
  end if;
  if new.status = 'approved' and new.signed_path is null then
    raise exception 'status cannot be approved without signed_path';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_exception_logs_lock
  before update on exception_logs
  for each row execute function enforce_exception_lock();
```

This runs regardless of role, closing the gap RLS alone can't: RLS controls *which rows* a role can touch, not *which values* a column may transition through.

## SQL Policy Examples

Every table's migration drops its existing `anon, authenticated` policy first — otherwise it stays in force and OR's with the new one, granting everyone everything regardless of what's added:

```sql
-- 0. drop the old permissive policy before adding role-scoped ones —
-- repeat for every {select,insert,update} policy on every table.
drop policy "anon select reports" on reports;

-- 1. team_lead SELECT on reports — own rows only
create policy "team_lead select own reports" on reports
  for select to authenticated
  using (
    team_lead_id = (select p.team_lead_id from profiles p where p.id = auth.uid())
  );

-- 2. team_lead INSERT on reports — must attribute to self
create policy "team_lead insert own reports" on reports
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and team_lead_id = (select p.team_lead_id from profiles p where p.id = auth.uid())
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'team_lead')
  );

-- 3. factory_manager UPDATE on exception_logs — full access, role verified server-side
create policy "manager update exception_logs" on exception_logs
  for update to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'factory_manager'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'factory_manager'));
```

`profiles` itself needs its own scoped policy (`select using (id = auth.uid())` for team leads, `using (true)` for managers) so these subqueries can resolve.

## Testing Plan

Run against real authenticated sessions (two real test users, one per role) — never the service-role key, which bypasses RLS entirely and would give false confidence.

| # | Role | Table | Operation | Expected |
|---|---|---|---|---|
| 1 | team_lead A | reports (own) | SELECT/INSERT/UPDATE | pass |
| 2 | **team_lead A** | **reports (team_lead B's)** | **SELECT** | **must fail — 0 rows, not an error** |
| 3 | **team_lead A** | **reports (team_lead B's)** | **UPDATE** | **must fail — RLS rejects at DB level** |
| 4 | **team_lead A** | **exception_logs (own, approved)** | **UPDATE any field** | **must fail — trigger rejects** |
| 5 | **team_lead A** | **exception_logs (own)** | **UPDATE status directly to 'approved' without signed_path** | **must fail — trigger rejects** |
| 6 | **team_lead A** | **team_leads (insert new row)** | **INSERT** | **must fail — no team_lead INSERT policy** |
| 7 | factory_manager | any table | SELECT/UPDATE within matrix | pass |
| 8 | factory_manager | reports | INSERT | must fail (no manager INSERT policy on reports) |
| 9 | team_lead A | clients (inactive row) | SELECT | must fail — filtered by policy |
| 10 | **no session (anon key only)** | **any of the 11 tables** | **SELECT/INSERT/UPDATE** | **must fail — 0 rows or permission error; this is the actual public-facing hole today** |

## Rollout & Rollback Plan

Enable table-by-table, not all at once — a missed policy silently breaks the running app rather than throwing an obvious error.

1. Stage against dev project only, one table at a time, in dependency order: `profiles` → `team_leads` → `clients`/`projects` → `reports`/`report_photos` → `exception_logs`/`exception_photos` → `part_orders`/`part_requests` → `catalog_items`. For each table: drop its old `anon, authenticated` policies, then create the role-scoped `authenticated` ones — don't leave both in place even temporarily, since the old one masks the new one.
2. After each table, manually walk both roles through every screen that touches it, **and** confirm a plain `curl` with just the anon key (no `Authorization` bearer token) gets 0 rows / a permission error against that table, before moving to the next.
3. Only after all tables pass on dev: apply the same migration to prod during a low-usage window.
4. **Rollback (manual, documented, not automated):** keep the prior migration's `drop policy` + re-create-permissive-policy statements ready per table. If a table blocks legitimate access in production, revert that table's policies to the Phase-1 permissive state immediately, then fix and re-apply — don't leave users locked out while debugging.

## Error Handling

Screens that hit a blocked query today get an empty result, not a thrown error (RLS filters rows silently for SELECT). For INSERT/UPDATE rejections, add one generic handler reusing the existing error-banner pattern:

- `הפעולה נכשלה — אין לך הרשאה לבצע אותה` ("Action failed — you don't have permission to do this") wherever an insert/update `error` object surfaces a Postgres RLS rejection.

## Open Questions

- Should `part_orders`/`part_requests` allow a team lead to cancel their own pending order, or is that manager-only in practice?
- Does a team lead need historical visibility into a client/project that's since been deactivated (their own past reports reference it)?

## Acceptance Criteria

- [ ] All 11 tables have `authenticated`-scoped policies matching the matrix above; no table is left `using (true)` for both roles.
- [ ] `anon` has zero remaining SELECT/INSERT/UPDATE policies on all 11 tables — confirmed via `pg_policies`, not just "not used by the app." `deploy_files` is the sole intentional exception.
- [ ] Test matrix items 2, 3, 4, 5, 6, 8, 9, 10 (all "must fail" cases) are rejected by the database, including item 10 (anon key, no session at all) — not just hidden by the UI.
- [ ] `exception_logs` cannot transition to `approved` without `signed_path` set in the same statement, for either role.
- [ ] An `approved` `exception_logs` row rejects all further updates from both roles.
- [ ] Existing legitimate flows (report submit/edit, exception generate/send/upload, admin CRUD) work unchanged for both roles after rollout.
- [ ] Rollback SQL exists and is documented per table before any table's policy ships to prod.
