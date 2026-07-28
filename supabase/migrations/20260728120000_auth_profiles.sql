-- Phase 1 — Authentication & Identity (see enbar-app - PRD/enbar-auth-phase1-prd.md)
--
-- NOT YET APPLIED — review before running against live projects, and apply to
-- BOTH enbar-Webapp-dev (test) and enbar-prod when approved.
--
-- profiles links a Supabase Auth user to a role and, for team leads, to their
-- existing team_leads row. reports.created_by is added purely for audit — the
-- FK team_lead_id relationship on reports is unchanged.

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

create unique index profiles_team_lead_id_key on profiles(team_lead_id) where team_lead_id is not null;

alter table reports add column created_by uuid references auth.users(id);
