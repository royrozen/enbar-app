-- Lets a client who already signed re-open their /sign/:token link and view
-- the actual signed PDF, instead of just a bare "thank you" message. Needs:
-- 1. get_signature_request_public() to also return signed_pdf_path.
-- 2. An anon SELECT policy on the signed-approvals bucket, scoped by the
--    same token (regardless of status/expiry -- once a client has signed,
--    they can always re-view their own already-completed document; this is
--    a read of something that's rightfully theirs, not a fresh grant).
--
-- Same SECURITY DEFINER pattern as the rest of this feature: the check runs
-- as a function that explicitly bypasses signature_requests' RLS, never a
-- raw subquery under the anon role (that was the bug fixed in
-- 20260730090000).

create or replace function public.get_signature_request_public(p_token uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
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
$$;

create or replace function public.signature_request_token_matches(p_exception_id uuid, p_token uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from signature_requests sr
    where sr.exception_id = p_exception_id and sr.token = p_token
  )
$$;

grant execute on function public.signature_request_token_matches(uuid, uuid) to anon;

create policy "anon select own signed doc via signature token" on storage.objects
  for select to anon
  using (
    bucket_id = 'signed-approvals'
    and public.signature_request_token_matches(
      (storage.foldername(name))[2]::uuid,
      substring(storage.filename(name) from 'signed-([0-9a-fA-F-]{36})\.pdf$')::uuid
    )
  );
