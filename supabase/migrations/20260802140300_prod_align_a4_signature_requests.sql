-- PROD alignment A4: signature_requests table + the token-based signing
-- functions, ported verbatim from DEV (pg_get_functiondef, not
-- reconstructed). Additive: new table, new functions, new storage policies
-- alongside PROD's existing (still-open) ones — nothing removed here.

create table signature_requests (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  exception_id uuid not null references exception_logs(id),
  status text not null default 'awaiting_signature' check (status in ('awaiting_signature', 'signed', 'expired')),
  report_snapshot_hash text,
  signed_at timestamptz,
  signer_ip text,
  signed_pdf_path text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

alter table signature_requests enable row level security;

create policy "team_lead select own signature_requests" on signature_requests
  for select to authenticated
  using (exists (select 1 from exception_logs e where e.id = signature_requests.exception_id
    and e.team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id))));

create policy "team_lead insert own signature_requests" on signature_requests
  for insert to authenticated
  with check (exists (select 1 from exception_logs e where e.id = signature_requests.exception_id
    and e.team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id))));

create policy "team_lead update own signature_requests" on signature_requests
  for update to authenticated
  using (exists (select 1 from exception_logs e where e.id = signature_requests.exception_id
    and e.team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id))))
  with check (exists (select 1 from exception_logs e where e.id = signature_requests.exception_id
    and e.team_lead_id = (select auth_profile.team_lead_id from auth_profile() auth_profile(role, team_lead_id))));

create policy "manager select all signature_requests" on signature_requests
  for select to authenticated
  using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');

create policy "manager insert signature_requests" on signature_requests
  for insert to authenticated
  with check ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');

create policy "manager update signature_requests" on signature_requests
  for update to authenticated
  using ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager')
  with check ((select auth_profile.role from auth_profile() auth_profile(role, team_lead_id)) = 'factory_manager');

create or replace function get_signature_request_public(p_token uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'status', sr.status,
    'expires_at', sr.expires_at,
    'exception_id', e.id,
    'exception_no', e.exception_no,
    'work_description', e.work_description,
    'billable_days', e.billable_days,
    'project_name', p.name,
    'project_city', p.city,
    'client_name', c.name,
    'contact_person', p.contact_person,
    'signed_pdf_path', sr.signed_pdf_path,
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('storage_path', ph.storage_path, 'sort_order', ph.sort_order) order by ph.sort_order)
      from exception_photos ph where ph.exception_id = e.id
    ), '[]'::jsonb)
  )
  from signature_requests sr
  join exception_logs e on e.id = sr.exception_id
  join projects p on p.id = e.project_id
  left join clients c on c.id = p.client_id
  where sr.token = p_token
$function$;

create or replace function signature_request_is_signable(p_exception_id uuid, p_token uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from signature_requests sr
    where sr.exception_id = p_exception_id
      and sr.token = p_token
      and sr.status = 'awaiting_signature'
      and sr.expires_at > now()
  )
$function$;

create or replace function signature_request_token_matches(p_exception_id uuid, p_token uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from signature_requests sr
    where sr.exception_id = p_exception_id and sr.token = p_token
  )
$function$;

create or replace function submit_client_signature(p_token uuid, p_signed_pdf_path text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ip text;
begin
  v_ip := nullif(current_setting('request.headers', true)::json ->> 'x-forwarded-for', '');
  if v_ip is not null then
    v_ip := trim(split_part(v_ip, ',', 1));
  end if;

  update signature_requests
  set status = 'signed', signed_at = now(), signer_ip = v_ip, signed_pdf_path = p_signed_pdf_path
  where token = p_token
    and status = 'awaiting_signature'
    and expires_at > now();

  if not found then
    raise exception 'signature request not found, already signed, or expired';
  end if;

  update exception_logs e
  set signed_path = p_signed_pdf_path, status = 'approved', status_updated_by = 'client_signature'
  from signature_requests sr
  where sr.token = p_token and e.id = sr.exception_id;
end;
$function$;

create policy "anon select own signed doc via signature token" on storage.objects
  for select to anon
  using (
    bucket_id = 'signed-approvals'
    and signature_request_token_matches(
      (storage.foldername(name))[2]::uuid,
      substring(storage.filename(name), 'signed-([0-9a-fA-F-]{36})\.pdf$')::uuid
    )
  );

create policy "anon insert signed docs via signature token" on storage.objects
  for insert to anon
  with check (
    bucket_id = 'signed-approvals'
    and signature_request_is_signable(
      (storage.foldername(name))[2]::uuid,
      substring(storage.filename(name), 'signed-([0-9a-fA-F-]{36})\.pdf$')::uuid
    )
  );
