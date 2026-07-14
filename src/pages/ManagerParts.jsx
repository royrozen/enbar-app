import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import StatusBadge from '../components/StatusBadge'
import StatusChips from '../components/StatusChips'
import { ImageIcon, RefreshIcon, SpinnerIcon, PackageIcon, ChevronDownIcon } from '../components/Icons'
import { supabase, partPhotoUrl } from '../lib/supabase'
import {
  formatDate,
  todayISO,
  daysAgoISO,
  PART_STATUS_LABELS,
  groupPartRequestsByOrder,
} from '../lib/format'

const defaultFilters = () => ({
  status: '',
  projectId: '',
  from: daysAgoISO(6), // default: last 7 days
  to: todayISO(),
})

const PART_STATUS_CHIPS = [
  { value: '', label: 'הכל' },
  ...Object.entries(PART_STATUS_LABELS).map(([value, label]) => ({ value, label })),
]

export default function ManagerParts() {
  const [projects, setProjects] = useState([])
  const [filters, setFilters] = useState(defaultFilters)
  const [requests, setRequests] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [openOrders, setOpenOrders] = useState(() => new Set())

  function toggleOrder(orderId) {
    setOpenOrders((prev) => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

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
          'id, order_id, quantity, status, created_at, photo_path, projects(name, clients(name)), team_leads(name), catalog_items(name), other_description',
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

  const orders = groupPartRequestsByOrder(requests)

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

        {/* Status filter */}
        <div className="mt-4">
          <StatusChips
            value={filters.status}
            onChange={(status) => setFilters((f) => ({ ...f, status }))}
            options={PART_STATUS_CHIPS}
          />
        </div>

        {/* Filters */}
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
            {orders.map((order) => {
              const first = order.items[0]

              if (order.items.length === 1) {
                return (
                  <li key={order.orderId}>
                    <Link
                      to={`/manager/parts/${first.id}`}
                      className="card flex items-center gap-4 p-3.5 hover:border-accent transition-colors duration-200"
                    >
                      <div className="h-16 w-16 shrink-0 rounded-xl overflow-hidden bg-muted border border-border flex items-center justify-center text-primary">
                        {first.photo_path ? (
                          <img
                            src={partPhotoUrl(first.photo_path)}
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
                            {first.catalog_items?.name || first.other_description}
                          </span>
                          <span className="text-sm text-primary">{formatDate(first.created_at)}</span>
                        </div>
                        <p className="text-sm text-primary mt-1 flex items-center gap-3 flex-wrap">
                          <span>{first.projects?.name}</span>
                          <span>{first.team_leads?.name}</span>
                          <span>כמות: {first.quantity}</span>
                        </p>
                      </div>
                      <StatusBadge status={first.status} labels={PART_STATUS_LABELS} />
                    </Link>
                  </li>
                )
              }

              const isOpen = openOrders.has(order.orderId)
              return (
                <li key={order.orderId} className="card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleOrder(order.orderId)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-4 p-3.5 hover:bg-muted transition-colors duration-200 text-start"
                  >
                    <div className="h-16 w-16 shrink-0 rounded-xl overflow-hidden bg-muted border border-border flex items-center justify-center text-primary">
                      {first.photo_path ? (
                        <img
                          src={partPhotoUrl(first.photo_path)}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <PackageIcon size={24} className="opacity-50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold truncate">
                          {order.items.length} פריטים
                        </span>
                        <span className="text-sm text-primary">{formatDate(order.createdAt)}</span>
                      </div>
                      <p className="text-sm text-primary mt-1 flex items-center gap-3 flex-wrap">
                        <span>{first.projects?.name}</span>
                        <span>{first.team_leads?.name}</span>
                      </p>
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
                            to={`/manager/parts/${r.id}`}
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
