# Enbar — Direct Part Ordering from the Field (הזמנת חלקים חסרים מהשטח) — PRD

**Scope:** one new feature added to the live Enbar Daily Work Reports app. Everything here extends the current system as documented in `enbar-reverse-prd.md`; no existing screen is redesigned beyond the exact insertion points listed. Architecture is unchanged: React SPA talking directly to Supabase with the public anon key, no server, no auth, Hebrew-only RTL UI.

---

## 1. Feature objective

Let the person in the field report a missing part in under a minute — pick the site, pick the part from a searchable catalog (or describe it freely), set a quantity, optionally attach a photo — instead of calling the office. Give the factory manager a dedicated, prioritizable queue of these requests with a simple status flow ("בטיפול" / "מוכן לאיסוף") that the field can see, so both sides always know where a part stands.

---



## 2. Users and access

The outline refers to an "installation manager" in the field. **That role does not exist in the live app** (see reverse-PRD §2 — only two profiles exist). Mapping:


| Outline role              | Live profile      | Hebrew label    | Access                                                     |
| ------------------------- | ----------------- | --------------- | ---------------------------------------------------------- |
| Installer / field manager | `team_lead`       | ראש צוות התקנות | Creates part requests, views own requests and their status |
| Factory manager           | `factory_manager` | מנהל מפעל       | Sees all requests, updates status, manages the catalog     |


Access control is identical to today: profile flag in `localStorage`, shared password gate on all `/manager/*` routes. Request attribution follows the existing convention — the request's `team_lead_id` is the single active team lead resolved exactly as reports are today (oldest active row). The known "who is actually reporting" limitation (reverse-PRD §7) applies to part requests too.

---



## 3. Screens and flows



### 3a. Field app (team lead)

**Insertion point on** `/home`**:** a secondary button "+ הזמן חלק" (Report Missing Part) under the existing "+ דוח חדש" CTA, navigating to `/parts/new`. Below "הדוחות שלי", a new list section "בקשות חלקים" (Part Requests) showing the team lead's requests newest-first: part name (or the free-text description), project, date, quantity, and a status badge. Tapping opens `/parts/:id` (read-only).

**New request form —** `/parts/new` (fields in render order):

