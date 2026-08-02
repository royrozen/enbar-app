-- PROD alignment B2 (DESTRUCTIVE/RISKY — NOT applied, planning only).
-- Flips report-photos + signed-approvals to private, replaces PROD's open
-- anon storage policies with DEV's ownership-scoped ones. exception-photos/
-- exception-docs/part-photos stay public (matches DEV, Phase 3 non-goal).
-- Any existing public URL for these two buckets stops resolving once this
-- runs — irreversible for links already handed out. PROD has 0 objects
-- right now, so that risk is theoretical today, not actual.

update storage.buckets set public = false where id in ('report-photos', 'signed-approvals');

drop policy "anon upload report-photos" on storage.objects;
drop policy "public read report-photos" on storage.objects;
drop policy "anon upload signed-approvals" on storage.objects;
drop policy "public read signed-approvals" on storage.objects;

create policy "team_lead select own report photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'report-photos'
    and exists (
      select 1 from reports r
      where r.id = (storage.foldername(name))[2]::uuid
      and r.team_lead_id = (select team_lead_id from auth_profile())
    )
  );

create policy "manager select all report photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'report-photos'
    and (select role from auth_profile()) = 'factory_manager'
  );

create policy "team_lead insert own report photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'report-photos'
    and exists (
      select 1 from reports r
      where r.id = (storage.foldername(name))[2]::uuid
      and r.team_lead_id = (select team_lead_id from auth_profile())
    )
  );

create policy "team_lead select own signed docs" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'signed-approvals'
    and exists (
      select 1 from exception_logs e
      where e.id = (storage.foldername(name))[2]::uuid
      and e.team_lead_id = (select team_lead_id from auth_profile())
    )
  );

create policy "manager select all signed docs" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'signed-approvals'
    and (select role from auth_profile()) = 'factory_manager'
  );

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

create policy "manager insert signed docs" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'signed-approvals'
    and (select role from auth_profile()) = 'factory_manager'
  );
