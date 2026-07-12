# Enbar Daily Work Reports — Reverse-Engineered PRD

**Source:** live codebase (`enbar-app`, `main` branch, commit `26a8c1e`), the deployed Vercel app, and the connected Supabase project (`enbar-bot`, ref `svsuntixvxwwuggtqsws`). This document describes what the product **actually does today**, not what was originally planned. Where a claim can't be confirmed by reading the code, querying the live database, or exercising the running app, it's marked **[not observable]**.

---

## 1. What the product is

A Hebrew-only, RTL, mobile-first web app for an air-conditioning-duct installation company. A team lead files a short daily report from a construction site (work done, worker count, photos, issues, optional change-order request). A manager reviews all reports on a desktop dashboard, and runs a small approval workflow for change-order ("extras") requests, ending in a signed PDF.

Single-page React app, no backend server — the browser talks directly to Supabase (Postgres + Storage) with a public anon key embedded in the client bundle.

---

## 2. Users and access model

There is no login. Access is controlled entirely by a value in `localStorage` (`enbar_profile`), picked once from a screen at `/`.

| Profile value | Hebrew label | Home route | What it can reach |
|---|---|---|---|
| `team_lead` | ראש צוות התקנות | `/home` | `/home`, `/report/new`, `/report/:id` |
| `factory_manager` | מנהל מפעל | `/manager` | everything under `/manager/*`, including `/manager/settings` |

**Only two profiles exist in the running app.** The original planning doc (`enbar-app - PRD/enbar-spec.md`) describes a third profile, "מנהל התקנות" (Installation Manager), as a manager-without-admin-access role — that profile is **not present** in `ProfilePicker.jsx`. Today, picking "מנהל מפעל" is the only way into the manager area at all, and it grants full admin rights. There is no restricted, non-admin manager role in the live app.

Returning visitors skip the picker and go straight to their profile's home screen. A "החלף פרופיל" (switch profile) button (in the header) clears the stored profile and returns to `/`.

**Manager-area password gate (added after initial launch):** entering any `/manager/*` route additionally requires a shared password (currently `enbar2026`, overridable via a `VITE_ADMIN_PASSWORD` build-time env var). It's asked once per browser tab and remembered in `sessionStorage`. This is a stopgap against casual access, not real authentication — the password ships in the client JS bundle and is visible to anyone who opens dev tools.

There are no user accounts, no per-person login, and no way to tell which physical person is acting as "the team lead" — see §7.

---

## 3. Screens (as implemented)

### 3.1 Profile picker — `/`
- Enbar logo, app name, two large tap targets: "ראש צוות התקנות" and "מנהל מפעל".
- Picks write to `localStorage` and navigate to the profile's home route.
- No name entry, no password at this screen.

### 3.2 Team lead home — `/home`
- Header greeting "שלום, {שם}" using the name of **the single active team lead** returned by the database (see §6 — there is no per-user identity, just "whichever active team-lead row was created first").
- Primary CTA: "+ דוח חדש" → `/report/new`.
- "הדוחות שלי" (My Reports): every report belonging to that one active team lead, newest-first (ordered by report date, then creation time), up to 100 rows. Each row shows date, project name, photo count, an issue flag if `issues` is non-empty, and a status badge if the report has an extra. Tapping opens `/report/:id` (read-only).
- Loading / empty / error states are all handled (spinner, "עדיין אין דוחות" empty card, red error card on fetch failure).

### 3.3 New report form — `/report/new`
Fields, in order, exactly as rendered:
1. **לקוח** (Client) — required select, populated from active clients only.
2. **פרויקט** (Project) — only shown if the chosen client has **more than one** active project; auto-selected silently if the client has exactly one. (The original spec described a flat "pick a project" field with no client step — the live form is client-first, project-second.)
3. **תאריך** (Date) — required, defaults to today, browser date input capped at today (`max` attribute) plus a JS validation error if a past-typed value is somehow still in the future.
4. **תיאור העבודה שבוצעה** (Work description) — required textarea, minimum 5 trimmed characters.
5. **כמה עובדים היו באתר** (Worker count) — required integer 1–50, stepper buttons (±1, clamped) plus a numeric input.
6. **תמונות מהשטח** (Work photos) — optional, client-compressed (`browser-image-compression`, max 1600 px, ~1.2 MB target, JPEG) before upload; per-file 10 MB cap enforced before compression; combined cap of 10 photos across both photo fields.
7. **בעיות שהתגלו באתר** (Issues) — optional textarea + its own photo uploader (same 10-photo shared pool, tagged `kind: 'issue'`).
8. **תוספת / חריגה לאישור** (Extras / change-order request) — optional textarea. Non-empty text sets `extras_status = 'pending'` on submit; empty leaves `extras_status` and `extras_description` null.

