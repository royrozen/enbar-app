-- PROD alignment A3: part_orders table (Phase 2 grouping). Additive only —
-- part_requests restructuring (dropping team_lead_id/project_id/status/
-- status_updated_by/photo_path, adding the order_id FK) is destructive and
-- handled separately, requires explicit approval before applying.

create table part_orders (
  id uuid primary key default gen_random_uuid(),
  team_lead_id uuid not null references team_leads(id),
  project_id uuid not null references projects(id),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'ready')),
  status_updated_by text,
  notes text,
  created_at timestamptz not null default now()
);

alter table part_orders enable row level security;

create policy "team_lead select own part_orders" on part_orders
  for select to authenticated
  using (team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id)));

create policy "team_lead insert own part_orders" on part_orders
  for insert to authenticated
  with check (team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id)));

create policy "team_lead update own pending part_orders" on part_orders
  for update to authenticated
  using (team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id)) and status = 'pending')
  with check (team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id)));

create policy "manager select all part_orders" on part_orders
  for select to authenticated
  using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');

create policy "manager insert part_orders as team_lead" on part_orders
  for insert to authenticated
  with check (
    (select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager'
    and exists (select 1 from team_leads t where t.id = part_orders.team_lead_id and t.is_active and t.deleted_at is null)
  );

create policy "manager update part_orders" on part_orders
  for update to authenticated
  using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager')
  with check ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');
