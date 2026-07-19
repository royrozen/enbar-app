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
  PencilIcon,
} from '../components/Icons'
import { supabase, fetchActiveTeamLead, EXCEPTION_PHOTO_BUCKET } from '../lib/supabase'

const DRAFT_KEY = 'enbar_exception_draft'
const MAX_PHOTOS = 10

export function autoBillableDays(workers, workDays) {
  const w = Number(workers) || 0
  const d = Number(workDays) || 0
  return w * 0.5 * d
}

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {}
  } catch {
    return {}
  }
}

export default function ExceptionNew() {
  const nav = useNavigate()
  const draft = useMemo(loadDraft, [])

  const [clients, setClients] = useState(null)
  const [lead, setLead] = useState(null)
  const [loadError, setLoadError] = useState('')

  const [clientId, setClientId] = useState(draft.clientId || '')
  const [projectId, setProjectId] = useState(draft.projectId || '')
  const [workers, setWorkers] = useState(draft.workers || 1)
  const [workDays, setWorkDays] = useState(draft.workDays || 1)
  const [desc, setDesc] = useState(draft.desc || '')
  const [daysOverridden, setDaysOverridden] = useState(draft.daysOverridden || false)
  const [manualDays, setManualDays] = useState(draft.manualDays ?? '')
  const [photos, setPhotos] = useState([])

  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [done, setDone] = useState(null)

  const billableDays = daysOverridden ? manualDays : autoBillableDays(workers, workDays)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [{ data: cls, error: cErr }, activeLead] = await Promise.all([
          supabase
            .from('clients')
            .select('id, name, projects(id, name, city, is_active, deleted_at)')
            .eq('is_active', true)
            .is('deleted_at', null)
            .order('name'),
          fetchActiveTeamLead(),
        ])
        if (cancelled) return
        if (cErr) throw cErr
        setClients(
          (cls || []).map((c) => ({
            ...c,
            projects: (c.projects || []).filter((p) => p.is_active && !p.deleted_at),
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
      JSON.stringify({ clientId, projectId, workers, workDays, desc, daysOverridden, manualDays }),
    )
  }, [clientId, projectId, workers, workDays, desc, daysOverridden, manualDays, done])

  function stepWorkers(delta) {
    const w = Number(workers) || 0
    setWorkers(Math.min(50, Math.max(1, w + delta)))
  }

  function stepWorkDays(delta) {
    const d = Number(workDays) || 0
    setWorkDays(Math.min(99, Math.max(1, d + delta)))
  }

  function startOverride() {
    setManualDays(autoBillableDays(workers, workDays))
    setDaysOverridden(true)
  }

  function resetToAuto() {
    setDaysOverridden(false)
    setManualDays('')
  }

  function validate() {
    const errs = {}
    if (!clientId) errs.client = 'יש לבחור לקוח'
    else if (clientProjects.length === 0) errs.client = 'ללקוח זה אין פרויקט פעיל — פנו למנהל המפעל'
    else if (clientProjects.length > 1 && !projectId) errs.project = 'יש לבחור פרויקט עבור לקוח זה'
    const w = Number(workers)
    if (!Number.isInteger(w) || w < 1 || w > 50) errs.workers = 'מספר העובדים חייב להיות בין 1 ל־50'
    const d = Number(workDays)
    if (!Number.isInteger(d) || d < 1 || d > 99) errs.workDays = 'משך העבודה חייב להיות בין 1 ל־99 ימים'
    if (desc.trim().length < 5) errs.desc = 'יש להזין תיאור עבודה של 5 תווים לפחות'
    const b = Number(billableDays)
    if (!Number.isFinite(b) || b < 0.5 || b > 999) errs.days = 'כמות הימים לחיוב חייבת להיות בין 0.5 ל־999'
    return errs
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
      setProgress('שומר את היומן...')
      const { data: log, error } = await supabase
        .from('exception_logs')
        .insert({
          team_lead_id: lead.id,
          project_id: projectId,
          workers_count: Number(workers),
          work_days: Number(workDays),
          work_description: desc.trim(),
          billable_days: Number(billableDays),
          days_overridden: daysOverridden,
        })
        .select()
        .single()
      if (error) throw error

      let failed = 0
      for (let i = 0; i < photos.length; i++) {
        setProgress(`מעלה תמונה ${i + 1} מתוך ${photos.length}...`)
        try {
          const path = `exceptions/${log.id}/${crypto.randomUUID()}.jpg`
          const { error: upErr } = await supabase.storage
            .from(EXCEPTION_PHOTO_BUCKET)
            .upload(path, photos[i].file, { contentType: 'image/jpeg' })
          if (upErr) throw upErr
          const { error: rowErr } = await supabase
            .from('exception_photos')
            .insert({ exception_id: log.id, storage_path: path, sort_order: i })
          if (rowErr) throw rowErr
        } catch {
          failed++
        }
      }

      localStorage.removeItem(DRAFT_KEY)
      setDone({ id: log.id, failed, total: photos.length })
      window.scrollTo(0, 0)
    } catch {
      setSubmitError('שמירת היומן נכשלה — בדקו את חיבור האינטרנט ונסו שוב. מה שהקלדתם נשמר.')
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
          <h1 className="mt-5 text-3xl font-black">היומן נשמר ✓</h1>
          <p className="mt-2 text-primary">כעת ניתן להפיק את הדוח ולשלוח ללקוח לחתימה</p>
          {done.failed > 0 && (
            <p className="mt-4 card border-amber-300 bg-amber-50 p-3 text-amber-800 font-medium">
              שימו לב: {done.failed} מתוך {done.total} תמונות לא הועלו בגלל בעיית רשת
            </p>
          )}
          <div className="mt-10 flex flex-col gap-3">
            <Link to={`/exceptions/${done.id}`} className="btn btn-accent w-full !min-h-[56px]">
              להפקת הדוח ושליחה ללקוח
            </Link>
            <Link to="/home" className="btn btn-outline w-full">
              חזרה למסך הראשי
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-dvh pb-32">
      <Header backTo="/home" title="יומן חריגים" />
      <main className="mx-auto max-w-lg px-4 py-6">
        <h1 className="text-2xl font-black mb-5 sm:hidden">יומן חריגים</h1>

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

          {/* 1b. Project */}
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

          {/* 2. Workers */}
          <div data-error={!!errors.workers}>
            <span className="label">
              מספר עובדים <span className="text-destructive">*</span>
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

          {/* 3. Work duration */}
          <div data-error={!!errors.workDays}>
            <span className="label">
              משך העבודה (ימים) <span className="text-destructive">*</span>
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => stepWorkDays(-1)}
                disabled={submitting || Number(workDays) <= 1}
                aria-label="הפחתת יום"
                className="btn btn-outline !min-h-[56px] !w-14 !px-0 !text-2xl shrink-0"
              >
                <MinusIcon size={26} />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                className="input text-center !text-2xl font-black !min-h-[56px]"
                value={workDays}
                onChange={(e) => setWorkDays(e.target.value)}
                aria-invalid={!!errors.workDays}
                aria-label="משך העבודה בימים"
                disabled={submitting}
              />
              <button
                type="button"
                onClick={() => stepWorkDays(1)}
                disabled={submitting || Number(workDays) >= 99}
                aria-label="הוספת יום"
                className="btn btn-outline !min-h-[56px] !w-14 !px-0 !text-2xl shrink-0"
              >
                <PlusIcon size={26} />
              </button>
            </div>
            {errors.workDays && <p className="err">{errors.workDays}</p>}
          </div>

          {/* 4. Description */}
          <div data-error={!!errors.desc}>
            <label htmlFor="desc" className="label">
              תיאור העבודה הנדרשת <span className="text-destructive">*</span>
            </label>
            <textarea
              id="desc"
              className="input"
              rows={4}
              placeholder="תיאור הפער בין מה שסוכם בחוזה לבין המצב בשטח והעבודה הנדרשת..."
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              aria-invalid={!!errors.desc}
              disabled={submitting}
            />
            {errors.desc && <p className="err">{errors.desc}</p>}
          </div>

          {/* 5. Billable days (calculated) */}
          <div data-error={!!errors.days} className="card p-4 border-accent/40">
            <div className="flex items-center justify-between gap-3">
              <span className="label !mb-0">
                כמות ימים לחיוב <span className="text-destructive">*</span>
              </span>
              {daysOverridden ? (
                <button
                  type="button"
                  className="btn btn-ghost text-sm !min-h-[36px]"
                  onClick={resetToAuto}
                  disabled={submitting}
                >
                  חישוב אוטומטי
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost text-sm !min-h-[36px]"
                  onClick={startOverride}
                  disabled={submitting}
                >
                  <PencilIcon size={14} />
                  עריכה ידנית
                </button>
              )}
            </div>
            {daysOverridden ? (
              <>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0.5}
                  max={999}
                  step={0.5}
                  className="input text-center !text-2xl font-black !min-h-[56px] mt-2"
                  value={manualDays}
                  onChange={(e) => setManualDays(e.target.value)}
                  aria-invalid={!!errors.days}
                  aria-label="כמות ימים לחיוב"
                  disabled={submitting}
                />
                <p className="mt-1.5 text-xs text-amber-800 font-medium">הוזן ידנית — הנוסחה האוטומטית מושבתת</p>
              </>
            ) : (
              <>
                <p className="text-3xl font-black text-accent mt-2 text-center">{billableDays}</p>
                <p className="mt-1.5 text-xs text-primary text-center">
                  חישוב אוטומטי: {workers} עובדים × חצי יום × {workDays} ימים
                </p>
              </>
            )}
            {errors.days && <p className="err">{errors.days}</p>}
          </div>

          {/* 6. Photos */}
          <PhotoUploader
            label="תמונות מהשטח"
            hint={`עד ${MAX_PHOTOS} תמונות — נדחסות אוטומטית`}
            photos={photos}
            onChange={setPhotos}
            remaining={MAX_PHOTOS - photos.length}
            disabled={submitting}
          />
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
                {progress || 'שומר...'}
              </>
            ) : (
              'שמירת היומן'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
