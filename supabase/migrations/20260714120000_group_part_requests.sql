-- Group part_requests submitted together (one field order, several line items)
-- under a shared id so the UI can merge them into one card/drawer.
--
-- NOT YET APPLIED — review before running against the live `enbar-bot` project.
-- default gen_random_uuid() means every pre-existing row becomes its own
-- single-item group, matching current behavior for old data.

alter table public.part_requests
  add column order_id uuid not null default gen_random_uuid();
