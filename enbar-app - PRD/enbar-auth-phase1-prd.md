# Enbar Daily Work Reports — Phase 1: Authentication & Identity

**Status:** Draft for review
**Scope:** Replace the localStorage profile picker and the `enbar2026` shared password with real user accounts via Supabase Auth phone OTP. This is Phase 1 of a 4-phase hardening roadmap; RLS, storage privacy, and serverless/e-signature work are separate future phases.

## Overview & Goals

Today Enbar has no login. `/` is a two-button profile picker that writes a role string (`team_lead` or `factory_manager`) to `localStorage`, and `/manager/*` is additionally gated by a shared password (`enbar2026`) shipped in the client bundle. There is no concept of an individual person: all reports are auto-attributed to whichever `team_leads` row is oldest and active, so a second team lead cannot even be selected.

This phase replaces that with real identity: every person gets an account, logs in with their own phone via SMS OTP, and every new report is attributed to the actual logged-in team lead. The app remains a browser-direct-to-Supabase SPA — no backend server is introduced.

Goals:
- Real per-person login using phone number + OTP, Supabase Auth session, Hebrew/RTL throughout.
- A `profiles` table giving every authenticated user a role and (for team leads) a link to their `team_leads` row.
- New reports attributed to the actual logged-in team lead; the "oldest active team lead" fallback is deleted from the code.
- A workable process for creating users and assigning roles/phones for Phase 1.
- A migration/cutover plan that preserves attribution on all existing reports.

## Non-Goals

- No RLS policy changes — RLS stays permissive (anon-key inserts/updates continue to work), matching today's behavior. This is a known, accepted risk carried into Phase 2.
- No change to storage bucket privacy (`report-photos`, `signed-approvals` remain public-URL readable) — Phase 3.
- No serverless functions, no e-signature capture — Phase 4.
- No email/password, magic link, or social login — phone OTP is the only method.
- No redesign of the report form, manager dashboard, extras workflow, or admin clients/projects tabs. Only the entry screen, header, and the team-leads admin tab change.

## User Stories

**Team lead**
- As a team lead, I log in with my own phone number so the app knows it's me, not a shared identity.
- As a team lead, my home screen shows only reports I filed, not a mix from an arbitrary "first" team lead.
- As a team lead, if my session expires mid-report, my draft (already saved to `localStorage`) is still there after I log back in.

**Factory manager**
- As a factory manager, I log in with my own phone and reach `/manager` without a shared password.
- As a factory manager, I can see (read-only in Phase 1) which team lead is linked to which phone number in admin settings.
- As a factory manager, deactivating a team lead in admin settings also blocks that person's login, without deleting their historical reports.

## Login Flow

Replaces `/`. Entire UI in Hebrew, RTL, with loading/empty/error states per existing conventions.

