import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import StatusBadge from '../components/StatusBadge'
import { ImageIcon, RefreshIcon, SpinnerIcon, PackageIcon } from '../components/Icons'
import { supabase, partPhotoUrl } from '../lib/supabase'
import { formatDate, todayISO, daysAgoISO, PART_STATUS_LABELS } from '../lib/format'

const defaultFilters = () => ({
  status: '',
  projectId: '',
  from: daysAgoISO(6), // default: last 7 days
  to: todayISO(),
})

export default function ManagerParts() {
  const [projects, setProjects] = useState([])
  const [filters, setFilters] = useState(defaultFilters)
  const [requests, setRequests] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadMeta = useCallback(async () => {
    const { data } = await supabase.from('projects').select('id, name').order('name')
    setProjects(data || [])
  }, [])

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let q = supabase
        .from('part_requests')
        .select(
          'id, quantity, status, created_at, photo_path, projects(name, clients(name)), team_leads(name), catalog_items(name), other_description',
        )
        .order('created_at', { ascending: false })
        .limit(200)
      if (filters.status) q = q.eq('status', filters.status)
      if (filters.projectId) q = q.eq('project_id', filters.projectId)
      if (filters.from) q = q.gte('created_at', filters.from)
      if (filters.to) q = q.lte('created_at', `${filters.to}T23:59:59`)
      const { data, error: err } = await q
      if (err) throw err
      setRequests(data || [])
    } catch {
      setError('טעינת הבקשות נכשלה — נסו לרענן')
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadMeta()
  }, [loadMeta])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  function refresh() {
    loadMeta()
    loadRequests()
  }

  return (
    <div className="min-h-dvh">
      <Header backTo="/manager" title="בקשות חלקים" />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-black">בקשות חלקים</h1>
          <button className="btn btn-ghost text-sm" onClick={refresh} disabled={loading}>
            <RefreshIcon size={18} className={loading ? 'spin' : ''} />
            רענון
          </button>
        </div>

        {/* Filters */}
        <div className="card mt-4 p-4 grid grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label className="label !text-xs" htmlFor="f-status">סטטוס</label>
            <select
              id="f-status"
              className="input !min-h-[48px]"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="">כל הסטטוסים</option>
              {Object.entries(PART_STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2 lg:col-span-1">
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
          <div>
            <label className="label !text-xs" htmlFor="f-from">מתאריך</label>
            <input
              id="f-from"
              type="date"
              className="input !min-h-[48px]"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            />
          </div>
          <div>
            <label className="label !text-xs" htmlFor="f-to">עד תאריך</label>
            <input
              id="f-to"
              type="date"
              className="input !min-h-[48px]"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            />
          </div>
          <button
            className="btn btn-ghost !min-h-[48px] col-span-2 lg:col-span-1"
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

        {/* Requests list */}
        {requests === null ? (
          <div className="flex justify-center py-12 text-primary">
            <SpinnerIcon size={32} />
          </div>
        ) : requests.length === 0 ? (
          <div className="card p-10 mt-4 text-center text-primary">
            <PackageIcon size={40} className="mx-auto mb-3 opacity-60" />
            <p className="font-bold text-foreground">לא נמצאו בקשות</p>
            <p className="text-sm mt-1">נסו להרחיב את טווח התאריכים או לאפס את המסננים</p>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {requests.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/manager/parts/${r.id}`}
                  className="card flex items-center gap-4 p-3.5 hover:border-accent transition-colors duration-200"
                >
                  <div className="h-16 w-16 shrink-0 rounded-xl overflow-hidden bg-muted border border-border flex items-center justify-center text-primary">
                    {r.photo_path ? (
                      <img
                        src={partPhotoUrl(r.photo_path)}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon size={24} className="opacity-50" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold truncate">
                        {r.catalog_items?.name || r.other_description}
                      </span>
                      <span className="text-sm text-primary">{formatDate(r.created_at)}</span>
                    </div>
                    <p className="text-sm text-primary mt-1 flex items-center gap-3 flex-wrap">
                      <span>{r.projects?.name}</span>
                      <span>{r.team_leads?.name}</span>
                      <span>כמות: {r.quantity}</span>
                    </p>
                  </div>
                  <StatusBadge status={r.status} labels={PART_STATUS_LABELS} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
