-- Phase 3 follow-up: the team_lead INSERT policy on signed-approvals never
-- encoded "only while not yet approved" (PRD's own matrix said it, the SQL
-- didn't) — confirmed empirically: a team_lead could still write a new file
-- under an already-approved exception's path. enforce_exception_lock()
-- blocks the exception_logs row update, but not the storage write itself.

drop policy "team_lead insert own signed docs" on storage.objects;

create policy "team_lead insert own signed docs" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'signed-approvals'
    and exists (
      select 1 from exception_logs e
      where e.id = (storage.foldername(name))[2]::uuid
      and e.team_lead_id = (select team_lead_id from auth_profile())
      and e.status <> 'approved'
    )
  );
