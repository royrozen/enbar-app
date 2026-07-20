export const EXCEPTION_STATUS_LABELS = {
  pending: 'ממתין',
  sent: 'נשלח ללקוח',
  approved: 'אושר ע"י הלקוח',
}

export const PART_STATUS_LABELS = {
  pending: 'ממתין',
  in_progress: 'בטיפול',
  ready: 'מוכן לאיסוף',
}

// ISO (yyyy-mm-dd) -> DD/MM/YYYY
export function formatDate(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO() {
  return toISO(new Date())
}

export function daysAgoISO(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toISO(d)
}

// True when an ISO date or timestamp falls on the browser's local "today" —
// used to gate edit access (D2: created_at-based, not report_date).
export function isToday(isoDateOrTimestamp) {
  if (!isoDateOrTimestamp) return false
  return String(isoDateOrTimestamp).slice(0, 10) === todayISO()
}
