import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { verifyEventHash, fetchCompletedPdf } from '../_lib/signwell.js'

const SIGNED_DOC_BUCKET = 'signed-approvals'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const body = req.body || {}
  const event = body.event || {}

  let validHash
  try {
    validHash = verifyEventHash({ eventType: event.type, eventTime: event.time, hash: event.hash })
  } catch (err) {
    console.error('signwell webhook hash check failed', err)
    res.status(401).json({ error: 'invalid_hash' })
    return
  }
  if (!validHash) {
    res.status(401).json({ error: 'invalid_hash' })
    return
  }

  // Anything other than a fully-completed document is out of scope here —
  // status changes for pending/sent/rejected are all driven from the app.
  if (event.type !== 'document_completed') {
    res.status(200).json({ ignored: event.type || null })
    return
  }

  const documentId = body.data?.object?.id
  if (!documentId) {
    res.status(200).json({ ignored: 'missing document id' })
    return
  }

  try {
    const supabase = supabaseAdmin()
    const { data: log, error: findErr } = await supabase
      .from('exception_logs')
      .select('id')
      .eq('signwell_document_id', documentId)
      .single()
    if (findErr || !log) {
      // Nothing on our side references this document — ack so SignWell
      // doesn't retry, there's nothing more we can do with it.
      res.status(200).json({ ignored: 'unknown document' })
      return
    }

    const pdfBytes = await fetchCompletedPdf(documentId)
    const path = `exceptions/${log.id}/signed-${randomUUID()}.pdf`
    const { error: upErr } = await supabase.storage
      .from(SIGNED_DOC_BUCKET)
      .upload(path, pdfBytes, { contentType: 'application/pdf' })
    if (upErr) throw upErr

    const { error: updErr } = await supabase
      .from('exception_logs')
      .update({ signed_path: path, status: 'approved', status_updated_by: 'חתימה דיגיטלית (SignWell)' })
      .eq('id', log.id)
    if (updErr) throw updErr

    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('signwell webhook processing failed', err)
    res.status(500).json({ error: 'processing_failed' })
  }
}
