# TODO

## Now
- Maintenance module, Phase 3 — machine management (מכונות sub-tab under תחזוקת מכונות): machine list, add/edit, per-machine period assignment (pick from the fixed 4-row period list, no "add period" action), QR generation/display. Run from `enbar-app - PRD/enbar-maintenance-module-implementation-plan.md`, Phase 3 block. Needs Phase 1's schema and Phase 2-revision's `MachineMaintenanceTab`/`MachinesStubSection` in `src/pages/ManagerSettings.jsx` (currently a stub — Phase 3 fills it in).

## Next
- Maintenance module Phases 4-8 (parts catalog, auth/role provisioning, field checklist flow, fault report flow, manager reports) — see the implementation plan for each phase's own spec
- Live browser click-through of Phases 1/2/2-revision on the Vercel preview — not yet done (phone-OTP login isn't testable in an agent session; only build + role-simulated DB checks were run)
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
- Maintenance module Phase 2-revision (2026-09-10): מחזורי טיפול admin tab deleted entirely (periods are now fixed/seeded, never admin-editable), `triannual` schedule_kind added + `maintenance_periods` seeded with its 4 fixed rows, `compute_next_due_date` gained a triannual branch, `/manager/settings` restructured into a `תחזוקת מכונות` parent tab with `מכונות` (stub, Phase 3) and `משימות תחזוקה` (relocated) sub-tabs. Approved.
- App-wide `platform_admin` superadmin migration (2026-09-10): 40 pre-existing `factory_manager`-only RLS policies across 16 tables widened to also accept `platform_admin`, plus the `/manager/settings` route guard. Standalone change, tagged `pre-platform-admin-superadmin`.
- Maintenance module Phase 2 (2026-09-10): admin catalog tabs (מחזורי טיפול, משימות תחזוקה — the former later removed by Phase 2-revision above) and the per-employee `maintenance_access_enabled` toggle on the employees tab, in `src/pages/ManagerSettings.jsx`. Approved.
- Maintenance module Phase 1 (2026-09-10): full schema (11 new tables), RLS (all `authenticated`-only, verified via role-simulated tests), `profiles`/`employees` extended (`factory_worker`/`platform_admin` roles, self-provisioning RLS policy via `employee_access_match()`), `compute_next_due_date()` helper, `set_part_no()` trigger, `machine-parts`/`fault-reports` Storage buckets. Tagged `pre-maintenance-schema`. Approved after two rounds of verification (found and fixed: policies missing `TO authenticated`, a missing column grant, an RLS self-recursion bug in the self-provisioning policy).
- Display numbering live in schema: `clients.client_no`, `projects.project_seq`/`project_code`, `reports.report_no`, `exception_logs.exception_no` — all `IDENTITY`/unique, verified 2026-09-09 (exceptions numbering was originally deferred in the PRD but has since been implemented too)
- v1.0.0 tagged and released (git tag `v1.0.0` @ `acee99f`, GitHub Release published)
- Self-hosted signature flow live, SignWell removed from active flow
- Parts order print sheet: page-splitting bug fixed, signature area added ("שם העובד" + date)
- Lunch-ordering feature: fully designed and database-migrated
- Lunch admin tab at `/manager/settings` ("עובדים")
