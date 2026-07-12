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
  TrashIcon,
} from '../components/Icons'
import { supabase, fetchActiveTeamLead, PART_PHOTO_BUCKET } from '../lib/supabase'

const DRAFT_KEY = 'enbar_part_request_draft'

function makeLine() {
  return {
    key: crypto.randomUUID(),
    useOther: false,
    selectedItem: null,
    catalogSearch: '',
    otherDescription: '',
    quantity: 1,
  }
}

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY)) || {}
    return {
      clientId: d.clientId || '',
      projectId: d.projectId || '',
      notes: d.notes || '',
      lines: Array.isArray(d.lines) && d.lines.length ? d.lines : [makeLine()],
    }
  } catch {
    return { clientId: '', projectId: '', notes: '', lines: [makeLine()] }
  }
}

export default function PartRequestNew() {
  const nav = useNavigate()
  const draft = useMemo(loadDraft, [])

  const [clients, setClients] = useState(null)
  const [catalogItems, setCatalogItems] = useState([])
  const [lead, setLead] = useState(null)
  const [loadError, setLoadError] = useState('')

  const [clientId, setClientId] = useState(draft.clientId)
  const [projectId, setProjectId] = useState(draft.projectId)
  const [lines, setLines] = useState(draft.lines)
  const [notes, setNotes] = useState(draft.notes)
  const [photos, setPhotos] = useState([])

  const [errors, setErrors] = useState({})
  const [lineErrors, setLineErrors] = useState({})
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

  // Draft auto-save (text only, not the photo)
  useEffect(() => {
    if (done) return
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ clientId, projectId, notes, lines }))
  }, [clientId, projectId, notes, lines, done])

  function updateLine(key, patch) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function addLine() {
    setLines((ls) => [...ls, makeLine()])
  }

  function removeLine(key) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls))
  }

  function stepQuantity(key, delta, current) {
    const q = Number(current) || 0
    updateLine(key, { quantity: Math.min(999, Math.max(1, q + delta)) })
  }

  function validate() {
    const errs = {}
    if (!clientId) errs.client = 'יש לבחור לקוח'
    else if (clientProjects.length === 0) errs.client = 'ללקוח זה אין פרויקט פעיל — פנו למנהל המפעל'
    else if (clientProjects.length > 1 && !projectId) errs.project = 'יש לבחור פרויקט עבור לקוח זה'

    const lErrs = {}
    for (const line of lines) {
      const le = {}
      if (line.useOther) {
        if (line.otherDescription.trim().length < 5) le.part = 'יש להזין תיאור של 5 תווים לפחות'
      } else if (!line.selectedItem) {
        le.part = 'יש לבחור חלק מהקטלוג'
      }
      const q = Number(line.quantity)
      if (!Number.isInteger(q) || q < 1 || q > 999) le.quantity = 'הכמות חייבת להיות בין 1 ל־999'
      if (Object.keys(le).length) lErrs[line.key] = le
    }

    return { errs, lErrs }
  }

  async function submit(e) {
    e.preventDefault()
    if (submitting) return
    setSubmitError('')
    const { errs, lErrs } = validate()
    setErrors(errs)
    setLineErrors(lErrs)
    if (Object.keys(errs).length || Object.keys(lErrs).length) {
      document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (!lead) {
      setSubmitError('לא נמצא ראש צוות פעיל במערכת')
      return
    }

    setSubmitting(true)
    try {
      const insertedIds = []
      let failedLines = 0
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        setProgress(lines.length > 1 ? `שומר פריט ${i + 1} מתוך ${lines.length}...` : 'שומר את הבקשה...')
        try {
          const { data: request, error } = await supabase
            .from('part_requests')
            .insert({
              team_lead_id: lead.id,
              project_id: projectId,
              catalog_item_id: line.useOther ? null : line.selectedItem.id,
              other_description: line.useOther ? line.otherDescription.trim() : null,
              quantity: Number(line.quantity),
              notes: notes.trim() || null,
            })
            .select()
            .single()
          if (error) throw error
          insertedIds.push(request.id)
        } catch {
          failedLines++
        }
      }

      let photoFailed = false
      if (photos.length && insertedIds.length) {
        setProgress('מעלה תמונה...')
        try {
          const path = `parts/${insertedIds[0]}/${crypto.randomUUID()}.jpg`
          const { error: upErr } = await supabase.storage
            .from(PART_PHOTO_BUCKET)
            .upload(path, photos[0].file, { contentType: 'image/jpeg' })
          if (upErr) throw upErr
          const { error: updErr } = await supabase
            .from('part_requests')
            .update({ photo_path: path })
            .eq('id', insertedIds[0])
          if (updErr) throw updErr
        } catch {
          photoFailed = true
        }
      }

      if (!insertedIds.length) {
        setSubmitError('שליחת הבקשה נכשלה — בדקו את חיבור האינטרנט ונסו שוב. מה שהקלדתם נשמר.')
        return
      }

      localStorage.removeItem(DRAFT_KEY)
      setDone({ failedLines, totalLines: lines.length, photoFailed })
      window.scrollTo(0, 0)
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
          <h1 className="mt-5 text-3xl font-black">ההזמנה נשלחה ✓</h1>
          <p className="mt-2 text-primary">ההזמנה מופיעה כעת אצל המנהל</p>
          {done.failedLines > 0 && (
            <p className="mt-4 card border-amber-300 bg-amber-50 p-3 text-amber-800 font-medium">
              שימו לב: {done.failedLines} מתוך {done.totalLines} פריטים לא נשלחו בגלל בעיית רשת
            </p>
          )}
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
              הזמנה נוספת
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

          {/* 2/3. Line items — each is a catalog part (or free-text "other") + quantity */}
          <div className="flex flex-col gap-4">
            <label className="label !mb-0">
              פריטים להזמנה <span className="text-destructive">*</span>
            </label>

            {lines.map((line, idx) => {
              const le = lineErrors[line.key] || {}
              const filteredCatalog = (() => {
                const q = line.catalogSearch.trim()
                if (!q) return catalogItems
                return catalogItems.filter((i) => i.name.includes(q))
              })()

              return (
                <div key={line.key} className="card p-4 flex flex-col gap-3 border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary">פריט {idx + 1}</span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        aria-label="הסרת פריט"
                        className="text-primary hover:text-destructive"
                        disabled={submitting}
                      >
                        <TrashIcon size={18} />
                      </button>
                    )}
                  </div>

                  {/* Catalog part or free-text "other" */}
                  <div data-error={!!le.part}>
                    {!line.useOther && (
                      <>
                        {line.selectedItem ? (
                          <div className="input flex items-center justify-between !min-h-[56px]">
                            <span className="font-bold">{line.selectedItem.name}</span>
                            <button
                              type="button"
                              onClick={() => updateLine(line.key, { selectedItem: null })}
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
                                value={line.catalogSearch}
                                onChange={(e) => updateLine(line.key, { catalogSearch: e.target.value })}
                                aria-invalid={!!le.part}
                                disabled={submitting}
                              />
                            </div>
                            <ul className="mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-border bg-white divide-y divide-border">
                              {filteredCatalog.map((item) => (
                                <li key={item.id}>
                                  <button
                                    type="button"
                                    className="w-full text-start px-4 py-3 hover:bg-muted transition-colors"
                                    onClick={() =>
                                      updateLine(line.key, { selectedItem: item, catalogSearch: '' })
                                    }
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
                        checked={line.useOther}
                        onChange={(e) => updateLine(line.key, { useOther: e.target.checked })}
                        disabled={submitting}
                      />
                      החלק לא בקטלוג? בחר &quot;אחר&quot;
                    </label>

                    {line.useOther && (
                      <textarea
                        className="input mt-2"
                        rows={3}
                        placeholder="תיאור חופשי של החלק החסר..."
                        value={line.otherDescription}
                        onChange={(e) => updateLine(line.key, { otherDescription: e.target.value })}
                        aria-invalid={!!le.part}
                        disabled={submitting}
                      />
                    )}

                    {le.part && <p className="err">{le.part}</p>}
                  </div>

                  {/* Quantity */}
                  <div data-error={!!le.quantity}>
                    <span className="label">
                      כמות <span className="text-destructive">*</span>
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => stepQuantity(line.key, -1, line.quantity)}
                        disabled={submitting || Number(line.quantity) <= 1}
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
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        aria-invalid={!!le.quantity}
                        aria-label="כמות"
                        disabled={submitting}
                      />
                      <button
                        type="button"
                        onClick={() => stepQuantity(line.key, 1, line.quantity)}
                        disabled={submitting || Number(line.quantity) >= 999}
                        aria-label="הוספת כמות"
                        className="btn btn-outline !min-h-[56px] !w-14 !px-0 !text-2xl shrink-0"
                      >
                        <PlusIcon size={26} />
                      </button>
                    </div>
                    {le.quantity && <p className="err">{le.quantity}</p>}
                  </div>
                </div>
              )
            })}

            <button
              type="button"
              onClick={addLine}
              disabled={submitting}
              className="btn btn-outline w-full"
            >
              <PlusIcon size={20} />
              הוספת פריט נוסף
            </button>
          </div>

          {/* 6. Photo */}
          <PhotoUploader
            label="תמונה"
            hint="תמונה אחת בלבד להזמנה — נדחסת אוטומטית"
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
              'שליחת ההזמנה'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
