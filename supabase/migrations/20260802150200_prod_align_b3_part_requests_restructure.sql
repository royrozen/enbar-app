-- PROD alignment B3 (DESTRUCTIVE/RISKY — NOT applied, planning only).
-- part_requests still has its pre-grouping shape on PROD: team_lead_id,
-- project_id, status, status_updated_by, photo_path sat directly on the
-- row before the group_part_requests restructuring moved them to the new
-- parent part_orders table (created in A3). This drops those columns and
-- wires order_id up as a real FK. PROD has 0 rows in part_requests today,
-- so no data is actually lost — but these are real DROP COLUMNs, on your
-- explicit no-go list, and this table's RLS depends on the restructuring
-- so it's bundled in here rather than split into B1.

drop policy "anon insert part_requests" on part_requests;
drop policy "anon select part_requests" on part_requests;
drop policy "anon update part_requests" on part_requests;

alter table part_requests drop column team_lead_id;
alter table part_requests drop column project_id;
alter table part_requests drop column status;
alter table part_requests drop column status_updated_by;
alter table part_requests drop column photo_path;

alter table part_requests alter column order_id drop default;
alter table part_requests add constraint part_requests_order_id_fkey foreign key (order_id) references part_orders(id);

create policy "team_lead select own part_requests" on part_requests
  for select to authenticated
  using (exists (select 1 from part_orders po where po.id = part_requests.order_id and po.team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id))));

create policy "team_lead insert own pending part_requests" on part_requests
  for insert to authenticated
  with check (exists (select 1 from part_orders po where po.id = part_requests.order_id and po.team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id)) and po.status = 'pending'));

create policy "team_lead update own pending part_requests" on part_requests
  for update to authenticated
  using (exists (select 1 from part_orders po where po.id = part_requests.order_id and po.team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id)) and po.status = 'pending'))
  with check (exists (select 1 from part_orders po where po.id = part_requests.order_id and po.team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id))));

create policy "team_lead delete own pending part_requests" on part_requests
  for delete to authenticated
  using (exists (select 1 from part_orders po where po.id = part_requests.order_id and po.team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id)) and po.status = 'pending'));

create policy "manager select all part_requests" on part_requests
  for select to authenticated
  using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');

create policy "manager insert part_requests" on part_requests
  for insert to authenticated
  with check ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager' and exists (select 1 from part_orders po where po.id = part_requests.order_id and po.status = 'pending'));

create policy "manager update part_requests" on part_requests
  for update to authenticated
  using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager')
  with check ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');

create policy "manager delete pending part_requests" on part_requests
  for delete to authenticated
  using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager' and exists (select 1 from part_orders po where po.id = part_requests.order_id and po.status = 'pending'));
