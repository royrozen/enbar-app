-- Phase 2 — Authorization & RLS (see enbar-app - PRD/enbar-authorization-rls-phase2-prd.md)
--
-- NOT YET APPLIED — review before running against live projects, and apply to
-- BOTH enbar-Webapp-dev (test) and enbar-prod when approved.
--
-- Replaces the Phase-1-follow-up's blanket `anon, authenticated` permissive
-- policies with real role-based ones. Every "anon ..." policy from prior
-- migrations is dropped and NOT recreated for `anon` — since Phase 1, no
-- legitimate screen touches these tables without a session, so `anon` is
-- left with zero matching policy (default-deny). `deploy_files` is
-- deliberately untouched (build-time script, no browser session involved).
--
-- auth_profile() is a SECURITY DEFINER helper: it bypasses RLS internally
-- (required to avoid infinite recursion for policies defined ON `profiles`
-- itself, which would otherwise re-trigger their own RLS check), and folds
-- in the is_active check so a deactivated user's still-valid JWT is denied
-- at the database level too, not just by the client-side AuthContext check.

create or replace function auth_profile()
returns table (role text, team_lead_id uuid)
language sql stable security definer set search_path = public
as $$
  select p.role, p.team_lead_id from profiles p where p.id = auth.uid() and p.is_active
$$;

-- ── profiles ────────────────────────────────────────────────────────────
alter table profiles enable row level security;

create policy "own profile select" on profiles
  for select to authenticated
  using (id = auth.uid());

create policy "manager select all profiles" on profiles
  for select to authenticated
  using ((select role from auth_profile()) = 'factory_manager');

-- ── team_leads ──────────────────────────────────────────────────────────
drop policy "anon select team_leads" on team_leads;
drop policy "anon insert team_leads" on team_leads;
drop policy "anon update team_leads" on team_leads;

create policy "team_lead select own" on team_leads
  for select to authenticated
  using (id = (select team_lead_id from auth_profile()));

create policy "manager select all team_leads" on team_leads
  for select to authenticated
  using ((select role from auth_profile()) = 'factory_manager');

create policy "manager insert team_leads" on team_leads
  for insert to authenticated
  with check ((select role from auth_profile()) = 'factory_manager');

create policy "manager update team_leads" on team_leads
  for update to authenticated
  using ((select role from auth_profile()) = 'factory_manager')
  with check ((select role from auth_profile()) = 'factory_manager');

-- ── clients ─────────────────────────────────────────────────────────────
drop policy "anon select clients" on clients;
drop policy "anon insert clients" on clients;
drop policy "anon update clients" on clients;

create policy "team_lead select active clients" on clients
  for select to authenticated
  using (is_active and deleted_at is null);

create policy "manager select all clients" on clients
  for select to authenticated
  using ((select role from auth_profile()) = 'factory_manager');

create policy "manager insert clients" on clients
  for insert to authenticated
  with check ((select role from auth_profile()) = 'factory_manager');

create policy "manager update clients" on clients
  for update to authenticated
  using ((select role from auth_profile()) = 'factory_manager')
  with check ((select role from auth_profile()) = 'factory_manager');

-- ── projects ────────────────────────────────────────────────────────────
drop policy "anon select projects" on projects;
drop policy "anon insert projects" on projects;
drop policy "anon update projects" on projects;

create policy "team_lead select active projects" on projects
  for select to authenticated
  using (is_active and deleted_at is null);

create policy "manager select all projects" on projects
  for select to authenticated
  using ((select role from auth_profile()) = 'factory_manager');

create policy "manager insert projects" on projects
  for insert to authenticated
  with check ((select role from auth_profile()) = 'factory_manager');

create policy "manager update projects" on projects
  for update to authenticated
  using ((select role from auth_profile()) = 'factory_manager')
  with check ((select role from auth_profile()) = 'factory_manager');

-- ── reports ─────────────────────────────────────────────────────────────
drop policy "anon select reports" on reports;
drop policy "anon insert reports" on reports;
drop policy "anon update reports" on reports;