1. **Phone entry screen** (`/`): Enbar logo, single input labeled `מספר טלפון`, placeholder `05X-XXXXXXX`. Input normalizes to `+972` (strips leading `0`, rejects non-Israeli formats) before sending. Button: `שלח קוד אימות`. Client-side validation error: `מספר טלפון לא תקין`.
2. App calls `supabase.auth.signInWithOtp({ phone })`. Button shows `שולח...` while pending.
3. **OTP entry screen**: `הזן את הקוד שנשלח למספר {phone}`, 6-digit input, button `אימות`, link `שלח קוד מחדש` (disabled with countdown per Supabase's rate limit, e.g. `שלח שוב בעוד 42 שניות`).
4. App calls `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`. On success, Supabase issues a session (JWT + refresh token), persisted via `supabase-js`'s default `localStorage` persistence so mobile browsers keep the session across tabs/reloads.
5. App reads the caller's `profiles` row to determine role, then routes to `/home` (team_lead) or `/manager` (factory_manager), exactly as today.
6. **No matching profile**: `אין לך הרשאה לגשת לאפליקציה. פנה למנהל המערכת.` — sign out, stay on `/`.
7. **Header logout**: existing "החלף פרופיל" button is relabeled `התנתקות`, calls `supabase.auth.signOut()`, returns to `/`.
8. `/manager/*` password gate (`enbar2026`, `sessionStorage`, `VITE_ADMIN_PASSWORD`) is fully removed; route protection becomes "is there a session, and does `profiles.role === 'factory_manager'`."

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

alter table reports
  alter column team_lead_id drop not null, -- unchanged FK, now populated from auth context
  add column created_by uuid references auth.users(id);
```

`team_lead_id` on `reports` continues to reference `team_leads` unchanged (no schema break for the manager dashboard's existing team-lead filter); `created_by` is added for audit purposes. `team_leads.is_active = false` plus `profiles.is_active = false` together represent deactivation — no hard deletes, consistent with existing convention.

## User Management

**Decision: admin-only creation via Supabase dashboard for Phase 1**, not a self-service "create user" screen inside `/manager/settings`.

Justification: building an in-app user-creation flow requires either a service-role key in the browser (unacceptable — it bypasses RLS entirely for anyone who opens dev tools, the same class of problem this phase is fixing) or a serverless function to create `auth.users` rows safely — which is explicitly Phase 4 scope. For a company with two team leads and one manager today, dashboard-based provisioning is low-effort and safe. The team-leads admin tab becomes read-only for phone/role display in this phase; a self-service admin UI is a candidate for a later phase once serverless functions exist.

Process: factory manager requests a new user via the existing team-leads admin tab ("שם" only, as today) or directly; a technical admin creates the `auth.users` row (phone, no password) in the Supabase dashboard and inserts the matching `profiles` row linking to the `team_leads` row.

## Migration & Cutover Plan

1. For each of the 2 existing active `team_leads` rows, collect a real phone number (manual outreach — none exists today).
2. Create one `auth.users` row per team lead (dashboard, phone-only, no email) plus one for the factory manager.
3. Insert `profiles` rows linking each new user to their `team_leads` row (or `factory_manager` with no link).
4. All existing `reports.team_lead_id` values are untouched — they already point at the correct `team_leads` rows, so historical attribution is preserved with no data migration needed.
5. **Hard cutover, not coexistence.** Given the live dataset is tiny (1 report, 2 team leads, 4 clients), a deploy that ships the new login screen and removes the password gate in one release is lower-risk than running two parallel access systems. Schedule the cutover for a low-usage window; notify both users by phone beforehand with their login number.
6. Rollback: revert the Vercel deployment to the prior commit; `profiles`/schema additions are additive and don't block the old code path if a fast rollback is needed.

## SMS Provider Recommendation

Supabase Auth phone OTP requires a configured third-party SMS provider; natively supported options include Twilio, MessageBird, and Vonage.

| Provider | IL delivery | Cost/SMS | Setup effort |
|---|---|---|---|
| **Twilio (recommended)** | Established global carrier relationships; widely used for IL OTP traffic | ~$0.04–0.08 [verify — check twilio.com/sms/pricing/il for current rate] | Low — first-class Supabase integration (`TwilioVerifyProvider`), well-documented |
| Vonage | Comparable reliability, Unicode auto-detection built in | [verify] | Low — native Supabase support |
| MessageBird | Native Supabase support, EU-based | [verify] | Low |

**Recommendation: Twilio.** It's the most commonly documented Supabase integration, has native OTP verification support (reducing custom code), and Enbar's volume (a handful of logins/day) makes cost differences across providers immaterial. Exact per-message IL pricing should be confirmed against Twilio's live pricing page before commit, as rates vary by carrier.

## Edge Cases & Error States

- **Wrong OTP**: `הקוד שהוזן שגוי, נסה שוב` — input stays, retry allowed.
- **Rate limit hit** (resend or attempts): `יותר מדי ניסיונות. נסה שוב בעוד {n} דקות` — matches Supabase's default 60-second resend cooldown / hourly send limits.
- **Phone number change**: no self-service in Phase 1; admin updates `auth.users.phone` via dashboard and the linked `profiles.phone` field.
- **Deactivated user logs in**: OTP still succeeds (Supabase auth doesn't know about `profiles.is_active`); app checks `profiles.is_active` post-login and shows `החשבון הושבת. פנה למנהל המערכת.`, then signs out.
- **Session expires mid-report**: the report form's existing `localStorage` draft autosave is untouched by this phase; on re-login the user lands on `/home` and can reopen `/report/new`, which restores the draft exactly as it does today.

## Open Questions

- Who owns collecting and verifying team leads' real phone numbers before cutover?
- Should `profiles.phone` be kept in sync with `auth.users.phone` automatically (trigger) or updated manually alongside it?
- Is a company Twilio/SMS budget already approved, or does this need separate sign-off?

## Acceptance Criteria

- [ ] `/` shows phone entry, not the two-button profile picker; the picker component is removed from the router.
- [ ] Entering a valid Israeli number and correct OTP creates a Supabase session and routes to `/home` or `/manager` based on `profiles.role`.
- [ ] `/manager/*` is reachable only with a session where `profiles.role = 'factory_manager'`; the `enbar2026` password prompt and `VITE_ADMIN_PASSWORD` env var are removed from the codebase.
- [ ] A new report's `team_lead_id` equals the logged-in user's linked `team_leads.id`; no code path resolves "oldest active team lead."
- [ ] `/home` "הדוחות שלי" lists only reports where `team_lead_id` matches the logged-in user.
- [ ] Deactivating a team lead (`is_active = false`) blocks their next login with the Hebrew message above; their historical reports remain visible on the manager dashboard.
- [ ] Logging out clears the Supabase session and returns to the phone entry screen.
- [ ] Starting a report, letting the session expire, logging back in, and reopening `/report/new` restores the previously typed draft.
- [ ] All pre-existing team-lead-attributed reports (1 in the current live dataset) still display the correct team lead name on the manager dashboard after migration.
