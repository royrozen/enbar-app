# PLAN

## Goal
Enbar Daily Work Reports: a Hebrew-only, RTL, mobile-first web app for Enbar
Sheet Metal Industries (Haifa air-duct installation). Team leads file daily
field reports; the factory manager reviews them and runs the extras
(change-order) approval workflow end to end, including client signature.

## Success criteria
Not yet formally defined — revisit and fill in once explicitly discussed.

## Approach
- Browser-direct-to-Supabase (project `enbar-bot`), no custom backend server
- Deployed on Vercel; a thin serverless layer handles secrets and third-party
  API calls only
- Supabase Storage for report photos, signed approvals, and other documents
- Two primary roles: team lead (field, mobile) and factory manager (desktop admin)

## Phases (security roadmap)
- **Phase 1** — Supabase Auth via phone OTP (Twilio) — in progress
- **Phase 2** — RLS hardening: explicit drop of permissive `anon` policies once
  `authenticated` policies are in place
- **Phase 3** — Convert public Storage buckets to private, served via signed URLs

## Decisions log (append-only)

| Date | Decision | Reason |
|---|---|---|
| — | Self-hosted e-signature flow, replacing SignWell | SignWell integration removed; historical DB column (`exception_logs.signwell_document_id`) kept nullable as a marker, drop deferred to pre-production cleanup |
| — | UI label "אישורי עבודה נוספת" is display-only | Routes, table names (`exception_logs`), and PDF title stay unchanged — avoids a rename touching working internals for a cosmetic change |
| — | Display numbers (`client_no`, `project_code`, `report_no`) are additive, not a PK replacement | Storage paths depend on UUIDs being unguessable; PK swap would be high-blast-radius against a live schema with real FKs and real data |
