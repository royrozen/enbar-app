// Alternative "extras approval" PDF template — parallel to pdf.js, for
// side-by-side comparison. Not wired into the app UI yet. Same data shape,
// same Hebrew RTL handling (rtl.js), independent document definition/layout.
import pdfMake from 'pdfmake/build/pdfmake'
import { heeboRegular, heeboBold } from './heeboFonts'
import { rtl, rtlBlock } from './rtl'
import { formatDate, todayISO } from './format'
import { LOGO_URL } from '../components/Logo'

pdfMake.vfs = {
  'Heebo-Regular.ttf': heeboRegular,
  'Heebo-Bold.ttf': heeboBold,
}

pdfMake.fonts = {
  Heebo: {
    normal: 'Heebo-Regular.ttf',
    bold: 'Heebo-Bold.ttf',
    italics: 'Heebo-Regular.ttf',
    bolditalics: 'Heebo-Bold.ttf',
  },
}

const NAVY = '#14284D'
const GREY = '#51637C'
const DARK = '#16233D'
const LIGHT = '#DCE3EC'
const PALE = '#F4F6FB'

const MARK_SVG =
  '<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">' +
  '<rect x="2" y="4" width="36" height="9" rx="2" fill="#14284D"/>' +
  '<rect x="8" y="16" width="30" height="9" rx="2" fill="#51637C"/>' +
  '<rect x="14" y="28" width="24" height="9" rx="2" fill="#AEBBCB"/>' +
  '</svg>'

let logoDataUrl = null
async function fetchLogoDataUrl() {
  if (logoDataUrl) return logoDataUrl
  const res = await fetch(LOGO_URL)
  if (!res.ok) throw new Error('logo fetch failed')
  const blob = await res.blob()
  logoDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
  return logoDataUrl
}

const CONTENT_WIDTH = 515

// Everything from the billable-days stat box through the signature block is
// pinned to a fixed page position via absolutePosition — NOT left in normal
// flow — same reason as pdf.js's approvalBlock: SignWell's e-signature
// integration (api/_lib/signwell.js) places its signature/date/name fields
// at hard-coded coordinates, which only line up if this block lands in the
// same place on every generated PDF. work_description is capped at
// MAX_EXCEPTION_DESCRIPTION_LENGTH (300 chars, src/lib/format.js) — measured
// empirically, the description card above this anchor varies by at most
// ~15pt between a one-line and a full 300-char description, well inside the
// margin reserved here. If ANCHOR_Y or the internal layout below change,
// SIGNWELL_FIELDS in api/_lib/signwell.js must be re-measured to match.
const ANCHOR_X = 40
const ANCHOR_Y = 450

// One label-over-value cell for the details strip.
function detailCell(label, value) {
  return {
    stack: [
      { text: rtl(`${label}:`), bold: true, fontSize: 8, color: GREY, alignment: 'right' },
      { text: rtl(value || '—'), fontSize: 11, color: DARK, alignment: 'right', margin: [0, 3, 0, 0] },
    ],
  }
}

// Billable-days stat box, declaration, and signature block — pinned as one
// unit at (ANCHOR_X, ANCHOR_Y), see the comment on ANCHOR_Y above.
function approvalBlock(daysText) {
  return {
    absolutePosition: { x: ANCHOR_X, y: ANCHOR_Y },
    width: CONTENT_WIDTH,
    stack: [
      // Billable-days stat line.
      {
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack: [
                  { text: rtl('ימי עבודה לחיוב'), fontSize: 9, color: GREY, alignment: 'center' },
                  { text: rtl(daysText), fontSize: 20, bold: true, color: NAVY, alignment: 'center', margin: [0, 2, 0, 0] },
                ],
                margin: [0, 10, 0, 10],
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0.75,
          vLineWidth: () => 0.75,
          hLineColor: () => NAVY,
          vLineColor: () => NAVY,
          fillColor: () => PALE,
        },
        margin: [0, 0, 0, 16],
      },

      // Declaration.
      {
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack: [
                  { text: rtl('הצהרת הלקוח:'), bold: true, fontSize: 8, color: GREY, margin: [0, 0, 0, 2] },
                  {
                    text: rtl(
                      'אני, החתום/ה מטה, מאשר/ת בזאת את ביצוע התוספת / החריגה המתוארת לעיל, לרבות ימי העבודה לחיוב, וזאת בנוסף להיקף העבודה המקורי שהוזמן מאת ענבר תעשיות פח.',
                    ),
                    fontSize: 8,
                    color: GREY,
                    lineHeight: 1.3,
                  },
                ],
                margin: [10, 8, 10, 8],
              },
            ],
          ],
        },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => PALE },
        margin: [0, 0, 0, 22],
      },

      // Signature section. שם מלא and תאריך החתימה share one row; each is its
      // own [value, label] pair (value column carries the underline, sized to
      // that pair alone) so neither field's line bleeds into the other's.
      // Physical column order is left-to-right; שם מלא is placed last so it
      // lands rightmost, i.e. read first in RTL — same [value][label]
      // convention as pdf.js's underlineField.
      { text: rtl('פרטי המאשר וחתימה:'), bold: true, fontSize: 11, margin: [0, 0, 0, 10] },
      {
        columnGap: 0,
        columns: [
          {
            width: 120,
            table: { widths: ['*'], body: [[{ text: '', alignment: 'right' }]] },
            layout: {
              hLineWidth: (i) => (i === 1 ? 1 : 0),
              vLineWidth: () => 0,
              hLineColor: () => GREY,
              paddingLeft: () => 0,
              paddingRight: () => 0,
              paddingTop: () => 0,
              paddingBottom: () => 3,
            },
          },
          { width: 8, text: '' },
          { width: 95, text: rtl('תאריך החתימה:'), bold: true, color: GREY, alignment: 'right' },
          { width: 24, text: '' },
          {
            width: 205,
            table: { widths: ['*'], body: [[{ text: '', alignment: 'right' }]] },
            layout: {
              hLineWidth: (i) => (i === 1 ? 1 : 0),
              vLineWidth: () => 0,
              hLineColor: () => GREY,
              paddingLeft: () => 0,
              paddingRight: () => 0,
              paddingTop: () => 0,
              paddingBottom: () => 3,
            },
          },
          { width: 8, text: '' },
          { width: 55, text: rtl('שם מלא:'), bold: true, color: GREY, alignment: 'right' },
        ],
      },
      {
        margin: [0, 22, 0, 0],
        columnGap: 0,
        columns: [
          { width: '*', text: '' },
          {
            width: 190,
            stack: [
              {
                canvas: [
                  { type: 'rect', x: 0, y: 0, w: 190, h: 48, lineWidth: 1, lineColor: GREY, dash: { length: 3, space: 2 } },
                ],
              },
              { text: rtl('חתימת הלקוח'), fontSize: 8, color: GREY, alignment: 'right', margin: [8, -42, 8, 0] },
            ],
          },
        ],
      },
    ],
  }
}

