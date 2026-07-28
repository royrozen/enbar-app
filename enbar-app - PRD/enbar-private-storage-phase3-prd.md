# Enbar Daily Work Reports — Phase 3: Private Storage

**Status:** Draft for review
**Scope:** Convert `report-photos` and `signed-approvals` from public-read to private buckets, replacing every `getPublicUrl()` call against them with time-limited signed URLs. Phases 1 (auth) and 2 (RLS) are complete and unchanged by this PRD.

**Scope note:** two more buckets — `exception-photos` and `exception-docs` — also currently use `getPublicUrl()` and are just as publicly exposed, but didn't exist when this phase was originally scoped. Explicitly out of scope here (see Non-Goals); flagged so it isn't forgotten as a Phase 3b.

## Overview & Goals

Today `report-photos` and `signed-approvals` are public buckets — `supabase.storage.from(bucket).getPublicUrl(path)` returns a permanent, unauthenticated URL anyone can hit forever, including a client's signed approval document. Goals:
- Flip both buckets to private; access requires an authenticated session and passes through storage RLS.
- Replace every `getPublicUrl()` call against these two buckets with `createSignedUrl()` (or the batch `createSignedUrls()` for galleries), generated at view time.
- Storage RLS mirrors Phase 2's DB ownership model (reusing the `auth_profile()` helper from that migration): team leads see/write only their own files, factory managers see everything.
- No path or filename changes — this is a policy/access change only, not a data migration.

## Non-Goals

- `exception-photos` / `exception-docs` buckets stay public — real residual exposure, explicitly deferred, not silently dropped.
- No DB RLS changes (Phase 2, done).
- No changes to SignWell webhook business logic (status transitions, event handling) — only what's needed so the app can *display* what it already writes.
- No new upload flows, no path restructuring.

## Storage Policy Matrix

| Bucket | Operation | team_lead | factory_manager |
|---|---|---|---|
| `report-photos` | SELECT | own report's photos only | all |
| `report-photos` | INSERT | own report's photos only | — (manager never uploads report photos) |
| `signed-approvals` | SELECT | own exception's signed doc only | all |
| `signed-approvals` | INSERT | own exception, **only while not yet approved** | all |

**Correction from the original brief:** it assumed only `factory_manager` writes to `signed-approvals`. In the real app, `ExceptionView.jsx`'s `uploadSignedDoc()` is a single shared component both roles call — team leads upload their own signed form until approval, same as managers. The matrix reflects actual behavior; restricting it to manager-only would break a real, existing feature.

```sql
update storage.buckets set public = false where id in ('report-photos', 'signed-approvals');

drop policy "anon upload report-photos" on storage.objects;
drop policy "public read report-photos" on storage.objects;
drop policy "anon upload signed-approvals" on storage.objects;
drop policy "public read signed-approvals" on storage.objects;

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
```

## Signed URL Implementation

Two expiries, not one — a flat value breaks a real feature (see below):

- **`IN_APP_EXPIRY = 300`** (5 min): report photo galleries, thumbnails, signed-doc "view" link, PDF-embedding fetches. Long enough that a screen doesn't break mid-view, short enough to limit exposure.
- **`SHARE_EXPIRY = 86400`** (24h): specifically `shareSignedDocWhatsApp()` in `ExceptionView.jsx`, which bakes the URL into a WhatsApp message the client opens whenever they get to it — a 5-minute link would almost always be dead on arrival. 24h is a judgment call, not a hard requirement; see Open Questions.

Call-site replacements (only these, all currently calling `getPublicUrl` via `photoUrl()`/`signedDocUrl()` in `src/lib/supabase.js`):
- `photoUrl()` / `signedDocUrl()` become `async`, taking an `expiresIn` param (default `IN_APP_EXPIRY`), calling `createSignedUrl` instead of `getPublicUrl`.
- `PhotoGallery.jsx` — batches all photo paths for a report through `createSignedUrls()` (plural) in one call, not N sequential requests.
- `ManagerDashboard.jsx` thumbnail — one signed URL per visible row, generated alongside the existing report-list fetch.
- `ExceptionView.jsx` — "צפייה במסמך החתום" uses `IN_APP_EXPIRY`; `shareSignedDocWhatsApp()` explicitly requests `SHARE_EXPIRY` at click time.
- `pdfV2.js`'s `fetchPhotoDataUrl()` receives an already-signed URL from `exceptionPhotoUrl()`'s new async form, fetches it immediately (its existing pattern) — no expiry risk since generation and fetch happen back-to-back in the same call.

