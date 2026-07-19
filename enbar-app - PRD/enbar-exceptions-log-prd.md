# Enbar — Exceptions Log (יומן חריגים) — PRD

**Scope:** one new standalone workflow added to the live app, wired into the placeholder card the home redesign shipped (`enbar-home-redesign-prd.md` §3a) — **and the full replacement of the in-report extras workflow**, which is removed from the UI and dropped from the schema (§3e, decided by the product owner during review). Documents out-of-scope work discovered in the field, prices it in billable days, and runs a client-signature loop before the work may be performed. Reuses the extras machinery end to end: the `pdfmake` + `src/lib/rtl.js` Hebrew PDF pipeline, the `signed-approvals` bucket convention, photo upload with client-side compression, client→project selection, draft autosave, and the existing Hebrew loading/empty/error states. Architecture unchanged: React SPA → Supabase with the anon key, no server, no auth.

---

## 1. Feature objective

When reality on site diverges from what was agreed at contract signing, the team lead opens an exceptions log: describes the required extra work, records worker count and work duration, gets an auto-calculated billable-days figure (workers × 0.5 × work-days, manually overridable), attaches field photos, generates an Enbar-branded PDF, and sends it to the client via WhatsApp for signature. **Without the client's signature the work is not performed** — the record becomes "אושר ע"י הלקוח" the moment the signed form is uploaded, and from that moment it is locked. Until then, both the team lead and the factory manager can edit, regenerate, and resend.

---

## 2. Users and access

| Profile | Access |
|---|---|
| `team_lead` | Creates exception logs; edits/regenerates/resends while not approved; uploads the signed form |
| `factory_manager` | Same edit/regenerate/resend/upload rights from the manager area; sees all logs |

Attribution follows the existing convention: `team_lead_id` = the single active team lead (oldest active row); `status_updated_by` stamps the acting profile's Hebrew label. Known identity limitations (reverse-PRD §7) apply.

---

## 3. Screens and flows

### 3a. New exception log — `/exceptions/new` (team lead)

Reached from the **יומן חריגים** home card (placeholder becomes a live link; "בקרוב" badge and muted styling removed). Fields in render order:

1. **לקוח** (Client) — required select, active clients only; identical component/behavior to the report form.
2. **פרויקט** (Project) — shown only when the client has more than one active project; auto-selected when exactly one (existing pattern).
3. **מספר עובדים** (Worker count) — required integer 1–50, stepper ±1 plus numeric input (same as the report form).
4. **משך העבודה (ימים)** (Work duration, days) — required integer 1–99, stepper ±1, default 1. Decided during review: the formula is per-day, so duration is an explicit input.
5. **תיאור העבודה הנדרשת** (Required work description) — required textarea, minimum 5 trimmed characters (existing rule).
6. **כמות ימים לחיוב** (Billable days) — **calculated**: `workers × 0.5 × work_days`, displayed read-only with a lock affordance. A pencil ("עריכה ידנית") button unlocks it for manual override (numeric, 0.5–999, half-day steps). While overridden, an "חישוב אוטומטי" reset link restores the formula. Per D1: an override sticks — changing workers/duration afterwards does **not** silently recalc; the "הוזן ידנית" tag signals the manual value.
7. **תמונות מהשטח** (Field photos) — optional, existing `PhotoUploader` (compression, 10-photo cap, 10 MB pre-compression limit).

Behavior: text fields autosave to `localStorage` (`enbar_exception_draft`), restored on return, cleared on successful submit. Validation scrolls to the first error. Submit inserts the `exception_logs` row (status `pending`), then uploads photos sequentially with the existing partial-failure banner. Success screen: "היומן נשמר ✓" with buttons to the new log's detail screen (where PDF + WhatsApp live) and back to `/home`.

### 3b. Exception detail — `/exceptions/:id` (team lead) and `/manager/exceptions/:id` (manager)

One shared component behind the two route guards; both profiles have identical rights until approval. Sections:

- **Summary card:** project + client, creation date, worker count, work duration, billable days (with "הוזן ידנית" tag when overridden), status badge.
- **Description** + photo gallery (lightbox).
- **Edit** — while status ≠ `approved`: an עריכה button switches to the 3a field set (client/project **not** editable; photos add-only, matching the report-edit convention). After approval: fully read-only, "היומן נעול — אושר ע״י הלקוח" note.
- **PDF** — "הפקת דוח חריגים ותוספות": generates the branded PDF via a new `generateExceptionPdf()` in `src/lib/pdf.js` (same header/footer/signature-block layout the extras PDF used; body rows add worker count, work duration, and billable days — days only, no monetary rate, per review decision). The file is **also uploaded to Storage** (new public bucket `exception-docs`, path `exceptions/{id}/{uuid}.pdf`) and `pdf_path` saved — this powers WhatsApp sharing. Regenerating repoints `pdf_path` (D4: latest-pointer only, no version-history UI).
- **WhatsApp share** — "שליחה בוואטסאפ", enabled once a PDF exists. Flow per review decision: a prompt shows **"לשלוח את הדוח לאישור אל {contact_person} — {phone}?"** prefilled from the project's stored contact, with the phone editable (free input) for ad-hoc recipients; confirm opens `wa.me/{phone}?text=` with a Hebrew message containing the PDF's public URL. Where `navigator.share({ files })` is supported (mobile), an additional "שיתוף הקובץ" option shares the actual PDF file through the OS share sheet. No stored phone and no typed phone → file-share/share-sheet path only.
- **Signed form** — upload control (PDF/image) to the existing `signed-approvals` bucket, path `exceptions/{id}/signed-{uuid}.{ext}`, saved to `signed_path`. **Uploading the signed form atomically sets `status = 'approved'`** (D2, confirmed) and locks the record. Until approved, the file can be replaced (each replacement keeps status approved? — n/a: replacement only possible pre-approval; after approval the record is locked including the file).

**Status model:**

| Status | Hebrew badge | Set by | Transition |
|---|---|---|---|
| `pending` | ממתין | system, on create | initial |
| `sent` | נשלח ללקוח | either profile, manually after sharing (source flow step 8) | from `pending` |
| `approved` | אושר ע"י הלקוח | either profile, **by uploading the signed form** | from `sent` or `pending` (hand-delivered signed form is legal from either state) |

No `rejected` state, no backward transitions out of `approved` (D5). Every transition stamps `status_updated_by`.

### 3c. Manager area — `/manager/exceptions` (list) + detail

- **Insertion point on `/manager`:** the existing "חריגות ממתינות לאישור" extras stat card is **replaced** by "יומני חריגים ממתינים" (count of status ≠ `approved`), clickable → `/manager/exceptions` — same card slot, same pattern as the parts card.
- **List:** rows show project, client, team lead, creation date, billable days, status badge; filters: status chips (`StatusChips`), project select, date range — same layout as `/manager/parts`. Tapping opens the shared detail (3b) under the manager guard.

### 3d. Home-screen integration (team lead)

- The יומן חריגים card becomes a `Link` to `/exceptions/new`.
- The unified today-list gains the third type: exception rows (`created_at`-based like everything else) show date badge "היום", project name, billable-days summary ("2.5 ימי חיוב"), and status badge. The existing filter chip now returns results.
- `/history` gains the same third type, date-filtered by `created_at`.
- **Edit window (D6):** exceptions are editable **until approved** — not today-only. The today-only rule continues to apply to reports and part requests.

### 3e. Removal of the in-report extras workflow (decided during review — full replacement)

The product owner resolved D7 as **replace, remove everywhere, including backend and DB**:

- **New-report form (`/report/new`):** the "תוספת / חריגה לאישור" field is removed.
- **Report edit (`/report/:id`):** the extras textarea is removed from edit mode.
- **Report views:** the extras section disappears from `ReportView` and `ManagerReport`; the extras status badge disappears from every report row (team-lead home/history lists, manager dashboard list).
- **Manager dashboard:** the pending-extras counter and its "pending only" filter toggle are removed (slot taken by the exceptions card, §3c).
- **PDF:** `generateExtrasPdf()` is deleted; `generateExceptionPdf()` is the only client-approval document.
- **Schema:** migration drops `extras_description`, `extras_edited`, `extras_status`, `extras_decided_by`, `extras_signed_path` from `reports`. **This is destructive and unrecoverable** — flagged for explicit confirmation at apply time. Current data note: the test DB holds a couple of freshly-created test reports (one with a rejected test extra); the production DB's reports table is empty — so nothing real is lost today. Files already in `signed-approvals` under `reports/…` become unreferenced but are not deleted (no-hard-delete posture on storage).
- `STATUS_LABELS` (extras labels) and related dead code removed.

