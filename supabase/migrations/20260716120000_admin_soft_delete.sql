-- Admin settings redesign (see enbar-app - PRD/enbar-admin-redesign-prd.md)
--
-- NOT YET APPLIED — review before running against live projects, and apply to
-- BOTH enbar-bot (test) and enbar-prod when approved.
--
-- 1. ח.פ (company registration number) on clients — optional free text (D4).
-- 2. Soft delete, distinct from is_active deactivation (D2): deleted_at IS NULL
--    means a normal row; a timestamp means the item is hidden everywhere in the
--    UI with no undo, while historical reports/part requests keep rendering its
--    name through their FKs. Every client-side read of these tables filters
--    .is('deleted_at', null).

alter table public.clients add column registration_number text;

alter table public.clients       add column deleted_at timestamptz;
alter table public.projects      add column deleted_at timestamptz;
alter table public.team_leads    add column deleted_at timestamptz;
alter table public.catalog_items add column deleted_at timestamptz;
