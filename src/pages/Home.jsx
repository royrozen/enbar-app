import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import StatusBadge from '../components/StatusBadge'
import StatusChips from '../components/StatusChips'
import {
  ImageIcon,
  AlertIcon,
  SpinnerIcon,
  ClipboardIcon,
  PackageIcon,
  ChevronDownIcon,
} from '../components/Icons'
import { supabase, fetchActiveTeamLead } from '../lib/supabase'
import { PART_STATUS_LABELS, groupPartRequestsByOrder, isToday } from '../lib/format'

const TYPE_CHIPS = [
  { value: '', label: 'הכל' },
  { value: 'report', label: 'יומן עבודה' },
  { value: 'part', label: 'הזמנת חלקים' },
  { value: 'exception', label: 'יומן חריגים' },
]

export default function Home() {
  const [lead, setLead] = useState(null)
  const [reports, setReports] = useState(null)
  const [partRequests, setPartRequests] = useState(null)
  const [exceptions, setExceptions] = useState(null)
  const [error, setError] = useState('')
  const [openOrders, setOpenOrders] = useState(() => new Set())
  const [typeFilter, setTypeFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const activeLead = await fetchActiveTeamLead()
        if (cancelled) return
        if (!activeLead) {
          setError('לא נמצא ראש צוות פעיל במערכת — פנו למנהל המפעל')
          setReports([])
          setPartRequests([])
          setExceptions([])
          return
        }
        setLead(activeLead)
        const [{ data, error: err }, { data: parts, error: partsErr }, { data: excs, error: excErr }] =
          await Promise.all([
            supabase
              .from('reports')
              .select('id, report_date, workers_count, issues, created_at, projects(name), report_photos(id)')
              .eq('team_lead_id', activeLead.id)
              .order('report_date', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(100),
            supabase
              .from('part_requests')
              .select(
                'id, order_id, quantity, status, created_at, projects(name), catalog_items(name), other_description',
              )
              .eq('team_lead_id', activeLead.id)
              .order('created_at', { ascending: false })
              .limit(100),
            supabase
              .from('exception_logs')
              .select('id, billable_days, days_overridden, status, created_at, projects(name)')
              .eq('team_lead_id', activeLead.id)
              .order('created_at', { ascending: false })
              .limit(100),
          ])
        if (cancelled) return
        if (err) throw err
        if (partsErr) throw partsErr
        if (excErr) throw excErr
        setReports(data || [])
        setPartRequests(parts || [])
        setExceptions(excs || [])
      } catch {
        if (!cancelled) {
          setError('טעינת הנתונים נכשלה — בדקו את חיבור האינטרנט ונסו שוב')
          setReports([])
          setPartRequests([])
          setExceptions([])
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  function toggleOrder(orderId) {
    setOpenOrders((prev) => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  const loading = reports === null || partRequests === null || exceptions === null

  const todaysReports = (reports || []).filter((r) => isToday(r.created_at))
  const todaysPartOrders = groupPartRequestsByOrder(
    (partRequests || []).filter((r) => isToday(r.created_at)),
  )
  const todaysExceptions = (exceptions || []).filter((e) => isToday(e.created_at))

  const unified = [
    ...todaysReports.map((r) => ({ type: 'report', ts: r.created_at, report: r })),
    ...todaysPartOrders.map((o) => ({ type: 'part', ts: o.createdAt, order: o })),
    ...todaysExceptions.map((e) => ({ type: 'exception', ts: e.created_at, exception: e })),
  ].sort((a, b) => new Date(b.ts) - new Date(a.ts))

  const visible = typeFilter ? unified.filter((u) => u.type === typeFilter) : unified

  return (
    <div className="min-h-dvh">
      <Header />
      <main className="mx-auto max-w-lg px-4 py-6">
        <h1 className="text-2xl font-black">
          שלום{lead ? `, ${lead.name}` : ''}
        </h1>
        <p className="text-primary mt-1">מה קרה היום בשטח?</p>

        {/* Workflow cards */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Link
            to="/report/new"
            className="card p-4 flex flex-col items-center justify-center gap-2 text-center hover:border-accent transition-colors duration-200"
          >
            <ClipboardIcon size={26} className="text-accent" />
            <span className="text-sm font-bold">יומן עבודה</span>
          </Link>
          <Link
            to="/parts/new"
            className="card p-4 flex flex-col items-center justify-center gap-2 text-center hover:border-accent transition-colors duration-200"
          >
            <PackageIcon size={26} className="text-accent" />
            <span className="text-sm font-bold">הזמנת חלקים</span>
          </Link>
          <Link
            to="/exceptions/new"
            className="card p-4 flex flex-col items-center justify-center gap-2 text-center hover:border-accent transition-colors duration-200"
          >
            <AlertIcon size={26} className="text-accent" />
            <span className="text-sm font-bold">יומן חריגים</span>
          </Link>
        </div>

        {/* Today's activity */}
        <div className="mt-8 mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">הפעילות שלי היום</h2>
          <Link to="/history" className="btn btn-ghost text-sm">
            דוחות ישנים
          </Link>
        </div>

        {error && (
          <div className="card border-destructive/40 bg-red-50 p-4 text-destructive font-medium">
            {error}
          </div>
        )}

        {loading && !error && (
          <div className="flex justify-center py-10 text-primary">
            <SpinnerIcon size={32} />
          </div>
        )}

        {!loading && !error && unified.length === 0 && (
          <div className="card p-8 text-center text-primary">
            <ClipboardIcon size={40} className="mx-auto mb-3 opacity-60" />
            <p className="font-bold text-foreground">עדיין לא דיווחתם היום</p>
          </div>
        )}

        {!loading && !error && unified.length > 0 && (
          <div className="mb-3">
            <StatusChips value={typeFilter} onChange={setTypeFilter} options={TYPE_CHIPS} />
          </div>
        )}

        {!loading && !error && unified.length > 0 && visible.length === 0 && (
          <div className="card p-8 text-center text-primary">
            <ClipboardIcon size={40} className="mx-auto mb-3 opacity-60" />
            <p className="font-bold text-foreground">לא נמצאו רשומות מסוג זה היום</p>
          </div>
        )}

        <ul className="flex flex-col gap-3">
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
                      <span className="text-sm font-black">היום</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate">{r.projects?.name || 'פרויקט'}</p>
                      <p className="text-sm text-primary flex items-center gap-2 mt-0.5">
                        <ImageIcon size={15} />
                        {r.report_photos?.length || 0} תמונות
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
                      <span className="text-sm font-black">היום</span>
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
                      <span className="text-sm font-black">היום</span>
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
                    <span className="text-sm font-black">היום</span>
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
      </main>
    </div>
  )
}
