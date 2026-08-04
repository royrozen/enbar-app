// Renders today's locked lunch list to a PNG, paper-table layout (PRD §5.2).
// Uses the native Canvas 2D API — canvas fillText is shaped by the browser's
// own text engine, which gets Hebrew bidi/shaping right natively, unlike
// pdfmake/fontkit (src/lib/rtl.js) which needs manual RTL workarounds.

const COLUMNS = [
  { key: 'employee_name', label: 'עובד', width: 170 },
  { key: 'main_dish', label: 'מנה עיקרית', width: 160 },
  { key: 'addition', label: 'תוספת', width: 150 },
  { key: 'salad_1', label: 'סלט 1', width: 150 },
  { key: 'salad_2', label: 'סלט 2', width: 150 },
]

const MARGIN = 24
const TITLE_HEIGHT = 56
const HEADER_HEIGHT = 48
const ROW_HEIGHT = 40

export async function renderLunchImage(rows, dateLabel) {
  await document.fonts.ready

  const tableWidth = COLUMNS.reduce((sum, c) => sum + c.width, 0)
  const width = tableWidth + MARGIN * 2
  const height = TITLE_HEIGHT + HEADER_HEIGHT + rows.length * ROW_HEIGHT + MARGIN * 2

  const canvas = document.createElement('canvas')
  const scale = 2 // sharper export
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)
  ctx.direction = 'rtl'
  ctx.textBaseline = 'middle'

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#111827'
  ctx.font = '700 22px Heebo'
  ctx.textAlign = 'center'
  ctx.fillText(`רשימת ארוחות — ${dateLabel}`, width / 2, MARGIN + TITLE_HEIGHT / 2)

  // Column right edges, right-to-left (Hebrew reading order).
  let rightEdge = width - MARGIN
  const colEdges = COLUMNS.map((c) => {
    const edge = rightEdge
    rightEdge -= c.width
    return edge
  })
  const tableTop = MARGIN + TITLE_HEIGHT
  const tableLeft = width - MARGIN - tableWidth
  const tableBottom = tableTop + HEADER_HEIGHT + rows.length * ROW_HEIGHT

  ctx.fillStyle = '#f3f4f6'
  ctx.fillRect(tableLeft, tableTop, tableWidth, HEADER_HEIGHT)

  ctx.fillStyle = '#111827'
  ctx.font = '700 16px Heebo'
  ctx.textAlign = 'right'
  COLUMNS.forEach((c, i) => {
    ctx.fillText(c.label, colEdges[i] - 12, tableTop + HEADER_HEIGHT / 2)
  })

  ctx.font = '400 15px Heebo'
  rows.forEach((row, rowIndex) => {
    const rowTop = tableTop + HEADER_HEIGHT + rowIndex * ROW_HEIGHT
    if (rowIndex % 2 === 1) {
      ctx.fillStyle = '#fafafa'
      ctx.fillRect(tableLeft, rowTop, tableWidth, ROW_HEIGHT)
    }
    ctx.fillStyle = '#111827'
    COLUMNS.forEach((c, i) => {
      const text = row[c.key] || '—'
      ctx.fillText(text, colEdges[i] - 12, rowTop + ROW_HEIGHT / 2, c.width - 16)
    })
  })

  ctx.strokeStyle = '#d1d5db'
  ctx.lineWidth = 1
  ;[...colEdges, tableLeft].forEach((x) => {
    ctx.beginPath()
    ctx.moveTo(x, tableTop)
    ctx.lineTo(x, tableBottom)
    ctx.stroke()
  })
  for (let r = 0; r <= rows.length; r++) {
    const y = tableTop + HEADER_HEIGHT + r * ROW_HEIGHT
    ctx.beginPath()
    ctx.moveTo(tableLeft, y)
    ctx.lineTo(tableLeft + tableWidth, y)
    ctx.stroke()
  }

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

export function downloadImage(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
