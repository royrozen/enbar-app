-- Manager "act as team lead" (see Header.jsx view-as picker, extended from
-- read-only to full read/write per explicit product decision).
--
-- NOT YET APPLIED — review before running against live projects, and apply to
-- BOTH enbar-Webapp-dev (test) and enbar-prod when approved.
--
-- Phase 2 deliberately gave factory_manager no INSERT on reports/
-- exception_logs/part_orders, and no UPDATE on reports at all — team leads
-- reported, managers oversaw. This intentionally widens that: a manager can
-- now create/edit anything a team lead can, attributed to any active team
-- lead they choose (client picks via the Header dropdown, not enforced at
-- the DB — the DB only checks the target team_leads row is real/active).
-- created_by (reports) and status_updated_by (exception_logs/part_orders)
-- still record the acting manager's real identity, not the team lead's —
-- audit trail is unaffected by this widening.

create policy "manager insert as team_lead" on reports
  for insert to authenticated
  with check (
    (select role from auth_profile()) = 'factory_manager'
    and created_by = auth.uid()
    and exists (
      select 1 from team_leads t
      where t.id = team_lead_id and t.is_active and t.deleted_at is null
    )
  );

create policy "manager update any report" on reports
  for update to authenticated
  using ((select role from auth_profile()) = 'factory_manager')
  with check ((select role from auth_profile()) = 'factory_manager');

create policy "manager insert any report photos" on report_photos
  for insert to authenticated
  with check ((select role from auth_profile()) = 'factory_manager');

create policy "manager insert exception_logs as team_lead" on exception_logs
  for insert to authenticated
  with check (
    (select role from auth_profile()) = 'factory_manager'
    and exists (
      select 1 from team_leads t
      where t.id = team_lead_id and t.is_active and t.deleted_at is null
    )
  );

create policy "manager insert any exception photos" on exception_photos
  for insert to authenticated
  with check ((select role from auth_profile()) = 'factory_manager');

create policy "manager insert part_orders as team_lead" on part_orders
  for insert to authenticated
  with check (
    (select role from auth_profile()) = 'factory_manager'
    and exists (
      select 1 from team_leads t
      where t.id = team_lead_id and t.is_active and t.deleted_at is null
    )
  );

create policy "manager insert part_requests" on part_requests
  for insert to authenticated
  with check (
    (select role from auth_profile()) = 'factory_manager'
    and exists (select 1 from part_orders po where po.id = part_requests.order_id and po.status = 'pending')
  );
