-- Base schema — reconstructed from the live enbar-bot project so a second
-- (production) Supabase project can be bootstrapped from a clean migration
-- history. This predates the migrations below it and must run first.
--
-- Mirrors what's actually live: team_leads/clients/projects/reports/
-- report_photos/deploy_files, open anon RLS policies (no auth in Phase 1,
-- see CLAUDE.md), and the report-photos/signed-approvals storage buckets.
-- clients still has contact_person/phone/email here — the later
-- 20260712190000_move_contact_to_projects.sql migration relocates them.

create table public.team_leads (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.clients (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  contact_person text,
  phone          text,
  email          text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id),
  name        text not null,
  city        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.reports (
  id                  uuid primary key default gen_random_uuid(),
  team_lead_id        uuid not null references public.team_leads(id),
  project_id          uuid not null references public.projects(id),
  report_date         date not null,
  work_description    text not null,
  workers_count       int not null check (workers_count between 1 and 50),
  issues              text,
  extras_description  text,
  extras_edited       text,
  extras_status       text check (extras_status in ('pending', 'sent', 'approved', 'rejected')),
  extras_decided_by   text,
  extras_signed_path  text,
  created_at          timestamptz not null default now()
);

create table public.report_photos (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.reports(id) on delete cascade,
  storage_path text not null,
  kind         text not null default 'work' check (kind in ('work', 'issue')),
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create table public.deploy_files (
  path    text primary key,
  content text not null
);

alter table public.team_leads enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.reports enable row level security;
alter table public.report_photos enable row level security;
alter table public.deploy_files enable row level security;

create policy "anon select team_leads" on public.team_leads for select to anon using (true);
create policy "anon insert team_leads" on public.team_leads for insert to anon with check (true);
create policy "anon update team_leads" on public.team_leads for update to anon using (true) with check (true);

create policy "anon select clients" on public.clients for select to anon using (true);
create policy "anon insert clients" on public.clients for insert to anon with check (true);
create policy "anon update clients" on public.clients for update to anon using (true) with check (true);

create policy "anon select projects" on public.projects for select to anon using (true);
create policy "anon insert projects" on public.projects for insert to anon with check (true);
create policy "anon update projects" on public.projects for update to anon using (true) with check (true);

create policy "anon select reports" on public.reports for select to anon using (true);
create policy "anon insert reports" on public.reports for insert to anon with check (true);
create policy "anon update reports" on public.reports for update to anon using (true) with check (true);

create policy "anon select report_photos" on public.report_photos for select to anon using (true);
create policy "anon insert report_photos" on public.report_photos for insert to anon with check (true);

create policy "anon_read_deploy_files" on public.deploy_files for select to anon using (true);

insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', true),
       ('signed-approvals', 'signed-approvals', true);

create policy "anon upload report-photos" on storage.objects
  for insert to anon with check (bucket_id = 'report-photos');
create policy "public read report-photos" on storage.objects
  for select to anon, authenticated using (bucket_id = 'report-photos');

create policy "anon upload signed-approvals" on storage.objects
  for insert to anon with check (bucket_id = 'signed-approvals');
create policy "public read signed-approvals" on storage.objects
  for select to anon, authenticated using (bucket_id = 'signed-approvals');
