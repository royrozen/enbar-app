-- Exceptions Log (יומן חריגים) — see enbar-app - PRD/enbar-exceptions-log-prd.md
--
-- NOT YET APPLIED — apply to BOTH enbar-bot (test) and enbar-prod.
-- ⚠ The final ALTER TABLE is DESTRUCTIVE: it drops the in-report extras
-- columns (§3e — the Exceptions Log fully replaces the extras workflow).
-- Confirm before running.

create table public.exception_logs (
  id                 uuid primary key default gen_random_uuid(),
  team_lead_id       uuid not null references public.team_leads(id),
  project_id         uuid not null references public.projects(id),
  workers_count      int not null check (workers_count between 1 and 50),
  work_days          int not null default 1 check (work_days between 1 and 99),
  work_description   text not null,
  billable_days      numeric(5,1) not null check (billable_days between 0.5 and 999),
  days_overridden    boolean not null default false,
  status             text not null default 'pending'
                       check (status in ('pending', 'sent', 'approved')),
  status_updated_by  text,
  pdf_path           text,   -- latest generated PDF in the exception-docs bucket
  signed_path        text,   -- client-signed file in signed-approvals
  created_at         timestamptz not null default now()
);

create table public.exception_photos (
  id           uuid primary key default gen_random_uuid(),
  exception_id uuid not null references public.exception_logs(id) on delete cascade,
  storage_path text not null,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

alter table public.exception_logs enable row level security;
alter table public.exception_photos enable row level security;

create policy "anon select exception_logs" on public.exception_logs
  for select to anon using (true);
create policy "anon insert exception_logs" on public.exception_logs
  for insert to anon with check (true);
create policy "anon update exception_logs" on public.exception_logs
  for update to anon using (true) with check (true);

create policy "anon select exception_photos" on public.exception_photos
  for select to anon using (true);
create policy "anon insert exception_photos" on public.exception_photos
  for insert to anon with check (true);

insert into storage.buckets (id, name, public)
values ('exception-photos', 'exception-photos', true),
       ('exception-docs', 'exception-docs', true);

create policy "anon upload exception-photos" on storage.objects
  for insert to anon with check (bucket_id = 'exception-photos');
create policy "public read exception-photos" on storage.objects
  for select to anon, authenticated using (bucket_id = 'exception-photos');

create policy "anon upload exception-docs" on storage.objects
  for insert to anon with check (bucket_id = 'exception-docs');
create policy "public read exception-docs" on storage.objects
  for select to anon, authenticated using (bucket_id = 'exception-docs');

-- ⚠ DESTRUCTIVE — removes the legacy in-report extras workflow (§3e)
alter table public.reports
  drop column extras_description,
  drop column extras_edited,
  drop column extras_status,
  drop column extras_decided_by,
  drop column extras_signed_path;
