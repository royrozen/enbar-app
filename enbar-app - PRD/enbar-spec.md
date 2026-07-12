# PRD — Daily Reporting App for Installation Teams | Enbar Sheet Metal Industries

**Version:** 1.1 | **Date:** 12.07.2026 | **Client contact:** Or — or@enbarsteel.com
**Product type:** Mobile-first Web App, Hebrew RTL only.

---

## 1. Background and Goal

Enbar Sheet Metal Industries (Haifa) manufactures and installs air-conditioning ducts at construction sites. Today, daily work reports from the sites arrive by phone/WhatsApp in an unorganized way, and it is hard for the manager to track progress, issues, and extras (change orders) that require supervisor approval. The goal: a simple web app where a team lead fills out a daily report from their phone in 2–3 minutes (including photos from the field), and the manager sees all reports from all projects in one place — including tracking of extras awaiting approval.

---

## 2. Users and Use Cases

### Team Lead (reporter)
- Is at a construction site, works from their personal phone, sometimes with gloves, in strong sunlight, while standing.
- **UX implications:** large buttons and touch targets (48px minimum), high contrast, few fields, minimal typing.
- Scenario: at the end of the workday, opens the app, picks their name, taps "דוח חדש" (New Report), fills it in, takes/uploads photos, submits. Done.

### Installation Manager (viewer and approver) — desktop-first
- Sits in the office, wants a status picture: what happened today at all the sites, what issues were discovered, and which extras are awaiting a decision.
- Scenario: opens the dashboard, filters by project/date, opens a report, views photos, edits the extra's wording if needed, generates a formal branded PDF and sends it to the client for signature (manually, via WhatsApp/email), then marks the extra as "אושר" (Approved) / "נדחה" (Rejected) once the client responds.

### Factory Manager (admin) — desktop-first
- Everything the Installation Manager can do, **plus** the admin area: creates clients/customers, projects (under clients), and team leads. **Only the Factory Manager can reach the admin dashboard.**

**Profiles instead of authentication in Phase 1** — on entry the user picks a profile: ראש צוות (Team Lead) / מנהל התקנות (Installation Manager) / מנהל מפעל (Factory Manager). The choice is saved to localStorage. No passwords at this stage (documented as technical debt for Phase 2). Manager actions (e.g., extra decisions) record which profile performed them.

---

## 3. Screens and Details

### 3.1 Profile Selection Screen (`/`)
- Enbar logo + three large buttons: **ראש צוות** (Team Lead), **מנהל התקנות** (Installation Manager), **מנהל מפעל** (Factory Manager).
- The selection is saved to localStorage — on the next visit, the user skips straight to their home screen (with a "החלף פרופיל" (Switch Profile) option).
- **No team-lead name picker in Phase 1** — there is exactly one team lead; reports are attributed to them automatically. (A name picker may be added later when there are multiple team leads.)

**Acceptance criteria:** tapping a profile navigates to the correct home screen; on a return visit from the same device, no re-selection is required; Installation Manager profile cannot reach `/manager/settings` (admin).

### 3.2 Team Lead Main Screen (`/home`)
- Greeting: "שלום, {שם}" (Hello, {name}) + small "החלף פרופיל" (Switch Profile) button.
- Large, prominent primary button: **"+ דוח חדש" (+ New Report)**.
- Below it: "הדוחות שלי" (My Reports) — the team lead's list of reports, newest to oldest (date, project name, number of photos, indication of whether there is an extra and its status). Tapping opens a read-only view of the report.

**Acceptance criteria:** only the selected team lead's reports are shown; the "דוח חדש" (New Report) button opens the form; a submitted report appears in the list immediately.

### 3.3 Daily Report Form (`/report/new`)

