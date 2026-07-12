# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Enbar — daily work-log web app for an air-conditioning duct install company (Hebrew, RTL-only, no i18n). Team leads submit daily site reports (with photos) from a phone; managers review them on a dashboard, approve/reject "extras" (change orders), and generate branded PDF approval docs. Full requirements/data-model/spec: `enbar-app - PRD/enbar-spec.md`.

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — runs `prebuild` (see below) then `vite build`
- `npm run preview` — preview production build
- No lint/test scripts configured — there is no test suite in this repo.

### Prebuild step (`scripts/gen-fonts.mjs`)

Runs automatically before every build via the `prebuild` npm hook. It does two unrelated things:
1. Generates `src/lib/heeboFonts.js` (base64 TTF data for pdfmake) from the `@expo-google-fonts/heebo` package. This generated file **is committed to git** — don't hand-edit it, re-run `npm run build` or `node scripts/gen-fonts.mjs` instead.
2. Fetches rows from a Supabase table called `deploy_files` and writes them to disk for any listed path that doesn't already exist locally (currently `src/pages/ManagerReport.jsx` and `src/pages/ManagerSettings.jsx`). This is a fallback only — those files are normally already tracked in git — so it's a no-op unless one of those files is missing. If offline and the files are missing, the build fails intentionally.

## Architecture

**Stack:** React 18 + Vite + React Router, Tailwind CSS v4 (via `@tailwindcss/vite`, theme tokens in `src/index.css` `@theme` block, no `tailwind.config.js`), Supabase (Postgres + Storage) as the only backend — no server code at all, the client talks to Supabase directly with the anon key.

**No real authentication (Phase 1 by design).** Instead there's a profile picker (`src/pages/ProfilePicker.jsx`) that stores one of `team_lead` / `factory_manager` (see `src/lib/profile.js`) in `localStorage` under `enbar_profile`. There is no "installation_manager" localStorage value distinct from factory_manager in code — route guards in `src/App.jsx` treat anyone who isn't `team_lead` as a manager, and further gate `/manager/settings` to `factory_manager` only. When touching auth/route-guard logic, mirror the three `Require*` wrapper components in `App.jsx` rather than inventing a new pattern.

As a stopgap against casual/accidental access to the admin area (there being no real auth), `/manager/settings` is additionally gated by `AdminGate` in `App.jsx`: a single shared password (`VITE_ADMIN_PASSWORD` env var, fallback `enbar2026`), unlocked once per tab via `sessionStorage['enbar_admin_unlocked']`. This is not real security — the password ships in the client bundle — just a speed bump. Don't mistake it for Phase-2 auth.

**Routing** (`src/App.jsx`): `/` (profile picker) → `/home` (team lead) → `/report/new`, `/report/:id` (team lead's own reports) → `/manager` (dashboard) → `/manager/report/:id` → `/manager/settings` (admin, factory manager only).

**Data model** — see `enbar-app - PRD/enbar-spec.md` section 4 for full SQL. Key tables: `team_leads`, `clients`, `projects` (belongs to a client), `reports` (belongs to a team lead + project, has an optional "extra" with `extras_status` lifecycle `pending → sent → approved/rejected`), `report_photos` (`kind` is `work` or `issue`). Phase 1 has exactly one active team lead — `fetchActiveTeamLead()` in `src/lib/supabase.js` just grabs the oldest active row, no picker UI. No hard deletes anywhere; entities are soft-deleted via `is_active`.

**Storage:** public bucket `report-photos` (path `reports/{report_id}/{uuid}.jpg`) and `signed-approvals`; URLs built via `photoUrl()` / `signedDocUrl()` in `src/lib/supabase.js`. Photos are compressed client-side (`browser-image-compression`, max 1600px) in `src/components/PhotoUploader.jsx` before upload — never upload raw camera files.

**PDF generation** (`src/lib/pdf.js` + `src/lib/rtl.js`): client-side via `pdfmake`, producing the "extra approval" document with an embedded Heebo font. `src/lib/rtl.js` is the load-bearing piece here — pdfmake/fontkit does not correctly bidi-render Hebrew (word order, digit runs, bracket mirroring, and inter-word spaces are all wrong by default). Every Hebrew string bound for pdfmake must go through `rtl()` (single line) or `rtlBlock()` (wrapped paragraph) — read the comment block at the top of that file before changing it, the workarounds are non-obvious and empirically derived.

**Draft persistence:** `src/pages/ReportNew.jsx` autosaves text fields (not photos) to `localStorage` (`enbar_report_draft`) so an interrupted report isn't lost.

**Env vars:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (`.env` / `.env.local`, gitignored). `src/lib/supabase.js` falls back to hardcoded project values if unset, so the app builds/runs even without an env file.

**Deployment:** Vercel, SPA rewrite in `vercel.json` sends all paths to `index.html`.
