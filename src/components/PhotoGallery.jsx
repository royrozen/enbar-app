import { useState } from 'react'
import Lightbox from './Lightbox'
import { photoUrl } from '../lib/supabase'

export default function PhotoGallery({ photos }) {
  const [open, setOpen] = useState(null)
  if (!photos?.length) return null
  const sorted = [...photos].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  return (
    <>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {sorted.map((p) => {
          const url = photoUrl(p.storage_path)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setOpen(url)}
              className="aspect-square rounded-xl overflow-hidden border border-border bg-muted hover:opacity-90 transition-opacity"
              aria-label="הגדלת תמונה"
            >
              <img src={url} alt="תמונה מהדוח" loading="lazy" className="h-full w-full object-cover" />
            </button>
          )
        })}
      </div>
      {open && <Lightbox src={open} onClose={() => setOpen(null)} />}
    </>
  )
}