| # | Field | Type | Required | Validation / Notes |
|---|------|-----|------|------------------|
| 1 | Project | Pick from list (select) | Required | Active projects only |
| 2 | Date | date, defaults to today | Required | Not in the future; backdating allowed (late reporting) |
| 3 | Description of work performed | Free text (textarea) | Required | Minimum 5 characters |
| 4 | How many workers were on site | Number — large +/− buttons + numeric input | Required | Integer, 1–50 |
| 5 | Photos from the field | Multiple photo upload (`capture` from camera or from gallery) | Optional | Up to 10 photos, up to ~10MB each; client-side compression before upload (~1600px); preview + delete before submitting |
| 6 | Issues discovered on site | Free text — **a separate field from the work description** — **plus optional related photos** (same upload component as field 5, tagged as issue photos) | Optional | Empty = "לא התגלו בעיות" (No issues discovered); issue photos count toward the 10-photo total |
| 7 | Proposed addition / extras for approval | Free text | Optional | If filled — the report is flagged with an extra in "ממתין" (Pending) status and appears for the manager's review |

- Large submit button at the bottom, sticky. During upload — loading state + photo upload progress indicator; prevention of double submission.
- After a successful submission: confirmation screen "הדוח נשלח ✓" (Report sent ✓) + return to the main screen.
- **Nice-to-have:** automatic draft saving to localStorage (text only, not photos) — restore if the browser closes mid-way.

**Acceptance criteria:** submission is impossible without the required fields (error message in Hebrew next to the field); photos are uploaded to Storage and linked to the report; a report with an extra is created with "ממתין" (Pending) status; a network failure shows a clear error without losing what was typed.

### 3.4 Manager Screen — Dashboard (`/manager`)
- **Top status row:** number of reports today + **prominent badge** "X חריגות ממתינות לאישור" (X extras awaiting approval) — tapping filters to pending extras only.
- **Filtering:** project, team lead, date range (default: last 7 days). Filters combine.
- **Recent reports list** (newest→oldest): date, project, team lead, number of workers, first thumbnail photo, icon if an issue was reported, extra status badge (ממתין (Pending) / אושר (Approved) / נדחה (Rejected)) if one exists.

**Acceptance criteria:** a new report appears on the dashboard without a manual refresh (or with a simple refresh); the filters work in combination; the badge shows the correct count of pending extras.

### 3.5 Report Detail Screen (Manager) (`/manager/report/:id`)
- All report fields in full, including a photo gallery (enlarged view on tap); issue photos shown next to the issues field, work photos next to the work description.
- If an extra exists — **extras workflow box**:
  1. **Edit** — the manager can edit the extra's wording (original team-lead text is preserved for reference).
  2. **Generate PDF** — produces a formal approval document: Enbar logo, project + client details, extra description, date, and a signature block (client name, date, signature line). Downloaded/shared manually by the manager (WhatsApp/email) — no in-app sending in Phase 1.
  3. **Status** — "ממתין" (Pending) → "נשלח ללקוח" (Sent to client) → "אושר" (Approved) / "נדחה" (Rejected). The decision can be changed; the acting profile is recorded.

**Acceptance criteria:** all data and photos are displayed; extra edits are saved; the PDF renders correctly in Hebrew RTL with the logo and signature block; status changes are saved to the DB and reflected immediately in the dashboard and the team lead's reports list.

### 3.6 Administration (`/manager/settings`) — **Factory Manager only**
- **Clients/customers:** add (name, contact person, phone, email), mark active/inactive. Client details feed the extras-approval PDF automatically.
- **Projects:** add (name + client (required, from clients list) + address/city optional), mark active/inactive (inactive does not appear in the report form; old reports are preserved).
- **Team leads:** add (name), mark active/inactive.
- No hard deletion in Phase 1 — deactivation only.
- Route is blocked for the Installation Manager profile (redirect to dashboard).

**Acceptance criteria:** a new client/project/team lead appears in the selection lists immediately; a project cannot be created without a client; a deactivated item disappears from lists but history is preserved; Installation Manager profile cannot access this screen.

---

## 4. Data Model (Supabase / Postgres)

