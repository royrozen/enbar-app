# Changelog

## [Unreleased]
Maintenance module (machine × maintenance-period tracking, QR-triggered checklists, parts catalog, fault reporting) — in progress on `feat/maintenance-tracking`, not yet merged to `main`. Phases 1-2 (+ a revision) done and approved; Phases 3-8 remain.
- **Phase 1 — schema + role model.** 11 new tables (`maintenance_periods`, `maintenance_tasks`, `machines`, `machine_periods`, `machine_period_tasks`, `maintenance_visits`, `machine_period_logs`, `machine_period_log_tasks`, `machine_parts`, `fault_reports`, `fault_report_parts`), all RLS `authenticated`-only. `profiles.role` extended with `factory_worker`/`platform_admin`; `profiles.employee_id` added; `employees.maintenance_access_enabled` added. New self-provisioning RLS `INSERT` policy lets a factory worker's own first OTP login create their `profiles` row, gated entirely in-database (no admin step, no service-role code). `compute_next_due_date()` (Saturday-shift rule) and `set_part_no()` (per-machine sequential numbering) helper functions/triggers. Two new public Storage buckets (`machine-parts`, `fault-reports`).
- **App-wide: `platform_admin` superadmin.** Widened from module-only to identical access to `factory_manager` everywhere in the app — 40 existing RLS policies across 16 tables (only their role predicate changed), plus the `/manager/settings` route guard. Standalone change, not scoped to the maintenance module.
- **Phase 2 — admin catalogs + employee access toggle.** Added a per-employee "גישה למודול תחזוקה" toggle to the existing employees tab (`ManagerSettings.jsx`), restricted to `factory_manager`/`platform_admin`.
- **Phase 2-revision.** Corrected Phase 2 per three later decisions: the periods catalog is no longer admin-manageable at all (fixed/seeded, 4 rows: שבועי, חודשי, תלת שנתי, אחת לשלוש שנים); added a new `triannual` schedule kind (3×/year, every 4 months) and renamed the old once-per-3-years cadence to disambiguate; restructured `/manager/settings` admin nav into one `תחזוקת מכונות` parent tab with `מכונות` (stub, Phase 3 builds it) and `משימות תחזוקה` (relocated, unchanged) sub-tabs.

## [1.0.0] - 2026-09-09
Initial production baseline.
- Daily work reports (team lead submission + manager dashboard/review)
- Extras/change-order approval workflow (UI label "אישורי עבודה נוספת", internals `exception_logs`), including signed-document upload step
- Client / project / team-lead admin (deactivate-only, no hard delete)
- Self-hosted client e-signature flow (replaces prior SignWell integration)
- Lunch-ordering feature: QR self-order at time clock, phone-number lookup, 12:00 daily cutoff, monthly report for factory manager
