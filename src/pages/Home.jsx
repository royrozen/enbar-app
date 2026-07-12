import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import StatusBadge from '../components/StatusBadge'
import {
  PlusIcon,
  ImageIcon,
  AlertIcon,
  SpinnerIcon,
  ClipboardIcon,
  PackageIcon,
} from '../components/Icons'
import { supabase, fetchActiveTeamLead } from '../lib/supabase'
import { formatDate, PART_STATUS_LABELS } from '../lib/format'

export default function Home() {
  const [lead, setLead] = useState(null)
  const [reports, setReports] = useState(null)
  const [partRequests, setPartRequests] = useState(null)
  const [error, setError] = useState('')

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
          return
        }
        setLead(activeLead)
        const [{ data, error: err }, { data: parts, error: partsErr }] = await Promise.all([
          supabase
            .from('reports')
            .select('id, report_date, workers_count, issues, extras_status, created_at, projects(name), report_photos(id)')
            .eq('team_lead_id', activeLead.id)
            .order('report_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(100),
          supabase
            .from('part_requests')
            .select('id, quantity, status, created_at, projects(name), catalog_items(name), other_description')
            .eq('team_lead_id', activeLead.id)
            .order('created_at', { ascending: false })
            .limit(100),
        ])
        if (cancelled) return
        if (err) throw err
        if (partsErr) throw partsErr
        setReports(data || [])
        setPartRequests(parts || [])
      } catch {
        if (!cancelled) {
          setError('טעינת הדוחות נכשלה — בדקו את חיבור האינטרנט ונסו שוב')
          setReports([])
          setPartRequests([])
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-dvh">
      <Header />
      <main className="mx-auto max-w-lg px-4 py-6">
        <h1 className="text-2xl font-black">
          שלום{lead ? `, ${lead.name}` : ''}
        </h1>
        <p className="text-primary mt-1">מה קרה היום בשטח?</p>

        <Link
          to="/report/new"
          className="btn btn-accent w-full mt-5 !min-h-[64px] !text-xl !rounded-2xl shadow-md shadow-accent/30"
        >
          <PlusIcon size={26} />
          דוח חדש
        </Link>

        <Link to="/parts/new" className="btn btn-outline w-full mt-3 !min-h-[52px]">
          <PackageIcon size={22} />
          הזמן חלק
        </Link>

        <h2 className="mt-8 mb-3 text-lg font-bold">הדוחות שלי</h2>

        {error && (
          <div className="card border-destructive/40 bg-red-50 p-4 text-destructive font-medium">
            {error}
          </div>
        )}

        {reports === null && !error && (
          <div className="flex justify-center py-10 text-primary">
            <SpinnerIcon size={32} />
          </div>
        )}

        {reports !== null && reports.length === 0 && !error && (
          <div className="card p-8 text-center text-primary">
            <ClipboardIcon size={40} className="mx-auto mb-3 opacity-60" />
            <p className="font-bold text-foreground">עדיין אין דוחות</p>
            <p className="text-sm mt-1">הדוח הראשון שתשלחו יופיע כאן</p>
          </div>
        )}

        <ul className="flex flex-col gap-3">
          {(reports || []).map((r) => (
            <li key={r.id}>
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
                    {r.report_photos?.length || 0} תמונות
                    {r.issues && (
                      <span className="inline-flex items-center gap-1 text-destructive font-medium">
                        <AlertIcon size={15} />
                        בעיה
                      </span>
                    )}
                  </p>
                </div>
                <StatusBadge status={r.extras_status} />
              </Link>
            </li>
          ))}
        </ul>

        <h2 className="mt-8 mb-3 text-lg font-bold">בקשות חלקים</h2>

        {partRequests === null && !error && (
          <div className="flex justify-center py-10 text-primary">
            <SpinnerIcon size={32} />
          </div>
        )}

        {partRequests !== null && partRequests.length === 0 && !error && (
          <div className="card p-8 text-center text-primary">
            <PackageIcon size={40} className="mx-auto mb-3 opacity-60" />
            <p className="font-bold text-foreground">עדיין אין בקשות</p>
            <p className="text-sm mt-1">הבקשה הראשונה שתשלחו תופיע כאן</p>
          </div>
        )}

        <ul className="flex flex-col gap-3">
          {(partRequests || []).map((r) => (
            <li key={r.id}>
              <Link
                to={`/parts/${r.id}`}
                className="card flex items-center gap-4 p-4 hover:border-accent transition-colors duration-200"
              >
                <div className="flex flex-col items-center justify-center bg-muted rounded-xl px-3 py-2 min-w-[72px]">
                  <span className="text-sm font-black">{formatDate(r.created_at)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate">
                    {r.catalog_items?.name || r.other_description}
                  </p>
                  <p className="text-sm text-primary flex items-center gap-2 mt-0.5">
                    {r.projects?.name || 'פרויקט'} · כמות: {r.quantity}
                  </p>
                </div>
                <StatusBadge status={r.status} labels={PART_STATUS_LABELS} />
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