create policy "team_lead select own reports" on reports
  for select to authenticated
  using (team_lead_id = (select team_lead_id from auth_profile()));

create policy "team_lead insert own reports" on reports
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and team_lead_id = (select team_lead_id from auth_profile())
    and (select role from auth_profile()) = 'team_lead'
  );

create policy "team_lead update own reports" on reports
  for update to authenticated
  using (team_lead_id = (select team_lead_id from auth_profile()))
  with check (team_lead_id = (select team_lead_id from auth_profile()));

create policy "manager select all reports" on reports
  for select to authenticated
  using ((select role from auth_profile()) = 'factory_manager');

-- ── report_photos (ownership via parent report) ────────────────────────
drop policy "anon select report_photos" on report_photos;
drop policy "anon insert report_photos" on report_photos;

create policy "team_lead select own report_photos" on report_photos
  for select to authenticated
  using (exists (
    select 1 from reports r where r.id = report_photos.report_id
    and r.team_lead_id = (select team_lead_id from auth_profile())
  ));

create policy "team_lead insert own report_photos" on report_photos
  for insert to authenticated
  with check (exists (
    select 1 from reports r where r.id = report_photos.report_id
    and r.team_lead_id = (select team_lead_id from auth_profile())
  ));

create policy "manager select all report_photos" on report_photos
  for select to authenticated
  using ((select role from auth_profile()) = 'factory_manager');

-- ── exception_logs ──────────────────────────────────────────────────────
-- "until approved" is enforced by the trigger below (enforce_exception_lock),
-- not encoded into these policies' USING/CHECK clauses.
drop policy "anon select exception_logs" on exception_logs;
drop policy "anon insert exception_logs" on exception_logs;
drop policy "anon update exception_logs" on exception_logs;

create policy "team_lead select own exception_logs" on exception_logs
  for select to authenticated
  using (team_lead_id = (select team_lead_id from auth_profile()));

create policy "team_lead insert own exception_logs" on exception_logs
  for insert to authenticated
  with check (team_lead_id = (select team_lead_id from auth_profile()));

create policy "team_lead update own exception_logs" on exception_logs
  for update to authenticated
  using (team_lead_id = (select team_lead_id from auth_profile()))
  with check (team_lead_id = (select team_lead_id from auth_profile()));

create policy "manager select all exception_logs" on exception_logs
  for select to authenticated
  using ((select role from auth_profile()) = 'factory_manager');

create policy "manager update exception_logs" on exception_logs
  for update to authenticated
  using ((select role from auth_profile()) = 'factory_manager')
  with check ((select role from auth_profile()) = 'factory_manager');

-- Column-level protection: no role, including factory_manager, may set
-- status='approved' without signed_path, and an approved row locks for
-- everyone. This is a shared invariant, not a role split — RLS alone can't
-- express it (RLS controls which rows, not which values a column may take).
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

-- ── exception_photos (ownership via parent exception_logs) ─────────────
drop policy "anon select exception_photos" on exception_photos;
drop policy "anon insert exception_photos" on exception_photos;

create policy "team_lead select own exception_photos" on exception_photos
  for select to authenticated
  using (exists (
    select 1 from exception_logs e where e.id = exception_photos.exception_id
    and e.team_lead_id = (select team_lead_id from auth_profile())
  ));

create policy "team_lead insert own exception_photos" on exception_photos
  for insert to authenticated
  with check (exists (
    select 1 from exception_logs e where e.id = exception_photos.exception_id
    and e.team_lead_id = (select team_lead_id from auth_profile())
  ));

create policy "manager select all exception_photos" on exception_photos
  for select to authenticated
  using ((select role from auth_profile()) = 'factory_manager');

-- ── part_orders ─────────────────────────────────────────────────────────
drop policy "anon select part_orders" on part_orders;
drop policy "anon insert part_orders" on part_orders;
drop policy "anon update part_orders" on part_orders;

