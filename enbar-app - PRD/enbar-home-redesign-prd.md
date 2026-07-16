# Enbar — Team Lead Home Redesign (Workflow Cards + Today List + Historical View) — PRD

**Scope:** redesigns `/home` only, adds one new route for historical browsing, and adds conditional edit capability to the existing `/report/:id` and `/parts/:id` detail screens. Everything here extends the current system as documented in `enbar-reverse-prd.md` and `enbar-parts-ordering-prd.md`; no other screen changes. Architecture is unchanged: React SPA talking directly to Supabase with the public anon key, no server, no auth, Hebrew-only RTL UI.

---

## 1. Feature objective

Turn `/home` from "two buttons + two read-only lists" into a workflow hub: three clickable entry-point cards at the top (work log, part ordering, and a placeholder for a future exceptions log), and a single, filterable, **today-only** list at the bottom that merges every entry type the team lead created today. From that list, today's own entries become editable in place for the first time — today's reports and part requests are currently 100% read-only once submitted (reverse-PRD §3.2, §3.4; parts-ordering-PRD §3a). Anything older than today stays read-only, reachable through a new "דוחות ישנים" (historical reports) screen.

---

## 2. Users and access

No change to the access model. `team_lead` profile only; same `localStorage` flag, same single-active-team-lead resolution (oldest active `team_leads` row — reverse-PRD §7). Everything described here is scoped to that one resolved team lead's own data, exactly like today's `/home`.

---

## 3. Screens and flows

### 3a. `/home` — redesigned

**Top: three workflow cards, in render order, one row (`grid-cols-3`), icon above Hebrew label:**

1. **יומן עבודה** (Work Log) — replaces today's "+ דוח חדש" CTA. Tap → `/report/new` (unchanged form).
2. **הזמנת חלקים** (Part Ordering) — replaces today's "הזמן חלק" button. Tap → `/parts/new` (unchanged form).
3. **יומן חריגים** (Exceptions Log) — **placeholder, not wired to any flow this phase.** Rendered visually muted (reduced opacity, no hover/active state) with a small "בקרוב" (coming soon) badge. It is **not** a link or button — tapping it does nothing; there is no toast, alert, or dialog (the app has no toast/dialog primitive today — see `src/components/`, and introducing one is out of scope for this phase).

**Bottom: "הפעילות שלי היום" (My activity today) — a single merged list.**

Section header row: title on the start side, **"דוחות ישנים"** (historical reports) link/button on the end side (same placement convention as the "רענון" ghost button in `ManagerDashboard.jsx`/`ManagerParts.jsx` headers) → navigates to the new `/history` screen (§3c).

Below the header, a type-filter chip row (reusing the existing `StatusChips` component with a new value set, not the status values): **הכל / יומן עבודה / הזמנת חלקים / יומן חריגים**.

**List contents — only entries dated today** (see D2 for what "today" means for reports), across the two types that exist today, newest-first:

| Type | Row shows | Tap target |
|---|---|---|
| Work log (report) | date badge ("היום"), project name, photo count icon, issue flag if `issues` is non-empty, extras status badge if an extra exists | `/report/:id` — opens in **edit mode** (it's today's) |
| Part order (grouped by `order_id`, reusing the existing `groupPartRequestsByOrder` + drawer pattern from `Home.jsx`/`ManagerParts.jsx`) | date badge ("היום"), project name, item name (single-item order) or item count (multi-item order), status badge (single) or chevron-drawer (multi) | `/parts/:id` per item — opens in **edit mode** |
| Exceptions | no data source exists yet (§6, D1) | — |

Both existing row/drawer components already built this session for `Home.jsx` are reused as-is; only the data source changes from "all of mine" to "mine, today only."

**Empty states:**
- No entries at all today, any type: card with icon, "עדיין לא דיווחתם היום", no secondary prompt needed (the three cards above are already the prompt).
- Entries exist today but none match the selected type filter: "לא נמצאו רשומות מסוג זה היום" (same pattern as the existing "לא נמצאו בקשות בסטטוס זה" empty state).
- "יומן חריגים" filter selected: always empty this phase (§6, D1 decides whether the chip itself is even shown).

