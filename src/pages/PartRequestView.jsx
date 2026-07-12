import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Header from '../components/Header'
import StatusBadge from '../components/StatusBadge'
import Lightbox from '../components/Lightbox'
import { SpinnerIcon, CalendarIcon, PackageIcon } from '../components/Icons'
import { supabase, partPhotoUrl } from '../lib/supabase'
import { formatDate, PART_STATUS_LABELS } from '../lib/format'

export default function PartRequestView() {
  const { id } = useParams()
  const [request, setRequest] = useState(null)
  const [error, setError] = useState('')
  const [lightboxOpen, setLightboxOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error: err } = await supabase
        .from('part_requests')
        .select('*, projects(name, city, clients(name)), catalog_items(name)')
        .eq('id', id)
        .single()
      if (cancelled) return
      if (err || !data) setError('הבקשה לא נמצאה')
      else setRequest(data)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  const partName = request?.catalog_items?.name || request?.other_description

  return (
    <div className="min-h-dvh">
      <Header backTo="/home" title="בקשת חלק" />
      <main className="mx-auto max-w-lg px-4 py-6">
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
            <div className="card p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <h1 className="text-xl font-black flex items-center gap-2">
                  <PackageIcon size={20} className="text-accent shrink-0" />
                  {partName}
                </h1>
                <StatusBadge status={request.status} labels={PART_STATUS_LABELS} size="lg" />
              </div>
              <p className="text-sm text-primary mt-1">
                {request.projects?.name}
                {request.projects?.clients?.name ? ` · ${request.projects.clients.name}` : ''}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-primary">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon size={16} />
                  {formatDate(request.created_at)}
                </span>
                <span>כמות: {request.quantity}</span>
              </div>
            </div>

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

            {request.notes && (
              <section className="card p-5">
                <h2 className="font-bold mb-2">הערות לייצור</h2>
                <p className="whitespace-pre-wrap leading-relaxed">{request.notes}</p>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
