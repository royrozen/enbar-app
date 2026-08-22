import { useState } from 'react'
import { CalendarIcon, ChevronDownIcon } from './Icons'
import { formatDate, todayISO } from '../lib/format'

const WEEKDAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']

function pad(n) {
  return String(n).padStart(2, '0')
}

function toISO(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`
}

function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m: m - 1, d }
}

// Custom calendar-grid date field — a native <input type="date"> can't render
// per-day indicator dots (its calendar popup is OS chrome), so this replaces
// it wherever a "already logged" marker is needed (enbar-backdated-reports-prd.md D5).
export default function DateField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  markedDates,
  disabled,
  error,
  required,
}) {
  const [open, setOpen] = useState(false)
  const base = parseISO(value || todayISO())
  const [viewY, setViewY] = useState(base.y)
  const [viewM, setViewM] = useState(base.m)

  const monthLabel = new Date(viewY, viewM, 1).toLocaleDateString('he-IL', {
    month: 'long',
    year: 'numeric',
  })

  const startWeekday = new Date(viewY, viewM, 1).getDay()
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate()
  const cells = Array(startWeekday).fill(null).concat(
    Array.from({ length: daysInMonth }, (_, i) => i + 1),
  )

  const { y: maxY, m: maxM } = max ? parseISO(max) : {}
  const canGoNext = !max || viewY < maxY || (viewY === maxY && viewM < maxM)

  function goMonth(delta) {
    let m = viewM + delta
    let y = viewY
    if (m < 0) {
      m = 11
      y -= 1
    } else if (m > 11) {
      m = 0
      y += 1
    }
    setViewM(m)
    setViewY(y)
  }

  function pick(iso) {
    onChange(iso)
    setOpen(false)
  }

  function toggle() {
    if (disabled) return
    if (!open) {
      const b = parseISO(value || todayISO())
      setViewY(b.y)
      setViewM(b.m)
    }
    setOpen((o) => !o)
  }

  return (
    <div data-error={!!error}>
      {label && (
        <label htmlFor={id} className="label">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
      )}
      <button
        type="button"
        id={id}
        className="input flex items-center gap-2"
        onClick={toggle}
        aria-invalid={!!error}
        aria-expanded={open}
        disabled={disabled}
      >
        <CalendarIcon size={18} className="shrink-0 text-primary" />
        <span className="flex-1 text-start">{value ? formatDate(value) : 'בחרו תאריך'}</span>
        <ChevronDownIcon size={16} className={`shrink-0 text-primary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {error && <p className="err">{error}</p>}

      {open && (
        <div className="card mt-2 p-3 border-border">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => goMonth(-1)}
              aria-label="חודש קודם"
              className="btn btn-ghost !min-h-[36px] !w-9 !px-0"
            >
              <ChevronDownIcon size={16} className="rotate-90" />
            </button>
            <span className="font-bold">{monthLabel}</span>
            <button
              type="button"
              onClick={() => goMonth(1)}
              disabled={!canGoNext}
              aria-label="חודש הבא"
              className="btn btn-ghost !min-h-[36px] !w-9 !px-0"
            >
              <ChevronDownIcon size={16} className="-rotate-90" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-primary mb-1">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d === null) return <div key={`empty-${i}`} />
              const iso = toISO(viewY, viewM, d)
              const inBounds = (!min || iso >= min) && (!max || iso <= max)
              const isSelected = iso === value
              const isToday = iso === todayISO()
              const isMarked = markedDates?.has(iso)
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => pick(iso)}
                  disabled={!inBounds}
                  className={`flex flex-col items-center justify-center gap-0.5 h-11 rounded-lg text-sm font-semibold transition-colors ${
                    isSelected
                      ? 'bg-accent text-white'
                      : inBounds
                        ? `hover:bg-muted ${isToday ? 'ring-2 ring-accent/50' : ''}`
                        : 'text-border cursor-not-allowed'
                  }`}
                >
                  <span>{d}</span>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isMarked && !isSelected ? 'bg-accent' : 'bg-transparent'
                    }`}
                  />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
