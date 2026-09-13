# HANDOFF

Written 2026-09-13, for a reader with zero prior context.

## Branch
`feat/maintenance-tracking` — not merged to `main`. All work below lives here.
Just merged into `dev` for Roy to test on the dev preview.

## Where things stand
Building the **maintenance module** (machine × maintenance-period tracking,
QR-triggered checklists, per-machine parts catalog, fault/breakage reporting).
Following `enbar-app - PRD/enbar-maintenance-module-implementation-plan.md`,
one phase per session. **Phases 1-4 (+ three corrective revisions) are done
and approved.** Phase 5 is next.

Read `enbar-app - PRD/enbar-maintenance-module-prd.md` (current) and the
implementation plan (same folder) before touching anything — both are the
authoritative spec, already updated for every decision made mid-build.

### What shipped
- **Phase 1** — full DB schema for the module (11 tables), RLS, `profiles`/
  `employees` extended for the new `factory_worker`/`platform_admin` roles,
  self-provisioning RLS policy, `compute_next_due_date()` helper,
  `set_part_no()` trigger, two Storage buckets. Tag: `pre-maintenance-schema`.
- **App-wide `platform_admin` superadmin** — a standalone migration widening
  40 pre-existing RLS policies across 16 tables, plus the `/manager/settings`
  route guard. Tag: `pre-platform-admin-superadmin`.
- **Phase 2** — admin catalog tabs + the per-employee
  `maintenance_access_enabled` toggle on the existing employees tab.
- **Phase 2-revision** — periods catalog made fixed/seeded (never
  admin-editable), added the `triannual` schedule kind, restructured
  `/manager/settings` nav into a `תחזוקת מכונות` parent tab. Tag:
  `pre-period-catalog-revision`.
- **Phase 2-revision-2** — corrected the periods seed data: deleted
  `אחת לשלוש שנים`, restored plain `שנתי`. Final fixed catalog: שבועי /
  חודשי / שנתי / תלת שנתי.
- **Phase 2-revision-3** — dropped `maintenance_tasks` entirely (tag:
  `pre-task-model-revision`); tasks are now machine-owned free text
  (`machine_period_tasks.task_name`), never a shared catalog. Collapsed
  `תחזוקת מכונות` to one flat tab, no sub-tab bar.
- **Phase 3** — built the `תחזוקת מכונות` tab for real: machine list
  (add/edit/deactivate, `#{machine_no}` zero-padded), per-machine period
  assignment with schedule-correct anchor inputs, inline machine-owned tasks
  with cross-machine autocomplete, printable QR (`machines.id`, never
  `machine_no`). Added `qrcode` npm dependency. Imported Roy's real
  21-machine CSV (21 machines, 40 parts, 28 periods, 78 tasks) — machine_no
  verified 1-21 matching CSV order after catching and fixing a stale-identity
  sequence gap. Found and fixed two pre-existing bugs: the dev DB's periods
  catalog never actually got the Phase 2-revision-2 fix (TODO had marked it
  done, it wasn't applied), and `compute_next_due_date`'s triannual branch
  read the wrong columns (day_of_month instead of anchor_month/anchor_day).
- **Phase 4** — added a `חלקים` (parts) tab to each machine's detail view:
  list/add/edit/deactivate covering all PRD §6.5 fields including photo
  upload (reuses the existing report/exception-photo compression pattern).
  Found and fixed a real Phase 1 gap: `machine-parts` Storage bucket had zero
  `storage.objects` RLS policies, so uploads would have failed silently
  despite the bucket being public. `fault-reports` has the identical gap,
  intentionally left for whoever builds Phase 7 (see TODO.md).
- **Select-arrow bug** — `select.input` in `src/index.css` was missing
  `-webkit-appearance: none`, so Safari never rendered the custom dropdown
  arrow on any select in the app. Fixed app-wide, Roy confirmed.
- Roy has since logged in with real OTP, clicked through Phase 3/4's UI
  himself, and set the real schedule anchor (weekday/day/month) for all 28
  imported machine_periods rows by hand — that placeholder-anchor cleanup
  item is closed.

All of this is committed to `feat/maintenance-tracking` and merged into `dev`.

## What's verified vs. not
- **Verified:** every DB object (tables, constraints, RLS policies, helper
  functions, triggers, storage buckets, storage RLS) via direct schema
  queries and role-simulated checks. `npm run build` passes clean throughout.
  New UI layout (Phase 3's period-anchor selects, Phase 4's parts form) was
  screenshot-verified via a Playwright/Chromium+WebKit repro against the real
  compiled CSS before being called done — this was learned the hard way after
  first shipping a Safari-only select-arrow bug and a flexbox width bug
  without actually rendering anything.
- **NOT verified by this agent:** a from-scratch phone-OTP click-through.
  This agent session cannot receive SMS, so it can never log in as a real
  user — Roy has done this verification himself for Phases 3-4 already (see
  above); anything built in a *future* session still needs the same manual
  check from him before being trusted end-to-end.

## What's next
**Phase 5 — client-side self-provisioning + access-check helper.** Run it
from `enbar-app - PRD/enbar-maintenance-module-implementation-plan.md`, the
"Phase 5" block. Small, deliberately minimal phase: no server function, no
admin action, no new secret — just a client-side insert-and-catch against
Phase 1's existing self-provisioning RLS policy, plus a small shared
access-check helper for Phase 6/7 to call. Read PRD §4.0 in full first; it's
easy to over-build this one.

## The one thing to remember
**Maintenance periods are fixed, not admin-editable.** `maintenance_periods`
holds exactly 4 seeded rows (שבועי, חודשי, שנתי, תלת שנתי) and there is no
admin UI anywhere to add, edit, or deactivate one. Any future picker must
choose from those 4 fixed rows only.

**Tasks are machine-owned text, not a shared catalog.** `machine_period_tasks
.task_name` is plain text scoped to one machine's period assignment — there
is no `maintenance_tasks` table anymore (dropped in Phase 2-revision-3), no
shared task entity, and no standalone task-management screen. Autocomplete
across machines is a wording convenience only, never a link.

Also worth knowing: `תלת שנתי` means **3 times a year** (`schedule_kind =
'triannual'`, every 4 months), not "once every 3 years" — that cadence was
renamed to `אחת לשלוש שנים` then deleted outright. Don't conflate the two.

Whenever building a new Storage bucket's upload feature, check
`pg_policies`/`storage.objects` for that bucket first — Phase 1 created
`machine-parts` and `fault-reports` without any RLS policies on either, and
the `machine-parts` gap (now fixed) wasn't caught until Phase 4 tried to
actually upload something.
