import { useCallback, useEffect, useState } from 'react'
import Header from '../components/Header'
import StatusChips from '../components/StatusChips'
import PartOrderCard from '../components/PartOrderCard'
import PartOrderPrintSheet from '../components/PartOrderPrintSheet'
import { RefreshIcon, SpinnerIcon, PackageIcon } from '../components/Icons'
import { supabase } from '../lib/supabase'
import { todayISO, daysAgoISO, PART_STATUS_LABELS } from '../lib/format'

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

const PART_ORDER_SELECT =
  'id, status, status_updated_by, notes, created_at, projects(name, city, project_code, clients(name)), team_leads(name), part_requests(id, quantity, catalog_item_id, other_description, catalog_items(name))'

export default function ManagerParts() {
  const [projects, setProjects] = useState([])
  const [filters, setFilters] = useState(defaultFilters)
  const [orders, setOrders] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [printOrder, setPrintOrder] = useState(null)

  const loadMeta = useCallback(async () => {
    const { data } = await supabase.from('projects').select('id, name').is('deleted_at', null).order('name')
    setProjects(data || [])
  }, [])

  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let q = supabase
        .from('part_orders')
        .select(PART_ORDER_SELECT)
        .order('created_at', { ascending: false })
        .limit(200)
      if (filters.status) q = q.eq('status', filters.status)
      if (filters.projectId) q = q.eq('project_id', filters.projectId)
      if (filters.from) q = q.gte('created_at', filters.from)
      if (filters.to) q = q.lte('created_at', `${filters.to}T23:59:59`)
      const { data, error: err } = await q
      if (err) throw err
      setOrders(data || [])
    } catch {
      setError('טעינת הבקשות נכשלה — נסו לרענן')
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadMeta()
  }, [loadMeta])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  function refresh() {
    loadMeta()
    loadOrders()
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

        {/* Orders list */}
        {orders === null ? (
          <div className="flex justify-center py-12 text-primary">
            <SpinnerIcon size={32} />
          </div>
        ) : orders.length === 0 ? (
          <div className="card p-10 mt-4 text-center text-primary">
            <PackageIcon size={40} className="mx-auto mb-3 opacity-60" />
            <p className="font-bold text-foreground">לא נמצאו בקשות</p>
            <p className="text-sm mt-1">נסו להרחיב את טווח התאריכים או לאפס את המסננים</p>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {orders.map((order) => (
              <PartOrderCard
                key={order.id}
                order={order}
                manager
                onChanged={loadOrders}
                onPrint={setPrintOrder}
              />
            ))}
          </ul>
        )}
      </main>

      {printOrder && <PartOrderPrintSheet order={printOrder} onClose={() => setPrintOrder(null)} />}
    </div>
  )
}
