# Enbar — Lunch Ordering (Self-Service via QR) — PRD v4 (Final, incl. admin UI refinements)

**Supersedes v3.** All open decisions from v3 (D5, D6) are now closed, plus two later UI refinements (D13, D14) requested directly during the Claude Code implementation pass. The database migration described here has **already been applied** to the live Supabase project (`enbar-bot`, ref `svsuntixvxwwuggtqsws`), and the frontend has **already been implemented** by Claude Code — this document is now the as-built reference, kept in sync with what was actually asked for and built.

If v3 was saved to `enbar-app/enbar-app - PRD/`, replace it with this file.

---

## 1. Problem / objective

Replace the paper "הזמנת ארוחת צהריים" sheet with:
- Self-service ordering: each employee orders their own lunch via a QR code at the time clock, identified only by phone number, no login.
- A hard 12:00 daily cutoff — no submissions or edits after.
- A fixed public URL that always shows today's locked order list as a shareable image, for a designated employee to forward to the restaurant via WhatsApp.
- A monthly, always-live-computed per-employee order-count report for the office manager (login required).

---

## 2. Actors

- **Employee** — self-orders via `/lunch`, identified by phone only, no login, no PIN, no proxy/filler.
- **Office manager** — manages the employee roster and the menu catalog via `/manager/settings` (requires a real, authenticated `factory_manager` session — see §5). Also the only one who can view the monthly report.
- **Any employee** (forwarding role, no special access) — opens `/lunch/today` after 12:00 to view and forward today's locked list to the restaurant.

No dependency on Twilio SMS/WhatsApp automation — the daily image page is fully client-side, no server push.

**However:** admin management (adding/editing employees or menu items) and the monthly report **do depend on the in-progress Supabase Auth / Twilio OTP work (Phase 1)**, because their RLS policies require a real authenticated `factory_manager` session (see §5). This is a deliberate, confirmed dependency — narrower in scope than it might first appear, since the employee-facing self-order flow and the restaurant image page do **not** depend on it at all.

---

## 3. Data model (as already applied to Supabase)

```sql
-- General company employee roster (not lunch-specific; may be reused by future features)
employees(
  id, name, phone,              -- phone unique among active rows
  is_active, created_at, deleted_at
)

-- Menu catalog — single table, tagged by category, fixed/rarely-changing
lunch_menu_items(
  id, category [check: main_dish | addition | salad],
  name, is_active, created_at, deleted_at
)

-- Orders — semantic, catalog-based selection
lunch_orders(
  id, order_date, employee_id → employees,
  main_dish_id → lunch_menu_items,   -- exactly 1, must be category='main_dish'
  addition_id  → lunch_menu_items,   -- exactly 1, must be category='addition'
  salad_1_id   → lunch_menu_items,   -- 2 salads, must be category='salad', no duplicate
  salad_2_id   → lunch_menu_items,
  created_at, updated_at,
  unique(order_date, employee_id)
)
```

- A validation trigger (`lunch_orders_validate_categories`) enforces that each FK points to a menu item of the correct category — a plain FK can't express "must be category X," so this prevents e.g. a salad's id being saved into `main_dish_id`.
- No hard deletes anywhere — `employees` and `lunch_menu_items` use deactivate/`deleted_at`. Deactivating a menu item doesn't affect historical orders that already reference it.

---

## 4. Access model (RLS + RPC) — as already applied

This is the most significant architectural decision in this PRD and differs from the rest of the app's usual "fully open to anon" pattern:

| Table / action | Who | Mechanism |
|---|---|---|
| `employees` — INSERT/UPDATE | office manager only | RLS: requires authenticated session with `auth_profile().role = 'factory_manager'` |
| `employees` — SELECT (full list) | office manager only | Same RLS restriction — **not** open to anon |
| `lunch_menu_items` — SELECT | anyone | Open (needed by the anonymous order form) |
| `lunch_menu_items` — INSERT/UPDATE | office manager only | Same `factory_manager` RLS restriction |
| `lunch_orders` — SELECT (full table) | office manager only | Same `factory_manager` RLS restriction — used for the monthly report |
| `lunch_orders` — INSERT | anyone | Open (self-service order creation) |
| `lunch_orders` — UPDATE / DELETE | anyone, **today's date only** | Pre-existing DB-level restriction (`order_date = CURRENT_DATE`) |

Since direct `SELECT` on `employees` and `lunch_orders` is manager-only, the no-login employee flow and the public restaurant page go through **4 RPC functions** instead (all already created, all `SECURITY DEFINER`, each exposing only the minimum needed):

