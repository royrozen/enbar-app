# Enbar — Admin Settings Redesign (Desktop Width, Nested Clients→Projects, Collapsed Forms, Soft Delete) — PRD

**Scope:** redesigns `/manager/settings` only. Everything here extends the current system as documented in `enbar-reverse-prd.md` and `enbar-parts-ordering-prd.md`; no field-app screen, report/extras flow, or parts-queue behavior changes. Architecture unchanged: React SPA talking directly to Supabase with the public anon key, shared-password gate on `/manager/*`, Hebrew-only RTL UI.

---

## 1. Feature objective

Turn the admin settings screen from a phone-width, four-tab, always-open-form list into a desktop-first management console: full-width layout, projects nested inside their client (no separate Projects tab), collapsed add-forms behind explicit buttons, in-place editing of client and project details, a ח.פ (company registration number) field on clients, per-project contact info visible at a glance, and a soft-delete action distinct from the existing deactivate toggle.

---

## 2. Users and access

No change. `factory_manager` profile only, behind the existing `RequireFactoryManager` guard and shared-password gate. All operations continue through the anon key with the existing permissive RLS policies (plus one new `DELETE`-adjacent decision — see §6, D2; the recommended design needs only `UPDATE`, which every entity already has, except `team_leads`/`catalog_items` whose `UPDATE` policies also already exist).

---

## 3. Screens and flows

### 3a. Layout — desktop-first, responsive

- The page container widens from today's `max-w-3xl` to `max-w-7xl` (matching nothing else in the app — this is deliberately the widest screen; the manager dashboard uses `max-w-5xl`). Mobile keeps the current single-column stack; no horizontal scroll at any width.
- Tabs shrink from four to three: **לקוחות / ראשי צוות / קטלוג חלקים** (the פרויקטים tab is removed — see 3b). Same underline-tab pattern as today.
- Within the Clients tab on desktop (`lg:` and up), client cards lay out in a 2-column grid (`grid-cols-1 lg:grid-cols-2`); an expanded client card spans both columns (`lg:col-span-2`) so its project list gets full width. Team-lead and catalog lists stay single-column but stretch to the wider container.

### 3b. Clients tab — nested client→projects cards

The separate Projects tab is deleted. All project management happens inside the client card. (The current code already half-implements this: client rows expand to show a read-only project list with a detail sheet — this redesign makes that the only path and adds create/edit/delete.)

**Tab header row:** "הוספת לקוח חדש" button (btn-accent, PlusIcon). The add-client form is **collapsed by default** and revealed by this button; a second click (or a ביטול button on the form) collapses it again. Form fields, in render order:

1. **שם הלקוח** (Client name) — required, non-empty after trim (existing rule).
2. **ח.פ** (Company registration number) — optional, free text (no checksum validation — see §6, D4).

**Collapsed client card** (one grid cell): expand chevron, client name (+ "(מושבת)" suffix when inactive, existing convention), ח.פ if present, project count badge ("3 פרויקטים"), and the actions cluster: **עריכה** (pencil), **השבתה/הפעלה** (existing toggle — kept, see §6 D3), **מחיקה** (trash, destructive styling).

**Expanded client card** (spans full width):
- **Client edit mode** — the עריכה action swaps the card header for an inline form: שם הלקוח (required) and ח.פ (optional), with שמירה / ביטול buttons. Same validation as the add form.
- **Project list** — each project row shows, in order: project name, city if present, and **the project's own contact person name + phone** (see §6, D1 — these fields already live on `projects`), plus "(מושבת)" when inactive. Row actions: **עריכה**, **השבתה/הפעלה**, **מחיקה**.
- **Project edit mode** — inline form replacing the row (or the existing bottom-sheet on mobile), with the full add-project field set: שם הפרויקט (required), כתובת / עיר, איש קשר, טלפון, דוא"ל — all optional except name; client is **not** editable (a project cannot be moved between clients — same rationale as the field-app edit rules).
- **"הוספת פרויקט חדש"** — button at the bottom of the project list; reveals a collapsed inline add-project form with the same fields as project edit. The client is implicit (the enclosing card) — no client select.
- Empty state inside an expanded client: "אין פרויקטים ללקוח זה" plus the add-project button.

### 3c. Team leads tab

Unchanged list behavior, two additions:
- The add form is **collapsed** behind a **"הוסף ראש צוות"** button (same reveal/collapse pattern as clients).
- Each row gains a **מחיקה** action next to the existing השבתה/הפעלה toggle. The existing "reports auto-attribute to the first active team lead" note stays.

### 3d. Catalog tab

Unchanged list + inline-rename behavior, two additions:
- The add form is **collapsed** behind a **"הוספת חלק"** button.
- Each row gains a **מחיקה** action next to the existing toggle and pencil.

### 3e. Delete flow (all four entities)

- Tapping מחיקה asks for confirmation inline (the row swaps to "למחוק את {name}? / מחיקה / ביטול") — **no** `window.confirm` and no new modal primitive; inline confirmation matches the app's existing no-dialog convention.
- Confirming sets the soft-delete flag (§4) and removes the row from the list immediately. **There is no undo in the UI** — deleted items never render anywhere in the app again (admin lists, field pickers, filters). Historical reports/part requests that reference a deleted client/project/team lead/catalog item keep rendering its name via the existing FK joins — the row still exists in the DB (see §6, D2).
- Deleting a **client** requires its project list to be empty of non-deleted projects; otherwise the delete action is disabled with a tooltip ("יש למחוק קודם את הפרויקטים של הלקוח") — prevents orphaning live projects in the field-app pickers.

