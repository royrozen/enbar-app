import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import {
  AlertIcon,
  ImageIcon,
  RefreshIcon,
  SpinnerIcon,
  UsersIcon,
  ClipboardIcon,
  PackageIcon,
  SearchIcon,
} from '../components/Icons'
import { supabase, photoUrl } from '../lib/supabase'
import { formatDate, todayISO, daysAgoISO } from '../lib/format'

const defaultFilters = () => ({
  projectId: '',
  leadId: '',
  from: daysAgoISO(6), // default: last 7 days
  to: todayISO(),
})

export default function ManagerDashboard() {
  const [projects, setProjects] = useState([])
  const [leads, setLeads] = useState([])
  const [filters, setFilters] = useState(defaultFilters)
  const [search, setSearch] = useState('')
  const [reports, setReports] = useState(null)
  const [stats, setStats] = useState({ today: null, pendingExceptions: null, pendingParts: null })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadMeta = useCallback(async () => {
    const [projRes, leadRes, todayRes, pendingRes, pendingPartsRes] = await Promise.all([
      supabase.from('projects').select('id, name').is('deleted_at', null).order('name'),
      supabase.from('team_leads').select('id, name').is('deleted_at', null).order('name'),
      supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('report_date', todayISO()),
      supabase
        .from('exception_logs')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'approved'),
      supabase
        .from('part_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ])
    setProjects(projRes.data || [])
    setLeads(leadRes.data || [])
    setStats({
      today: todayRes.count ?? 0,
      pendingExceptions: pendingRes.count ?? 0,
      pendingParts: pendingPartsRes.count ?? 0,
    })
  }, [])

  const loadReports = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let q = supabase
        .from('reports')
        .select(
          'id, report_date, workers_count, issues, created_at, projects(name), team_leads(name), report_photos(id, storage_path, sort_order)',
        )
        .order('report_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200)
      if (filters.projectId) q = q.eq('project_id', filters.projectId)
      if (filters.leadId) q = q.eq('team_lead_id', filters.leadId)
      if (filters.from) q = q.gte('report_date', filters.from)
      if (filters.to) q = q.lte('report_date', filters.to)
      const { data, error: err } = await q
      if (err) throw err
      setReports(data || [])
    } catch {
      setError('טעינת הדוחות נכשלה — נסו לרענן')
      setReports([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadMeta()
  }, [loadMeta])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  function refresh() {
    loadMeta()
    loadReports()
  }

  function firstThumb(r) {
    const sorted = [...(r.report_photos || [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    )
    return sorted[0] ? photoUrl(sorted[0].storage_path) : null
  }

  const q = search.trim()
  const visibleReports = !q
    ? reports
    : (reports || []).filter((r) => {
        const haystack = `${r.projects?.name || ''} ${r.team_leads?.name || ''} ${formatDate(r.report_date)}`
        return haystack.includes(q)
      })

  return (
    <div className="min-h-dvh">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-black">לוח דוחות</h1>
          <button className="btn btn-ghost text-sm" onClick={refresh} disabled={loading}>
            <RefreshIcon size={18} className={loading ? 'spin' : ''} />
            רענון
          </button>
        </div>

        {/* Status row */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card p-4 flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-primary">
              <ClipboardIcon size={24} />
            </span>
            <div>
              <p className="text-3xl font-black leading-none">
                {stats.today ?? '—'}
              </p>
              <p className="text-sm text-primary mt-1">דוחות היום</p>
            </div>
          </div>
          <Link to="/manager/exceptions" className="card p-4 flex items-center gap-4 hover:border-accent transition-colors duration-200">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white">
              <AlertIcon size={24} />
            </span>
            <div>
              <p className="text-3xl font-black leading-none text-accent">
                {stats.pendingExceptions ?? '—'}
              </p>
              <p className="text-sm text-primary mt-1">יומני חריגים ממתינים — לחצו לצפייה</p>
            </div>
          </Link>
          <Link to="/manager/parts" className="card p-4 flex items-center gap-4 hover:border-accent transition-colors duration-200">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white">
              <PackageIcon size={24} />
            </span>
            <div>
              <p className="text-3xl font-black leading-none text-accent">
                {stats.pendingParts ?? '—'}
              </p>
              <p className="text-sm text-primary mt-1">חלקים ממתינים — לחצו לצפייה</p>
            </div>
          </Link>
        </div>

        {/* Filters */}
        <div className="card mt-4 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
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
          <div className="sm:col-span-1">
            <label className="label !text-xs" htmlFor="f-lead">ראש צוות</label>
            <select
              id="f-lead"
              className="input !min-h-[48px]"
              value={filters.leadId}
              onChange={(e) => setFilters((f) => ({ ...f, leadId: e.target.value }))}
            >
              <option value="">כל ראשי הצוות</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
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

        {/* Search */}
        <div className="relative mt-4">
          <SearchIcon
            size={18}
            className="absolute top-1/2 -translate-y-1/2 start-3 text-primary pointer-events-none"
          />
          <input
            type="text"
            className="input !ps-10"
            placeholder="חיפוש דוח לפי פרויקט, ראש צוות או תאריך..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Reports list */}
        {reports === null ? (
          <div className="flex justify-center py-12 text-primary">
            <SpinnerIcon size={32} />
          </div>
        ) : visibleReports.length === 0 ? (
          <div className="card p-10 mt-4 text-center text-primary">
            <ClipboardIcon size={40} className="mx-auto mb-3 opacity-60" />
            <p className="font-bold text-foreground">לא נמצאו דוחות</p>
            <p className="text-sm mt-1">
              {q ? 'נסו חיפוש אחר' : 'נסו להרחיב את טווח התאריכים או לאפס את המסננים'}
            </p>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {visibleReports.map((r) => {
              const thumb = firstThumb(r)
              return (
                <li key={r.id}>
                  <Link
                    to={`/manager/report/${r.id}`}
                    className="card flex items-center gap-4 p-3.5 hover:border-accent transition-colors duration-200"
                  >
                    <div className="h-16 w-16 shrink-0 rounded-xl overflow-hidden bg-muted border border-border flex items-center justify-center text-primary">
                      {thumb ? (
                        <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon size={24} className="opacity-50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold truncate">{r.projects?.name || 'פרויקט'}</span>
                        <span className="text-sm text-primary">{formatDate(r.report_date)}</span>
                      </div>
                      <p className="text-sm text-primary mt-1 flex items-center gap-3 flex-wrap">
                        <span>{r.team_leads?.name}</span>
                        <span className="inline-flex items-center gap-1">
                          <UsersIcon size={15} />
                          {r.workers_count}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <ImageIcon size={15} />
                          {r.report_photos?.length || 0}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {r.issues && (
                        <span
                          className="text-destructive inline-flex items-center gap-1 text-xs font-bold"
                          title="דווחה בעיה באתר"
                        >
                          <AlertIcon size={16} />
                          בעיה
                        </span>
                      )}
                    </div>
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
