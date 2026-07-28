# Enbar Daily Work Reports — Phase 1: Authentication & Identity

**Status:** Draft for review
**Scope:** Replace the localStorage profile picker and `enbar2026` shared password with real user accounts via Supabase Auth phone OTP. Phase 1 of 3: (1) Authentication & Identity — this PRD, (2) Authorization & RLS, (3) Private storage buckets. A separate SignWell e-signature serverless layer (`api/_lib/signwell.js`, `api/webhooks/signwell.js`) already exists and is untouched by any phase.

## Overview & Goals

Today Enbar has no login. `/` is a two-button profile picker writing a role string (`team_lead` or `factory_manager`) to `localStorage`, and `/manager/*` is additionally gated by a shared password (`enbar2026`) shipped in the client bundle. There is no individual identity: every report auto-attributes to whichever `team_leads` row is oldest and active, so a second team lead can't currently be selected by anyone.

This phase replaces that with real identity: every person gets an account, logs in with their own phone via SMS OTP, and new reports attribute to the actual logged-in team lead. The app stays a browser-direct-to-Supabase SPA — no backend server beyond what Supabase Auth itself requires.

Goals:
- Real per-person login via phone + OTP, Supabase Auth session, Hebrew/RTL throughout.
- A `profiles` table giving every authenticated user a role and, for team leads, a link to their `team_leads` row.
- New reports attributed to the logged-in team lead; the "oldest active team lead" fallback removed from the code.
- A workable process for creating users and assigning roles/phones in Phase 1.
- A migration/cutover plan preserving attribution on all existing reports.

## Non-Goals

- No RLS policy changes — stays permissive (anon-key inserts/updates keep working), matching today. Known, accepted risk, addressed in Phase 2.
- No change to storage bucket privacy (`report-photos`, `signed-approvals` stay public-URL readable) — Phase 3.
- No changes to the existing SignWell serverless functions or webhook.
- No email/password, magic link, or social login — phone OTP only.
- No redesign of the report form, manager dashboard, extras workflow, or clients/projects admin tabs. Only the entry screen, header, and team-leads admin tab change.

## User Stories

**Team lead**
- I log in with my own phone so the app knows it's me, not a shared identity.
- My home screen shows only reports I filed, not whichever team-lead row is oldest.
- If my session expires mid-report, my draft (already in `localStorage`) is still there after I log back in.

**Factory manager**
- I log in with my own phone and reach `/manager` without a shared password.
- I can see, read-only in Phase 1, which team lead is linked to which phone.
- Deactivating a team lead blocks their login without deleting their historical reports.

## Login Flow

Replaces `/`. Entire UI in Hebrew, RTL, with loading/empty/error states per existing conventions.

1. **Phone entry** (`/`): logo, input `מספר טלפון`, placeholder `05X-XXXXXXX`. Normalizes to `+972` (strips leading `0`, rejects non-Israeli formats). Button: `שלח קוד אימות`. Validation error: `מספר טלפון לא תקין`.
2. App calls `supabase.auth.signInWithOtp({ phone })`; button shows `שולח...` while pending.
3. **OTP entry**: `הזן את הקוד שנשלח למספר {phone}`, 6-digit input, button `אימות`, link `שלח קוד מחדש` (disabled with countdown, e.g. `שלח שוב בעוד 42 שניות`).
4. App calls `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`. Session persists via `supabase-js`'s default `localStorage` persistence, so mobile browsers keep it across tabs/reloads.
5. App reads the caller's `profiles` row for role, routes to `/home` (team_lead) or `/manager` (factory_manager) — same routing as today.
6. **No matching profile**: `אין לך הרשאה לגשת לאפליקציה. פנה למנהל המערכת.` — sign out, stay on `/`.
7. **Header logout**: "החלף פרופיל" is relabeled `התנתקות`, calls `supabase.auth.signOut()`, returns to `/`.
8. `/manager/*` password gate is fully removed; protection becomes "session exists and `profiles.role === 'factory_manager'`."

## Data Model Changes

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('team_lead', 'factory_manager')),
  team_lead_id uuid references team_leads(id),
  phone text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint team_lead_link_required check (
    (role = 'team_lead' and team_lead_id is not null) or
    (role = 'factory_manager' and team_lead_id is null)
  )
);

create unique index profiles_team_lead_id_key on profiles(team_lead_id) where team_lead_id is not null;

