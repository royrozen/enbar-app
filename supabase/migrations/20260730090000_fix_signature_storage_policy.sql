-- Fix: the anon storage insert policy from signature_requests.sql checked
-- `exists (select 1 from signature_requests sr where ...)` directly inside
-- the storage.objects RLS predicate. That subquery runs as the calling role
-- (anon), and signature_requests deliberately has zero anon policies — so
-- for an anon caller the subquery always sees zero rows, the EXISTS is
-- always false, and every anon upload to signed-approvals was rejected
-- (confirmed in storage logs: 400 on the real client-signing attempt).
--
-- Fix: same SECURITY DEFINER pattern already used for the two RPC functions
-- — a function that explicitly bypasses RLS to do the exact-match check,
-- called from the policy instead of an inline subquery.

create or replace function public.signature_request_is_signable(p_exception_id uuid, p_token uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from signature_requests sr
    where sr.exception_id = p_exception_id
      and sr.token = p_token
      and sr.status = 'awaiting_signature'
      and sr.expires_at > now()
  )
$$;

grant execute on function public.signature_request_is_signable(uuid, uuid) to anon;

drop policy "anon insert signed docs via signature token" on storage.objects;

create policy "anon insert signed docs via signature token" on storage.objects
  for insert to anon
  with check (
    bucket_id = 'signed-approvals'
    and public.signature_request_is_signable(
      (storage.foldername(name))[2]::uuid,
      substring(storage.filename(name) from 'signed-([0-9a-fA-F-]{36})\.pdf$')::uuid
    )
  );
