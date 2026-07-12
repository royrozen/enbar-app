import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Header from '../components/Header'
import StatusBadge from '../components/StatusBadge'
import PhotoGallery from '../components/PhotoGallery'
import { AlertIcon, SpinnerIcon, UsersIcon, CalendarIcon } from '../components/Icons'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/format'

export default function ReportView() {
  const { id } = useParams()
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error: err } = await supabase
        .from('reports')
        .select('*, projects(name, city, clients(name)), team_leads(name), report_photos(*)')
        .eq('id', id)
        .single()
      if (cancelled) return
      if (err || !data) setError('הדוח לא נמצא')
      else setReport(data)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  const workPhotos = report?.report_photos?.filter((p) => p.kind === 'work') || []
  const issuePhotos = report?.report_photos?.filter((p) => p.kind === 'issue') || []

  return (
    <div className="min-h-dvh">
      <Header backTo="/home" title="צפייה בדוח" />
      <main className="mx-auto max-w-lg px-4 py-6">
        {error && (
          <div className="card border-destructive/40 bg-red-50 p-4 text-destructive font-medium">{error}</div>
        )}
        {!report && !error && (
          <div className="flex justify-center py-10 text-primary">
            <SpinnerIcon size={32} />
          </div>
        )}
        {report && (
          <div className="flex flex-col gap-5">
            <div className="card p-5">
              <h1 className="text-xl font-black">{report.projects?.name}</h1>
              {report.projects?.clients?.name && (
                <p className="text-sm text-primary mt-0.5">לקוח: {report.projects.clients.name}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-primary">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon size={16} />
                  {formatDate(report.report_date)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <UsersIcon size={16} />
                  {report.workers_count} עובדים
                </span>
              </div>
            </div>

            <section className="card p-5">
              <h2 className="font-bold mb-2">תיאור העבודה</h2>
              <p className="whitespace-pre-wrap leading-relaxed">{report.work_description}</p>
              {workPhotos.length > 0 && (
                <div className="mt-4">
                  <PhotoGallery photos={workPhotos} />
                </div>
              )}
            </section>

            <section className="card p-5">
              <h2 className="font-bold mb-2 flex items-center gap-2">
                בעיות שהתגלו
                {report.issues && <AlertIcon size={18} className="text-destructive" />}
              </h2>
              {report.issues ? (
                <p className="whitespace-pre-wrap leading-relaxed">{report.issues}</p>
              ) : (
                <p className="text-primary">לא התגלו בעיות</p>
              )}
              {issuePhotos.length > 0 && (
                <div className="mt-4">
                  <PhotoGallery photos={issuePhotos} />
                </div>
              )}
            </section>

            {report.extras_description && (
              <section className="card p-5 border-amber-200">
                <h2 className="font-bold mb-2 flex items-center justify-between">
                  תוספת / חריגה לאישור
                  <StatusBadge status={report.extras_status} />
                </h2>
                <p className="whitespace-pre-wrap leading-relaxed">{report.extras_description}</p>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