Behavior:
- Text fields (not photos) autosave to `localStorage` (`enbar_report_draft`) on every change and are restored on next visit to the form; cleared on successful submit.
- On submit: validates client/project/date/description/workers client-side, scrolls to the first error field if any fail, then inserts the `reports` row, then uploads photos to Storage and inserts one `report_photos` row per photo sequentially, tracking per-photo failures without aborting the whole submission. A partial-failure banner ("X מתוך Y תמונות לא הועלו") shows on the success screen if any photo upload failed.
- Submit button shows a live text status ("שומר את הדוח...", "מעלה תמונה 2 מתוך 5...") and is disabled while submitting or if there are no active clients at all.
- Success screen: checkmark, "הדוח נשלח ✓", link back to `/home`, and a "דוח חדש נוסף" button that does a full page reload of the same form.

### 3.4 Report detail (team lead, read-only) — `/report/:id`
- Project name, client name, date, worker count.
- Work description + work photos (gallery with lightbox).
- Issues text (or "לא התגלו בעיות") + issue photos.
- If an extra exists: its text and a status badge. No edit or action controls on this screen — it's read-only for the team lead.

### 3.5 Manager dashboard — `/manager`
- Header stat: count of reports dated today.
- Prominent "חריגות ממתינות לאישור" (extras pending approval) count, clickable — toggles a filter that shows every pending-extra report regardless of date range.
- Filters: project (select), team lead (select), date range (`from`/`to`, defaulting to the last 7 days), all combinable; a reset button restores defaults. Date filters are disabled while the "pending only" toggle is active.
- Report list (up to 200 rows): thumbnail (first photo by sort order, or a placeholder icon), project name, date, team lead name, worker count, photo count, an issue flag, and the extra status badge. Tapping opens `/manager/report/:id`.
- Manual "רענון" (refresh) button; no live/websocket updates — data is fetched on load, filter change, or manual refresh only. **[not observable: whether Supabase Realtime is used elsewhere in a way that would make new reports appear automatically — the dashboard code shows only manual/query-triggered fetches.]**

### 3.6 Manager report detail — `/manager/report/:id`
All the team-lead-visible fields, plus, when the report has an extra, an **extras workflow box** with four parts:

1. **Edit wording** — a textarea seeded with the manager's previously-edited text if any, else the team lead's original. Saving writes to `extras_edited` only if the text differs from the original (`extras_edited` stays `null` otherwise, meaning "use the original"). The original team-lead text is always shown for reference once the manager's version diverges from it.
2. **Generate PDF** — client-side PDF (via `pdfmake`) with Enbar branding, project/client details, the extra text (edited version if present), and a signature block. Downloads directly to the manager's device; no in-app sending.
3. **Signed document upload** *(not in the original planning spec)* — a file (PDF or image) representing the client's physically-signed approval can be uploaded to a separate Storage bucket (`signed-approvals`) and linked via `extras_signed_path`. Once uploaded it can be viewed or replaced.
4. **Status** — buttons that step the status through `pending → sent → approved/rejected`, with backward transitions also available (`approved`/`rejected` can be changed back to `sent`). **Marking a status "approved" is blocked unless a signed document has already been uploaded** — the button is disabled with an explanatory tooltip. Every status change stamps `extras_decided_by` with the acting profile's Hebrew label (there's no way to know which physical person that was, only which of the two profiles).

### 3.7 Admin settings — `/manager/settings` (factory_manager profile only, plus the shared password gate)
Three tabs, each a simple list + add-form, no edit and no hard delete anywhere — only an "השבתה/הפעלה" (deactivate/activate) toggle per row:

- **לקוחות (Clients):** name (required), contact person, phone, email. New clients appear in the report form's client dropdown immediately (client-side is just a refetch).
- **פרויקטים (Projects):** name (required), client (required select, populated from active clients only — a project cannot be created if there are zero active clients, and the form shows a warning banner in that case), city (optional).
- **ראשי צוות (Team leads):** name only. An inline note tells the admin that reports are still auto-attributed to "the first active team lead," i.e. adding a second team lead does not give a way to choose which one a report belongs to.

---

## 4. Data model (confirmed live via Supabase, project `enbar-bot`)