alter table reports add column created_by uuid references auth.users(id);
```

`reports.team_lead_id` stays unchanged — no schema break for the manager dashboard's team-lead filter; `created_by` is added for audit only. `team_leads.is_active = false` plus `profiles.is_active = false` together represent deactivation — no hard deletes.

## User Management

**Decision: admin-only creation via the Supabase dashboard for Phase 1**, not a self-service "create user" screen in `/manager/settings`.

An in-app flow needs either a service-role key in the browser (bypasses RLS for anyone who opens dev tools — the exact problem this phase fixes) or a serverless function to create `auth.users` safely, not justified for two team leads and one manager today. The team-leads admin tab becomes read-only for phone/role display; self-service creation is a candidate once a serverless layer exists for it.

Process: the factory manager requests a new user via the existing team-leads admin tab (name only, as today); a technical admin creates the `auth.users` row (phone, no password) in the Supabase dashboard and inserts the matching `profiles` row.

## Migration & Cutover Plan

1. Collect a real phone number for each of the 2 existing active `team_leads` rows (manual outreach — none exists today).
2. Create one `auth.users` row per team lead (dashboard, phone-only) plus one for the factory manager.
3. Insert `profiles` rows linking each user to their `team_leads` row (or `factory_manager` with no link).
4. Existing `reports.team_lead_id` values are untouched — already correct, so no data migration needed for historical attribution.
5. **Hard cutover, not coexistence.** The live dataset is tiny (1 report, 2 team leads, 4 clients), so one release shipping login + removing the password gate is lower-risk than two parallel access systems. Schedule a low-usage window; notify both users by phone beforehand with their login number.
6. Rollback: revert the Vercel deployment; `profiles` and `reports.created_by` are additive and don't block the old code path.

## SMS Provider Recommendation

Supabase Auth phone OTP requires a configured third-party SMS provider; natively supported options include Twilio, MessageBird, and Vonage.

| Provider | IL delivery | Cost/SMS | Setup effort |
|---|---|---|---|
| **Twilio (recommended)** | Established carrier relationships, widely used for IL OTP | ~$0.04–0.08 [verify] | Low — first-class Supabase integration |
| Vonage | Comparable reliability, built-in Unicode handling | [verify] | Low — native Supabase support |
| MessageBird | Native Supabase support, EU-based | [verify] | Low |

**Recommendation: Twilio.** Most commonly documented Supabase integration with native OTP support; Enbar's volume (a handful of logins/day) makes cost differences across providers immaterial. Confirm exact IL per-message pricing before commit.

## Edge Cases & Error States

- **Wrong OTP**: `הקוד שהוזן שגוי, נסה שוב` — input stays, retry allowed.
- **Rate limit hit**: `יותר מדי ניסיונות. נסה שוב בעוד {n} דקות` — matches Supabase's default cooldown/send limits.
- **Phone number change**: no self-service in Phase 1; admin updates `auth.users.phone` and linked `profiles.phone` via dashboard.
- **Deactivated user logs in**: OTP still succeeds (Supabase Auth doesn't know `profiles.is_active`); app checks it post-login, shows `החשבון הושבת. פנה למנהל המערכת.`, signs out.
- **Session expires mid-report**: draft autosave is untouched by this phase; re-login reaches `/home`, reopening `/report/new` restores the draft as today.

## Open Questions

- Who owns collecting and verifying team leads' real phone numbers before cutover?
- Should `profiles.phone` sync from `auth.users.phone` via trigger, or be updated manually alongside it?
- Is an SMS budget already approved, or does this need separate sign-off?

## Acceptance Criteria

- [ ] `/` shows phone entry, not the profile picker; the picker component is removed from the router.
- [ ] A valid Israeli number plus correct OTP creates a session and routes to `/home` or `/manager` per `profiles.role`.
- [ ] `/manager/*` requires a session with `profiles.role = 'factory_manager'`; `enbar2026` and `VITE_ADMIN_PASSWORD` are removed from the codebase.
- [ ] A new report's `team_lead_id` equals the logged-in user's linked `team_leads.id`; no code path resolves "oldest active team lead."
- [ ] `/home` "הדוחות שלי" lists only reports matching the logged-in user.
- [ ] Deactivating a team lead blocks their next login with the message above; their historical reports stay visible on the manager dashboard.
- [ ] Logging out clears the session and returns to phone entry.
- [ ] Session expiry mid-report, then re-login, then reopening `/report/new`, restores the previously typed draft.
- [ ] The existing report (1 in the live dataset) still shows the correct team lead name on the manager dashboard after migration.
