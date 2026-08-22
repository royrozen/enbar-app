# Enbar — Backdated Reports + Per-Project "Already Logged" Indicators — PRD

**Scope:** the new-report form (`/report/new`) and the new-exception form (`/exceptions/new`) only — specifically their date field and the client→project→date portion of the screen flow. No change to `/manager/*`, `/history`, edit modes, PDF generation, or part orders. Extends the current system as documented in `enbar-reverse-prd.md`, `enbar-home-redesign-prd.md`, and `enbar-exceptions-log-prd.md`. Architecture unchanged: React SPA → Supabase with the anon key, Hebrew-only RTL UI.

---

## 1. Feature objective

Let a team lead log a daily work report or an exceptions report for a day other than today, and show them — per project, per report type — which days already have something logged, so they don't have to guess or duplicate blind. Both forms already pick client then project before anything else; the date field slots in right after, same position it (mostly) occupies today.

---

## 2. Investigation findings (as of this document, current `dev` branch)

These correct or sharpen the brief given for this PRD:

- **Daily reports can already be backdated today.** `ReportNew.jsx`'s date input (`src/pages/ReportNew.jsx:303-313`) sets `max={todayISO()}` but has **no `min`** — the browser's native calendar lets a team lead pick any past date already, and client-side validation (`ReportNew.jsx:121-122`) only rejects a *future* date. There is no lower bound today. So items 1–2 of the brief ("option to log previous days," "date picker appears after project") are **already true for daily reports** — the only genuinely new daily-report work here is the indicator (items 3–4) and picking a lower bound (currently: none).
- **Exceptions reports have no date field at all.** `exception_logs` (`supabase/migrations/20260719120000_exceptions_log.sql`, confirmed against every later migration touching that table) has `created_at timestamptz default now()` and nothing else date-related. `ExceptionNew.jsx` never asks for a date — the log's "date" is whatever moment the insert happens to run at. There is currently no way to say "this exception happened on a day other than the day I filed the paperwork," and therefore nothing to backdate. A **new column is required** to make backdating possible at all — see §4 and D1.
- **No date-picker/calendar component or library exists anywhere in the codebase.** Both forms use a plain native `<input type="date">`. A native date input's calendar popup is OS-rendered chrome — there is no cross-browser way to inject a dot or badge onto one of its day cells. **A native date input structurally cannot satisfy the literal ask ("indicator on the date picker")** — see D5, which is the one decision in this document that meaningfully changes implementation size.
- **Screen order already matches for daily reports** (client → project → date → rest of form, `ReportNew.jsx:249-314`). For exceptions, the new date field slots into the equivalent position: after project, before worker count (`ExceptionNew.jsx`'s current field 2 becomes field 3, etc.).
- **Projects have a `created_at`** (`supabase/migrations/20260709120000_base_schema.sql`), available as a candidate lower bound with no new column.

---

## 3. Screen flow

### 3a. Daily report — `/report/new`

No change to field order (client → project → date → description → …, already correct). Changes:

1. Replace the native `<input type="date">` with a custom calendar-grid date picker (see D5) that:
   - Defaults to today, same as now.
   - Caps the upper bound at today (unchanged — matches existing convention, matches the brief).
   - Applies a lower bound per D2.
   - Renders a small dot under any day that already has a **daily report** logged for the currently selected project (§3c).
2. The date field stays hidden/inert until a project is resolved (auto-selected single-project client, or manually chosen) — it already effectively depends on project selection since `projectId` must be set for submit to validate; the change here is that the indicator data can't be fetched until a project is known, so the calendar has nothing to mark before that point anyway.

### 3b. Exceptions report — `/exceptions/new`

1. **New required field: תאריך (Date)** — inserted after פרויקט (project), before מספר עובדים (worker count), i.e. becomes the new field 3, pushing worker count/duration/description/billable-days/photos down by one. Same custom calendar-grid component as §3a, same today-default, same upper bound, own lower bound (D2 applies identically), own indicator restricted to **exceptions** reports only (§3c).
2. Draft persistence (`enbar_exception_draft`) gains the date field, same pattern as the report form's existing `draft.date` handling (`ReportNew.jsx:39`).
3. Validation gains the same rule the report form already has: required, not in the future; lower-bound rule per D2.

### 3c. Indicator behavior (both forms)

- Indicator source is **per report type** — the daily-report calendar only marks days with a row in `reports` (`report_date`) for the selected project; the exceptions calendar only marks days with a row in `exception_logs` (new date column, see §4) for the selected project. Neither ever reflects the other type, per the brief's explicit requirement.
- Indicator is **informational only** (see D3) — it does not block or alter what the team lead can do next.
- Recomputes whenever the selected project changes (client change that resolves to a new project counts the same way); does not recompute on client change alone if the project hasn't actually changed (e.g., re-selecting the same auto-resolved project).

---

## 4. Data model impact

**Reports:** no schema change. `reports.report_date` already exists and is already the field being backdated.

**Exceptions — new column required:**

```sql
alter table public.exception_logs
  add column work_date date not null default current_date;
```

- Named `work_date` to avoid confusion with the existing `created_at` (submission timestamp) and to mirror `reports.report_date`'s role as "the business date this entry is about."
- `not null default current_date` so the migration backfills existing rows to their creation date (the closest available truth) without a manual data pass — every existing `exception_logs` row already has a `created_at` on the day it was created, so defaulting new rows and backfilling old ones to "today at migration time" for old rows specifically needs a backfill expression, not the bare column default, which only applies to *future* inserts. Correct migration:

```sql
alter table public.exception_logs add column work_date date;
update public.exception_logs set work_date = created_at::date;
alter table public.exception_logs alter column work_date set not null;
```

- No RLS change needed — `exception_logs` already has permissive anon/authenticated select/insert/update policies covering all columns (`supabase/migrations/20260719120000_exceptions_log.sql`, `20260728130000_rls_allow_authenticated.sql`).
- `exception_photos`, `report_photos` — untouched.

**Indicator queries** — see D4 for the "how" and confirmation this doesn't need a new table.

---

## 5. Cross-cutting behaviors

- **Language/RTL:** unchanged, all new strings Hebrew.
- **Draft persistence:** exceptions draft gains a `date` key exactly like the report draft already has one.
- **Resilience:** indicator fetch failure degrades to "no dots shown" (calendar still fully usable for picking a date) rather than blocking the form — consistent with the app's existing pattern of never letting a secondary data fetch block a primary action.
- **No new dependencies:** the calendar-grid component (D5) is hand-built from existing Tailwind tokens and the app's existing `formatDate`/`todayISO`/`daysAgoISO` helpers (`src/lib/format.js`), not a new library.
- **Reused components:** none directly reusable for the calendar grid itself (none exists today); the dot indicator reuses the app's existing accent color token (`--color-accent`, `#14284d`, already used for `border-accent/40` on the exceptions form's billable-days card) rather than introducing a new color.

