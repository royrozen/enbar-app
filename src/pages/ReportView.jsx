import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Header from '../components/Header'
import StatusBadge from '../components/StatusBadge'
import PhotoGallery from '../components/PhotoGallery'
import PhotoUploader from '../components/PhotoUploader'
import {
  AlertIcon,
  SpinnerIcon,
  UsersIcon,
  CalendarIcon,
  PencilIcon,
  PlusIcon,
  MinusIcon,
} from '../components/Icons'
import { supabase, PHOTO_BUCKET } from '../lib/supabase'
import { formatDate, isToday } from '../lib/format'

const MAX_PHOTOS = 10
const SELECT = '*, projects(name, city, clients(name)), team_leads(name), report_photos(*)'

export default function ReportView() {
  const { id } = useParams()
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  const [editing, setEditing] = useState(false)
  const [desc, setDesc] = useState('')
  const [workers, setWorkers] = useState(1)
  const [issues, setIssues] = useState('')
  const [extras, setExtras] = useState('')
  const [newWorkPhotos, setNewWorkPhotos] = useState([])
  const [newIssuePhotos, setNewIssuePhotos] = useState([])
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveWarning, setSaveWarning] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error: err } = await supabase.from('reports').select(SELECT).eq('id', id).single()
      if (cancelled) return
      if (err || !data) setError('הדוח לא נמצא')
      else setReport(data)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  const workPhotos = report?.report_photos?.filter((p) => p.kind === 'work') || []
  const issuePhotos = report?.report_photos?.filter((p) => p.kind === 'issue') || []
  const editable = report ? isToday(report.created_at) : false

  const totalPhotos = workPhotos.length + issuePhotos.length + newWorkPhotos.length + newIssuePhotos.length
  const remaining = MAX_PHOTOS - totalPhotos

  function startEdit() {
    setDesc(report.work_description)
    setWorkers(report.workers_count)
    setIssues(report.issues || '')
    setExtras(report.extras_description || '')
    setNewWorkPhotos([])
    setNewIssuePhotos([])
    setErrors({})
    setSaveError('')
    setSaveWarning('')
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
  }

  function stepWorkers(delta) {
    const w = Number(workers) || 0
    setWorkers(Math.min(50, Math.max(1, w + delta)))
  }

  function validate() {
    const errs = {}
    if (desc.trim().length < 5) errs.desc = 'יש להזין תיאור עבודה של 5 תווים לפחות'
    const w = Number(workers)
    if (!Number.isInteger(w) || w < 1 || w > 50) errs.workers = 'מספר העובדים חייב להיות בין 1 ל־50'
    return errs
  }

  async function save() {
    if (saving) return
    setSaveError('')
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length) {
      document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setSaving(true)
    try {
      const extrasText = extras.trim()
      const patch = {
        work_description: desc.trim(),
        workers_count: Number(workers),
        issues: issues.trim() || null,
        extras_description: extrasText || null,
        extras_status: extrasText ? report.extras_status || 'pending' : null,
      }
      const { error: updErr } = await supabase.from('reports').update(patch).eq('id', report.id)
      if (updErr) throw updErr

      const newPhotos = [
        ...newWorkPhotos.map((p) => ({ ...p, kind: 'work' })),
        ...newIssuePhotos.map((p) => ({ ...p, kind: 'issue' })),
      ]
      const existingPhotos = report.report_photos || []
      const startSort = existingPhotos.length
        ? Math.max(...existingPhotos.map((p) => p.sort_order ?? 0)) + 1
        : 0
      let failed = 0
      for (let i = 0; i < newPhotos.length; i++) {
        const p = newPhotos[i]
        try {
          const path = `reports/${report.id}/${crypto.randomUUID()}.jpg`
          const { error: upErr } = await supabase.storage
            .from(PHOTO_BUCKET)
            .upload(path, p.file, { contentType: 'image/jpeg' })
          if (upErr) throw upErr
          const { error: rowErr } = await supabase
            .from('report_photos')
            .insert({ report_id: report.id, storage_path: path, kind: p.kind, sort_order: startSort + i })
          if (rowErr) throw rowErr
        } catch {
          failed++
        }
      }
      if (failed > 0) setSaveWarning(`שימו לב: ${failed} מתוך ${newPhotos.length} תמונות לא הועלו בגלל בעיית רשת`)

      const { data: refreshed } = await supabase.from('reports').select(SELECT).eq('id', report.id).single()
      if (refreshed) setReport(refreshed)
      setEditing(false)
    } catch {
      setSaveError('שמירת השינויים נכשלה — בדקו את חיבור האינטרנט ונסו שוב')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-dvh pb-32">
      <Header backTo="/home" title={editing ? 'עריכת דוח' : 'צפייה בדוח'} />
      <main className="mx-auto max-w-lg px-4 py-6">
        {error && (
          <div className="card border-destructive/40 bg-red-50 p-4 text-destructive font-medium">{error}</div>
        )}
        {!report && !error && (
          <div className="flex justify-center py-10 text-primary">
            <SpinnerIcon size={32} />
          </div>
        )}
        {report && !editing && (
          <div className="flex flex-col gap-5">
            <div className="card p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <h1 className="text-xl font-black">{report.projects?.name}</h1>
                {editable && (
                  <button type="button" onClick={startEdit} className="btn btn-outline !min-h-[40px] text-sm">
                    <PencilIcon size={16} />
                    עריכה
                  </button>
                )}
              </div>
              {report.projects?.clients?.name && (
                <p className="text-sm text-primary mt-0.5">לקוח: {report.projects.clients.name}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-primary">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon size={16} />
                  {formatDate(report.report_date)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <UsersIcon size={16} />
                  {report.workers_count} עובדים
                </span>
              </div>
            </div>

            <section className="card p-5">
              <h2 className="font-bold mb-2">תיאור העבודה</h2>
              <p className="whitespace-pre-wrap leading-relaxed">{report.work_description}</p>
              {workPhotos.length > 0 && (
                <div className="mt-4">
                  <PhotoGallery photos={workPhotos} />
                </div>
              )}
            </section>

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

            {report.extras_description && (
              <section className="card p-5 border-amber-200">
                <h2 className="font-bold mb-2 flex items-center justify-between">
                  תוספת / חריגה לאישור
                  <StatusBadge status={report.extras_status} />
                </h2>
                <p className="whitespace-pre-wrap leading-relaxed">{report.extras_description}</p>
              </section>
            )}
          </div>
        )}

        {report && editing && (
          <div className="flex flex-col gap-6">
            <div data-error={!!errors.desc}>
              <label htmlFor="desc" className="label">
                תיאור העבודה שבוצעה <span className="text-destructive">*</span>
              </label>
              <textarea
                id="desc"
                className="input"
                rows={4}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                aria-invalid={!!errors.desc}
                disabled={saving}
              />
              {errors.desc && <p className="err">{errors.desc}</p>}
            </div>

            <div data-error={!!errors.workers}>
              <span className="label">
                כמה עובדים היו באתר? <span className="text-destructive">*</span>
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => stepWorkers(-1)}
                  disabled={saving || Number(workers) <= 1}
                  aria-label="הפחתת עובד"
                  className="btn btn-outline !min-h-[56px] !w-14 !px-0 !text-2xl shrink-0"
                >
                  <MinusIcon size={26} />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  className="input text-center !text-2xl font-black !min-h-[56px]"
                  value={workers}
                  onChange={(e) => setWorkers(e.target.value)}
                  aria-invalid={!!errors.workers}
                  aria-label="מספר עובדים"
                  disabled={saving}
                />
                <button
                  type="button"
                  onClick={() => stepWorkers(1)}
                  disabled={saving || Number(workers) >= 50}
                  aria-label="הוספת עובד"
                  className="btn btn-outline !min-h-[56px] !w-14 !px-0 !text-2xl shrink-0"
                >
                  <PlusIcon size={26} />
                </button>
              </div>
              {errors.workers && <p className="err">{errors.workers}</p>}
            </div>

            {workPhotos.length > 0 && (
              <div>
                <span className="label">תמונות קיימות</span>
                <PhotoGallery photos={workPhotos} />
                <p className="mt-1.5 text-xs text-primary">אי אפשר להסיר תמונות קיימות בשלב זה — ניתן רק להוסיף</p>
              </div>
            )}
            <PhotoUploader
              label="הוספת תמונות מהשטח"
              hint={`נשארו ${remaining} מתוך ${MAX_PHOTOS} תמונות אפשריות`}
              photos={newWorkPhotos}
              onChange={setNewWorkPhotos}
              remaining={remaining}
              disabled={saving}
            />

            <div className="card p-4 flex flex-col gap-4 border-amber-200">
              <div>
                <label htmlFor="issues" className="label">
                  בעיות שהתגלו באתר
                </label>
                <textarea
                  id="issues"
                  className="input"
                  rows={3}
                  placeholder="ריק = לא התגלו בעיות"
                  value={issues}
                  onChange={(e) => setIssues(e.target.value)}
                  disabled={saving}
                />
              </div>
              {issuePhotos.length > 0 && (
                <div>
                  <span className="label">תמונות קיימות</span>
                  <PhotoGallery photos={issuePhotos} />
                </div>
              )}
              <PhotoUploader
                label="הוספת תמונות של הבעיה"
                photos={newIssuePhotos}
                onChange={setNewIssuePhotos}
                remaining={remaining}
                disabled={saving}
              />
            </div>

            <div>
              <label htmlFor="extras" className="label">
                תוספת / חריגה לאישור
              </label>
              <textarea
                id="extras"
                className="input"
                rows={3}
                placeholder="עבודה מעבר להזמנה שדורשת אישור לקוח — למשל: פתח נוסף בקיר..."
                value={extras}
                onChange={(e) => setExtras(e.target.value)}
                disabled={saving}
              />
              <p className="mt-1.5 text-xs text-primary">
                אם מולא — התוספת תסומן כ״ממתין״ ותופיע למנהל לאישור מול הלקוח
              </p>
            </div>
          </div>
        )}
      </main>

      {report && editing && (
        <div className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-lg flex flex-col gap-2">
            {saveError && <p className="err !mt-0 text-center font-bold">{saveError}</p>}
            {saveWarning && (
              <p className="text-center text-sm font-medium text-amber-800">{saveWarning}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="btn btn-outline flex-1 !min-h-[56px]"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="btn btn-accent flex-[2] !min-h-[56px] !text-lg"
              >
                {saving ? <SpinnerIcon size={22} /> : 'שמירה'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
