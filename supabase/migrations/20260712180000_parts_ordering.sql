-- Direct Part Ordering from the Field (הזמנת חלקים חסרים מהשטח)
-- See: enbar-app - PRD/enbar-parts-ordering-prd.md §4
--
-- NOT YET APPLIED — review before running against the live `enbar-Webapp-dev` project.
-- Mirrors the conventions already live on reports/report_photos/report-photos:
-- uuid PK via gen_random_uuid(), timestamptz created_at default now(),
-- RLS enabled with permissive anon insert/select/update policies (no delete
-- policy anywhere — deactivate-only, never hard-delete), public storage bucket
-- with an anon insert + public(anon,authenticated) select policy.

create table public.catalog_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.part_requests (
  id                 uuid primary key default gen_random_uuid(),
  team_lead_id       uuid not null references public.team_leads(id),
  project_id         uuid not null references public.projects(id),
  catalog_item_id    uuid references public.catalog_items(id),
  other_description  text,
  quantity           int not null check (quantity between 1 and 999),
  notes              text,
  photo_path         text,
  status             text not null default 'pending'
                       check (status in ('pending', 'in_progress', 'ready')),
  status_updated_by  text,
  created_at         timestamptz not null default now(),
  constraint part_requests_item_or_description check (
    catalog_item_id is not null or length(trim(other_description)) >= 5
  )
);

alter table public.catalog_items enable row level security;
alter table public.part_requests enable row level security;

create policy "anon select catalog_items" on public.catalog_items
  for select to anon using (true);
create policy "anon insert catalog_items" on public.catalog_items
  for insert to anon with check (true);
create policy "anon update catalog_items" on public.catalog_items
  for update to anon using (true) with check (true);

create policy "anon select part_requests" on public.part_requests
  for select to anon using (true);
create policy "anon insert part_requests" on public.part_requests
  for insert to anon with check (true);
create policy "anon update part_requests" on public.part_requests
  for update to anon using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('part-photos', 'part-photos', true);

create policy "anon upload part-photos" on storage.objects
  for insert to anon with check (bucket_id = 'part-photos');
create policy "public read part-photos" on storage.objects
  for select to anon, authenticated using (bucket_id = 'part-photos');