// exception must include: work_description, billable_days,
// projects { name, city, clients { name } } — same shape as generateExceptionPdf.
// Returns a Promise<Blob>. Never triggers a browser download itself (see
// pdf.js's note on pdfmake's .download() on mobile Safari).
export async function generateExceptionPdfV2(exception) {
  const project = exception.projects || {}
  const client = project.clients || {}
  const description = (exception.work_description || '').trim()
  const days = Number(exception.billable_days)
  const daysText = `${days % 1 === 0 ? days : days.toFixed(1)} ימי עבודה`

  let logoBlock
  try {
    const logo = await fetchLogoDataUrl()
    logoBlock = { image: logo, width: 110 }
  } catch {
    logoBlock = { svg: MARK_SVG, width: 40 }
  }

  let descFont = 11
  let descWrap = 78
  if (description.length > 2600) {
    descFont = 8
    descWrap = 110
  } else if (description.length > 1600) {
    descFont = 9
    descWrap = 96
  } else if (description.length > 900) {
    descFont = 10
    descWrap = 86
  }

  const dd = {
    pageSize: 'A4',
    pageMargins: [40, 36, 40, 50],
    info: { title: 'אישור תוספת / חריגה — ענבר תעשיות פח (תבנית חדשה)' },
    defaultStyle: {
      font: 'Heebo',
      fontSize: 11,
      color: DARK,
      alignment: 'right',
      lineHeight: 1.3,
    },
    footer: () => ({
      text: rtl('ענבר תעשיות פח בע"מ | מסמך זה נחתם אלקטרונית ומהווה אישור מחייב לביצוע העבודה'),
      alignment: 'center',
      fontSize: 8,
      color: GREY,
      margin: [40, 14, 40, 0],
    }),
    content: [
      // Header band: title/subtitle/date stacked on the right, logo on the left.
      {
        columns: [
          logoBlock,
          {
            width: '*',
            stack: [
              { text: rtl('אישור תוספת / חריגה'), fontSize: 18, bold: true, color: NAVY },
              {
                text: rtl('אישור לקוח לביצוע עבודה נוספת שאינה כלולה בהזמנה המקורית'),
                fontSize: 8,
                color: GREY,
                margin: [0, 3, 0, 0],
              },
              { text: formatDate(todayISO()), fontSize: 8, color: GREY, margin: [0, 4, 0, 0] },
            ],
            alignment: 'right',
          },
        ],
        columnGap: 14,
      },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 2, lineColor: NAVY }],
        margin: [0, 12, 0, 18],
      },

      // Details strip — three label/value cells in one bordered row.
      // Body order is physically left-to-right; reversed so "לקוח" ends up
      // rightmost, matching Hebrew reading order.
      {
        table: {
          widths: ['*', '*', '*'],
          body: [[detailCell('כתובת האתר', project.city), detailCell('אתר', project.name), detailCell('לקוח', client.name)]],
        },
        layout: {
          hLineWidth: () => 0.75,
          vLineWidth: (i) => (i === 1 || i === 2 ? 0.75 : 0),
          hLineColor: () => LIGHT,
          vLineColor: () => LIGHT,
          paddingLeft: () => 10,
          paddingRight: () => 10,
          paddingTop: () => 8,
          paddingBottom: () => 8,
        },
        margin: [0, 0, 0, 18],
      },

      // Description card.
      { text: rtl('תיאור העבודה'), bold: true, fontSize: 12, margin: [0, 0, 0, 8] },
      {
        table: {
          widths: ['*'],
          body: [
            [
              {
                text: rtlBlock(description || 'לא צוין', descWrap),
                fontSize: descFont,
                margin: [12, 12, 12, 12],
                lineHeight: 1.35,
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0.75,
          vLineWidth: () => 0.75,
          hLineColor: () => LIGHT,
          vLineColor: () => LIGHT,
        },
        margin: [0, 0, 0, 16],
      },

      approvalBlock(daysText),
    ],
  }

  const pdf = pdfMake.createPdf(dd)
  return new Promise((resolve) => pdf.getBlob(resolve))
}
