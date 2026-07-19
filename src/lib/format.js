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

// Groups part_requests rows submitted together (same order_id) into one
// entry per order. Assumes rows are already sorted newest-first — that
// order is preserved for the returned groups.
export function groupPartRequestsByOrder(rows) {
  const groups = []
  const byId = new Map()
  for (const row of rows || []) {
    const key = row.order_id || row.id
    let group = byId.get(key)
    if (!group) {
      group = { orderId: key, createdAt: row.created_at, items: [] }
      byId.set(key, group)
      groups.push(group)
    }
    group.items.push(row)
  }
  return groups
}
