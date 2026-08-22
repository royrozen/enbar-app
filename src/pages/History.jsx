import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import StatusBadge from '../components/StatusBadge'
import StatusChips from '../components/StatusChips'
import TypeChip from '../components/TypeChip'
import PartOrderCard from '../components/PartOrderCard'
import { ImageIcon, AlertIcon, SpinnerIcon, ClipboardIcon } from '../components/Icons'
import { supabase } from '../lib/supabase'
import { formatDate, todayISO, monthStartISO } from '../lib/format'
import { useAuth } from '../lib/AuthContext'

const TYPE_CHIPS = [
  { value: '', label: 'הכל' },
  { value: 'report', label: 'יומן עבודה' },
  { value: 'part', label: 'הזמנת חלקים' },
  { value: 'exception', label: 'אישורי עבודה נוספת' },
]

const defaultFilters = () => ({
  type: '',
  clientId: '',
  projectId: '',
  from: monthStartISO(), // default: from the start of the current month
  to: todayISO(),
})

const PART_ORDER_SELECT =
  'id, status, status_updated_by, notes, created_at, projects(name, city, clients(name)), part_requests(id, quantity, catalog_item_id, other_description, catalog_items(name))'

export default function History() {
  const { profile, viewAsTeamLead } = useAuth()
  const effectiveTeamLeadId = viewAsTeamLead?.id || profile?.team_lead_id
  const [lead, setLead] = useState(null)
  const [clients, setClients] = useState([])
  const [filters, setFilters] = useState(defaultFilters)
  const [reports, setReports] = useState(null)
  const [partOrders, setPartOrders] = useState(null)
  const [exceptions, setExceptions] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const loadMeta = useCallback(async () => {
    const [{ data: activeLead }, { data: cls }] = await Promise.all([
      effectiveTeamLeadId
        ? supabase.from('team_leads').select('id, name').eq('id', effectiveTeamLeadId).single()
        : Promise.resolve({ data: null }),
      // Includes inactive clients/projects, not just deleted-filtered — same
      // "show full history regardless of active status" precedent the plain
      // project filter already used.
      supabase
        .from('clients')
        .select('id, name, projects(id, name, deleted_at)')
        .is('deleted_at', null)
        .order('name')
        .order('name', { foreignTable: 'projects' }),
    ])
    setLead(activeLead)
    setClients(
      (cls || []).map((c) => ({ ...c, projects: (c.projects || []).filter((p) => !p.deleted_at) })),
    )
    return activeLead
  }, [effectiveTeamLeadId])

  const loadData = useCallback(async (activeLead) => {
    if (!activeLead) return
    setLoading(true)
    setError('')
    try {
      // No specific project chosen but a client is: narrow to that client's
      // project ids client-side (already have them from loadMeta) rather
      // than joining clients into every query.
      const clientProjectIds = filters.clientId
        ? (clients.find((c) => c.id === filters.clientId)?.projects || []).map((p) => p.id)
        : null
      if (clientProjectIds && clientProjectIds.length === 0) {
        setReports([])
        setPartOrders([])
        setExceptions([])
        return
      }

      let reportsQ = supabase
        .from('reports')
        .select('id, report_no, report_date, workers_count, issues, created_at, projects(name, clients(name))')
        .eq('team_lead_id', activeLead.id)
        .order('report_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200)
      if (filters.projectId) reportsQ = reportsQ.eq('project_id', filters.projectId)
      else if (clientProjectIds) reportsQ = reportsQ.in('project_id', clientProjectIds)
      if (filters.from) reportsQ = reportsQ.gte('report_date', filters.from)
      if (filters.to) reportsQ = reportsQ.lte('report_date', filters.to)

      let partsQ = supabase
        .from('part_orders')
        .select(PART_ORDER_SELECT)
        .eq('team_lead_id', activeLead.id)
        .order('created_at', { ascending: false })
        .limit(200)
      if (filters.projectId) partsQ = partsQ.eq('project_id', filters.projectId)
      else if (clientProjectIds) partsQ = partsQ.in('project_id', clientProjectIds)
      if (filters.from) partsQ = partsQ.gte('created_at', filters.from)
      if (filters.to) partsQ = partsQ.lte('created_at', `${filters.to}T23:59:59`)

      let excQ = supabase
        .from('exception_logs')
        .select('id, billable_days, days_overridden, status, created_at, projects(name, clients(name))')
        .eq('team_lead_id', activeLead.id)
        .order('created_at', { ascending: false })
        .limit(200)
      if (filters.projectId) excQ = excQ.eq('project_id', filters.projectId)
      else if (clientProjectIds) excQ = excQ.in('project_id', clientProjectIds)
      if (filters.from) excQ = excQ.gte('created_at', filters.from)
      if (filters.to) excQ = excQ.lte('created_at', `${filters.to}T23:59:59`)

      const [{ data: rpts, error: rErr }, { data: orders, error: pErr }, { data: excs, error: eErr }] =
        await Promise.all([reportsQ, partsQ, excQ])
      if (rErr) throw rErr
      if (pErr) throw pErr
      if (eErr) throw eErr
      setReports(rpts || [])
      setPartOrders(orders || [])
      setExceptions(excs || [])
    } catch {
      setError('טעינת הנתונים נכשלה — נסו לרענן')
      setReports([])
      setPartOrders([])
      setExceptions([])
    } finally {
      setLoading(false)
    }
  }, [filters, clients])

  useEffect(() => {
    let cancelled = false
    loadMeta().then((activeLead) => {
      if (!cancelled) loadData(activeLead)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTeamLeadId])

  useEffect(() => {
    if (lead) loadData(lead)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const reportItems = (reports || []).map((r) => ({ type: 'report', ts: r.report_date, report: r }))
  const partItems = (partOrders || []).map((o) => ({ type: 'part', ts: o.created_at, order: o }))
  const exceptionItems = (exceptions || []).map((e) => ({ type: 'exception', ts: e.created_at, exception: e }))
  const unified = [...reportItems, ...partItems, ...exceptionItems].sort(
    (a, b) => new Date(b.ts) - new Date(a.ts),
  )
  const typeFiltered = filters.type ? unified.filter((u) => u.type === filters.type) : unified
  const q = search.trim().toLowerCase()
  const visible = !q
    ? typeFiltered
    : typeFiltered.filter((u) => {
        const record = u.type === 'report' ? u.report : u.type === 'exception' ? u.exception : u.order
        const projectName = record.projects?.name || ''
        const clientName = record.projects?.clients?.name || ''
        const reportNo = u.type === 'report' ? String(record.report_no ?? '') : ''
        return [projectName, clientName, reportNo].some((v) => v.toLowerCase().includes(q))
      })

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
            <label className="label !text-xs" htmlFor="f-client">לקוח</label>
            <select
              id="f-client"
              className="input !min-h-[48px]"
              value={filters.clientId}
              onChange={(e) => setFilters((f) => ({ ...f, clientId: e.target.value, projectId: '' }))}
            >
              <option value="">כל הלקוחות</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label !text-xs" htmlFor="f-project">פרויקט</label>
            <select
              id="f-project"
              className="input !min-h-[48px]"
              value={filters.projectId}
              onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))}
            >
              <option value="">כל הפרויקטים</option>
              {(filters.clientId
                ? clients.find((c) => c.id === filters.clientId)?.projects || []
                : clients.flatMap((c) => c.projects).sort((a, b) => a.name.localeCompare(b.name, 'he'))
              ).map((p) => (
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
          <div className="sm:col-span-2 min-w-0">
            <label className="label !text-xs" htmlFor="f-search">חיפוש לפי פרויקט, לקוח או מספר דוח</label>
            <input
              id="f-search"
              type="text"
              className="input !min-h-[48px] w-full min-w-0"
              placeholder="לדוגמה: אפל הרצליה, אלקטרה, 245"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
                        <TypeChip type="report" className="mb-1" />
                        <p className="font-bold truncate">
                          {r.projects?.name || 'פרויקט'}
                          {r.report_no != null && (
                            <span className="text-xs text-primary font-normal ms-2">#{r.report_no}</span>
                          )}
                        </p>
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
                        <TypeChip type="exception" className="mb-1" />
                        <p className="font-bold truncate">{ex.projects?.name || 'פרויקט'}</p>
                        <p className="text-sm text-primary mt-0.5">
                          אישורי עבודה נוספת · {d} ימי חיוב
                        </p>
                      </div>
                      <StatusBadge status={ex.status} />
                    </Link>
                  </li>
                )
              }

              return (
                <PartOrderCard
                  key={`part-${item.order.id}`}
                  order={item.order}
                  onChanged={() => loadData(lead)}
                  typeChip={<TypeChip type="part" />}
                />
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}
