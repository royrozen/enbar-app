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
  SearchIcon,
  XIcon,
} from '../components/Icons'
import { supabase, fetchActiveTeamLead, PART_PHOTO_BUCKET } from '../lib/supabase'

const DRAFT_KEY = 'enbar_part_request_draft'

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {}
  } catch {
    return {}
  }
}

export default function PartRequestNew() {
  const nav = useNavigate()
  const draft = useMemo(loadDraft, [])

  const [clients, setClients] = useState(null)
  const [catalogItems, setCatalogItems] = useState([])
  const [lead, setLead] = useState(null)
  const [loadError, setLoadError] = useState('')

  const [clientId, setClientId] = useState(draft.clientId || '')
  const [projectId, setProjectId] = useState(draft.projectId || '')
  const [useOther, setUseOther] = useState(draft.useOther || false)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState(draft.selectedItem || null)
  const [otherDescription, setOtherDescription] = useState(draft.otherDescription || '')
  const [quantity, setQuantity] = useState(draft.quantity || 1)
  const [notes, setNotes] = useState(draft.notes || '')
  const [photos, setPhotos] = useState([])

  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [done, setDone] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [{ data: cls, error: cErr }, { data: items, error: iErr }, activeLead] =
          await Promise.all([
            supabase
              .from('clients')
              .select('id, name, projects(id, name, city, is_active)')
              .eq('is_active', true)
              .order('name'),
            supabase.from('catalog_items').select('id, name').eq('is_active', true).order('name'),
            fetchActiveTeamLead(),
          ])
        if (cancelled) return
        if (cErr) throw cErr
        if (iErr) throw iErr
        setClients(
          (cls || []).map((c) => ({
            ...c,
            projects: (c.projects || []).filter((p) => p.is_active),
          })),
        )
        setCatalogItems(items || [])
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
  // more than one the team lead must pick which project the request is for.
  useEffect(() => {
    if (clientProjects.length === 1) {
      setProjectId(clientProjects[0].id)
    } else if (!clientProjects.some((p) => p.id === projectId)) {
      setProjectId('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, clients])

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim()
    if (!q) return catalogItems
    return catalogItems.filter((i) => i.name.includes(q))
  }, [catalogItems, catalogSearch])

  // Draft auto-save (text only, not the photo)
  useEffect(() => {
    if (done) return
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        clientId,
        projectId,
        useOther,
        selectedItem,
        otherDescription,
        quantity,
        notes,
      }),
    )
  }, [clientId, projectId, useOther, selectedItem, otherDescription, quantity, notes, done])

  function validate() {
    const errs = {}
    if (!clientId) errs.client = 'יש לבחור לקוח'
    else if (clientProjects.length === 0) errs.client = 'ללקוח זה אין פרויקט פעיל — פנו למנהל המפעל'
    else if (clientProjects.length > 1 && !projectId) errs.project = 'יש לבחור פרויקט עבור לקוח זה'
    if (useOther) {
      if (otherDescription.trim().length < 5) errs.part = 'יש להזין תיאור של 5 תווים לפחות'
    } else if (!selectedItem) {
      errs.part = 'יש לבחור חלק מהקטלוג'
    }
    const q = Number(quantity)
    if (!Number.isInteger(q) || q < 1 || q > 999) errs.quantity = 'הכמות חייבת להיות בין 1 ל־999'
    return errs
  }

  function stepQuantity(delta) {
    const q = Number(quantity) || 0
    setQuantity(Math.min(999, Math.max(1, q + delta)))
  }

  function toggleOther(next) {
    setUseOther(next)
    setErrors((e) => ({ ...e, part: undefined }))
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
      setProgress('שומר את הבקשה...')
      const { data: request, error } = await supabase
        .from('part_requests')
        .insert({
          team_lead_id: lead.id,
          project_id: projectId,
          catalog_item_id: useOther ? null : selectedItem.id,
          other_description: useOther ? otherDescription.trim() : null,
          quantity: Number(quantity),
          notes: notes.trim() || null,
        })
        .select()
        .single()
      if (error) throw error

      let photoFailed = false
      if (photos.length) {
        setProgress('מעלה תמונה...')
        try {
          const path = `parts/${request.id}/${crypto.randomUUID()}.jpg`
          const { error: upErr } = await supabase.storage
            .from(PART_PHOTO_BUCKET)
            .upload(path, photos[0].file, { contentType: 'image/jpeg' })
          if (upErr) throw upErr
          const { error: updErr } = await supabase
            .from('part_requests')
            .update({ photo_path: path })
            .eq('id', request.id)
          if (updErr) throw updErr
        } catch {
          photoFailed = true
        }
      }

      localStorage.removeItem(DRAFT_KEY)
      setDone({ photoFailed })
      window.scrollTo(0, 0)
    } catch {
      setSubmitError('שליחת הבקשה נכשלה — בדקו את חיבור האינטרנט ונסו שוב. מה שהקלדתם נשמר.')
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
          <h1 className="mt-5 text-3xl font-black">הבקשה נשלחה ✓</h1>
          <p className="mt-2 text-primary">הבקשה מופיעה כעת אצל המנהל</p>
          {done.photoFailed && (
            <p className="mt-4 card border-amber-300 bg-amber-50 p-3 text-amber-800 font-medium">
              שימו לב: התמונה לא הועלתה בגלל בעיית רשת
            </p>
          )}
          <div className="mt-10 flex flex-col gap-3">
            <Link to="/home" className="btn btn-accent w-full !min-h-[56px]">
              חזרה למסך הראשי
            </Link>
            <button className="btn btn-outline w-full" onClick={() => nav(0)}>
              בקשה נוספת
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-dvh pb-32">
      <Header backTo="/home" title="הזמנת חלק חסר" />
      <main className="mx-auto max-w-lg px-4 py-6">
        <h1 className="text-2xl font-black mb-5 sm:hidden">הזמנת חלק חסר</h1>

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

          {/* 2/3. Catalog part or free-text "other" */}
          <div data-error={!!errors.part}>
            <label className="label">
              חלק מהקטלוג <span className="text-destructive">*</span>
            </label>

            {!useOther && (
              <>
                {selectedItem ? (
                  <div className="input flex items-center justify-between !min-h-[56px]">
                    <span className="font-bold">{selectedItem.name}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedItem(null)}
                      aria-label="ניקוי בחירה"
                      className="text-primary hover:text-destructive"
                      disabled={submitting}
                    >
                      <XIcon size={18} />
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="relative">
                      <SearchIcon
                        size={18}
                        className="absolute top-1/2 -translate-y-1/2 start-3 text-primary pointer-events-none"
                      />
                      <input
                        type="text"
                        className="input !ps-10"
                        placeholder="חיפוש חלק בקטלוג..."
                        value={catalogSearch}
                        onChange={(e) => setCatalogSearch(e.target.value)}
                        aria-invalid={!!errors.part}
                        disabled={submitting}
                      />
                    </div>
                    <ul className="mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-border bg-white divide-y divide-border">
                      {filteredCatalog.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            className="w-full text-start px-4 py-3 hover:bg-muted transition-colors"
                            onClick={() => {
                              setSelectedItem(item)
                              setCatalogSearch('')
                            }}
                            disabled={submitting}
                          >
                            {item.name}
                          </button>
                        </li>
                      ))}
                      {filteredCatalog.length === 0 && (
                        <li className="px-4 py-3 text-sm text-primary">לא נמצאו חלקים תואמים</li>
                      )}
                    </ul>
                  </div>
                )}
              </>
            )}

            <label className="mt-2 flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={useOther}
                onChange={(e) => toggleOther(e.target.checked)}
                disabled={submitting}
              />
              החלק לא בקטלוג? בחר &quot;אחר&quot;
            </label>

            {useOther && (
              <textarea
                className="input mt-2"
                rows={3}
                placeholder="תיאור חופשי של החלק החסר..."
                value={otherDescription}
                onChange={(e) => setOtherDescription(e.target.value)}
                aria-invalid={!!errors.part}
                disabled={submitting}
              />
            )}

            {errors.part && <p className="err">{errors.part}</p>}
          </div>

          {/* 5. Quantity */}
          <div data-error={!!errors.quantity}>
            <span className="label">
              כמות <span className="text-destructive">*</span>
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => stepQuantity(-1)}
                disabled={submitting || Number(quantity) <= 1}
                aria-label="הפחתת כמות"
                className="btn btn-outline !min-h-[56px] !w-14 !px-0 !text-2xl shrink-0"
              >
                <MinusIcon size={26} />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                className="input text-center !text-2xl font-black !min-h-[56px]"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                aria-invalid={!!errors.quantity}
                aria-label="כמות"
                disabled={submitting}
              />
              <button
                type="button"
                onClick={() => stepQuantity(1)}
                disabled={submitting || Number(quantity) >= 999}
                aria-label="הוספת כמות"
                className="btn btn-outline !min-h-[56px] !w-14 !px-0 !text-2xl shrink-0"
              >
                <PlusIcon size={26} />
              </button>
            </div>
            {errors.quantity && <p className="err">{errors.quantity}</p>}
          </div>

          {/* 6. Photo */}
          <PhotoUploader
            label="תמונה של החלק"
            hint="תמונה אחת בלבד — נדחסת אוטומטית"
            photos={photos}
            onChange={setPhotos}
            remaining={1 - photos.length}
            disabled={submitting}
          />

          {/* 7. Notes */}
          <div>
            <label htmlFor="notes" className="label">
              הערות לייצור
            </label>
            <textarea
              id="notes"
              className="input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
            />
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
              'שליחת הבקשה'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
