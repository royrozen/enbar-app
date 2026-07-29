# Enbar — Self-Hosted Signature Link (Replacing SignWell) — PRD (v2, confirmed)

**Scope:** replace the current SignWell API integration used for extras (`exception_logs`) client approval with a self-hosted signature flow: a unique, tokenized public link the manager sends to the client, a signature-capture page, and automatic PDF stamping + storage on submit. This PRD covers **removal** of the SignWell-specific parts and **addition** of the replacement — both sides are implemented together so the extras workflow doesn't end up half-migrated.

**Confirmed against live Supabase schema** (project `enbar-bot`, ref `svsuntixvxwwuggtqsws`) on 2026-07-29. Table/column names below are real, not assumed.

---

## 1. Feature objective

Today: generate PDF → send to SignWell via a serverless call (holds the SignWell API key) → SignWell hosts the signing UI → a webhook updates `exception_logs`. Replace with: manager generates the PDF as today → app creates a single-use signing link → client opens the link (no login), reviews the report, draws a signature on a canvas, submits → app stamps the signature into the PDF, uploads it to Storage, and updates status automatically → client sees a confirmation screen.

**Extras = `exception_logs`.** Confirmed: there is no separate "extras" concept on `reports` anymore — the entire extras/change-order workflow (formerly "יומן חריגים / exceptions") lives in `exception_logs`, and that's the table this PRD touches. No ambiguity about scope — this replaces signature handling for `exception_logs` only, which is the only place SignWell is wired in today.

---

## 2. What's being removed

Confirmed live columns on `exception_logs` (to be removed/repurposed):

- `signwell_document_id` (text, nullable) — stops being written to going forward, but **kept in the schema** (not dropped) as a historical marker of which rows were signed via SignWell. Revisit dropping it before the production/Vercel deploy of this feature — see §7 D5.
- The serverless function(s) that call the SignWell API to create a signing document.
- The webhook endpoint that SignWell calls back on completion, which currently updates `exception_logs.status`, `exception_logs.signed_path`, and clears/sets `signwell_document_id`.
- Whatever UI trigger on the manager's exception detail screen currently kicks off "send via SignWell."

**Kept, not removed:** the serverless/edge function layer itself. It's not SignWell-only — Twilio OTP (Phase 1 auth) is planned to use it too, so only the SignWell-specific handler(s) inside it are deleted; the deployment/infrastructure stays.

**Reused, unchanged:**
- `exception_logs.pdf_path` — the generated (unsigned) PDF, produced today via `pdfmake`. Same generation path is reused for producing the document that gets shown/stamped in the new flow.
- `exception_logs.signed_path` — still the field that ends up holding the final signed PDF's storage path, regardless of whether it got there via the new link flow or the existing manual-upload fallback.
- `exception_logs.status` (`pending | sent | approved`) — same state machine. "Approved" still requires a signed document to exist; that requirement is now satisfied automatically when a client completes the link flow, in addition to the existing manual-upload path.
- `exception_logs.status_updated_by` — same "which profile changed status" stamp as today.

---

## 3. What's being added

### 3.1 New table: `signature_requests`

```sql
CREATE TABLE signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  exception_id UUID REFERENCES exception_logs(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_signature'
    CHECK (status IN ('awaiting_signature', 'signed', 'expired')),
  report_snapshot_hash TEXT,          -- see §3.4: detects "did the report change"
  signed_at TIMESTAMPTZ,
  signer_ip TEXT,
  signed_pdf_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);
```

- `token` is a second random UUID, deliberately not the row's own `id` or `exception_logs.id` — same unguessable-path principle already used for Storage paths.
- `expires_at` defaults to **7 days** from creation (confirmed).
- `report_snapshot_hash`: a hash (or simple updated-at comparison) of the exception's editable content (`work_description`, `billable_days`, edited extras wording, etc.) taken at link-creation time — used to implement the re-send rule in §3.4 without needing to diff full records manually.
- RLS: this table must be readable/writable by an unauthenticated client hitting `/sign/:token`, scoped strictly by exact `token` match — never by a list query. This is the one deliberately-public policy in the schema; it must not allow enumeration.

### 3.2 New route: `/sign/:token` (public, no profile/password gate)

- Token not found, `status = 'expired'`, or `expires_at` passed → "הקישור פג תוקף" (link expired), no further action.
- `status = 'signed'` already → show the confirmation screen again (idempotent for a client re-opening the link).
- Otherwise: Enbar branding, read-only summary (project/client name, extras text as currently shown on the generated PDF), signature canvas (draw, clear/redo), required consent checkbox ("אני מאשר/ת שקראתי את התוכן לעיל ומסכים/ה לחתום עליו"), submit button disabled until both are complete.

