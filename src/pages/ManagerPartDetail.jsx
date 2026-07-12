import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Header from '../components/Header'
import StatusBadge from '../components/StatusBadge'
import Lightbox from '../components/Lightbox'
import { SpinnerIcon, CalendarIcon, PackageIcon, SendIcon, CheckIcon } from '../components/Icons'
import { supabase, partPhotoUrl } from '../lib/supabase'
import { formatDate, PART_STATUS_LABELS } from '../lib/format'
import { getProfile, PROFILES } from '../lib/profile'

export default function ManagerPartDetail() {
  const { id } = useParams()
  const [request, setRequest] = useState(null)
  const [error, setError] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [lightboxOpen, setLightboxOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error: err } = await supabase
        .from('part_requests')
        .select(
          '*, projects(name, city, clients(name)), team_leads(name), catalog_items(name)',
        )
        .eq('id', id)
        .single()
      if (cancelled) return
      if (err || !data) {
        setError('הבקשה לא נמצאה')
        return
      }
      setRequest(data)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  const partName = request?.catalog_items?.name || request?.other_description

  async function setStatus(status) {
    if (!request || statusBusy) return
    setStatusBusy(true)
    setStatusError('')
    try {
      const updatedBy = PROFILES[getProfile()] || 'לא ידוע'
      const { error: err } = await supabase
        .from('part_requests')
        .update({ status, status_updated_by: updatedBy })
        .eq('id', request.id)
      if (err) throw err
      setRequest((r) => ({ ...r, status, status_updated_by: updatedBy }))
    } catch {
      setStatusError('עדכון הסטטוס נכשל — נסו שוב')
    } finally {
      setStatusBusy(false)
    }
  }

  function statusActions() {
    const s = request.status
    if (s === 'pending') {
      return (
        <button className="btn btn-outline flex-1" disabled={statusBusy} onClick={() => setStatus('in_progress')}>
          <SendIcon size={18} />
          התחלת טיפול
        </button>
      )
    }
    if (s === 'in_progress') {
      return (
        <button className="btn btn-success flex-1" disabled={statusBusy} onClick={() => setStatus('ready')}>
          <CheckIcon size={18} />
          מוכן לאיסוף
        </button>
      )
    }
    if (s === 'ready') {
      return (
        <button className="btn btn-outline flex-1" disabled={statusBusy} onClick={() => setStatus('in_progress')}>
          החזרה ל&quot;בטיפול&quot;
        </button>
      )
    }
    return null
  }

  return (
    <div className="min-h-dvh">
      <Header backTo="/manager/parts" title="פרטי בקשה" />
      <main className="mx-auto max-w-3xl px-4 py-6">
        {error && (
          <div className="card border-destructive/40 bg-red-50 p-4 text-destructive font-medium">{error}</div>
        )}
        {!request && !error && (
          <div className="flex justify-center py-10 text-primary">
            <SpinnerIcon size={32} />
          </div>
        )}
        {request && (
          <div className="flex flex-col gap-5">
            {/* Summary */}
            <div className="card p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-xl font-black flex items-center gap-2">
                    <PackageIcon size={20} className="text-accent shrink-0" />
                    {partName}
                  </h1>
                  <p className="text-sm text-primary mt-0.5">
                    {request.projects?.name}
                    {request.projects?.clients?.name ? ` · ${request.projects.clients.name}` : ''}
                  </p>
                </div>
                <StatusBadge status={request.status} labels={PART_STATUS_LABELS} size="lg" />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-primary">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon size={16} />
                  {formatDate(request.created_at)}
                </span>
                <span>ראש צוות: {request.team_leads?.name}</span>
                <span>כמות: {request.quantity}</span>
              </div>
            </div>

            {/* Photo */}
            {request.photo_path && (
              <section className="card p-5">
                <h2 className="font-bold mb-2">תמונה</h2>
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="aspect-square w-32 rounded-xl overflow-hidden border border-border bg-muted hover:opacity-90 transition-opacity"
                  aria-label="הגדלת תמונה"
                >
                  <img
                    src={partPhotoUrl(request.photo_path)}
                    alt="תמונה של החלק"
                    className="h-full w-full object-cover"
                  />
                </button>
                {lightboxOpen && (
                  <Lightbox src={partPhotoUrl(request.photo_path)} onClose={() => setLightboxOpen(false)} />
                )}
              </section>
            )}

            {/* Notes */}
            {request.notes && (
              <section className="card p-5">
                <h2 className="font-bold mb-2">הערות לייצור</h2>
                <p className="whitespace-pre-wrap leading-relaxed">{request.notes}</p>
              </section>
            )}

            {/* Status */}
            <section className="card p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="font-bold">עדכון סטטוס</h2>
                {request.status_updated_by && (
                  <p className="text-xs text-primary">עדכון אחרון על ידי: {request.status_updated_by}</p>
                )}
              </div>
              <div className="mt-3 flex gap-2 flex-wrap">{statusActions()}</div>
              {statusError && <p className="err">{statusError}</p>}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
