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

// The exceptions-log approval PDF (src/lib/pdf.js) pins its client-approval
// block (signature fields) to a fixed page position so SignWell's hard-coded
// field coordinates always line up — which only works if the description
// above it can't grow past a certain height. 300 chars was measured (by
// actually rendering the PDF) to leave a ~30pt safety margin before that
// fixed block on the current layout (header + 6-row details table already
// consume most of a page before the description even starts).
export const MAX_EXCEPTION_DESCRIPTION_LENGTH = 300

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