1. **`lunch_lookup_employee(phone)`** → returns `{employee_id, employee_name}` for an active employee with that phone, or nothing. This is the self-service identification step.
2. **`lunch_get_order(employee_id, date)`** → returns that employee's order for a given date, if any — used to check "did I already order today."
3. **`lunch_get_last_order(employee_id)`** → returns that employee's most recent prior order — used for auto-prefill (see §6.1).
4. **`lunch_today_sheet()`** → returns every employee's order **for today only** (name + selections), joined and ready to render — powers the public `/lunch/today` page. Deliberately scoped to `CURRENT_DATE`; there is no way to pull historical days through this function.

None of these four functions expose more than their stated purpose — in particular, there is no RPC that lets an anonymous caller browse the full employee list or historical order data.

---

## 5. Screens

### 5.1 Employee self-order — `/lunch`
- No login. Reached via the QR code at the time clock.
- Employee enters their phone number → calls `lunch_lookup_employee`.
  - Match → proceed.
  - No match → show **"טלפון לא רשום במערכת"** and stop. No self-registration; only the office manager can add a phone number.
- On successful match, **automatically** (no separate button):
  - Call `lunch_get_order(employee_id, today)` — if an order already exists for today, load it into the form and ask whether to update it on submit.
  - Otherwise, call `lunch_get_last_order(employee_id)` — if a prior order exists, pre-fill the form from it (skip any selection whose menu item has since been deactivated); the employee can still edit before submitting.
  - If neither exists, the form starts empty.
- Order form, built from active `lunch_menu_items` rows (read directly, open SELECT):
  - **מנה עיקרית** — single-select, required, `category='main_dish'`.
  - **תוספת** — single-select, required, `category='addition'`.
  - **סלטים** — multi-select, exactly 2 required, `category='salad'`, no duplicate.
- Submit inserts or updates (matching the flow above) directly into `lunch_orders` — this is allowed by the open INSERT policy and the today-only UPDATE policy, no RPC needed for writes.
- **Cutoff:** after 12:00, the form is replaced with "ההזמנות ליום היום ננעלו" — no new orders or edits.

### 5.2 Daily restaurant image — `/lunch/today`
- No login, publicly reachable.
- Before 12:00: "not yet locked" state — today's list is still open.
- After 12:00: calls `lunch_today_sheet()`, renders a client-side generated image in the paper-table layout — one row per employee who ordered (name, main dish, addition, both salads).
- **"Send to restaurant" button:** opens `wa.me/972503338181` (placeholder number, **to be replaced by Roy with the real restaurant number before/at launch** — do not hardcode a final value assuming this is permanent). Known limitation: the click-to-chat link opens the conversation but cannot auto-attach the image.
- **"Save image" button:** downloads the image directly, as the manual-attach fallback.
- No server-side automation — fully client-side, generated on-demand whenever the URL is opened after 12:00.

### 5.3 Admin — `/manager/settings` (office manager only, requires real `factory_manager` auth session)
**Note on device context:** the entire `/manager` area (including this tab) is desktop-oriented, consistent with the rest of the manager dashboard (the reverse-engineered PRD already describes the manager reviewing reports "on a desktop dashboard") — unlike the mobile-first team-lead-facing screens (`/lunch`, `/lunch/today`), controls here do not need thumb-sized touch targets.

**One tab, "עובדים"** (icon: represents workers/people, not food — this is a people-management tab, the food association belongs to the catalog sub-section only, not the tab itself), containing two sub-sections (not two separate top-level tabs):
- **Employee roster:** name + phone, add / **toggle active-inactive**, same list-pattern as clients/projects/team leads except using a toggle switch rather than a "השבתה" button/label. Each row shows the phone number **under the employee's name, aligned to the right side, displayed without the country code** (e.g. `050-1234567`, not `+972501234567`) — even if the stored value includes a country code for matching purposes in `lunch_lookup_employee`, the display strips it for readability.
- **Menu catalog:** one list (not three), each row tagged main dish / addition / salad via `category`; add / **toggle active-inactive**, same toggle-switch pattern as the employee roster.

**Both sub-sections are collapsed/closed drawers by default** — the office manager sees each drawer's title bar without its list rendered open; tapping/clicking expands it to show the existing rows. This applies equally to the employee list and the menu-item list.

**The "add new" button for each sub-section lives inside its own drawer, next to that drawer's title, and only renders while that drawer is expanded** — it is not visible on the closed/collapsed title bar, and is not shared between the two drawers. Opening the employee drawer reveals "add employee" next to its title; opening the menu-catalog drawer reveals "add menu item" next to its title; each disappears again if its drawer is collapsed.

**Inside the menu-catalog drawer, items are grouped into three visually distinct sections** — main dishes (מנות עיקריות), additions (תוספות), and salads (סלטים) — reflecting the `category` column, rather than one flat undifferentiated list. This is a display grouping only; the underlying table remains the single `lunch_menu_items` table with a `category` column (§3), not three separate tables.

