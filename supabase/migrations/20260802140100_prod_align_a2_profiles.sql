-- PROD alignment A2: profiles table + auth_profile() helper (Phase 1 auth).
-- New table only — does not touch any existing table's RLS.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('team_lead', 'factory_manager')),
  team_lead_id uuid references team_leads(id),
  phone text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint team_lead_link_required check (
    (role = 'team_lead' and team_lead_id is not null) or
    (role = 'factory_manager' and team_lead_id is null)
  )
);

create unique index profiles_team_lead_id_key on profiles (team_lead_id) where team_lead_id is not null;

alter table profiles enable row level security;

create or replace function auth_profile()
 returns table(role text, team_lead_id uuid)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.role, p.team_lead_id from profiles p where p.id = auth.uid() and p.is_active
$function$;

create policy "own profile select" on profiles
  for select to authenticated
  using (id = auth.uid());

create policy "manager select all profiles" on profiles
  for select to authenticated
  using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');