### 3.3 On submit

1. Capture canvas as PNG.
2. Stamp signature image into the existing `pdfmake` template, same signature-block position used today.
3. Stamp signed timestamp + consent statement into the PDF (this is what substitutes for SignWell's audit trail).
4. Upload signed PDF to the existing `signed-approvals` bucket, existing filename convention.
5. Update `signature_requests`: `status = 'signed'`, `signed_at`, `signer_ip`, `signed_pdf_path`.
6. Update `exception_logs`: `signed_path` = new path, `status` advances per the existing rule (signed document present → approval unblocked), `status_updated_by` stamped appropriately (this is a client action, not a manager profile — needs a distinct value, e.g. `'client_signature'`, rather than reusing `'מנהל מפעל'`/`'ראש צוות'`).
7. Confirmation screen: "תודה, האישור נשלח בהצלחה", terminal — no links back into `/manager` or `/home`.

### 3.4 Manager-side trigger (exception detail screen)

Replace "send via SignWell" with **"שלח לחתימה"**:

- **First send:** creates a `signature_requests` row, snapshotting `report_snapshot_hash`, returns a shareable link (clipboard copy and/or WhatsApp `wa.me` deep link, matching the existing WhatsApp-sharing pattern).
- **Re-send, confirmed rule:**
  - If the existing link is **still within its 7-day window** AND the exception's content **hasn't changed** since that link was created → reuse the same link/token, just resend it.
  - If the existing link is still within 7 days but the exception **was edited** since creation → the old token is marked `expired` and a **new** token is generated (the client must not be able to sign a stale version of the report).
  - If more than 7 days have passed since the original link was created → always generate a new token, regardless of whether content changed.
- Status display reads from `signature_requests` (not from any SignWell field): not sent / awaiting signature (with link age) / signed (with signed date).
- The manual signed-document upload fallback (physically-signed file uploaded directly) stays exactly as-is for cases where a client signs on paper — both paths converge on `exception_logs.signed_path`.

---

## 4. Cross-cutting behaviors

- **No new secrets needed for this feature** — signature capture and PDF stamping are both client-side (canvas + existing `pdfmake`). The kept serverless layer is not touched by this feature at all; it stays reserved for Twilio OTP.
- **No hard deletes** — superseded `signature_requests` rows are marked `expired`, never deleted.
- **RTL** — signing page follows existing Hebrew RTL layout; canvas itself is orientation-agnostic.
- **Audit trail parity with SignWell** — timestamp, IP, and explicit consent statement are captured and stamped into the PDF itself, so evidentiary basis doesn't regress from what SignWell provided.

---

## 5. Screens summary (new/changed)

| Screen | Change |
|---|---|
| Manager exception detail | "Send via SignWell" → "שלח לחתימה", with the conditional re-send logic in §3.4; status reads from `signature_requests` |
| `/sign/:token` (new) | Public, no-auth: summary, signature canvas, consent checkbox, submit |
| `/sign/:token` confirmation state | Terminal thank-you screen, no app navigation |

---

## 6. Data model changes

```sql
-- New
signature_requests(id, token, exception_id, status, report_snapshot_hash,
                    signed_at, signer_ip, signed_pdf_path, created_at, expires_at)

-- exception_logs.signwell_document_id: kept in schema, no longer written to
-- (drop deferred to prod-migration review — see D5)

-- Reused, unchanged
exception_logs.pdf_path
exception_logs.signed_path
exception_logs.status
exception_logs.status_updated_by
```

---

## 7. Conflicts & decisions — status

- **D1 — Extras vs. exceptions scope:** ✅ resolved. Same table, `exception_logs`; no separate flow needed.
- **D2 — Serverless layer fate:** ✅ resolved. Keep the layer (Twilio OTP is planned); remove only the SignWell-specific handler(s) inside it.
- **D3 — Link expiry window:** ✅ resolved. 7 days.
- **D4 — Re-send behavior:** ✅ resolved. Conditional — see §3.4 (reuse if unchanged & within window; new token if edited or expired).
- **D5 — SignWell historical data:** ✅ resolved. Any `exception_logs` row already signed via SignWell keeps its existing `signed_path` untouched — no backfill. `signwell_document_id` stays in the schema (nullable, unused going forward) as a historical marker of which rows went through SignWell — **not dropped in this migration.** Revisit before the production/Vercel deploy of this feature.

---

## 8. Out of scope

Migrating or re-signing documents already completed via SignWell; identity verification of the signer beyond the consent checkbox; changes to the `pending → sent → approved` state machine itself beyond how it gets populated; changes to the manual signed-document upload fallback's existing behavior; Twilio OTP implementation itself (separate PRD, Phase 1).