### 5.4 Monthly report — new screen under `/manager` (requires real `factory_manager` auth session)
- Month selector — works for the current in-progress month and any past month identically.
- Always **live-computed** from `lunch_orders` — no freeze/snapshot mechanism; since orders can't change after their day's 12:00 cutoff, a live query for a past month always returns the same result a frozen snapshot would, without extra infrastructure.
- Per employee: phone linked to full name, and total number of orders (distinct days ordered) that month — not a sum of individual food items.
- Includes employees deactivated mid-month if they have orders in the period.
- Export to CSV/Excel.

---

## 6. Cross-cutting behaviors

### 6.1 "כמו פעם קודמת" — now automatic, not a button
Reinstated from v2 (where it was dropped) now that selection is catalog-based rather than free text — a fixed, rarely-changing catalog makes stale prefill low-risk. In v4 this is **automatic on phone match**, not a separate button (see §5.1) — a deliberate UX simplification from earlier drafts.

### 6.2 Security posture
- Self-service identification via phone number is not authentication — anyone who knows/guesses a registered phone number could submit an order under that identity. Same risk tier as the rest of the app's "no real auth" posture (documented, not treated as a gap to silently fix).
- The RPC functions are the actual security boundary for read access — they were deliberately scoped narrow (§4) specifically so this risk doesn't extend to bulk data exposure (e.g., scraping the full employee list or historical orders), even though write-side trust remains loose.

### 6.3 No fallback for employees without QR/smartphone access
Confirmed — everyone uses the QR flow in this phase.

### 6.4 Hardcoded 12:00 cutoff
Not admin-configurable in this phase.

### 6.5 No hard deletes
Consistent with the rest of the app, across `employees` and `lunch_menu_items`.

---

## 7. Decisions log (all closed)

- **D1:** restaurant output is a client-side generated image, paper-table layout. Confirmed.
- **D2:** only the office manager can add employees / menu items, via `/manager/settings`. Confirmed.
- **D3:** daily cutoff is 12:00, hardcoded. Confirmed.
- **D4:** no fallback for employees without QR access. Confirmed.
- **D5 (closed):** restaurant WhatsApp number is `0503338181` — **explicitly a placeholder**, stored as a configurable value, not hardcoded assuming permanence. Reminder standing to update before/at launch.
- **D6 (closed):** routes are `/lunch` (self-order) and `/lunch/today` (restaurant image).
- **D7:** "כמו פעם קודמת" reinstated, and further simplified to automatic (no button) in v4.
- **D8:** menu catalog is a single table (`lunch_menu_items`) tagged by `category`, not three separate tables — office-manager-managed, rarely changes.
- **D9:** monthly report is always live-computed, no freeze/snapshot.
- **D10:** "total orders" = count of distinct days ordered, not a sum of food items.
- **D11 (new in v4):** `employees` is a general-purpose table (not lunch-specific) — confirmed it may be reused by future features, so `is_filler`/`pin` (v1 leftovers) were dropped rather than repurposed.
- **D12:** `employees` and `lunch_orders` SELECT is restricted to authenticated `factory_manager` sessions — confirmed as intentional, accepting the resulting dependency on the in-progress OTP work for admin/report screens specifically (not for the employee-facing self-order or restaurant-image screens).
- **D13 (new):** the two lunch admin screens (employee roster, menu catalog) are one tab ("עובדים") with two collapsed-by-default drawer sub-sections, not two separate top-level tabs.
- **D14:** each drawer's "add new" button sits inside that drawer, next to its own title — not a shared/external add form. The "עובדים" tab's icon represents workers/people, not food, since the tab is about people management (the catalog sub-section is the only place food-related, and it doesn't need its own tab-level icon).
- **D15 (new):** the "add new" button only renders while its drawer is expanded — not visible on the collapsed title bar.
- **D16:** inside the menu-catalog drawer, items display grouped into three visual sections (main dishes / additions / salads) by `category` — display-only grouping, still one underlying table.
- **D17:** in the employee roster list, phone number displays under the name, right-aligned, with the country code stripped for readability — this is a display concern only, not a change to how the phone is stored or matched by `lunch_lookup_employee`.
- **D18 (new):** active/inactive state in both the employee roster and menu catalog is controlled via a toggle switch, not a "השבתה" button/label — same underlying deactivate mechanism (`is_active`), different control.
- **D19 (new):** the `/manager` area (including this tab) is desktop-oriented, consistent with the existing manager dashboard — no need to design its controls for thumb/touch use, unlike `/lunch` and `/lunch/today`.

---

## 8. Out of scope

Daily/frequent menu catalog updates; self-registration of phone numbers; fallback/manual-entry path for employees without QR access; server-side automated sending to the restaurant (Cron, Twilio WhatsApp Business, SMS); a configurable cutoff time; a frozen/snapshot monthly report; changes to the in-progress OTP/auth work itself, or to any other existing table, RLS policy, or storage bucket.