---

## 4. Data model changes (migration listed, NOT applied)

```sql
-- 1. Company registration number on clients
alter table public.clients add column registration_number text;   -- ח.פ, optional

-- 2. Soft delete, distinct from deactivation (see §6 D2) — all four admin entities
alter table public.clients       add column deleted_at timestamptz;
alter table public.projects      add column deleted_at timestamptz;
alter table public.team_leads    add column deleted_at timestamptz;
alter table public.catalog_items add column deleted_at timestamptz;
```

- `deleted_at IS NULL` = normal row; a timestamp = soft-deleted (records *when*, which a boolean wouldn't).
- **Every existing read of these tables must add `is('deleted_at', null)`** — this is the one change that leaks outside the settings screen (field-app client/catalog pickers, manager filters, `fetchActiveTeamLead()`); it's a query-filter change only, no UI change on those screens.
- No new RLS policies needed: soft delete is an `UPDATE`, and permissive anon `UPDATE` policies already exist on all four tables (confirmed live).
- No edit-tracking (`updated_at`) column — same posture as the home-redesign PRD (its D7): flagged there, still not required here.

---

## 5. Cross-cutting behaviors

- **Language/RTL:** all new strings Hebrew under the global `dir="rtl"`; no i18n framework.
- **Resilience:** every mutating action keeps the existing pattern — busy spinner on the acting button, Hebrew inline error on failure, optimistic or refetch-on-success list update as each tab already does.
- **No hard deletes:** unchanged at the DB level — "delete" is a flag; the page subtitle ("השבתה בלבד, ללא מחיקה") must be reworded to reflect that deletion hides items permanently but preserves history.
- **Reused components:** existing tab bar, `ActiveToggle`, card/list/empty/error patterns, `useAdminList` hook (extended with `deleted_at` filtering + update/delete helpers). No new dependencies.

---

## 6. Conflicts & decisions needed

- **D1 — Requirement 6's premise is outdated (correction, decision pre-empted).** The outline assumes "projects have no contact fields in the schema." They do — `contact_person`, `phone`, `email` were **moved from clients to projects** on 2026-07-12 (migration `20260712190000_move_contact_to_projects.sql`, commit `44371fb`); clients have no contact columns anymore. So requirement 6 is directly satisfiable from the project's own fields, and that is what §3b specifies. **Recommendation: show the project's own contact_person + phone on each project row; no schema change.** Needs only acknowledgment, not a real decision — flagged because the source requirement text contradicts the live schema.
- **D2 — Soft-delete mechanism: reuse `is_active` vs. new column. Recommendation: new `deleted_at` column (as specified in §4).** Reasons: (a) deactivation is an advertised *reversible* state with its own toggle and "(מושבת)" rendering — overloading it as delete would silently give every "deleted" item a resurrection path and make the two concepts indistinguishable in the data; (b) the product owner asked for delete *alongside* the existing behavior, implying both exist; (c) a timestamp preserves *when* for future audit. Referencing rows: reports/part requests keep their FKs and render the deleted entity's name in history — identical to how deactivated items behave today, so no manager-side or field-side rendering change.
- **D3 — Does deactivate/activate stay visible next to delete? Recommendation: yes, on all four entities.** Deactivate = temporary removal from field pickers (reversible, e.g. a paused project); delete = permanent removal everywhere (irreversible in UI, e.g. a duplicate typo row). They answer different needs; hiding the toggle would regress an existing feature. Needs sign-off since three actions per row is denser UI.
- **D4 — ח.פ validation. Recommendation: optional free text, no format/checksum validation.** Israeli company numbers are 9 digits with a check digit, but enforcing that would block edge cases (עוסק מורשה numbers, foreign entities) for zero product benefit at this stage. Flag: should ח.פ also appear on the extras-approval PDF header later? Out of scope here, noted for the PDF follow-up.
- **D5 — Client delete with existing projects.** §3e proposes block-until-projects-deleted. Alternative: cascade the soft delete to all of the client's projects in one action. Blocking is safer (explicit, no surprise mass-hide of projects mid-use in the field); cascade is fewer clicks. **Recommendation: block.** Needs sign-off.
- **D6 — Team-lead delete guard.** Deleting (or deactivating) the *only* active team lead breaks report attribution (`fetchActiveTeamLead()` returns null and the field app shows its "no active team lead" error). Today the deactivate toggle already allows this footgun. **Recommendation: disable מחיקה on the last remaining non-deleted, active team lead, with a tooltip.** Needs sign-off (and note we are *not* retrofitting the same guard onto deactivate in this phase).

---

## 7. Out of scope

Any change to field-app screens beyond the invisible `deleted_at` query filters; the reports/extras workflow; the parts queue; moving a project between clients; undo/restore UI for deleted items; ח.פ checksum validation or its appearance on PDFs; `updated_at`/audit columns; retrofitting collapsed-form or delete patterns onto any screen other than `/manager/settings`; real authentication.
