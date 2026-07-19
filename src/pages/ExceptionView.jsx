import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Header from '../components/Header'
import StatusBadge from '../components/StatusBadge'
import PhotoUploader from '../components/PhotoUploader'
import Lightbox from '../components/Lightbox'
import {
  SpinnerIcon,
  CalendarIcon,
  UsersIcon,
  AlertIcon,
  PencilIcon,
  PlusIcon,
  MinusIcon,
  DownloadIcon,
  UploadIcon,
  FileTextIcon,
  SendIcon,
} from '../components/Icons'
import {
  supabase,
  exceptionPhotoUrl,
  signedDocUrl,
  EXCEPTION_PHOTO_BUCKET,
  EXCEPTION_DOC_BUCKET,
  SIGNED_DOC_BUCKET,
} from '../lib/supabase'
import { formatDate } from '../lib/format'
import { getProfile, PROFILES } from '../lib/profile'
import { autoBillableDays } from './ExceptionNew'

const MAX_PHOTOS = 10
const SELECT = '*, projects(name, city, contact_person, phone, email, clients(name)), team_leads(name), exception_photos(*)'

// backTo differs per area; the component itself is identical for both profiles.
export default function ExceptionView({ backTo = '/home' }) {
  const { id } = useParams()
  const [log, setLog] = useState(null)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState(null)

  // Edit state
  const [editing, setEditing] = useState(false)
  const [workers, setWorkers] = useState(1)
  const [workDays, setWorkDays] = useState(1)
  const [desc, setDesc] = useState('')
  const [daysOverridden, setDaysOverridden] = useState(false)
  const [manualDays, setManualDays] = useState('')
  const [newPhotos, setNewPhotos] = useState([])
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveWarning, setSaveWarning] = useState('')

  // PDF / share / signed / status state
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [sharePrompt, setSharePrompt] = useState(false)
  const [sharePhone, setSharePhone] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [docUploading, setDocUploading] = useState(false)
  const [docError, setDocError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error: err } = await supabase.from('exception_logs').select(SELECT).eq('id', id).single()
      if (cancelled) return
      if (err || !data) setError('היומן לא נמצא')
      else setLog(data)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  const locked = log?.status === 'approved'
  const photos = [...(log?.exception_photos || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const days = log ? Number(log.billable_days) : 0
  const daysText = days % 1 === 0 ? String(days) : days.toFixed(1)
  const billableDaysEdit = daysOverridden ? manualDays : autoBillableDays(workers, workDays)

  async function refresh() {
    const { data } = await supabase.from('exception_logs').select(SELECT).eq('id', id).single()
    if (data) setLog(data)
  }

  function startEdit() {
    setWorkers(log.workers_count)
    setWorkDays(log.work_days)
    setDesc(log.work_description)
    setDaysOverridden(log.days_overridden)
    setManualDays(log.days_overridden ? Number(log.billable_days) : '')
    setNewPhotos([])
    setErrors({})
    setSaveError('')
    setSaveWarning('')
    setEditing(true)
  }

  function validate() {
    const errs = {}
    const w = Number(workers)
    if (!Number.isInteger(w) || w < 1 || w > 50) errs.workers = 'מספר העובדים חייב להיות בין 1 ל־50'
    const d = Number(workDays)
    if (!Number.isInteger(d) || d < 1 || d > 99) errs.workDays = 'משך העבודה חייב להיות בין 1 ל־99 ימים'
    if (desc.trim().length < 5) errs.desc = 'יש להזין תיאור עבודה של 5 תווים לפחות'
    const b = Number(billableDaysEdit)
    if (!Number.isFinite(b) || b < 0.5 || b > 999) errs.days = 'כמות הימים לחיוב חייבת להיות בין 0.5 ל־999'
    return errs
  }

  async function save() {
    if (saving) return
    setSaveError('')
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    try {
      const { error: updErr } = await supabase
        .from('exception_logs')
        .update({
          workers_count: Number(workers),
          work_days: Number(workDays),
          work_description: desc.trim(),
          billable_days: Number(billableDaysEdit),
          days_overridden: daysOverridden,
        })
        .eq('id', log.id)
      if (updErr) throw updErr

      const startSort = photos.length
      let failed = 0
      for (let i = 0; i < newPhotos.length; i++) {
        try {
          const path = `exceptions/${log.id}/${crypto.randomUUID()}.jpg`
          const { error: upErr } = await supabase.storage
            .from(EXCEPTION_PHOTO_BUCKET)
            .upload(path, newPhotos[i].file, { contentType: 'image/jpeg' })
          if (upErr) throw upErr
          const { error: rowErr } = await supabase
            .from('exception_photos')
            .insert({ exception_id: log.id, storage_path: path, sort_order: startSort + i })
          if (rowErr) throw rowErr
        } catch {
          failed++
        }
      }
      if (failed > 0) setSaveWarning(`שימו לב: ${failed} מתוך ${newPhotos.length} תמונות לא הועלו`)

      await refresh()
      setEditing(false)
    } catch {
      setSaveError('שמירת השינויים נכשלה — נסו שוב')
    } finally {
      setSaving(false)
    }
  }

  async function generatePdf() {
    if (!log || pdfBusy) return
    setPdfBusy(true)
    setPdfError('')
    try {
      const { generateExceptionPdf } = await import('../lib/pdf')
      const blob = await generateExceptionPdf(log)
      const path = `exceptions/${log.id}/${crypto.randomUUID()}.pdf`
      const { error: upErr } = await supabase.storage
        .from(EXCEPTION_DOC_BUCKET)
        .upload(path, blob, { contentType: 'application/pdf' })
      if (upErr) throw upErr
      const { error: updErr } = await supabase
        .from('exception_logs')
        .update({ pdf_path: path })
        .eq('id', log.id)
      if (updErr) throw updErr
      setLog((l) => ({ ...l, pdf_path: path }))
    } catch {
      setPdfError('הפקת הדוח נכשלה — נסו שוב')
    } finally {
      setPdfBusy(false)
    }
  }

  function openSharePrompt() {
    setSharePhone(log.projects?.phone || '')
    setSharePrompt(true)
  }

  function shareWhatsApp() {
    const url = exceptionDocPublicUrl()
    const text = encodeURIComponent(
      `שלום, מצורף דוח חריגים ותוספות מענבר תעשיות פח לאישורכם. נא לחתום ולהחזיר:\n${url}`,
    )
    const phone = sharePhone.replace(/[^\d]/g, '').replace(/^0/, '972')
    const wa = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`
    window.open(wa, '_blank')
    setSharePrompt(false)
  }

  function exceptionDocPublicUrl() {
    return supabase.storage.from(EXCEPTION_DOC_BUCKET).getPublicUrl(log.pdf_path).data.publicUrl
  }

  async function shareFile() {
    try {
      const res = await fetch(exceptionDocPublicUrl())
      const blob = await res.blob()
      const file = new File([blob], 'enbar-exception.pdf', { type: 'application/pdf' })
      await navigator.share({ files: [file], title: 'דוח חריגים ותוספות' })
    } catch {
      /* user cancelled or unsupported — no-op */
    }
    setSharePrompt(false)
  }

  async function markSent() {
    if (statusBusy) return
    setStatusBusy(true)
    setStatusError('')
    try {
      const by = PROFILES[getProfile()] || 'לא ידוע'
      const { error: err } = await supabase
        .from('exception_logs')
        .update({ status: 'sent', status_updated_by: by })
        .eq('id', log.id)
      if (err) throw err
      setLog((l) => ({ ...l, status: 'sent', status_updated_by: by }))
    } catch {
      setStatusError('עדכון הסטטוס נכשל — נסו שוב')
    } finally {
      setStatusBusy(false)
    }
  }

  async function uploadSignedDoc(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || docUploading || locked || !log.pdf_path) return
    setDocUploading(true)
    setDocError('')
    try {
      const ext = file.name.split('.').pop() || 'pdf'
      const path = `exceptions/${log.id}/signed-${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(SIGNED_DOC_BUCKET)
        .upload(path, file, { contentType: file.type || 'application/pdf' })
      if (upErr) throw upErr
      const by = PROFILES[getProfile()] || 'לא ידוע'
      // Uploading the signed form IS the approval (PRD D2) — atomic with the path.
      const { error: updErr } = await supabase
        .from('exception_logs')
        .update({ signed_path: path, status: 'approved', status_updated_by: by })
        .eq('id', log.id)
      if (updErr) throw updErr
      setLog((l) => ({ ...l, signed_path: path, status: 'approved', status_updated_by: by }))
    } catch {
      setDocError('העלאת המסמך נכשלה — נסו שוב')
    } finally {
      setDocUploading(false)
    }
  }

  return (
    <div className={`min-h-dvh ${editing ? 'pb-32' : ''}`}>
      <Header backTo={backTo} title={editing ? 'עריכת יומן חריגים' : 'יומן חריגים'} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        {error && (
          <div className="card border-destructive/40 bg-red-50 p-4 text-destructive font-medium">{error}</div>
        )}
        {!log && !error && (
          <div className="flex justify-center py-10 text-primary">
            <SpinnerIcon size={32} />
          </div>
        )}

        {log && !editing && (
          <div className="flex flex-col gap-5">
            {/* Summary */}
            <div className="card p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-xl font-black flex items-center gap-2">
                    <AlertIcon size={20} className="text-accent shrink-0" />
                    {log.projects?.name}
                  </h1>
                  <p className="text-sm text-primary mt-0.5">
                    לקוח: {log.projects?.clients?.name || '—'}
                    {log.projects?.city ? ` · ${log.projects.city}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={log.status} size="lg" />
                  {!locked && (
                    <button type="button" onClick={startEdit} className="btn btn-outline !min-h-[40px] text-sm">
                      <PencilIcon size={16} />
                      עריכה
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-primary">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon size={16} />
                  {formatDate(log.created_at)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <UsersIcon size={16} />
                  {log.workers_count} עובדים
                </span>
                <span>משך: {log.work_days} ימים</span>
                <span className="font-bold text-accent">
                  {daysText} ימי חיוב
                  {log.days_overridden && <span className="text-xs text-amber-700 ms-1">(הוזן ידנית)</span>}
                </span>
              </div>
              {log.status_updated_by && (
                <p className="text-xs text-primary mt-2">עדכון אחרון על ידי: {log.status_updated_by}</p>
              )}
              {locked && (
                <p className="mt-3 card border-green-300 bg-green-50 p-3 text-green-800 text-sm font-bold">
                  היומן נעול — אושר ע״י הלקוח
                </p>
              )}
            </div>

            {/* Description + photos */}
            <section className="card p-5">
              <h2 className="font-bold mb-2">תיאור העבודה הנדרשת</h2>
              <p className="whitespace-pre-wrap leading-relaxed">{log.work_description}</p>
              {photos.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                  {photos.map((p) => {
                    const url = exceptionPhotoUrl(p.storage_path)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setLightbox(url)}
                        className="aspect-square rounded-xl overflow-hidden border border-border bg-muted hover:opacity-90 transition-opacity"
                        aria-label="הגדלת תמונה"
                      >
                        <img src={url} alt="תמונה מהשטח" loading="lazy" className="h-full w-full object-cover" />
                      </button>
                    )
                  })}
                </div>
              )}
              {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
            </section>

            {/* PDF + WhatsApp */}
            <section className="card p-5">
              <h2 className="font-bold mb-3">דוח לאישור הלקוח</h2>
              <div className="flex gap-2 flex-wrap">
                <button className="btn btn-accent" onClick={generatePdf} disabled={pdfBusy || locked}>
                  {pdfBusy ? <SpinnerIcon size={18} /> : <DownloadIcon size={18} />}
                  הפקת דוח חריגים ותוספות
                </button>
                {log.pdf_path && (
                  <>
                    <a href={exceptionDocPublicUrl()} target="_blank" rel="noreferrer" className="btn btn-outline">
                      <FileTextIcon size={18} />
                      צפייה בדוח
                    </a>
                    <button className="btn btn-success" onClick={openSharePrompt} disabled={locked}>
                      <SendIcon size={18} />
                      שליחה בוואטסאפ
                    </button>
                  </>
                )}
              </div>
              {log.pdf_path && !locked && log.status === 'pending' && (
                <div className="mt-3 border-t border-border pt-3">
                  <button className="btn btn-outline" onClick={markSent} disabled={statusBusy}>
                    {statusBusy ? <SpinnerIcon size={18} /> : <SendIcon size={18} />}
                    סימון כ״נשלח ללקוח״
                  </button>
                </div>
              )}
              {pdfError && <p className="err">{pdfError}</p>}
              {statusError && <p className="err">{statusError}</p>}

              {sharePrompt && (
                <div className="mt-4 rounded-xl border-2 border-accent/40 bg-muted p-4">
                  <p className="font-bold text-sm mb-2">
                    לשלוח את הדוח לאישור אל
                    {log.projects?.contact_person ? ` ${log.projects.contact_person}` : ' הלקוח'}?
                  </p>
                  <label className="label !text-xs" htmlFor="share-phone">מספר וואטסאפ</label>
                  <input
                    id="share-phone"
                    type="tel"
                    dir="ltr"
                    className="input !min-h-[48px]"
                    value={sharePhone}
                    onChange={(e) => setSharePhone(e.target.value)}
                    placeholder="050-0000000"
                  />
                  <div className="mt-3 flex gap-2 flex-wrap">
                    <button className="btn btn-success" onClick={shareWhatsApp}>
                      <SendIcon size={16} />
                      פתיחת וואטסאפ
                    </button>
                    {typeof navigator !== 'undefined' && !!navigator.share && (
                      <button className="btn btn-outline" onClick={shareFile}>
                        <UploadIcon size={16} />
                        שיתוף הקובץ
                      </button>
                    )}
                    <button className="btn btn-ghost" onClick={() => setSharePrompt(false)}>
                      ביטול
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Signed form — disabled until a PDF has been generated at least once */}
            <section className={`card p-5 ${!log.pdf_path && !log.signed_path ? 'opacity-60' : ''}`}>
              <h2 className="font-bold mb-1">המסמך החתום מהלקוח</h2>
              <p className="text-xs text-primary mb-3">
                {log.pdf_path || log.signed_path
                  ? 'העלאת המסמך החתום מסמנת את היומן כ״אושר ע״י הלקוח״ ונועלת אותו'
                  : 'יש להפיק קודם את דוח החריגים — רק אחרי הפקה ושליחה ללקוח ניתן להעלות מסמך חתום'}
              </p>
              {log.signed_path ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <a
                    href={signedDocUrl(log.signed_path)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-outline"
                  >
                    <FileTextIcon size={18} />
                    צפייה במסמך החתום
                  </a>
                </div>
              ) : (
                <label
                  className={`btn btn-accent w-full sm:w-auto cursor-pointer ${
                    locked || !log.pdf_path ? 'opacity-50 pointer-events-none' : ''
                  }`}
                  title={!log.pdf_path ? 'יש להפיק קודם את דוח החריגים' : ''}
                >
                  {docUploading ? <SpinnerIcon size={18} /> : <UploadIcon size={18} />}
                  העלאת המסמך החתום
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={uploadSignedDoc}
                    disabled={docUploading || locked || !log.pdf_path}
                  />
                </label>
              )}
              {docError && <p className="err">{docError}</p>}
            </section>
          </div>
        )}

        {log && editing && (
          <div className="flex flex-col gap-6">
            <div data-error={!!errors.workers}>
              <span className="label">
                מספר עובדים <span className="text-destructive">*</span>
              </span>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setWorkers(Math.max(1, Number(workers) - 1))}
                  disabled={saving || Number(workers) <= 1} aria-label="הפחתת עובד"
                  className="btn btn-outline !min-h-[56px] !w-14 !px-0 !text-2xl shrink-0">
                  <MinusIcon size={26} />
                </button>
                <input type="number" inputMode="numeric" min={1} max={50}
                  className="input text-center !text-2xl font-black !min-h-[56px]"
                  value={workers} onChange={(e) => setWorkers(e.target.value)}
                  aria-invalid={!!errors.workers} aria-label="מספר עובדים" disabled={saving} />
                <button type="button" onClick={() => setWorkers(Math.min(50, Number(workers) + 1))}
                  disabled={saving || Number(workers) >= 50} aria-label="הוספת עובד"
                  className="btn btn-outline !min-h-[56px] !w-14 !px-0 !text-2xl shrink-0">
                  <PlusIcon size={26} />
                </button>
              </div>
              {errors.workers && <p className="err">{errors.workers}</p>}
            </div>

            <div data-error={!!errors.workDays}>
              <span className="label">
                משך העבודה (ימים) <span className="text-destructive">*</span>
              </span>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setWorkDays(Math.max(1, Number(workDays) - 1))}
                  disabled={saving || Number(workDays) <= 1} aria-label="הפחתת יום"
                  className="btn btn-outline !min-h-[56px] !w-14 !px-0 !text-2xl shrink-0">
                  <MinusIcon size={26} />
                </button>
                <input type="number" inputMode="numeric" min={1} max={99}
                  className="input text-center !text-2xl font-black !min-h-[56px]"
                  value={workDays} onChange={(e) => setWorkDays(e.target.value)}
                  aria-invalid={!!errors.workDays} aria-label="משך העבודה בימים" disabled={saving} />
                <button type="button" onClick={() => setWorkDays(Math.min(99, Number(workDays) + 1))}
                  disabled={saving || Number(workDays) >= 99} aria-label="הוספת יום"
                  className="btn btn-outline !min-h-[56px] !w-14 !px-0 !text-2xl shrink-0">
                  <PlusIcon size={26} />
                </button>
              </div>
              {errors.workDays && <p className="err">{errors.workDays}</p>}
            </div>

            <div data-error={!!errors.desc}>
              <label htmlFor="e-desc" className="label">
                תיאור העבודה הנדרשת <span className="text-destructive">*</span>
              </label>
              <textarea id="e-desc" className="input" rows={4} value={desc}
                onChange={(e) => setDesc(e.target.value)} aria-invalid={!!errors.desc} disabled={saving} />
              {errors.desc && <p className="err">{errors.desc}</p>}
            </div>

            <div data-error={!!errors.days} className="card p-4 border-accent/40">
              <div className="flex items-center justify-between gap-3">
                <span className="label !mb-0">
                  כמות ימים לחיוב <span className="text-destructive">*</span>
                </span>
                {daysOverridden ? (
                  <button type="button" className="btn btn-ghost text-sm !min-h-[36px]"
                    onClick={() => { setDaysOverridden(false); setManualDays('') }} disabled={saving}>
                    חישוב אוטומטי
                  </button>
                ) : (
                  <button type="button" className="btn btn-ghost text-sm !min-h-[36px]"
                    onClick={() => { setManualDays(autoBillableDays(workers, workDays)); setDaysOverridden(true) }}
                    disabled={saving}>
                    <PencilIcon size={14} />
                    עריכה ידנית
                  </button>
                )}
              </div>
              {daysOverridden ? (
                <>
                  <input type="number" inputMode="decimal" min={0.5} max={999} step={0.5}
                    className="input text-center !text-2xl font-black !min-h-[56px] mt-2"
                    value={manualDays} onChange={(e) => setManualDays(e.target.value)}
                    aria-invalid={!!errors.days} aria-label="כמות ימים לחיוב" disabled={saving} />
                  <p className="mt-1.5 text-xs text-amber-800 font-medium">הוזן ידנית — הנוסחה האוטומטית מושבתת</p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-black text-accent mt-2 text-center">{billableDaysEdit}</p>
                  <p className="mt-1.5 text-xs text-primary text-center">
                    חישוב אוטומטי: {workers} עובדים × חצי יום × {workDays} ימים
                  </p>
                </>
              )}
              {errors.days && <p className="err">{errors.days}</p>}
            </div>

            {photos.length > 0 && (
              <div>
                <span className="label">תמונות קיימות</span>
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                  {photos.map((p) => (
                    <div key={p.id} className="aspect-square rounded-xl overflow-hidden border border-border bg-muted">
                      <img src={exceptionPhotoUrl(p.storage_path)} alt="" className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-primary">אי אפשר להסיר תמונות קיימות — ניתן רק להוסיף</p>
              </div>
            )}
            <PhotoUploader
              label="הוספת תמונות"
              photos={newPhotos}
              onChange={setNewPhotos}
              remaining={MAX_PHOTOS - photos.length - newPhotos.length}
              disabled={saving}
            />
          </div>
        )}
      </main>

      {log && editing && (
        <div className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-3xl flex flex-col gap-2">
            {saveError && <p className="err !mt-0 text-center font-bold">{saveError}</p>}
            {saveWarning && <p className="text-center text-sm font-medium text-amber-800">{saveWarning}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(false)} disabled={saving}
                className="btn btn-outline flex-1 !min-h-[56px]">
                ביטול
              </button>
              <button type="button" onClick={save} disabled={saving}
                className="btn btn-accent flex-[2] !min-h-[56px] !text-lg">
                {saving ? <SpinnerIcon size={22} /> : 'שמירה'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
