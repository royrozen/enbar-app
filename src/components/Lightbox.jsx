import { useEffect } from 'react'
import { XIcon } from './Icons'

export default function Lightbox({ src, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  if (!src) return null
  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-label="תצוגת תמונה מוגדלת"
    >
      <button
        className="absolute top-4 start-4 text-white bg-white/10 hover:bg-white/25 rounded-full p-3 transition-colors"
        onClick={onClose}
        aria-label="סגירה"
      >
        <XIcon size={24} />
      </button>
      <img
        src={src}
        alt="תמונה מהדוח"
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