create policy "team_lead select own part_orders" on part_orders
  for select to authenticated
  using (team_lead_id = (select team_lead_id from auth_profile()));

create policy "team_lead insert own part_orders" on part_orders
  for insert to authenticated
  with check (team_lead_id = (select team_lead_id from auth_profile()));

create policy "team_lead update own pending part_orders" on part_orders
  for update to authenticated
  using (team_lead_id = (select team_lead_id from auth_profile()) and status = 'pending')
  with check (team_lead_id = (select team_lead_id from auth_profile()));

create policy "manager select all part_orders" on part_orders
  for select to authenticated
  using ((select role from auth_profile()) = 'factory_manager');

create policy "manager update part_orders" on part_orders
  for update to authenticated
  using ((select role from auth_profile()) = 'factory_manager')
  with check ((select role from auth_profile()) = 'factory_manager');

-- ── part_requests (ownership via parent part_orders; DELETE is real —
-- PartOrderCard.jsx deletes removed line items while the order is pending,
-- for both roles. The PRD's "no DELETE anywhere" claim was wrong for this
-- one table; corrected here to match actual app behavior.) ──────────────
drop policy "anon select part_requests" on part_requests;
drop policy "anon insert part_requests" on part_requests;
drop policy "anon update part_requests" on part_requests;
drop policy "anon delete part_requests" on part_requests;

create policy "team_lead select own part_requests" on part_requests
  for select to authenticated
  using (exists (
    select 1 from part_orders po where po.id = part_requests.order_id
    and po.team_lead_id = (select team_lead_id from auth_profile())
  ));

create policy "team_lead insert own pending part_requests" on part_requests
  for insert to authenticated
  with check (exists (
    select 1 from part_orders po where po.id = part_requests.order_id
    and po.team_lead_id = (select team_lead_id from auth_profile())
    and po.status = 'pending'
  ));

create policy "team_lead update own pending part_requests" on part_requests
  for update to authenticated
  using (exists (
    select 1 from part_orders po where po.id = part_requests.order_id
    and po.team_lead_id = (select team_lead_id from auth_profile())
    and po.status = 'pending'
  ))
  with check (exists (
    select 1 from part_orders po where po.id = part_requests.order_id
    and po.team_lead_id = (select team_lead_id from auth_profile())
  ));

create policy "team_lead delete own pending part_requests" on part_requests
  for delete to authenticated
  using (exists (
    select 1 from part_orders po where po.id = part_requests.order_id
    and po.team_lead_id = (select team_lead_id from auth_profile())
    and po.status = 'pending'
  ));

create policy "manager select all part_requests" on part_requests
  for select to authenticated
  using ((select role from auth_profile()) = 'factory_manager');

create policy "manager update part_requests" on part_requests
  for update to authenticated
  using ((select role from auth_profile()) = 'factory_manager')
  with check ((select role from auth_profile()) = 'factory_manager');

create policy "manager delete pending part_requests" on part_requests
  for delete to authenticated
  using (
    (select role from auth_profile()) = 'factory_manager'
    and exists (select 1 from part_orders po where po.id = part_requests.order_id and po.status = 'pending')
  );

-- ── catalog_items ───────────────────────────────────────────────────────
drop policy "anon select catalog_items" on catalog_items;
drop policy "anon insert catalog_items" on catalog_items;
drop policy "anon update catalog_items" on catalog_items;

create policy "team_lead select active catalog_items" on catalog_items
  for select to authenticated
  using (is_active and deleted_at is null);

create policy "manager select all catalog_items" on catalog_items
  for select to authenticated
  using ((select role from auth_profile()) = 'factory_manager');

create policy "manager insert catalog_items" on catalog_items
  for insert to authenticated
  with check ((select role from auth_profile()) = 'factory_manager');

create policy "manager update catalog_items" on catalog_items
  for update to authenticated
  using ((select role from auth_profile()) = 'factory_manager')
  with check ((select role from auth_profile()) = 'factory_manager');
