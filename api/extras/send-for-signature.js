import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { createSignwellDocument } from '../_lib/signwell.js'

const SELECT = '*, projects(name, city, contact_person, phone, email, clients(name))'

// SignWell requires a recipient email regardless of delivery channel — most
// project records here only have a phone on file (signing itself is shared
// via WhatsApp, not SignWell's own email). Placeholder per product decision
// until project records reliably carry a real client email.
const FALLBACK_RECIPIENT_EMAIL = 'office@enbarsteel.com'

// date_customer_site_Extra.pdf — the filename shown to the client in
// SignWell's UI (document title, signing page, completed-doc name). Uses
// today's date (the day the document is actually sent), not the log's
// original creation date.
function sanitizeForFilename(s) {
  return String(s || '').replace(/[\\/:*?"<>|]/g, '').trim()
}

function todayDDMMYYYY() {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const { exceptionId, pdfBase64, by } = req.body || {}
  if (!exceptionId || !pdfBase64) {
    res.status(400).json({ error: 'exceptionId and pdfBase64 are required' })
    return
  }

  try {
    const supabase = supabaseAdmin()
    const { data: log, error: loadErr } = await supabase
      .from('exception_logs')
      .select(SELECT)
      .eq('id', exceptionId)
      .single()
    if (loadErr || !log) {
      res.status(404).json({ error: 'exception log not found' })
      return
    }

    const project = log.projects || {}
    const client = project.clients || {}
    const recipientName = project.contact_person || client.name || 'לקוח'
    const recipientEmail = project.email || FALLBACK_RECIPIENT_EMAIL
    const base64 = String(pdfBase64).replace(/^data:application\/pdf;base64,/, '')

    const fileName = `${todayDDMMYYYY()}_${sanitizeForFilename(client.name) || 'לקוח'}_${sanitizeForFilename(project.name) || 'אתר'}_Extra.pdf`
    const doc = await createSignwellDocument({
      pdfBase64: base64,
      fileName,
      recipientName,
      recipientEmail,
    })

    const signingUrl = doc.recipients?.[0]?.signing_url
    if (!doc.id || !signingUrl) {
      throw new Error('SignWell response missing document id or signing_url')
    }

    const { error: updErr } = await supabase
      .from('exception_logs')
      .update({
        signwell_document_id: doc.id,
        status: 'sent',
        status_updated_by: by || null,
      })
      .eq('id', exceptionId)
    if (updErr) throw updErr

    res.status(200).json({ signingUrl, documentId: doc.id })
  } catch (err) {
    console.error('send-for-signature failed', err)
    res.status(500).json({ error: 'send_failed' })
  }
}
