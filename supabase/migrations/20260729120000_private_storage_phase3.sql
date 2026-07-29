-- Phase 3: flip report-photos and signed-approvals to private buckets,
-- replace anon-open storage policies with role/ownership-scoped ones
-- mirroring Phase 2's auth_profile() model.

update storage.buckets set public = false where id in ('report-photos', 'signed-approvals');

drop policy if exists "anon upload report-photos" on storage.objects;
drop policy if exists "public read report-photos" on storage.objects;
drop policy if exists "anon upload signed-approvals" on storage.objects;
drop policy if exists "public read signed-approvals" on storage.objects;

-- report-photos: path is reports/{report_id}/{uuid}.jpg
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

-- signed-approvals: path is exceptions/{exception_id}/signed-{uuid}.{ext}
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
    )
  );

create policy "manager insert signed docs" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'signed-approvals'
    and (select role from auth_profile()) = 'factory_manager'
  );