### 3b. Editing — `/report/:id` and `/parts/:id` (conditional)

Both existing detail routes gain a conditional edit mode: **if the entry is "today's" (§6, D2), render editable fields with a save action; otherwise render exactly what exists today (fully read-only).** No new routes — same URLs, same components, mode is derived from the loaded record's date.

**Report (`/report/:id`) — editable fields when today:**
- תיאור העבודה שבוצעה (work description)
- כמה עובדים היו באתר (worker count)
- בעיות שהתגלו באתר (issues text)
- תוספת / חריגה לאישור (extras description) — **only if `extras_status` is still `pending` or null; see D3**
- תמונות מהשטח / בעיות (photos) — **adding new photos only, via the existing `PhotoUploader`; removing or replacing an already-uploaded photo is not supported this phase (§6, D4 — schema gap)**

**Not editable, ever:** לקוח (client), פרויקט (project), תאריך (report_date). Changing the project/client after submission would break manager-side attribution and history; changing the date would let a report escape its own "today" edit window.

**Part request (`/parts/:id`) — editable fields when today, per line item:**
- חלק מהקטלוג / אחר (catalog item or free-text description, including switching between the two)
- כמות (quantity)
- הערות לייצור (notes)
- תמונה (photo) — replacing the single photo is supported: upload the new file to a new path and update `photo_path` (there's an existing `UPDATE` RLS policy on `part_requests`); the old storage object is simply orphaned, not deleted — consistent with the app's existing no-hard-delete convention (parts-ordering-PRD §5)

**Not editable, ever:** לקוח, פרויקט. **Editable only while `status = 'pending'`; see D5** for whether `in_progress`/`ready` requests should be editable at all.

### 3c. Historical view — `/history` (new, read-only)

New team-lead-only route (`RequireProfile`, same guard as `/home`). Fields in render order:

1. **סוג** (Type) — same chip set as the today-list filter: הכל / יומן עבודה / הזמנת חלקים / יומן חריגים.
2. **פרויקט** (Project) — select populated from **all** projects, active and inactive (mirrors `ManagerDashboard.jsx`'s existing project filter, which already includes inactive projects — precedent already established in this codebase, not a new decision).
3. **טווח תאריכים** (Date range) — `from`/`to` date inputs, same pattern as `ManagerDashboard.jsx`/`ManagerParts.jsx`. Default range is an open decision (§6, D6).

Below the filters: a read-only results list, reusing the same row/drawer rendering as the today-list (§3a) and the existing `/manager` list patterns for loading/empty/error states. Tapping any row opens the existing `/report/:id` or `/parts/:id` route — which renders read-only, since the tapped entry is by definition not today's (§3b).

---

## 4. Data model changes

**No new tables.** The Exceptions Log has no schema this phase — it's a placeholder card only (§3a).

**Reports:** editing already works at the RLS layer — an `"anon update reports"` policy already exists (confirmed live). No migration needed to let a team lead edit report fields.

**Part requests:** same — an `"anon update part_requests"` policy already exists. No migration needed for quantity/notes/catalog-item/photo-path edits.

**Report photos — schema gap, needs a decision (§6, D4):** `report_photos` currently has only `SELECT` and `INSERT` RLS policies (confirmed live: `"anon select report_photos"`, `"anon insert report_photos"` — no `UPDATE`, no `DELETE`). Removing or replacing a specific photo from an existing report's gallery is not possible today without either (a) a new `DELETE` policy, or (b) a soft-hide column (e.g. `is_active` on `report_photos`) plus a query-side filter. Same gap exists on the `part-photos`/`report-photos` storage buckets' object policies (`INSERT`+`SELECT` only, no `UPDATE`/`DELETE`) — irrelevant for the part-request photo case since that one uses the repoint-and-orphan approach (§3b), but blocking for reports' multi-photo gallery.

**Possible `updated_at` column** on `reports` and `part_requests` — flagged, not decided (§6, D7).

---

## 5. Cross-cutting behaviors

- **Language/RTL:** all new strings Hebrew, existing global `dir="rtl"`; no i18n framework introduced.
- **"Today" resolution:** uses the same browser-local-date convention the report form already uses (`todayISO()` in `src/lib/format.js`), not a server-side date — consistent with the existing `max={todayISO()}` cap on the report-date field.
- **Resilience:** every new/changed screen ships with the existing Hebrew loading / empty / error state pattern; draft-autosave is not extended to edit forms this phase (edits are on already-submitted, server-backed records, not drafts — no localStorage draft key needed).
- **No hard deletes:** consistent with the rest of the app; editing never deletes a report or part-request row, only updates fields (and, per §3b/§4, cannot remove individual report photos this phase).
- **Reused components:** `StatusChips` (new value set for type filtering), `groupPartRequestsByOrder`, the existing drawer-row pattern from `Home.jsx`/`ManagerParts.jsx`, `PhotoUploader`, and the existing loading/empty/error card patterns. No new dependencies.

---

## 6. Conflicts & decisions needed

- **D1 — Does the "יומן חריגים" type filter chip appear before the feature exists?** It will always return zero results this phase. Showing it now is forward-compatible (users learn the filter exists) but exposes a permanently-empty option; hiding it is simpler but means adding it back later. **Not decided here** — needs product sign-off.
- **D2 — What does "today" mean for a report?** `report_date` is a business date the team lead can backdate (form caps it at `<= today` but doesn't prevent picking yesterday) — it means "the work happened on this date." `created_at` means "this row was submitted today," regardless of which date it's about. These can disagree (a report about yesterday's work, filed today). The today-list and the edit-window gate need to pick one. Part requests have no equivalent ambiguity — they only have `created_at`. **Not decided here.**
- **D3 — Editing `extras_description` after the manager has already acted on it.** §3b restricts extras editing to `extras_status IN ('pending', null)` as a proposed default — editing the change-order text after a manager has already generated a PDF or moved status to `sent`/`approved`/`rejected` would silently invalidate a document that's already out the door. This mirrors D5 below but for reports; the outline didn't ask for it explicitly, flagging proactively. **Needs explicit confirmation, not just the proposed default.**
- **D4 — Report photo removal.** No RLS policy exists to delete or hide an individual `report_photos` row (§4). Options: (a) v1 ships add-only, no removal (proposed default in §3b); (b) add a `DELETE` policy; (c) add an `is_active` column and filter it out on read, keeping the no-hard-delete convention. **Not decided here** — needs a migration either way if anything beyond "add-only" is required.
- **D5 — Editing a part request already `in_progress` or `ready`.** The factory manager may already be acting on it (sourcing/packing the part) — the team lead silently changing quantity or swapping the item underneath that could cause a real mismatch on the shop floor. Proposed default in §3b is edit-only-while-`pending`. **Needs explicit confirmation.**
- **D6 — Default date range on `/history`.** No default stated by the outline. Options: last 30 days (consistent with the "recent by default" pattern elsewhere), all-time (simplest, but potentially a large query — current `.limit(100)`/`.limit(200)` patterns elsewhere suggest this is fine at current data volumes), or empty/required-selection. **Not decided here.**
- **D7 — `updated_at` column.** Neither `reports` nor `part_requests` currently tracks when a row was last edited. Useful for an audit trail / "last edited" display, not required for the edit mechanism itself to function. **Flagged, not decided.**

---

## 7. Out of scope

The Exceptions Log flow itself (data model, form, list, any backing table) — placeholder card only. Per-user authentication or identity beyond the existing single-active-team-lead resolution. Editing `לקוח`/`פרויקט`/date fields on any entry. Removing/replacing individual report photos unless D4 resolves in favor of it. Any change to the manager-side (`/manager/*`) screens. A toast/dialog/notification primitive (none exists today; the exceptions-card placeholder deliberately avoids needing one). Realtime/live updates to the today-list.
