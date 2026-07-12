import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Header from '../components/Header'
import StatusBadge from '../components/StatusBadge'
import PhotoGallery from '../components/PhotoGallery'
import {
  AlertIcon,
  SpinnerIcon,
  UsersIcon,
  CalendarIcon,
  DownloadIcon,
  UploadIcon,
  FileTextIcon,
  PencilIcon,
  SendIcon,
  CheckIcon,
  XIcon,
} from '../components/Icons'
import { supabase, signedDocUrl, SIGNED_DOC_BUCKET } from '../lib/supabase'
import { formatDate } from '../lib/format'
import { getProfile, PROFILES } from '../lib/profile'

export default function ManagerReport() {
  const { id } = useParams()
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  // Extras workflow state
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)
  const [extrasError, setExtrasError] = useState('')
  const [docUploading, setDocUploading] = useState(false)
  const [docError, setDocError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error: err } = await supabase
        .from('reports')
        .select(
          '*, projects(id, name, city, clients(id, name, contact_person, phone, email)), team_leads(name), report_photos(*)',
        )
        .eq('id', id)
        .single()
      if (cancelled) return
      if (err || !data) {
        setError('הדוח לא נמצא')
        return
      }
      setReport(data)
      setEditText(data.extras_edited ?? data.extras_description ?? '')
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  const workPhotos = report?.report_photos?.filter((p) => p.kind === 'work') || []
  const issuePhotos = report?.report_photos?.filter((p) => p.kind === 'issue') || []
  const hasExtra = !!(report?.extras_description || report?.extras_status)
  const isEdited =
    report && editText.trim() !== (report.extras_description || '').trim()
  const dirty =
    report && editText.trim() !== (report.extras_edited ?? report.extras_description ?? '').trim()

  async function saveExtraText() {
    if (!report || saving) return
    setSaving(true)
    setExtrasError('')
    setSavedMsg('')
    try {
      // Original team-lead text is preserved; edited version stored separately.
      const value = isEdited ? editText.trim() : null
      const { error: err } = await supabase
        .from('reports')
        .update({ extras_edited: value })
        .eq('id', report.id)
      if (err) throw err
      setReport((r) => ({ ...r, extras_edited: value }))
      setSavedMsg('הנוסח נשמר')
      setTimeout(() => setSavedMsg(''), 2500)
    } catch {
      setExtrasError('שמירת הנוסח נכשלה — נסו שוב')
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(status) {
    if (!report || statusBusy) return
    if (status === 'approved' && !report.extras_signed_path) {
      setExtrasError('יש להעלות את המסמך החתום מהלקוח לפני סימון כ״אושר״')
      return
    }
    setStatusBusy(true)
    setExtrasError('')
    try {
      const decidedBy = PROFILES[getProfile()] || 'לא ידוע'
      const { error: err } = await supabase
        .from('reports')
        .update({ extras_status: status, extras_decided_by: decidedBy })
        .eq('id', report.id)
      if (err) throw err
      setReport((r) => ({ ...r, extras_status: status, extras_decided_by: decidedBy }))
    } catch {
      setExtrasError('עדכון הסטטוס נכשל — נסו שוב')
    } finally {
      setStatusBusy(false)
    }
  }

  async function uploadSignedDoc(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !report || docUploading) return
    setDocUploading(true)
    setDocError('')
    try {
      const ext = file.name.split('.').pop() || 'pdf'
      const path = `reports/${report.id}/signed-${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(SIGNED_DOC_BUCKET)
        .upload(path, file, { contentType: file.type || 'application/pdf' })
      if (upErr) throw upErr
      const { error: updErr } = await supabase
        .from('reports')
        .update({ extras_signed_path: path })
        .eq('id', report.id)
      if (updErr) throw updErr
      setReport((r) => ({ ...r, extras_signed_path: path }))
    } catch {
      setDocError('העלאת המסמך נכשלה — נסו שוב')
    } finally {
      setDocUploading(false)
    }
  }

  async function downloadPdf() {
    if (!report) return
    const { generateExtrasPdf } = await import('../lib/pdf')
    generateExtrasPdf({ ...report, extras_edited: isEdited ? editText.trim() : null })
  }

  function statusActions() {
    const s = report.extras_status
    if (s === 'pending') {
      return (
        <button className="btn btn-outline flex-1" disabled={statusBusy} onClick={() => setStatus('sent')}>
          <SendIcon size={18} />
          סימון כ״נשלח ללקוח״
        </button>
      )
    }
    if (s === 'sent') {
      return (
        <>
          <button
            className="btn btn-success flex-1"
            disabled={statusBusy || !report.extras_signed_path}
            title={report.extras_signed_path ? '' : 'יש להעלות קודם את המסמך החתום מהלקוח'}
            onClick={() => setStatus('approved')}
          >
            <CheckIcon size={18} />
            אושר
          </button>
          <button className="btn btn-destructive flex-1" disabled={statusBusy} onClick={() => setStatus('rejected')}>
            <XIcon size={18} />
            נדחה
          </button>
        </>
      )
    }
    if (s === 'approved') {
      return (
        <>
          <button className="btn btn-destructive flex-1" disabled={statusBusy} onClick={() => setStatus('rejected')}>
            <XIcon size={18} />
            שינוי לנדחה
          </button>
          <button className="btn btn-outline flex-1" disabled={statusBusy} onClick={() => setStatus('sent')}>
            החזרה ל״נשלח ללקוח״
          </button>
        </>
      )
    }
    if (s === 'rejected') {
      return (
        <>
          <button
            className="btn btn-success flex-1"
            disabled={statusBusy || !report.extras_signed_path}
            title={report.extras_signed_path ? '' : 'יש להעלות קודם את המסמך החתום מהלקוח'}
            onClick={() => setStatus('approved')}
          >
            <CheckIcon size={18} />
            שינוי לאושר
          </button>
          <button className="btn btn-outline flex-1" disabled={statusBusy} onClick={() => setStatus('sent')}>
            החזרה ל״נשלח ללקוח״
          </button>
        </>
      )
    }
    return null
  }

  return (
    <div className="min-h-dvh">
      <Header backTo="/manager" title="פרטי דוח" />
      <main className="mx-auto max-w-3xl px-4 py-6">
        {error && (
          <div className="card border-destructive/40 bg-red-50 p-4 text-destructive font-medium">{error}</div>
        )}
        {!report && !error && (
          <div className="flex justify-center py-10 text-primary">
            <SpinnerIcon size={32} />
          </div>
        )}
        {report && (
          <div className="flex flex-col gap-5">
            {/* Summary */}
            <div className="card p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-xl font-black">{report.projects?.name}</h1>
                  <p className="text-sm text-primary mt-0.5">
                    לקוח: {report.projects?.clients?.name || '—'}
                    {report.projects?.city ? ` · ${report.projects.city}` : ''}
                  </p>
                </div>
                <StatusBadge status={report.extras_status} size="lg" />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-primary">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon size={16} />
                  {formatDate(report.report_date)}
                </span>
                <span>ראש צוות: {report.team_leads?.name}</span>
                <span className="inline-flex items-center gap-1.5">
                  <UsersIcon size={16} />
                  {report.workers_count} עובדים
                </span>
              </div>
            </div>

            {/* Work */}
            <section className="card p-5">
              <h2 className="font-bold mb-2">תיאור העבודה</h2>
              <p className="whitespace-pre-wrap leading-relaxed">{report.work_description}</p>
              {workPhotos.length > 0 && (
                <div className="mt-4">
                  <PhotoGallery photos={workPhotos} />
                </div>
              )}
            </section>

            {/* Issues */}
            <section className="card p-5">
              <h2 className="font-bold mb-2 flex items-center gap-2">
                בעיות שהתגלו
                {report.issues && <AlertIcon size={18} className="text-destructive" />}
              </h2>
              {report.issues ? (
                <p className="whitespace-pre-wrap leading-relaxed">{report.issues}</p>
              ) : (
                <p className="text-primary">לא התגלו בעיות</p>
              )}
              {issuePhotos.length > 0 && (
                <div className="mt-4">
                  <PhotoGallery photos={issuePhotos} />
                </div>
              )}
            </section>

            {/* Extras workflow */}
            {hasExtra && (
              <section className="card p-5 border-accent/40">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="font-bold text-lg flex items-center gap-2">
                    <PencilIcon size={18} className="text-accent" />
                    תוספת / חריגה לאישור
                  </h2>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={report.extras_status} size="lg" />
                  </div>
                </div>
                {report.extras_decided_by && (
                  <p className="text-xs text-primary mt-1">
                    עדכון אחרון על ידי: {report.extras_decided_by}
                  </p>
                )}

                {/* 1. Edit wording */}
                <div className="mt-4">
                  <label className="label" htmlFor="extra-edit">
                    נוסח התוספת (ניתן לעריכה — ייכנס ל־PDF)
                  </label>
                  <textarea
                    id="extra-edit"
                    className="input"
                    rows={4}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    disabled={saving}
                  />
                  {isEdited && (
                    <div className="mt-2 rounded-xl bg-muted p-3 text-sm">
                      <p className="font-bold text-primary mb-1">הנוסח המקורי של ראש הצוות:</p>
                      <p className="whitespace-pre-wrap text-primary">{report.extras_description}</p>
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      className="btn btn-outline"
                      onClick={saveExtraText}
                      disabled={saving || !dirty || !editText.trim()}
                    >
                      {saving ? <SpinnerIcon size={18} /> : <CheckIcon size={18} />}
                      שמירת נוסח
                    </button>
                    {savedMsg && <span className="text-success text-sm font-bold">{savedMsg}</span>}
                  </div>
                </div>

                {/* 2. PDF */}
                <div className="mt-5 border-t border-border pt-4">
                  <button className="btn btn-accent w-full sm:w-auto" onClick={downloadPdf}>
                    <DownloadIcon size={20} />
                    הפקת PDF לאישור הלקוח
                  </button>
                  <p className="text-xs text-primary mt-1.5">
                    הקובץ יורד למחשב — שלחו אותו ללקוח בוואטסאפ או במייל לחתימה
                  </p>
                </div>

                {/* 3. Signed doc */}
                <div className="mt-5 border-t border-border pt-4">
                  <p className="label">המסמך החתום מהלקוח</p>
                  {report.extras_signed_path ? (
                    <div className="flex items-center gap-3 flex-wrap">
                      <a
                        href={signedDocUrl(report.extras_signed_path)}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-outline"
                      >
                        <FileTextIcon size={18} />
                        צפייה במסמך החתום
                      </a>
                      <label className="btn btn-ghost text-sm cursor-pointer">
                        {docUploading ? <SpinnerIcon size={18} /> : <UploadIcon size={18} />}
                        החלפת קובץ
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          className="hidden"
                          onChange={uploadSignedDoc}
                          disabled={docUploading}
                        />
                      </label>
                    </div>
                  ) : (
                    <div>
                      <label className="btn btn-accent w-full sm:w-auto cursor-pointer">
                        {docUploading ? <SpinnerIcon size={18} /> : <UploadIcon size={18} />}
                        העלאת המסמך החתום
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          className="hidden"
                          onChange={uploadSignedDoc}
                          disabled={docUploading}
                        />
                      </label>
                      <p className="text-xs text-primary mt-1.5">
                        יש להעלות את הקובץ שחזר חתום מהלקוח לפני שניתן לסמן ״אושר״
                      </p>
                    </div>
                  )}
                  {docError && <p className="err">{docError}</p>}
                </div>

                {/* 4. Status */}
                <div className="mt-5 border-t border-border pt-4">
                  <p className="label">עדכון סטטוס</p>
                  <div className="flex gap-2 flex-wrap">{statusActions()}</div>
                  {extrasError && <p className="err">{extrasError}</p>}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
