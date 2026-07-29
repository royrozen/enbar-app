import { useEffect, useState } from 'react'
import Lightbox from './Lightbox'
import { photoUrls } from '../lib/supabase'

export default function PhotoGallery({ photos }) {
  const [open, setOpen] = useState(null)
  const [urls, setUrls] = useState(null)
  const sorted = photos?.length ? [...photos].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) : []

  useEffect(() => {
    if (!sorted.length) return
    let cancelled = false
    photoUrls(sorted.map((p) => p.storage_path)).then((map) => {
      if (!cancelled) setUrls(map)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos])

  if (!photos?.length) return null
  return (
    <>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {sorted.map((p) => {
          const url = urls?.[p.storage_path]
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => url && setOpen(url)}
              disabled={!url}
              className="aspect-square rounded-xl overflow-hidden border border-border bg-muted hover:opacity-90 transition-opacity disabled:opacity-50"
              aria-label="הגדלת תמונה"
            >
              {url && <img src={url} alt="תמונה מהדוח" loading="lazy" className="h-full w-full object-cover" />}
            </button>
          )
        })}
      </div>
      {open && <Lightbox src={open} onClose={() => setOpen(null)} />}
    </>
  )
}
