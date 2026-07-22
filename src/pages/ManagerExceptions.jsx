import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import StatusBadge from '../components/StatusBadge'
import StatusChips from '../components/StatusChips'
import { RefreshIcon, SpinnerIcon, AlertIcon } from '../components/Icons'
import { supabase } from '../lib/supabase'
import { formatDate, todayISO, daysAgoISO, EXCEPTION_STATUS_LABELS } from '../lib/format'

const STATUS_CHIPS = [
  { value: '', label: 'הכל' },
  ...Object.entries(EXCEPTION_STATUS_LABELS).map(([value, label]) => ({ value, label })),
]

const defaultFilters = () => ({
  status: '',
  projectId: '',
  from: daysAgoISO(29), // default: last 30 days
  to: todayISO(),
})

export default function ManagerExceptions() {
  const [projects, setProjects] = useState([])
  const [filters, setFilters] = useState(defaultFilters)
  const [logs, setLogs] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadMeta = useCallback(async () => {
    const { data } = await supabase.from('projects').select('id, name').is('deleted_at', null).order('name')
    setProjects(data || [])
  }, [])

  const loadLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let q = supabase
        .from('exception_logs')
        .select('id, exception_no, workers_count, work_days, billable_days, days_overridden, status, created_at, projects(name, clients(name)), team_leads(name)')
        .order('created_at', { ascending: false })
        .limit(200)
      if (filters.status) q = q.eq('status', filters.status)
      if (filters.projectId) q = q.eq('project_id', filters.projectId)
      if (filters.from) q = q.gte('created_at', filters.from)
      if (filters.to) q = q.lte('created_at', `${filters.to}T23:59:59`)
      const { data, error: err } = await q
      if (err) throw err
      setLogs(data || [])
    } catch {
      setError('טעינת היומנים נכשלה — נסו לרענן')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadMeta()
  }, [loadMeta])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  function refresh() {
    loadMeta()
    loadLogs()
  }

  return (
    <div className="min-h-dvh">
      <Header backTo="/manager" title="יומני חריגים" />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-black">יומני חריגים</h1>
          <button className="btn btn-ghost text-sm" onClick={refresh} disabled={loading}>
            <RefreshIcon size={18} className={loading ? 'spin' : ''} />
            רענון
          </button>
        </div>

        <div className="mt-4">
          <StatusChips
            value={filters.status}
            onChange={(status) => setFilters((f) => ({ ...f, status }))}
            options={STATUS_CHIPS}
          />
        </div>

        <div className="card mt-3 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div className="sm:col-span-1">
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
          <button
            className="btn btn-ghost !min-h-[48px] sm:col-span-2 lg:col-span-1"
            onClick={() => setFilters(defaultFilters())}
          >
            איפוס מסננים
          </button>
        </div>

        {error && (
          <div className="card border-destructive/40 bg-red-50 p-4 mt-4 text-destructive font-medium">
            {error}
          </div>
        )}

        {logs === null || loading ? (
          <div className="flex justify-center py-12 text-primary">
            <SpinnerIcon size={32} />
          </div>
        ) : logs.length === 0 ? (
          <div className="card p-10 mt-4 text-center text-primary">
            <AlertIcon size={40} className="mx-auto mb-3 opacity-60" />
            <p className="font-bold text-foreground">לא נמצאו יומני חריגים</p>
            <p className="text-sm mt-1">נסו להרחיב את טווח התאריכים או לאפס את המסננים</p>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {logs.map((l) => {
              const days = Number(l.billable_days)
              const daysText = days % 1 === 0 ? String(days) : days.toFixed(1)
              return (
                <li key={l.id}>
                  <Link
                    to={`/manager/exceptions/${l.id}`}
                    className="card flex items-center gap-4 p-3.5 hover:border-accent transition-colors duration-200"
                  >
                    <div className="flex flex-col items-center justify-center bg-muted rounded-xl px-3 py-2 min-w-[72px]">
                      <span className="text-sm font-black">{formatDate(l.created_at)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold truncate">{l.projects?.name}</span>
                        {l.exception_no != null && (
                          <span className="text-xs text-primary">#{l.exception_no}</span>
                        )}
                        <span className="text-sm text-primary">{l.projects?.clients?.name}</span>
                      </div>
                      <p className="text-sm text-primary mt-1 flex items-center gap-3 flex-wrap">
                        <span>{l.team_leads?.name}</span>
                        <span className="font-bold text-accent">{daysText} ימי חיוב</span>
                        {l.days_overridden && <span className="text-xs text-amber-700">(הוזן ידנית)</span>}
                      </p>
                    </div>
                    <StatusBadge status={l.status} />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}
