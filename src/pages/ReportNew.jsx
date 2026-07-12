import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import PhotoUploader from '../components/PhotoUploader'
import {
  PlusIcon,
  MinusIcon,
  CheckCircleIcon,
  SpinnerIcon,
  AlertIcon,
} from '../components/Icons'
import { supabase, fetchActiveTeamLead, PHOTO_BUCKET } from '../lib/supabase'
import { todayISO } from '../lib/format'

const DRAFT_KEY = 'enbar_report_draft'
const MAX_PHOTOS = 10

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {}
  } catch {
    return {}
  }
}

export default function ReportNew() {
  const nav = useNavigate()
  const draft = useMemo(loadDraft, [])

  const [clients, setClients] = useState(null)
  const [lead, setLead] = useState(null)
  const [loadError, setLoadError] = useState('')

  const [clientId, setClientId] = useState(draft.clientId || '')
  const [projectId, setProjectId] = useState(draft.projectId || '')
  const [date, setDate] = useState(draft.date && draft.date <= todayISO() ? draft.date : todayISO())
  const [desc, setDesc] = useState(draft.desc || '')
  const [workers, setWorkers] = useState(draft.workers || 1)
  const [issues, setIssues] = useState(draft.issues || '')
  const [extras, setExtras] = useState(draft.extras || '')
  const [workPhotos, setWorkPhotos] = useState([])
  const [issuePhotos, setIssuePhotos] = useState([])

  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [done, setDone] = useState(null)

  const totalPhotos = workPhotos.length + issuePhotos.length
  const remaining = MAX_PHOTOS - totalPhotos

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [{ data: cls, error: cErr }, activeLead] = await Promise.all([
          supabase
            .from('clients')
            .select('id, name, projects(id, name, city, is_active)')
            .eq('is_active', true)
            .order('name'),
          fetchActiveTeamLead(),
        ])
        if (cancelled) return
        if (cErr) throw cErr
        setClients(
          (cls || []).map((c) => ({
            ...c,
            projects: (c.projects || []).filter((p) => p.is_active),
          })),
        )
        setLead(activeLead)
        if (!activeLead) setLoadError('לא נמצא ראש צוות פעיל במערכת — פנו למנהל המפעל')
      } catch {
        if (!cancelled) {
          setClients([])
          setLoadError('טעינת הנתונים נכשלה — בדקו את חיבור האינטרנט ורעננו את הדף')
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedClient = (clients || []).find((c) => c.id === clientId) || null
  const clientProjects = selectedClient?.projects || []

  // A client with exactly one active project is resolved automatically; with
  // more than one the team lead must pick which project the report is for.
  useEffect(() => {
    if (clientProjects.length === 1) {
      setProjectId(clientProjects[0].id)
    } else if (!clientProjects.some((p) => p.id === projectId)) {
      setProjectId('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, clients])

  // Draft auto-save (text only, not photos)
  useEffect(() => {
    if (done) return
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ clientId, projectId, date, desc, workers, issues, extras }),
    )
  }, [clientId, projectId, date, desc, workers, issues, extras, done])

  function validate() {
    const errs = {}
    if (!clientId) errs.client = 'יש לבחור לקוח'
    else if (clientProjects.length === 0) errs.client = 'ללקוח זה אין פרויקט פעיל — פנו למנהל המפעל'
    else if (clientProjects.length > 1 && !projectId) errs.project = 'יש לבחור פרויקט עבור לקוח זה'
    if (!date) errs.date = 'יש לבחור תאריך'
    else if (date > todayISO()) errs.date = 'לא ניתן לדווח על תאריך עתידי'
    if (desc.trim().length < 5) errs.desc = 'יש להזין תיאור עבודה של 5 תווים לפחות'
    const w = Number(workers)
    if (!Number.isInteger(w) || w < 1 || w > 50) errs.workers = 'מספר העובדים חייב להיות בין 1 ל־50'
    return errs
  }

  function stepWorkers(delta) {
    const w = Number(workers) || 0
    setWorkers(Math.min(50, Math.max(1, w + delta)))
  }

  async function submit(e) {
    e.preventDefault()
    if (submitting) return
    setSubmitError('')
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length) {
      document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (!lead) {
      setSubmitError('לא נמצא ראש צוות פעיל במערכת')
      return
    }

    setSubmitting(true)
    try {
      setProgress('שומר את הדוח...')
      const extrasText = extras.trim()
      const { data: report, error } = await supabase
        .from('reports')
        .insert({
          team_lead_id: lead.id,
          project_id: projectId,
          report_date: date,
          work_description: desc.trim(),
          workers_count: Number(workers),
          issues: issues.trim() || null,
          extras_description: extrasText || null,
          extras_status: extrasText ? 'pending' : null,
        })
        .select()
        .single()
      if (error) throw error

      const allPhotos = [
        ...workPhotos.map((p) => ({ ...p, kind: 'work' })),
        ...issuePhotos.map((p) => ({ ...p, kind: 'issue' })),
      ]
      let failed = 0
      for (let i = 0; i < allPhotos.length; i++) {
        setProgress(`מעלה תמונה ${i + 1} מתוך ${allPhotos.length}...`)
        const p = allPhotos[i]
        try {
          const path = `reports/${report.id}/${crypto.randomUUID()}.jpg`
          const { error: upErr } = await supabase.storage
            .from(PHOTO_BUCKET)
            .upload(path, p.file, { contentType: 'image/jpeg' })
          if (upErr) throw upErr
          const { error: rowErr } = await supabase
            .from('report_photos')
            .insert({ report_id: report.id, storage_path: path, kind: p.kind, sort_order: i })
          if (rowErr) throw rowErr
        } catch {
          failed++
        }
      }

      localStorage.removeItem(DRAFT_KEY)
      setDone({ failed, total: allPhotos.length })
      window.scrollTo(0, 0)
    } catch {
      setSubmitError('שליחת הדוח נכשלה — בדקו את חיבור האינטרנט ונסו שוב. מה שהקלדתם נשמר.')
    } finally {
      setSubmitting(false)
      setProgress('')
    }
  }

  if (done) {
    return (
      <div className="min-h-dvh">
        <Header />
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <CheckCircleIcon size={72} className="mx-auto text-success" />
          <h1 className="mt-5 text-3xl font-black">הדוח נשלח ✓</h1>
          <p className="mt-2 text-primary">הדוח מופיע כעת אצל המנהל</p>
          {done.failed > 0 && (
            <p className="mt-4 card border-amber-300 bg-amber-50 p-3 text-amber-800 font-medium">
              שימו לב: {done.failed} מתוך {done.total} תמונות לא הועלו בגלל בעיית רשת
            </p>
          )}
          <div className="mt-10 flex flex-col gap-3">
            <Link to="/home" className="btn btn-accent w-full !min-h-[56px]">
              חזרה למסך הראשי
            </Link>
            <button className="btn btn-outline w-full" onClick={() => nav(0)}>
              דוח חדש נוסף
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-dvh pb-32">
      <Header backTo="/home" title="דוח עבודה יומי" />
      <main className="mx-auto max-w-lg px-4 py-6">
        <h1 className="text-2xl font-black mb-5 sm:hidden">דוח עבודה יומי</h1>

        {loadError && (
          <div className="card border-destructive/40 bg-red-50 p-4 mb-5 text-destructive font-medium flex items-start gap-2">
            <AlertIcon size={20} className="shrink-0 mt-0.5" />
            {loadError}
          </div>
        )}

        {clients !== null && clients.length === 0 && !loadError && (
          <div className="card border-amber-300 bg-amber-50 p-4 mb-5 text-amber-800 font-medium">
            אין לקוחות פעילים במערכת — פנו למנהל המפעל להוספת לקוח
          </div>
        )}

        <form onSubmit={submit} noValidate className="flex flex-col gap-6">
          {/* 1. Client */}
          <div data-error={!!errors.client}>
            <label htmlFor="client" className="label">
              לקוח <span className="text-destructive">*</span>
            </label>
            <select
              id="client"
              className="input"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              aria-invalid={!!errors.client}
              disabled={submitting}
            >
              <option value="">בחרו לקוח...</option>
              {(clients || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.client && <p className="err">{errors.client}</p>}
          </div>

          {/* 1b. Project — only shown when the client has more than one active project */}
          {clientProjects.length > 1 && (
            <div data-error={!!errors.project}>
              <label htmlFor="project" className="label">
                פרויקט <span className="text-destructive">*</span>
              </label>
              <select
                id="project"
                className="input"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                aria-invalid={!!errors.project}
                disabled={submitting}
              >
                <option value="">בחרו פרויקט...</option>
                {clientProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.city ? ` — ${p.city}` : ''}
                  </option>
                ))}
              </select>
              {errors.project && <p className="err">{errors.project}</p>}
            </div>
          )}

          {/* 2. Date */}
          <div data-error={!!errors.date}>
            <label htmlFor="date" className="label">
              תאריך <span className="text-destructive">*</span>
            </label>
            <input
              id="date"
              type="date"
              className="input"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={!!errors.date}
              disabled={submitting}
            />
            {errors.date && <p className="err">{errors.date}</p>}
          </div>

          {/* 3. Work description */}
          <div data-error={!!errors.desc}>
            <label htmlFor="desc" className="label">
              תיאור העבודה שבוצעה <span className="text-destructive">*</span>
            </label>
            <textarea
              id="desc"
              className="input"
              rows={4}
              placeholder="למשל: הותקנו 12 מטר תעלה בקומה 3, חיבור למפוח ראשי..."
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              aria-invalid={!!errors.desc}
              disabled={submitting}
            />
            {errors.desc && <p className="err">{errors.desc}</p>}
          </div>

          {/* 4. Workers count */}
          <div data-error={!!errors.workers}>
            <span className="label">
              כמה עובדים היו באתר? <span className="text-destructive">*</span>
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => stepWorkers(-1)}
                disabled={submitting || Number(workers) <= 1}
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
                disabled={submitting}
              />
              <button
                type="button"
                onClick={() => stepWorkers(1)}
                disabled={submitting || Number(workers) >= 50}
                aria-label="הוספת עובד"
                className="btn btn-outline !min-h-[56px] !w-14 !px-0 !text-2xl shrink-0"
              >
                <PlusIcon size={26} />
              </button>
            </div>
            {errors.workers && <p className="err">{errors.workers}</p>}
          </div>

          {/* 5. Work photos */}
          <PhotoUploader
            label="תמונות מהשטח"
            hint={`עד ${MAX_PHOTOS} תמונות בדוח (נשארו ${remaining}) — התמונות נדחסות אוטומטית`}
            photos={workPhotos}
            onChange={setWorkPhotos}
            remaining={remaining}
            disabled={submitting}
          />

          {/* 6. Issues + issue photos */}
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
                disabled={submitting}
              />
            </div>
            <PhotoUploader
              label="תמונות של הבעיות"
              photos={issuePhotos}
              onChange={setIssuePhotos}
              remaining={remaining}
              disabled={submitting}
            />
          </div>

          {/* 7. Extras */}
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
              disabled={submitting}
            />
            <p className="mt-1.5 text-xs text-primary">
              אם מולא — התוספת תסומן כ״ממתין״ ותופיע למנהל לאישור מול הלקוח
            </p>
          </div>
        </form>
      </main>

      {/* Sticky submit */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-lg">
          {submitError && (
            <p className="err !mt-0 mb-2 text-center font-bold">{submitError}</p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={submitting || (clients !== null && clients.length === 0)}
            className="btn btn-accent w-full !min-h-[60px] !text-xl !rounded-2xl"
          >
            {submitting ? (
              <>
                <SpinnerIcon size={24} />
                {progress || 'שולח...'}
              </>
            ) : (
              'שליחת הדוח'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
