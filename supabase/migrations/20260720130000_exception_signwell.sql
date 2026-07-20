-- SignWell e-signature integration for the Exceptions Log.
--
-- NOT YET APPLIED — apply to BOTH enbar-Webapp-dev (test) and enbar-prod.
-- Adds a single nullable column to track the SignWell document created for
-- an exception log's approval PDF, so the webhook (api/webhooks/signwell.js)
-- can match an incoming "document completed" event back to its report.
-- No changes to the existing status check constraint or status transitions.

alter table public.exception_logs
  add column signwell_document_id text;