---

## 4. Data model

```sql
create table public.exception_logs (
  id                 uuid primary key default gen_random_uuid(),
  team_lead_id       uuid not null references public.team_leads(id),
  project_id         uuid not null references public.projects(id),
  workers_count      int not null check (workers_count between 1 and 50),
  work_days          int not null default 1 check (work_days between 1 and 99),
  work_description   text not null,
  billable_days      numeric(5,1) not null check (billable_days between 0.5 and 999),
  days_overridden    boolean not null default false,
  status             text not null default 'pending'
                       check (status in ('pending', 'sent', 'approved')),
  status_updated_by  text,
  pdf_path           text,   -- latest generated PDF in the exception-docs bucket
  signed_path        text,   -- client-signed file in signed-approvals
  created_at         timestamptz not null default now()
);

create table public.exception_photos (
  id           uuid primary key default gen_random_uuid(),
  exception_id uuid not null references public.exception_logs(id) on delete cascade,
  storage_path text not null,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

-- Extras removal (§3e) — destructive, confirm before applying:
alter table public.reports
  drop column extras_description,
  drop column extras_edited,
  drop column extras_status,
  drop column extras_decided_by,
  drop column extras_signed_path;
```

- RLS: enabled on both new tables with the standard permissive anon select/insert/update policies (no delete policy).
- Storage: new public buckets `exception-photos` (path `exceptions/{id}/{uuid}.jpg`) and `exception-docs` (generated PDFs); signed files use the **existing** `signed-approvals` bucket. Standard anon-insert + public-read policies.
- No `deleted_at` on entries — soft delete remains an admin-entities convention.

---

## 5. Cross-cutting behaviors

- Hebrew RTL throughout; every PDF string goes through `rtl()` / `rtlBlock()`.
- All screens ship loading / empty ("עדיין אין יומני חריגים") / error states; the new-form keeps typed data via the draft on failure.
- Photos: existing compression pipeline.
- Notifications: none — WhatsApp share is user-initiated; the manager discovers logs via the dashboard counter.
- No hard deletes of rows or storage files (the extras **column** drop in §3e is the sanctioned exception, per the owner's explicit decision).

---

## 6. Conflicts & decisions (resolved during review unless noted)

- **D1 — Recalc after manual override: RESOLVED.** Override sticks; "הוזן ידנית" tag + one-tap "חישוב אוטומטי" reset.
- **D2 — Approval semantics: RESOLVED.** Uploading the signed form sets `approved` atomically and locks the record.
- **D3 — WhatsApp mechanism: RESOLVED (recommendation accepted + prefill).** Store every generated PDF in `exception-docs`; prompt with the project contact's name+phone (editable) → `wa.me` chat with the public PDF URL; OS file-share offered where supported. Public-URL exposure accepted, consistent with existing storage posture.
- **D4 — PDF versions: RESOLVED.** Latest-pointer only.
- **D5 — No `rejected` state: RESOLVED.** Shipped without; revisit if the field needs refusals.
- **D6 — Edit window: RESOLVED.** Until-approved for exceptions; today-only stays for reports/parts.
- **D7 — In-report extras: RESOLVED as FULL REPLACEMENT** including UI removal and DB column drop (§3e). The destructive migration still requires a per-project confirmation at apply time (stop condition).
- **Formula semantics: RESOLVED.** Billable days = workers × 0.5 × work-days; new duration field, default 1.
- **Money on PDF: RESOLVED.** Days only; pricing stays in the contract.

---

## 7. Out of scope

Rejected/cancelled states; PDF version history UI; in-app or push notifications; server-side WhatsApp integration (Business API); e-signature capture inside the app; editing client/project on an existing log; per-user identity; deleting exception logs.
