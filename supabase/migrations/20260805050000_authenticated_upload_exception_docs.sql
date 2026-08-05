-- Production hotfix (2026-08-05): the "anon upload exception-docs" INSERT
-- policy on storage.objects only covered {anon}, not {authenticated} — a
-- leftover from before real auth existed. A logged-in manager/team_lead
-- generating an exception's approval PDF runs as `authenticated`, so the
-- upload had zero applicable policy and failed with "new row violates
-- row-level security policy" (ExceptionView.jsx generatePdf(), reported
-- against exception a155bc8c-ac2f-4666-9da4-f17335e56fcb).
--
-- Dev already had {anon,authenticated} on this policy — only prod was
-- missing it. This brings prod back in sync with dev, not a new grant:
-- the anon policy was already fully open (bucket_id match only, no other
-- condition), so this doesn't widen access beyond what anon already had.
create policy "authenticated upload exception-docs"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'exception-docs');