1. **לקוח** (Client) — required select, active clients only; same component and behavior as the report form.
2. **פרויקט** (Project) — shown only if the chosen client has more than one active project; auto-selected silently when there is exactly one (identical to the report form).
3. **חלק מהקטלוג** (Catalog part) — required choice. A search input with real-time autocomplete: as the user types, the list of active catalog items filters client-side (the full active catalog is fetched once on form load; no item limit). Selecting an item locks it into the field with a clear button.
4. **אחר — תיאור חופשי** (Other — free description) — a "החלק לא בקטלוג? בחר 'אחר'" toggle. When active, the catalog field is replaced by a required free-text description (minimum 5 trimmed characters, matching the report form's description rule).
5. **כמות** (Quantity) — required integer 1–999, stepper buttons (±1, clamped) plus numeric input, same pattern as the workers-count field.
6. **תמונה של החלק** (Photo of the part) — optional, single photo, camera or gallery; compressed client-side with the existing `browser-image-compression` settings (max 1600 px, ~1.2 MB target, JPEG), 10 MB pre-compression cap.
7. **הערות לייצור** (Notes for production) — optional free-text textarea.

**Behavior:** text fields autosave to `localStorage` (`enbar_part_request_draft`) and restore on return, cleared on successful submit — same mechanism as the report draft. Client-side validation scrolls to the first error field. Submit inserts the `part_requests` row first, then uploads the photo; a photo-upload failure shows the existing partial-failure banner pattern without discarding the request. Submit button shows live status text ("שומר את הבקשה...", "מעלה תמונה..."). Success screen: "הבקשה נשלחה ✓", link to `/home`, and a "בקשה נוספת" full-reload button.

**Request detail —** `/parts/:id` **(read-only):** part name or free-text description, client, project, quantity, photo (lightbox), notes, status badge, creation date. No edit or cancel controls in v1.

### 3b. Manager dashboard (factory manager)

**Insertion point on** `/manager`**:** next to the existing "חריגות ממתינות לאישור" counter, a second prominent clickable counter — "חלקים ממתינים" (Parts pending) — counting requests with status `pending`. Clicking it opens the dedicated queue.

**Parts queue —** `/manager/parts`**:** list of requests (up to 200), each row showing thumbnail (photo or placeholder), part name / description, project, client, team lead, quantity, request date, status badge. Filters: status (select), project (select), date range defaulting to last 7 days; manual "רענון" button. **No push or realtime** — data loads on entry, filter change, or refresh, exactly like the reports dashboard (see §6 for the future option).

**Request detail —** `/manager/parts/:id`**:** all fields, plus a status control:


| Status        | Hebrew badge | Transition                                                       |
| ------------- | ------------ | ---------------------------------------------------------------- |
| `pending`     | ממתין        | initial value on submit                                          |
| `in_progress` | בטיפול       | from `pending`                                                   |
| `ready`       | מוכן לאיסוף  | from `in_progress`; backward transition to `in_progress` allowed |


Every status change stamps `status_updated_by` with the acting profile's Hebrew label — same (limited) attribution convention as `extras_decided_by`. The team lead sees the updated badge on next visit to `/home` or `/parts/:id`.

### 3c. Catalog admin — `/manager/settings`, new tab "קטלוג חלקים"

Same list + add-form pattern as the existing three tabs:

- **Add:** name (שם החלק) — required; that is the only field in v1.
- **Edit:** inline rename of an existing item (this is the first admin entity with in-place editing — see §6).
- **"Delete":** implemented as the standard "השבתה/הפעלה" (deactivate/activate) toggle, **not** a hard delete (see §6, Decision D1). Deactivated items disappear from the field autocomplete immediately but remain readable on historical requests.

---



## 4. Data model changes

```
catalog_items(
  id, name NOT NULL, is_active DEFAULT true, created_at
)

part_requests(
  id,
  team_lead_id → team_leads,
  project_id   → projects,
  catalog_item_id → catalog_items NULL,      -- null when "Other"
  other_description NULL,                    -- required when catalog_item_id is null
  quantity  [check 1..999],
  notes NULL,
  photo_path NULL,                           -- storage path, single optional photo
  status [check: pending|in_progress|ready] DEFAULT 'pending',
  status_updated_by NULL,
  created_at,
  [check: catalog_item_id IS NOT NULL OR length(trim(other_description)) >= 5]
)
```

**Storage:** new bucket `part-photos`, read via public URLs — same (insecure-by-design) pattern as `report-photos`. RLS enabled on both new tables with the same permissive, anon-key-compatible policies the existing tables use.

---



## 5. Cross-cutting behaviors

- **Language/RTL:** all new strings Hebrew, rendered under the existing global `dir="rtl"`; no i18n framework introduced.
- **Images:** identical client-side compression pipeline; no server-side processing exists or is added.
- **Resilience:** every new screen ships with explicit Hebrew loading / empty ("עדיין אין בקשות") / error states; draft autosave protects typed data on network failure.
- **No hard deletes:** catalog items and (implicitly) requests are never hard-deleted; catalog follows the deactivate convention.
- **Notifications:** none. The pending-parts counter on `/manager` is the discovery mechanism, mirroring how extras are discovered today.

---



## 6. Conflicts & decisions needed

- **D1 — "Delete catalog items" vs. no-hard-delete convention:** the outline asks for delete; the app never hard-deletes admin entities, and hard-deleting an item referenced by historical requests would break them. **Decision: deactivate-only**, presented in the UI as removal from the active catalog. Needs stakeholder sign-off that this satisfies the requirement.
- **D2 — "Notifications" vs. zero notification infrastructure:** the outline says requests "trigger a notification." No email/SMS/push exists anywhere in the app. **Decision: dashboard-first** — the pending counter is v1. Supabase Realtime (a live-updating counter) or push is listed as a future option only; it would be the app's first realtime surface and needs its own decision.
- **D3 — Inline editing of catalog items:** the outline requires editing; no existing admin tab supports edit (add + toggle only). This introduces a new admin interaction pattern — confirm it should not also be retrofitted to clients/projects/team leads (out of scope here).
- **D4 — Requester identity:** requests inherit the "first active team lead" attribution flaw. Acceptable for v1? Fixing it is a platform change, not part of this feature.
- **D5 — Field cancellation:** the outline is silent on whether the field can cancel a request. V1 ships without it; flagged for prioritization.

---



## 7. Out of scope

Per-user authentication or identity; email/SMS/push/realtime notifications; inventory levels, pricing, SKUs, or units of measure on catalog items; multi-photo attachments per request; editing or canceling a submitted request from the field; production scheduling beyond the three-state status; any change to the existing report, extras, or admin flows outside the insertion points named above.