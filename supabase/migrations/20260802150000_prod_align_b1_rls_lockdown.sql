-- PROD alignment B1 (DESTRUCTIVE/RISKY — NOT applied, planning only).
-- Tightens RLS on 8 tables from PROD's current wide-open `anon: true`
-- policies to DEV's real authenticated/auth_profile()-scoped model.
-- part_requests is deliberately excluded here — its RLS is bundled with
-- B3 since the new policies depend on the part_orders restructuring.
-- Blast radius: PROD currently has 0 rows anywhere, so no data is at risk,
-- but this changes what the anon key can do — do not apply without
-- confirming nothing (e.g. a stray script, a forgotten integration) still
-- depends on PROD's anon key having write access.

drop policy "anon insert catalog_items" on catalog_items;
drop policy "anon select catalog_items" on catalog_items;
drop policy "anon update catalog_items" on catalog_items;
create policy "team_lead select active catalog_items" on catalog_items for select to authenticated using (is_active and deleted_at is null);
create policy "manager select all catalog_items" on catalog_items for select to authenticated using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');
create policy "manager insert catalog_items" on catalog_items for insert to authenticated with check ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');
create policy "manager update catalog_items" on catalog_items for update to authenticated using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager') with check ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');

drop policy "anon insert clients" on clients;
drop policy "anon select clients" on clients;
drop policy "anon update clients" on clients;
create policy "team_lead select active clients" on clients for select to authenticated using (is_active and deleted_at is null);
create policy "manager select all clients" on clients for select to authenticated using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');
create policy "manager insert clients" on clients for insert to authenticated with check ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');
create policy "manager update clients" on clients for update to authenticated using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager') with check ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');

drop policy "anon insert projects" on projects;
drop policy "anon select projects" on projects;
drop policy "anon update projects" on projects;
create policy "team_lead select active projects" on projects for select to authenticated using (is_active and deleted_at is null);
create policy "manager select all projects" on projects for select to authenticated using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');
create policy "manager insert projects" on projects for insert to authenticated with check ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');
create policy "manager update projects" on projects for update to authenticated using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager') with check ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');

drop policy "anon insert team_leads" on team_leads;
drop policy "anon select team_leads" on team_leads;
drop policy "anon update team_leads" on team_leads;
create policy "team_lead select own" on team_leads for select to authenticated using (id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id)));
create policy "manager select all team_leads" on team_leads for select to authenticated using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');
create policy "manager insert team_leads" on team_leads for insert to authenticated with check ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');
create policy "manager update team_leads" on team_leads for update to authenticated using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager') with check ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');

drop policy "anon insert reports" on reports;
drop policy "anon select reports" on reports;
drop policy "anon update reports" on reports;
create policy "team_lead select own reports" on reports for select to authenticated using (team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id)));
create policy "team_lead insert own reports" on reports for insert to authenticated with check (created_by = auth.uid() and team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id)) and (select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'team_lead');
create policy "team_lead update own reports" on reports for update to authenticated using (team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id))) with check (team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id)));
create policy "manager select all reports" on reports for select to authenticated using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');
create policy "manager insert as team_lead" on reports for insert to authenticated with check ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager' and created_by = auth.uid() and exists (select 1 from team_leads t where t.id = reports.team_lead_id and t.is_active and t.deleted_at is null));
create policy "manager update any report" on reports for update to authenticated using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager') with check ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');

drop policy "anon insert report_photos" on report_photos;
drop policy "anon select report_photos" on report_photos;
create policy "team_lead select own report_photos" on report_photos for select to authenticated using (exists (select 1 from reports r where r.id = report_photos.report_id and r.team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id))));
create policy "team_lead insert own report_photos" on report_photos for insert to authenticated with check (exists (select 1 from reports r where r.id = report_photos.report_id and r.team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id))));
create policy "manager select all report_photos" on report_photos for select to authenticated using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');
create policy "manager insert any report photos" on report_photos for insert to authenticated with check ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');

drop policy "anon insert exception_logs" on exception_logs;
drop policy "anon select exception_logs" on exception_logs;
drop policy "anon update exception_logs" on exception_logs;
create policy "team_lead select own exception_logs" on exception_logs for select to authenticated using (team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id)));
create policy "team_lead insert own exception_logs" on exception_logs for insert to authenticated with check (team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id)));
create policy "team_lead update own exception_logs" on exception_logs for update to authenticated using (team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id))) with check (team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id)));
create policy "manager select all exception_logs" on exception_logs for select to authenticated using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');
create policy "manager insert exception_logs as team_lead" on exception_logs for insert to authenticated with check ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager' and exists (select 1 from team_leads t where t.id = exception_logs.team_lead_id and t.is_active and t.deleted_at is null));
create policy "manager update exception_logs" on exception_logs for update to authenticated using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager') with check ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');

drop policy "anon insert exception_photos" on exception_photos;
drop policy "anon select exception_photos" on exception_photos;
create policy "team_lead select own exception_photos" on exception_photos for select to authenticated using (exists (select 1 from exception_logs e where e.id = exception_photos.exception_id and e.team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id))));
create policy "team_lead insert own exception_photos" on exception_photos for insert to authenticated with check (exists (select 1 from exception_logs e where e.id = exception_photos.exception_id and e.team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id))));
create policy "manager select all exception_photos" on exception_photos for select to authenticated using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');
create policy "manager insert any exception photos" on exception_photos for insert to authenticated with check ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');

-- enforce_exception_lock trigger — Phase 2's DB-level lock on approved exceptions
create or replace function enforce_exception_lock()
 returns trigger
 language plpgsql
as $function$
begin
  if old.status = 'approved' then
    raise exception 'exception_logs row is locked once approved';
  end if;
  if new.status = 'approved' and new.signed_path is null then
    raise exception 'status cannot be approved without signed_path';
  end if;
  return new;
end;
$function$;

create trigger trg_exception_logs_lock before update on exception_logs
  for each row execute function enforce_exception_lock();
