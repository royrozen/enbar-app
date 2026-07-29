-- Self-Hosted Signature Link (see enbar-app - PRD/enbar-signature-link-prd.md)
--
-- NOT YET APPLIED — review before running against live projects, and apply to
-- BOTH enbar-Webapp-dev (test) and enbar-prod when approved.
--
-- Adds signature_requests (§3.1/§6) and the public /sign/:token surface.
--
-- ⚠ SECURITY REVIEW NEEDED — the PRD asks for "an RLS policy... allowing an
-- unauthenticated client to read/write ONLY the single row matching an exact
-- token value... no listing, no way to enumerate rows." A plain permissive
-- `for select/update to anon using (true)` cannot actually deliver that: RLS
-- USING clauses are a per-row predicate, not a constraint on how the client
-- queries — a client hitting `GET /rest/v1/signature_requests` with no
-- filter at all would get every row back (every outstanding signing token)
-- if the policy were permissive. There is no USING clause that can require
-- "the caller already supplied token=X" without a session-scoped GUC that
-- Supabase's PostgREST isn't configured here to set.
--
-- So instead: signature_requests keeps ZERO anon policies (default-deny,
-- same posture Phase 2 already established for every other table), and the
-- anon-facing surface is two SECURITY DEFINER functions that take the token
-- as an explicit SQL parameter and do the exact-match lookup/update
-- internally — the same bypass-RLS-safely pattern this project already uses
-- for auth_profile() (see rls_phase2_authorization.sql). This is strictly
-- tighter than any table policy could be: the only query Postgres will ever
-- run against this table for an anon caller is `where token = $1`, fixed by
-- us, never by client-supplied filters.
--
-- The one place a real anon *table* policy is unavoidable is storage.objects
-- (Storage's HTTP API enforces its own RLS — a SECURITY DEFINER SQL function
-- can't call it) — that policy is scoped as tightly as the same reasoning
-- allows: see the "anon insert signed docs via signature token" policy below.
--
-- Please review both mechanisms before applying.

create table public.signature_requests (
  id                   uuid primary key default gen_random_uuid(),
  token                uuid not null unique default gen_random_uuid(),
  exception_id         uuid not null references public.exception_logs(id),
  status               text not null default 'awaiting_signature'
                         check (status in ('awaiting_signature', 'signed', 'expired')),
  report_snapshot_hash text,
  signed_at            timestamptz,
  signer_ip            text,
  signed_pdf_path      text,
  created_at           timestamptz not null default now(),
  expires_at           timestamptz not null default (now() + interval '7 days')
);

alter table public.signature_requests enable row level security;

-- ── authenticated (manager UI: create/resend links, read status) ──────────
-- Same ownership-via-parent-exception pattern as exception_photos.
create policy "team_lead select own signature_requests" on public.signature_requests
  for select to authenticated
  using (exists (
    select 1 from exception_logs e where e.id = signature_requests.exception_id
    and e.team_lead_id = (select team_lead_id from auth_profile())
  ));

create policy "team_lead insert own signature_requests" on public.signature_requests
  for insert to authenticated
  with check (exists (
    select 1 from exception_logs e where e.id = signature_requests.exception_id
    and e.team_lead_id = (select team_lead_id from auth_profile())
  ));

create policy "team_lead update own signature_requests" on public.signature_requests
  for update to authenticated
  using (exists (
    select 1 from exception_logs e where e.id = signature_requests.exception_id
    and e.team_lead_id = (select team_lead_id from auth_profile())
  ))
  with check (exists (
    select 1 from exception_logs e where e.id = signature_requests.exception_id
    and e.team_lead_id = (select team_lead_id from auth_profile())
  ));

create policy "manager select all signature_requests" on public.signature_requests
  for select to authenticated
  using ((select role from auth_profile()) = 'factory_manager');

create policy "manager insert signature_requests" on public.signature_requests
  for insert to authenticated
  with check ((select role from auth_profile()) = 'factory_manager');

create policy "manager update signature_requests" on public.signature_requests
  for update to authenticated
  using ((select role from auth_profile()) = 'factory_manager')
  with check ((select role from auth_profile()) = 'factory_manager');

-- ── anon (public /sign/:token page) — via SECURITY DEFINER RPC only ────────
-- No anon policies on the table itself; see the review note above.

-- Read-only summary + everything generateExceptionPdfV2() needs to re-render
-- the same document for stamping. Returns null for an unknown token — the
-- client treats null the same as an expired/consumed link (§3.2).
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

grant execute on function public.get_signature_request_public(uuid) to anon;

-- On submit (§3.3): atomically marks the request signed and advances the
-- exception_log the same way the manual-upload fallback already does
-- (enforce_exception_lock still applies — a stale/expired/already-approved
-- row still can't be signed). status_updated_by uses a distinct value,
-- never the manager/team-lead profile labels, per the PRD's explicit ask.
-- signer_ip is read from the request headers PostgREST already exposes —
-- no new secret, no serverless call needed for this.
create or replace function public.submit_client_signature(p_token uuid, p_signed_pdf_path text)
returns void
language plpgsql security definer set search_path = public
as $$
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
$$;

grant execute on function public.submit_client_signature(uuid, text) to anon;

-- ── storage: anon upload to signed-approvals, scoped by the same token ────
-- Path stays the existing convention (exceptions/{exception_id}/signed-
-- {uuid}.pdf) — the "uuid" slot is the signing token itself rather than a
-- fresh random one, so RLS can verify it against a live, unexpired request
-- for that exact exception without needing any GUC/session state. Insert
-- only — the anon flow never needs to read the file back.
create policy "anon insert signed docs via signature token" on storage.objects
  for insert to anon
  with check (
    bucket_id = 'signed-approvals'
    and exists (
      select 1 from signature_requests sr
      where sr.exception_id = (storage.foldername(name))[2]::uuid
        and sr.status = 'awaiting_signature'
        and sr.expires_at > now()
        and sr.token::text = substring(storage.filename(name) from 'signed-([0-9a-fA-F-]{36})\.pdf$')
    )
  );