```sql
team_leads (
  id          uuid PK default gen_random_uuid(),
  name        text NOT NULL,
  is_active   boolean NOT NULL default true,
  created_at  timestamptz NOT NULL default now()
)

clients (
  id             uuid PK default gen_random_uuid(),
  name           text NOT NULL,
  contact_person text,
  phone          text,
  email          text,
  is_active      boolean NOT NULL default true,
  created_at     timestamptz NOT NULL default now()
)

projects (
  id          uuid PK default gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES clients(id),
  name        text NOT NULL,
  city        text,                      -- optional
  is_active   boolean NOT NULL default true,
  created_at  timestamptz NOT NULL default now()
)

reports (
  id                 uuid PK default gen_random_uuid(),
  team_lead_id       uuid NOT NULL REFERENCES team_leads(id),
  project_id         uuid NOT NULL REFERENCES projects(id),
  report_date        date NOT NULL,
  work_description   text NOT NULL,      -- description of work performed
  workers_count      int  NOT NULL CHECK (workers_count BETWEEN 1 AND 50),
  issues             text,               -- issues discovered on site (separate!)
  extras_description text,               -- original team-lead text
  extras_edited      text,               -- manager-edited version used in the PDF (NULL = use original)
  extras_status      text CHECK (extras_status IN ('pending','sent','approved','rejected')),
                     -- NULL if there is no extra; 'pending' upon creation with an extra
  extras_decided_by  text,               -- profile that made the decision
  created_at         timestamptz NOT NULL default now()
)

report_photos (
  id           uuid PK default gen_random_uuid(),
  report_id    uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  storage_path text NOT NULL,            -- path in Supabase Storage
  kind         text NOT NULL default 'work' CHECK (kind IN ('work','issue')),
  sort_order   int  NOT NULL default 0,
  created_at   timestamptz NOT NULL default now()
)
```

- **Storage:** bucket named `report-photos`, path `reports/{report_id}/{uuid}.jpg`. Publicly readable bucket in Phase 1 (no authentication).
- **RLS:** since there is no authentication in Phase 1, access is via the anon key with open policies for insert/select (and update only for `extras_status`). Document as technical debt for Phase 2.
- Status display in Hebrew: `pending` = ממתין (Pending), `sent` = נשלח ללקוח (Sent to client), `approved` = אושר (Approved), `rejected` = נדחה (Rejected).

---

## 5. UX Decisions

- **Full RTL:** `dir="rtl"` on the root, all layouts and icons in the correct direction. Hebrew only — no i18n.
- **Mobile-first:** designed for 390px and up; the dashboard scales nicely to desktop.
- **Large touch targets:** buttons 48–56px tall, input font 16px+ (prevents auto-zoom on iOS), high contrast for working in sunlight.
- **Short forms:** one form, one page, 7 fields, 3 of them optional. Workers count with +/− instead of typing.
- **Draft saving (nice-to-have):** localStorage for text only.
- Readable Hebrew font (Heebo/Assistant), dates in DD/MM/YYYY format.

---

## 6. Technology

| Component | Choice |
|------|--------|
| Frontend | React + Vite |
| Styling | Tailwind CSS (configured for RTL) |
| DB + Storage | Supabase (Postgres + Storage), direct access with supabase-js and the anon key |
| Routing | React Router (`/`, `/home`, `/report/new`, `/manager`, `/manager/report/:id`, `/manager/settings`) |
| Hosting | Vercel |
| Image compression | Client-side (canvas / browser-image-compression) before upload |
| PDF generation | Client-side, Hebrew RTL capable (e.g., pdfmake / @react-pdf with embedded Hebrew font) — Enbar logo embedded, signature block template |

No dedicated backend in Phase 1 — the client talks directly to Supabase.

---

## 7. Out of Scope for Phase 1

- User authentication and passwords (profiles are honor-system in Phase 1)
- Team-lead name picker (single team lead for now)
- Push / email / SMS notifications; in-app sending of the extras PDF (manual share only)
- In-app/digital client signature (client signs the PDF externally)
- Excel export
- Native app (iOS/Android)
- Full offline mode (only basic localStorage draft)
- Per-worker hours/attendance reporting, multi-language support

---

## 8. Definition of Done

1. A team lead in the field submits a full report with 5 photos from their phone in under 3 minutes, and it appears immediately on the manager's dashboard.
2. A manager filters reports by project + date, opens a report, views the photos, edits an extra, generates a branded RTL PDF with a signature block, and approves/rejects it — and the status is saved.
3. The Factory Manager adds a new client, a project under it, and a team lead — all available immediately in the forms; the Installation Manager cannot reach the admin screen.
4. The app is deployed on Vercel, connected to Supabase, and works in mobile Chrome/Safari with correct Hebrew RTL.