```
team_leads(id, name, is_active, created_at)
clients(id, name, contact_person, phone, email, is_active, created_at)
projects(id, client_id → clients, name, city, is_active, created_at)
reports(
  id, team_lead_id → team_leads, project_id → projects,
  report_date, work_description, workers_count [check 1..50],
  issues, extras_description, extras_edited,
  extras_status [check: pending|sent|approved|rejected],
  extras_decided_by, extras_signed_path, created_at
)
report_photos(id, report_id → reports, storage_path, kind [check: work|issue], sort_order, created_at)
```

- `extras_signed_path` exists in the live schema but is **absent from the original planning-doc SQL** — it was added during implementation to support the signed-document-upload step (§3.6).
- Storage buckets: `report-photos` (work/issue photos) and `signed-approvals` (client-signed PDFs/images), both read via public URLs (`supabase.storage...getPublicUrl`) — i.e. **anyone with a storage path can view the file without authentication**.
- RLS is enabled on every table (`rls_enabled: true`), but the app connects with the public anon key with no user session, so in practice **[not observable: exact RLS policy contents]** — the app's behavior (unauthenticated inserts/updates succeeding for anyone who loads the page) implies permissive policies, consistent with the "Phase 1, no auth" note in the planning doc.
- There is also a `deploy_files` table (2 rows) and an unrelated `reports_bot_legacy` table (1 row, a completely different schema — chat_id, description_file_id, etc.) in the same Supabase project. `reports_bot_legacy` appears to be leftover from a different, earlier bot project sharing this database and is not read or written by this app's code.
- **Live data snapshot (observed at time of writing):** 2 team leads, 4 clients, 1 project, 1 report, 2 report_photos rows. This is an early/near-empty dataset, consistent with a just-launched app, not a mature production dataset.

---

## 5. Cross-cutting behaviors observed in code

- **Language:** 100% Hebrew UI strings, `dir="rtl"` on `<html>`, no language switcher, no i18n framework.
- **PDF Hebrew rendering:** a hand-written bidi correction layer (`src/lib/rtl.js`) works around specific `pdfmake`/`fontkit` bugs (word-order reversal, digit-run reversal, bracket mirroring, word-spacing collapse) — this is a real, documented engineering workaround, not a cosmetic detail.
- **Image handling:** every uploaded photo is compressed client-side before upload; there is no server-side image processing (no server at all).
- **Resilience:** every data-fetching screen has an explicit loading, empty, and error state in Hebrew; the report submission flow keeps typed data on network failure and reports partial photo-upload failure without discarding the report itself.
- **No hard deletes anywhere** in the admin area — deactivation only, consistent across clients/projects/team leads.
- **No notifications:** no email/SMS/push anywhere in the code. The manager finding out about a new report depends on opening the dashboard (or clicking refresh).
- **No client-side or in-app signature capture:** the "signature" is a physical/external signature that gets uploaded as a file.

---

## 6. Notable gaps versus the original planning document (`enbar-app - PRD/enbar-spec.md`)

| Planned | What's actually live |
|---|---|
| 3 profiles: team lead, installation manager, factory manager | Only 2 profiles exist; there's no non-admin manager role |
| Report form: pick project directly | Report form: pick client, then (conditionally) project |
| No mention of a signed-document upload step | A signed-document upload is required before an extra can be marked "approved" |
| No password/access control called out beyond the profile picker itself | A shared-password gate now sits in front of the entire `/manager` area (added post-launch, not in the original spec) |
| — | A `deploy_files` Supabase table and a prebuild script that can pull two page files from it exist as a build-time fallback mechanism; unrelated to product behavior but is a real part of how this app ships |

---

## 7. Known limitations (explicit, not speculative)

- No authentication: profile choice is an honor-system localStorage flag; the manager-area password is a shared, client-bundled string, not real access control.
- No concept of an individual team-lead user session — "who's reporting" is always resolved to whichever active `team_leads` row is oldest; a second active team lead cannot currently be selected by anyone in the field.
- No audit trail beyond `extras_decided_by` storing a profile label (e.g. "מנהל מפעל"), not a person's name or account.
- All photos and signed documents are served from public storage URLs — no access control on file content once you have the path.
- **[not observable]** Actual production traffic/usage volume, uptime, or error rates — nothing in the codebase reports analytics or monitoring.
- **[not observable]** Whether Vercel deployment protection or team-plan concurrency limits are configured — observed empirically that 3 consecutive production deployments sat in `BLOCKED` state with no build logs before a 4th succeeded; root cause was not exposed by the available tooling.
