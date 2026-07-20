import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import PartLineFields, { lineIsFilled, validateLine } from '../components/PartLineFields'
import {
  PlusIcon,
  CheckCircleIcon,
  SpinnerIcon,
  AlertIcon,
  TrashIcon,
  PencilIcon,
  ChevronDownIcon,
} from '../components/Icons'
import { supabase, fetchActiveTeamLead } from '../lib/supabase'

const DRAFT_KEY = 'enbar_part_request_draft'

function makeLine() {
  return {
    key: crypto.randomUUID(),
    useOther: false,
    selectedItem: null,
    catalogSearch: '',
    otherDescription: '',
    quantity: 1,
    collapsed: false,
  }
}

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY)) || {}
    return {
      clientId: d.clientId || '',
      projectId: d.projectId || '',
      notes: d.notes || '',
      lines:
        Array.isArray(d.lines) && d.lines.length
          ? d.lines.map((l) => ({ collapsed: false, ...l }))
          : [makeLine()],
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

  const [errors, setErrors] = useState({})
  const [lineErrors, setLineErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [{ data: cls, error: cErr }, { data: items, error: iErr }, activeLead] =
          await Promise.all([
            supabase
              .from('clients')
              .select('id, name, projects(id, name, city, is_active, deleted_at)')
              .eq('is_active', true)
              .is('deleted_at', null)
              .order('name'),
            supabase
              .from('catalog_items')
              .select('id, name')
              .eq('is_active', true)
              .is('deleted_at', null)
              .order('name'),
            fetchActiveTeamLead(),
          ])
        if (cancelled) return
        if (cErr) throw cErr
        if (iErr) throw iErr
        setClients(
          (cls || []).map((c) => ({
            ...c,
            projects: (c.projects || []).filter((p) => p.is_active && !p.deleted_at),
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

  // Draft auto-save
  useEffect(() => {
    if (done) return
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ clientId, projectId, notes, lines }))
  }, [clientId, projectId, notes, lines, done])

  function updateLine(key, patch) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function addLine() {
    setLines((ls) => [
      ...ls.map((l) => (lineIsFilled(l) ? { ...l, collapsed: true } : l)),
      makeLine(),
    ])
  }

  function removeLine(key) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls))
  }

  function toggleCollapse(key) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, collapsed: !l.collapsed } : l)))
  }

  function validate() {
    const errs = {}
    if (!clientId) errs.client = 'יש לבחור לקוח'
    else if (clientProjects.length === 0) errs.client = 'ללקוח זה אין פרויקט פעיל — פנו למנהל המפעל'
    else if (clientProjects.length > 1 && !projectId) errs.project = 'יש לבחור פרויקט עבור לקוח זה'

    const lErrs = {}
    for (const line of lines) {
      const le = validateLine(line)
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
      if (Object.keys(lErrs).length) {
        setLines((ls) => ls.map((l) => (lErrs[l.key] ? { ...l, collapsed: false } : l)))
      }
      setTimeout(() => {
        document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 0)
      return
    }
    if (!lead) {
      setSubmitError('לא נמצא ראש צוות פעיל במערכת')
      return
    }

    setSubmitting(true)
    try {
      const { data: order, error: orderErr } = await supabase
        .from('part_orders')
        .insert({
          team_lead_id: lead.id,
          project_id: projectId,
          notes: notes.trim() || null,
        })
        .select()
        .single()
      if (orderErr) throw orderErr

      const { error: linesErr } = await supabase.from('part_requests').insert(
        lines.map((line) => ({
          order_id: order.id,
          catalog_item_id: line.useOther ? null : line.selectedItem.id,
          other_description: line.useOther ? line.otherDescription.trim() : null,
          quantity: Number(line.quantity),
        })),
      )
      if (linesErr) throw linesErr

      localStorage.removeItem(DRAFT_KEY)
      setDone(true)
      window.scrollTo(0, 0)
    } catch {
      setSubmitError('שליחת ההזמנה נכשלה — בדקו את חיבור האינטרנט ונסו שוב. מה שהקלדתם נשמר.')
    } finally {
      setSubmitting(false)
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

          {/* 1b. Project — shown whenever the client has any active project
              (auto-selected when there's exactly one, but still visible) */}
          {clientProjects.length >= 1 && (
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

              if (line.collapsed && lineIsFilled(line)) {
                return (
                  <div key={line.key} className="card p-3 flex items-center gap-3 border-border">
                    <span className="text-xs font-bold text-primary shrink-0">פריט {idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate">
                        {line.useOther ? line.otherDescription : line.selectedItem.name}
                      </p>
                      <p className="text-sm text-primary">כמות: {line.quantity}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleCollapse(line.key)}
                      aria-label="עריכת פריט"
                      className="btn btn-outline !min-h-[40px] !px-3 shrink-0"
                      disabled={submitting}
                    >
                      <PencilIcon size={16} />
                    </button>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        aria-label="הסרת פריט"
                        className="text-primary hover:text-destructive shrink-0"
                        disabled={submitting}
                      >
                        <TrashIcon size={18} />
                      </button>
                    )}
                  </div>
                )
              }

              return (
                <div key={line.key} className="card p-4 flex flex-col gap-3 border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary">פריט {idx + 1}</span>
                    <div className="flex items-center gap-3">
                      {lineIsFilled(line) && (
                        <button
                          type="button"
                          onClick={() => toggleCollapse(line.key)}
                          aria-label="כיווץ פריט"
                          className="text-primary hover:text-accent"
                          disabled={submitting}
                        >
                          <ChevronDownIcon size={18} />
                        </button>
                      )}
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
                  </div>

                  <PartLineFields
                    catalogItems={catalogItems}
                    useOther={line.useOther}
                    selectedItem={line.selectedItem}
                    catalogSearch={line.catalogSearch}
                    otherDescription={line.otherDescription}
                    quantity={line.quantity}
                    onChange={(patch) => updateLine(line.key, patch)}
                    error={le}
                    disabled={submitting}
                  />
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

          {/* Notes */}
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
                שולח...
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
