import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import { ImageIcon, AlertIcon, SpinnerIcon, ClipboardIcon, PencilIcon } from '../components/Icons'
import { supabase } from '../lib/supabase'
import { formatDate, todayISO, daysAgoISO } from '../lib/format'
import { useAuth } from '../lib/AuthContext'

const defaultFilters = () => ({
  projectId: '',
  from: daysAgoISO(29), // default: last 30 days
  to: todayISO(),
})

function DisplayNameEditor({ profile, session }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(profile.display_name || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await supabase.from('profiles').update({ display_name: value.trim() }).eq('id', session.user.id)
    setSaving(false)
    setEditing(false)
    profile.display_name = value.trim() // reflect immediately without a refetch
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="btn btn-ghost !p-1.5 text-primary"
        aria-label="עריכת שם תצוגה"
        onClick={() => setEditing(true)}
      >
        <PencilIcon size={16} />
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-2">
      <input
        autoFocus
        className="input !min-h-[36px] !py-1 !w-40 text-sm"
        placeholder="השם שלך"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={saving}
      />
      <button type="button" className="btn btn-accent !min-h-[36px] !py-1 text-sm" onClick={save} disabled={saving}>
        שמירה
      </button>
    </span>
  )
}

export default function ManagerMyReports() {
  const { session, profile } = useAuth()
  const [projects, setProjects] = useState([])
  const [filters, setFilters] = useState(defaultFilters)
  const [reports, setReports] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [reportNoSearch, setReportNoSearch] = useState('')

  const loadProjects = useCallback(async () => {
    const { data } = await supabase.from('projects').select('id, name').is('deleted_at', null).order('name')
    setProjects(data || [])
  }, [])

  const loadReports = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let q = supabase
        .from('reports')
        .select('id, report_no, report_date, workers_count, issues, created_at, projects(name)')
        .eq('created_by', session.user.id)
        .order('report_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200)
      if (filters.projectId) q = q.eq('project_id', filters.projectId)
      if (filters.from) q = q.gte('report_date', filters.from)
      if (filters.to) q = q.lte('report_date', filters.to)
      const { data, error: err } = await q
      if (err) throw err
      setReports(data || [])
    } catch {
      setError('טעינת הנתונים נכשלה — נסו לרענן')
      setReports([])
    } finally {
      setLoading(false)
    }
  }, [session, filters])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  const q = reportNoSearch.trim()
  const visible = !q
    ? reports || []
    : (reports || []).filter((r) => String(r.report_no ?? '').includes(q))

  return (
    <div className="min-h-dvh manager-desktop">
      <Header backTo="/manager" title="הדוחות שלי" />
      <main className="mx-auto max-w-lg px-4 py-6">
        <h1 className="text-2xl font-black mb-1 flex items-center gap-2">
          שלום, {profile.display_name || 'מנהל מפעל'}
          <DisplayNameEditor profile={profile} session={session} />
        </h1>
        <p className="text-primary mb-5 text-sm">דוחות שהגשתם באופן אישי, בכל ראשי הצוות</p>

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
          <div className="sm:col-span-2 min-w-0">
            <label className="label !text-xs" htmlFor="f-report-no">חיפוש לפי מספר דוח</label>
            <input
              id="f-report-no"
              type="text"
              inputMode="numeric"
              className="input !min-h-[48px] w-full min-w-0"
              placeholder="לדוגמה: 245"
              value={reportNoSearch}
              onChange={(e) => setReportNoSearch(e.target.value)}
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
            <p className="font-bold text-foreground">לא נמצאו דוחות</p>
            <p className="text-sm mt-1">נסו להרחיב את טווח התאריכים או לשנות את הסינון</p>
          </div>
        )}

        {!loading && !error && visible.length > 0 && (
          <ul className="mt-4 flex flex-col gap-3">
            {visible.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/manager/report/${r.id}`}
                  className="card flex items-center gap-4 p-4 hover:border-accent transition-colors duration-200"
                >
                  <div className="flex flex-col items-center justify-center bg-muted rounded-xl px-3 py-2 min-w-[72px]">
                    <span className="text-sm font-black">{formatDate(r.report_date)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
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
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
