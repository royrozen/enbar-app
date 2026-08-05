import { useEffect, useState } from 'react'
import Logo from '../components/Logo'
import { SpinnerIcon, DownloadIcon, SendIcon } from '../components/Icons'
import { isPastCutoff, fetchTodaySheet, RESTAURANT_WHATSAPP_NUMBER } from '../lib/lunch'
import { renderLunchImage, downloadImage } from '../lib/lunchImage'
import { formatDate, todayISO } from '../lib/format'

function NotYetLocked() {
  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="card p-6 w-full max-w-sm text-center">
        <Logo className="h-10 w-auto mx-auto mb-4" />
        <p className="text-lg font-black">הרשימה עדיין פתוחה</p>
        <p className="text-sm text-primary mt-2">הרשימה תינעל ותוצג בשעה 12:00</p>
      </div>
    </div>
  )
}

export default function LunchToday() {
  const [imageUrl, setImageUrl] = useState(null)
  const [blob, setBlob] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isPastCutoff()) return
    let cancelled = false
    async function load() {
      try {
        const rows = await fetchTodaySheet()
        const png = await renderLunchImage(rows, formatDate(todayISO()))
        if (cancelled) return
        setBlob(png)
        setImageUrl(URL.createObjectURL(png))
      } catch {
        if (!cancelled) setError('הטעינה נכשלה — נסו לרענן את הדף')
      }
    }
    load()
    return () => cancelled = true
  }, [])

  if (!isPastCutoff()) return <NotYetLocked />

  return (
    <div className="min-h-dvh px-4 py-8 flex flex-col items-center gap-4">
      <Logo className="h-10 w-auto" />
      <h1 className="text-lg font-black">רשימת ארוחות היום — {formatDate(todayISO())}</h1>

      {error && <p className="err">{error}</p>}
      {!imageUrl && !error && <SpinnerIcon size={28} />}

      {imageUrl && (
        <>
          <img src={imageUrl} alt="רשימת ארוחות" className="max-w-full rounded-xl border border-border" />
          <div className="flex gap-2 flex-wrap justify-center">
            <a
              className="btn btn-accent"
              href={`https://wa.me/${RESTAURANT_WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noreferrer"
            >
              <SendIcon size={18} />
              שליחה למסעדה
            </a>
            <button
              className="btn btn-outline"
              onClick={() => downloadImage(blob, `lunch-${todayISO()}.png`)}
            >
              <DownloadIcon size={18} />
              שמירת תמונה
            </button>
          </div>
          <p className="text-xs text-primary text-center max-w-sm">
            הקישור פותח שיחה עם המסעדה אך אינו מצרף את התמונה אוטומטית — יש לצרף את התמונה שנשמרה ידנית
          </p>
        </>
      )}
    </div>
  )
}