---

## 6. Conflicts & decisions needed

- **D1 — Confirm the new `exception_logs.work_date` column.** Without it there is nothing to backdate on the exceptions side and the feature is daily-reports-only. **Recommendation: add it** (§4) — it's the only way to satisfy the brief for exceptions, the backfill is unambiguous (`created_at::date`), and it mirrors an existing, already-proven column (`reports.report_date`).

- **D2 — Lower bound on how far back a date can go.** Today there is effectively no lower bound on daily reports (a gap, not a feature) and no field at all on exceptions. Options:
  - (a) **No limit** — simplest, matches current (accidental) daily-report behavior, but lets someone backdate to an implausible date (e.g., before the company existed).
  - (b) **Fixed cap, e.g. 30 or 90 days** — a round number, easy to explain, but arbitrary and needs a constant someone has to remember exists.
  - (c) **Project's `created_at`** — a report/exception can't predate the project it's filed against; uses data that already exists, no magic number, self-documenting.
  **Recommendation: (c), project's `created_at`, with a floor of "not before the project existed."** It's free (no new config), correct in the case that actually matters (garbage dates), and doesn't block any legitimate backdating scenario a team lead would realistically have (catching up on paperwork for an active project).

- **D3 — Second report of the same type/project/day, when the indicator is already showing one.** Options: block, warn, or allow silently. **Recommendation: allow, indicator stays purely informational.** Nothing else in this app enforces uniqueness this way (no report/exception has a unique constraint on project+date today), team leads may legitimately file two entries for one day (e.g., a morning and an afternoon shift, or a follow-up exception), and a warn/block step adds a confirmation dialog the app has no existing pattern for (no toast/dialog primitive exists per `enbar-home-redesign-prd.md` §7).

- **D4 — Query approach for the indicator.** Recommendation: on project selection (or on load if a project is already resolved), fire one lightweight query per form — `select report_date from reports where project_id = :id` (daily form) or `select work_date from exception_logs where project_id = :id` (exceptions form) — no joins, no photo/status columns. Build a `Set` of ISO date strings client-side once; the calendar grid checks membership per rendered day, no per-day-cell query. Refetch only when `projectId` changes. At current data volumes (reverse-PRD §4: single-digit rows per project today, and even a mature project realistically accumulates low hundreds of daily reports) this is a trivial query with no pagination or date-range narrowing needed; revisit only if a project's report count grows large enough to matter, which isn't observable as a risk today.

- **D5 — Build a custom calendar-grid component, or keep the native `<input type="date">` and show the indicator as a separate list instead.** This is the decision with the biggest implementation-size swing:
  - (a) **Custom calendar-grid component** (month view, prev/next, day cells, dot under marked days) — matches the brief literally ("indicator on the date picker"), reused identically by both forms, but is new UI that has to handle keyboard/touch interaction, month navigation, and RTL layout from scratch since nothing like it exists in the codebase today.
  - (b) **Keep the native date input, add a small hint below it** — e.g. "כבר דווח בתאריכים: 12/08, 14/08, 15/08" (or a truncated "+N נוספים" for many dates) rendered under the existing input. Zero calendar-widget engineering, reuses `formatDate()`, but doesn't literally put a mark "on" the picker the way the brief describes, and gets unwieldy if a project has many logged days.
  **Recommendation: (a).** The brief is specific about the indicator living on the date picker itself, and a project with an actively-reporting team lead will accumulate enough dates that a text list (b) stops being readable within a season. (a) is a real but bounded and one-time cost — a single small component shared by both forms, not a per-form build.

---

## 7. Out of scope

Part orders (`/parts/new`) and their date/created_at handling — not touched by this feature, no indicator, no backdating change. Editing an already-submitted report or exception's date (`enbar-home-redesign-prd.md` §3b explicitly keeps report_date non-editable; same posture applies to the new `work_date` on exceptions). The `/manager` and `/manager/exceptions` dashboards, their date-range filters, and `/history` — all already query by date range and need no change to keep working once backdated entries exist. Any change to the "today" edit-window logic for reports/parts (`enbar-home-redesign-prd.md` D2) — that ambiguity (`report_date` vs `created_at`) already exists independently of this feature and isn't resolved or worsened by it, since edit-window logic there was already flagged as unresolved before this document.

---

Phase 1 complete — awaiting your review.
