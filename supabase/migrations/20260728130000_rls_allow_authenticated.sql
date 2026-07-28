-- Phase 1 — Authentication & Identity follow-up (see enbar-app - PRD/enbar-auth-phase1-prd.md)
--
-- NOT YET APPLIED — review before running against live projects, and apply to
-- BOTH enbar-Webapp-dev (test) and enbar-prod when approved.
--
-- Discovered while testing real login sessions: every existing RLS policy in
-- this project is scoped `to anon` only. A logged-in Supabase Auth session
-- runs PostgREST requests as the `authenticated` role, not `anon` — so with
-- no policy change, every query breaks immediately after login (nothing was
-- ever scoped to `authenticated`). This is not a new restriction and not
-- Phase 2 authorization work — it's the same "permissive, matching today"
-- posture (still `using (true)` / `with check (true)` everywhere), just
-- widened so it actually applies once a real session exists. Real per-role
-- restrictions are still Phase 2.

alter policy "anon select catalog_items" on public.catalog_items to anon, authenticated;
alter policy "anon insert catalog_items" on public.catalog_items to anon, authenticated;
alter policy "anon update catalog_items" on public.catalog_items to anon, authenticated;

alter policy "anon select clients" on public.clients to anon, authenticated;
alter policy "anon insert clients" on public.clients to anon, authenticated;
alter policy "anon update clients" on public.clients to anon, authenticated;

alter policy "anon select projects" on public.projects to anon, authenticated;
alter policy "anon insert projects" on public.projects to anon, authenticated;
alter policy "anon update projects" on public.projects to anon, authenticated;

alter policy "anon select team_leads" on public.team_leads to anon, authenticated;
alter policy "anon insert team_leads" on public.team_leads to anon, authenticated;
alter policy "anon update team_leads" on public.team_leads to anon, authenticated;

alter policy "anon select reports" on public.reports to anon, authenticated;
alter policy "anon insert reports" on public.reports to anon, authenticated;
alter policy "anon update reports" on public.reports to anon, authenticated;

alter policy "anon select report_photos" on public.report_photos to anon, authenticated;
alter policy "anon insert report_photos" on public.report_photos to anon, authenticated;

alter policy "anon select exception_logs" on public.exception_logs to anon, authenticated;
alter policy "anon insert exception_logs" on public.exception_logs to anon, authenticated;
alter policy "anon update exception_logs" on public.exception_logs to anon, authenticated;

alter policy "anon select exception_photos" on public.exception_photos to anon, authenticated;
alter policy "anon insert exception_photos" on public.exception_photos to anon, authenticated;

alter policy "anon select part_orders" on public.part_orders to anon, authenticated;
alter policy "anon insert part_orders" on public.part_orders to anon, authenticated;
alter policy "anon update part_orders" on public.part_orders to anon, authenticated;

alter policy "anon select part_requests" on public.part_requests to anon, authenticated;
alter policy "anon insert part_requests" on public.part_requests to anon, authenticated;
alter policy "anon update part_requests" on public.part_requests to anon, authenticated;
alter policy "anon delete part_requests" on public.part_requests to anon, authenticated;

-- Storage uploads — read policies were already {anon,authenticated}; only the
-- upload (INSERT) policies were anon-only.
alter policy "anon upload report-photos" on storage.objects to anon, authenticated;
alter policy "anon upload signed-approvals" on storage.objects to anon, authenticated;
alter policy "anon upload exception-photos" on storage.objects to anon, authenticated;
alter policy "anon upload exception-docs" on storage.objects to anon, authenticated;
alter policy "anon upload part-photos" on storage.objects to anon, authenticated;
