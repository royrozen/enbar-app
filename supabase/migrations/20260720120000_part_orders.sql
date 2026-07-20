-- Move part-request status from the line-item level to the order level.
-- A team lead submits several parts together as one "order"; until now that
-- was only a shared `order_id` grouping key with status/notes/team_lead/
-- project duplicated (and independently mutable) on every line row. This
-- gives the order a real row and makes the line rows pure line items.
--
-- Applied 2026-07-20 to the live `enbar-Webapp-dev` project.

create table public.part_orders (
  id                 uuid primary key default gen_random_uuid(),
  team_lead_id       uuid not null references public.team_leads(id),
  project_id         uuid not null references public.projects(id),
  status             text not null default 'pending'
                       check (status in ('pending', 'in_progress', 'ready')),
  status_updated_by  text,
  notes              text,
  created_at         timestamptz not null default now()
);

alter table public.part_orders enable row level security;

create policy "anon select part_orders" on public.part_orders
  for select to anon using (true);
create policy "anon insert part_orders" on public.part_orders
  for insert to anon with check (true);
create policy "anon update part_orders" on public.part_orders
  for update to anon using (true) with check (true);

-- One part_orders row per existing order_id group, carrying over the
-- group's oldest row's team_lead/project/status/status_updated_by/notes/
-- created_at. Reusing the group's order_id as the new part_orders.id keeps
-- part_requests.order_id valid without touching those rows.
insert into public.part_orders (id, team_lead_id, project_id, status, status_updated_by, notes, created_at)
select distinct on (pr.order_id)
  pr.order_id, pr.team_lead_id, pr.project_id, pr.status, pr.status_updated_by, pr.notes, pr.created_at
from public.part_requests pr
order by pr.order_id, pr.created_at asc;

alter table public.part_requests
  add constraint part_requests_order_id_fkey foreign key (order_id) references public.part_orders(id);

-- Was default gen_random_uuid() so every pre-grouping row became its own
-- single-item group; now order_id must point at a real part_orders row the
-- app creates first, so a random default would just produce dangling FKs.
alter table public.part_requests alter column order_id drop default;

alter table public.part_requests
  drop column team_lead_id,
  drop column project_id,
  drop column status,
  drop column status_updated_by,
  drop column notes,
  drop column photo_path;

-- Line items are editable (qty / add / remove) only while the parent order
-- is still 'pending' (enforced client-side, matching the rest of the app's
-- no-real-auth model). Unlike top-level entities, a still-pending order's
-- lines are draft-like scratch state, not a historical record, so hard
-- delete here doesn't break the app's no-hard-delete convention for
-- reports/clients/projects/etc — the order row itself is never deleted.
create policy "anon delete part_requests" on public.part_requests
  for delete to anon using (true);