## SignWell Integration Impact

- `api/webhooks/signwell.js`: **no change**. It uploads via the service-role client, which bypasses RLS entirely regardless of the bucket's public/private flag — confirmed via code read, it never calls `getPublicUrl`.
- `ExceptionView.jsx`'s `uploadSignedDoc()`: **no change to the upload call itself** (still `supabase.storage.from(SIGNED_DOC_BUCKET).upload(...)`, which works against a private bucket under the INSERT policy above). Only the *display* of what it wrote — the view link and the WhatsApp share — switches to a signed URL.

## PDF Generation Impact

`pdfV2.js` embeds photos as base64 by fetching each `exceptionPhotoUrl()` result and converting via `FileReader` — already "fetch-and-convert immediately before use," so swapping in a signed URL is a same-shape change: `exceptionPhotoUrl()` becomes async, PDF generation `await`s it right before `fetchPhotoDataUrl()`. Both calls happen back-to-back inside the same async function with no user-facing delay between them, so even the 5-minute expiry can't realistically lapse mid-generation.

## Migration Plan

No re-upload, no path rewrite — only `storage.buckets.public = false` plus the policy changes above. Existing files stay exactly where they are.

**Residual risk (accepted, not mitigated):** any signed-approval or report-photo URL already sent externally before this ships — an old WhatsApp message, a browser history entry — stops resolving once the bucket goes private (403). One-way, can't be fixed retroactively; acceptable since these were never meant to be permanent public links. Report-draft `localStorage` doesn't cache any photo URLs (only text fields), so no exposure there.

## UX/Performance Handling

- Signed URL generation is one extra round-trip before an image renders. Galleries use `createSignedUrls()` (batch) so a report with 8 photos is one request, not 8.
- Existing loading-state convention extends naturally: the photos array stays `null` until both the DB rows *and* their signed URLs resolve, matching today's spinner-while-null pattern — no new UI state introduced.
- Manager dashboard thumbnails: signed URLs for all visible rows generated in one batched call alongside the existing report-list fetch, not per-row on scroll.

## Testing Plan

| # | Case | Expected |
|---|---|---|
| 1 | Old public URL pattern, no auth, hit directly | 400/403 — bucket no longer public |
| 2 | team_lead A, signed URL for own report photo | resolves, image loads |
| 3 | team_lead A, signed URL request for team_lead B's report photo | rejected — RLS denies `createSignedUrl` |
| 4 | factory_manager, signed URL for any report/signed-doc | resolves for all |
| 5 | team_lead, `uploadSignedDoc()` on own exception (not yet approved) | succeeds |
| 6 | PDF generation (both roles, where applicable) end-to-end | photos embed correctly, no broken images |
| 7 | `shareSignedDocWhatsApp()` link opened >5 min but <24h later | still resolves |

## Open Questions

- Is 24h the right `SHARE_EXPIRY` for the WhatsApp-shared signed doc, or should it be even longer given clients may not check WhatsApp same-day?
- Should `exception-photos`/`exception-docs` become Phase 3b immediately after this ships, given they have the identical exposure?
- Any external system (besides SignWell, which stores its own copy) holding a long-lived reference to today's public URLs?

## Acceptance Criteria

- [ ] `report-photos` and `signed-approvals` are private buckets; the old public URL pattern returns 403/400 for both.
- [ ] Every `getPublicUrl()` call against these two buckets is replaced with `createSignedUrl`/`createSignedUrls`.
- [ ] Team lead can generate a signed URL only for their own report photos / own exception's signed doc; cross-team-lead requests are rejected by storage RLS, not just hidden by the UI.
- [ ] Factory manager can generate signed URLs for any file in both buckets.
- [ ] `uploadSignedDoc()` still works for both roles while an exception is not yet approved.
- [ ] `api/webhooks/signwell.js` requires zero code changes (verified, not just assumed).
- [ ] PDF generation embeds photos correctly for both roles with no expiry-related failures.
- [ ] `shareSignedDocWhatsApp()` links remain valid for `SHARE_EXPIRY`, not `IN_APP_EXPIRY`.
- [ ] No storage path, filename, or DB schema changes anywhere in this phase.
