# TODO

## Now
- Maintenance module: machine × maintenance-period tracking (QR-triggered checklist per machine), per-machine parts catalog, fault/breakage reporting with status workflow — brainstorm stage, PRD not yet written

## Next
- Auth Phase 1: complete Twilio Alphanumeric Sender ID approval, wire Supabase Auth phone OTP end-to-end
- Auth Phase 2 (RLS hardening): create `authenticated` policies → drop permissive `anon` policies → verify zero `anon` policies remain
- Auth Phase 3: convert public Storage buckets to private with signed URLs
- Backdated report logging (per-project, per-type date picker indicator) — discussed, not implemented
- Production Vercel deployment (pending the auth phases + schema cleanup)
- Decide on dropping `exception_logs.signwell_document_id` (deferred, revisit before production Vercel deployment)

## Blocked
- Twilio Alphanumeric Sender ID ("EnbarApp") — submitted for Israel, under review

## Someday
- (none tracked yet)

## Done
- Display numbering live in schema: `clients.client_no`, `projects.project_seq`/`project_code`, `reports.report_no`, `exception_logs.exception_no` — all `IDENTITY`/unique, verified 2026-09-09 (exceptions numbering was originally deferred in the PRD but has since been implemented too)
- v1.0.0 tagged and released (git tag `v1.0.0` @ `acee99f`, GitHub Release published)
- Self-hosted signature flow live, SignWell removed from active flow
- Parts order print sheet: page-splitting bug fixed, signature area added ("שם העובד" + date)
- Lunch-ordering feature: fully designed and database-migrated
- Lunch admin tab at `/manager/settings` ("עובדים")
