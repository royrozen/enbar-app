import { useRef, useState } from 'react'
import imageCompression from 'browser-image-compression'
import { CameraIcon, TrashIcon, SpinnerIcon } from './Icons'

const MAX_FILE_MB = 10

// photos: [{ id, file, preview }]
export default function PhotoUploader({ label, hint, photos, onChange, remaining, disabled }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleFiles(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length || disabled) return
    setError('')

    if (remaining <= 0) {
      setError('הגעתם למקסימום של 10 תמונות בדוח')
      return
    }
    let toAdd = files
    if (files.length > remaining) {
      toAdd = files.slice(0, remaining)
      setError(`ניתן לצרף עד 10 תמונות בדוח — נוספו ${remaining} הראשונות בלבד`)
    }

    setBusy(true)
    const added = []
    for (const file of toAdd) {
      if (!file.type.startsWith('image/')) {
        setError('ניתן לצרף קבצי תמונה בלבד')
        continue
      }
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        setError(`תמונה גדולה מ־${MAX_FILE_MB}MB דולגה`)
        continue
      }
      let finalFile = file
      try {
        // Client-side compression before upload (~1600px)
        finalFile = await imageCompression(file, {
          maxWidthOrHeight: 1600,
          maxSizeMB: 1.2,
          useWebWorker: true,
          fileType: 'image/jpeg',
          initialQuality: 0.85,
        })
      } catch {
        // If compression fails, fall back to the original file
      }
      added.push({
        id: crypto.randomUUID(),
        file: finalFile,
        preview: URL.createObjectURL(finalFile),
      })
    }
    if (added.length) onChange([...photos, ...added])
    setBusy(false)
  }

  function removePhoto(id) {
    const photo = photos.find((p) => p.id === id)
    if (photo) URL.revokeObjectURL(photo.preview)
    onChange(photos.filter((p) => p.id !== id))
  }

  return (
    <div>
      {label && <span className="label">{label}</span>}
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {photos.map((p) => (
          <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden border border-border bg-muted">
            <img src={p.preview} alt="תצוגה מקדימה" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => removePhoto(p.id)}
              disabled={disabled}
              aria-label="מחיקת תמונה"
              className="absolute top-1.5 end-1.5 bg-black/60 hover:bg-destructive text-white rounded-full p-2 transition-colors"
            >
              <TrashIcon size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy || remaining <= 0}
          className="aspect-square rounded-xl border-2 border-dashed border-border bg-white text-primary hover:border-accent hover:text-accent transition-colors flex flex-col items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {busy ? <SpinnerIcon size={26} /> : <CameraIcon size={26} />}
          <span className="text-xs font-bold">{busy ? 'מעבד...' : 'הוספת תמונות'}</span>
        </button>
      </div>
      {hint && <p className="mt-1.5 text-xs text-primary">{hint}</p>}
      {error && <p className="err">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
    </div>
  )
}
