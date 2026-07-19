import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import StatusBadge from '../components/StatusBadge'
import StatusChips from '../components/StatusChips'
import {
  ImageIcon,
  AlertIcon,
  SpinnerIcon,
  ClipboardIcon,
  ChevronDownIcon,
} from '../components/Icons'
import { supabase, fetchActiveTeamLead } from '../lib/supabase'
import { formatDate, todayISO, daysAgoISO, PART_STATUS_LABELS, groupPartRequestsByOrder } from '../lib/format'

const TYPE_CHIPS = [
  { value: '', label: 'הכל' },
  { value: 'report', label: 'יומן עבודה' },
  { value: 'part', label: 'הזמנת חלקים' },
  { value: 'exception', label: 'יומן חריגים' },
]

const defaultFilters = () => ({
  type: '',
  projectId: '',
  from: daysAgoISO(29), // default: last 30 days
  to: todayISO(),
})

export default function History() {
  const [lead, setLead] = useState(null)
  const [projects, setProjects] = useState([])
  const [filters, setFilters] = useState(defaultFilters)
  const [reports, setReports] = useState(null)
  const [partRequests, setPartRequests] = useState(null)
  const [exceptions, setExceptions] = useState(null)
  const [openOrders, setOpenOrders] = useState(() => new Set())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const loadMeta = useCallback(async () => {
    const [activeLead, { data: projs }] = await Promise.all([
      fetchActiveTeamLead(),
      supabase.from('projects').select('id, name').is('deleted_at', null).order('name'),
    ])
    setLead(activeLead)
    setProjects(projs || [])
    return activeLead
  }, [])

  const loadData = useCallback(async (activeLead) => {
    if (!activeLead) return
    setLoading(true)
    setError('')
    try {
      let reportsQ = supabase
        .from('reports')
        .select('id, report_date, workers_count, issues, created_at, projects(name)')
        .eq('team_lead_id', activeLead.id)
        .order('report_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200)
      if (filters.projectId) reportsQ = reportsQ.eq('project_id', filters.projectId)
      if (filters.from) reportsQ = reportsQ.gte('report_date', filters.from)
      if (filters.to) reportsQ = reportsQ.lte('report_date', filters.to)

      let partsQ = supabase
        .from('part_requests')
        .select('id, order_id, quantity, status, created_at, projects(name), catalog_items(name), other_description')
        .eq('team_lead_id', activeLead.id)
        .order('created_at', { ascending: false })
        .limit(200)
      if (filters.projectId) partsQ = partsQ.eq('project_id', filters.projectId)
      if (filters.from) partsQ = partsQ.gte('created_at', filters.from)
      if (filters.to) partsQ = partsQ.lte('created_at', `${filters.to}T23:59:59`)

      let excQ = supabase
        .from('exception_logs')
        .select('id, billable_days, days_overridden, status, created_at, projects(name)')
        .eq('team_lead_id', activeLead.id)
        .order('created_at', { ascending: false })
        .limit(200)
      if (filters.projectId) excQ = excQ.eq('project_id', filters.projectId)
      if (filters.from) excQ = excQ.gte('created_at', filters.from)
      if (filters.to) excQ = excQ.lte('created_at', `${filters.to}T23:59:59`)

      const [{ data: rpts, error: rErr }, { data: parts, error: pErr }, { data: excs, error: eErr }] =
        await Promise.all([reportsQ, partsQ, excQ])
      if (rErr) throw rErr
      if (pErr) throw pErr
      if (eErr) throw eErr
      setReports(rpts || [])
      setPartRequests(parts || [])
      setExceptions(excs || [])
    } catch {
      setError('טעינת הנתונים נכשלה — נסו לרענן')
      setReports([])
      setPartRequests([])
      setExceptions([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    let cancelled = false
    loadMeta().then((activeLead) => {
      if (!cancelled) loadData(activeLead)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (lead) loadData(lead)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  function toggleOrder(orderId) {
    setOpenOrders((prev) => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  const reportItems = (reports || []).map((r) => ({ type: 'report', ts: r.report_date, report: r }))
  const partOrders = groupPartRequestsByOrder(partRequests)
  const partItems = partOrders.map((o) => ({ type: 'part', ts: o.createdAt, order: o }))
  const exceptionItems = (exceptions || []).map((e) => ({ type: 'exception', ts: e.created_at, exception: e }))
  const unified = [...reportItems, ...partItems, ...exceptionItems].sort(
    (a, b) => new Date(b.ts) - new Date(a.ts),
  )
  const visible = filters.type ? unified.filter((u) => u.type === filters.type) : unified

  return (
    <div className="min-h-dvh">
      <Header backTo="/home" title="דוחות ישנים" />
      <main className="mx-auto max-w-lg px-4 py-6">
        <h1 className="text-2xl font-black mb-5">דוחות ישנים</h1>

        <div className="mb-4">
          <StatusChips
            value={filters.type}
            onChange={(type) => setFilters((f) => ({ ...f, type }))}
            options={TYPE_CHIPS}
          />
        </div>

        <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="label !text-xs" htmlFor="f-project">פרויקט</label>
            <select
              id="f-project"
              className="input !min-h-[48px]"
              value={filters.projectId}
              onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))}
            >
              <option value="">כל הפרויקטים</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="label !text-xs" htmlFor="f-from">מתאריך</label>
            <input
              id="f-from"
              type="date"
              className="input !min-h-[48px] w-full min-w-0"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            />
          </div>
          <div className="min-w-0">
            <label className="label !text-xs" htmlFor="f-to">עד תאריך</label>
            <input
              id="f-to"
              type="date"
              className="input !min-h-[48px] w-full min-w-0"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            />
          </div>
        </div>

        {error && (
          <div className="card border-destructive/40 bg-red-50 p-4 mt-4 text-destructive font-medium">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-12 text-primary">
            <SpinnerIcon size={32} />
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <div className="card p-10 mt-4 text-center text-primary">
            <ClipboardIcon size={40} className="mx-auto mb-3 opacity-60" />
            <p className="font-bold text-foreground">לא נמצאו רשומות</p>
            <p className="text-sm mt-1">נסו להרחיב את טווח התאריכים או לשנות את הסינון</p>
          </div>
        )}

        {!loading && !error && visible.length > 0 && (
          <ul className="mt-4 flex flex-col gap-3">
            {visible.map((item) => {
              if (item.type === 'report') {
                const r = item.report
                return (
                  <li key={`report-${r.id}`}>
                    <Link
                      to={`/report/${r.id}`}
                      className="card flex items-center gap-4 p-4 hover:border-accent transition-colors duration-200"
                    >
                      <div className="flex flex-col items-center justify-center bg-muted rounded-xl px-3 py-2 min-w-[72px]">
                        <span className="text-sm font-black">{formatDate(r.report_date)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate">{r.projects?.name || 'פרויקט'}</p>
                        <p className="text-sm text-primary flex items-center gap-2 mt-0.5">
                          <ImageIcon size={15} />
                          {r.issues && (
                            <span className="inline-flex items-center gap-1 text-destructive font-medium">
                              <AlertIcon size={15} />
                              בעיה
                            </span>
                          )}
                        </p>
                      </div>
                    </Link>
                  </li>
                )
              }

              if (item.type === 'exception') {
                const ex = item.exception
                const d = Number(ex.billable_days)
                return (
                  <li key={`exception-${ex.id}`}>
                    <Link
                      to={`/exceptions/${ex.id}`}
                      className="card flex items-center gap-4 p-4 hover:border-accent transition-colors duration-200"
                    >
                      <div className="flex flex-col items-center justify-center bg-muted rounded-xl px-3 py-2 min-w-[72px]">
                        <span className="text-sm font-black">{formatDate(ex.created_at)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate">{ex.projects?.name || 'פרויקט'}</p>
                        <p className="text-sm text-primary mt-0.5">
                          יומן חריגים · {d % 1 === 0 ? d : d.toFixed(1)} ימי חיוב
                        </p>
                      </div>
                      <StatusBadge status={ex.status} />
                    </Link>
                  </li>
                )
              }

              const order = item.order
              const first = order.items[0]

              if (order.items.length === 1) {
                return (
                  <li key={`part-${order.orderId}`}>
                    <Link
                      to={`/parts/${first.id}`}
                      className="card flex items-center gap-4 p-4 hover:border-accent transition-colors duration-200"
                    >
                      <div className="flex flex-col items-center justify-center bg-muted rounded-xl px-3 py-2 min-w-[72px]">
                        <span className="text-sm font-black">{formatDate(order.createdAt)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate">
                          {first.catalog_items?.name || first.other_description}
                        </p>
                        <p className="text-sm text-primary flex items-center gap-2 mt-0.5">
                          {first.projects?.name || 'פרויקט'} · כמות: {first.quantity}
                        </p>
                      </div>
                      <StatusBadge status={first.status} labels={PART_STATUS_LABELS} />
                    </Link>
                  </li>
                )
              }

              const isOpen = openOrders.has(order.orderId)
              return (
                <li key={`part-${order.orderId}`} className="card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleOrder(order.orderId)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-4 p-4 hover:bg-muted transition-colors duration-200 text-start"
                  >
                    <div className="flex flex-col items-center justify-center bg-muted rounded-xl px-3 py-2 min-w-[72px]">
                      <span className="text-sm font-black">{formatDate(order.createdAt)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate">{first.projects?.name || 'פרויקט'}</p>
                      <p className="text-sm text-primary mt-0.5">{order.items.length} פריטים</p>
                    </div>
                    <ChevronDownIcon
                      size={20}
                      className={`text-primary shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {isOpen && (
                    <ul className="border-t border-border divide-y divide-border">
                      {order.items.map((r) => (
                        <li key={r.id}>
                          <Link
                            to={`/parts/${r.id}`}
                            className="flex items-center gap-3 p-3.5 ps-[92px] hover:bg-muted transition-colors duration-200"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">
                                {r.catalog_items?.name || r.other_description}
                              </p>
                              <p className="text-sm text-primary mt-0.5">כמות: {r.quantity}</p>
                            </div>
                            <StatusBadge status={r.status} labels={PART_STATUS_LABELS} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}
