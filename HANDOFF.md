# HANDOFF

Written 2026-09-09, for a reader with zero prior context.

## Where things stand
- `v1.0.0` is tagged (`acee99f`) and published as a GitHub Release. This is the
  production baseline: daily reports, extras approval workflow, admin, lunch
  ordering. See `CHANGELOG.md` for the full list.
- Repo hygiene just got cleaned up: stray tags (`v1.1.0`, `v1.1.1`, `v1.2.0`) and
  their releases were removed, only `v1.0.0` remains.
- `RELEASE-WORKFLOW.md` was just added to the repo — the standing process for
  branching, tagging, releasing, and (new) branching the DB before any schema
  change, generalized beyond Supabase for reuse across projects.

## What's in progress
- About to start the **maintenance module** (machine × maintenance-period
  tracking, QR-triggered checklists, per-machine parts catalog, fault/breakage
  reporting). Currently brainstorm-stage, no PRD written yet.

## What's next
- Write the maintenance-module PRD before any implementation (per the
  two-phase workflow in `RELEASE-WORKFLOW.md` / prior convention).
- Auth Phase 1 (phone OTP) still in progress — Twilio Alphanumeric Sender ID
  pending approval.
- Production Vercel deployment is blocked on the auth phases and the
  `signwell_document_id` cleanup decision.

