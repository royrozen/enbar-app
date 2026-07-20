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

// Fallback brand mark, used only if fetching the real logo PNG fails
const MARK_SVG =
  '<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">' +
  '<rect x="2" y="4" width="36" height="9" rx="2" fill="#14284D"/>' +
  '<rect x="8" y="16" width="30" height="9" rx="2" fill="#51637C"/>' +
  '<rect x="14" y="28" width="24" height="9" rx="2" fill="#AEBBCB"/>' +
  '</svg>'

// The real company logo, fetched once and cached as a data URL. pdfmake can
// only embed images as base64, and the logo lives on the website CDN.
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

const CONTENT_WIDTH = 515 // page width 595.28 minus the 40+40 side margins
const FIELD_LABEL_W = 100

// One "underline field" — value sits on the line, label caption below-right —
// matching the approval-document template (enbar-extras-approval-template.pdf).
function underlineField(label, value, { marginBottom = 16 } = {}) {
  return {
    margin: [0, 0, 0, marginBottom],
    stack: [
      {
        columns: [
          { width: '*', text: rtl(value || '—'), alignment: 'right', margin: [0, 0, 0, 4] },
          { width: FIELD_LABEL_W, text: '' },
        ],
        columnGap: 8,
      },
      {
        columns: [
          {
            width: '*',
            canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH - FIELD_LABEL_W - 8, y2: 0, lineWidth: 1, lineColor: GREY }],
          },
          { width: FIELD_LABEL_W, text: rtl(`${label}:`), bold: true, color: GREY, alignment: 'right' },
        ],
        columnGap: 8,
      },
    ],
  }
}

// Client-approval block (declaration box, name/signature/date fields) is
// pinned to a fixed page position via absolutePosition — NOT left in normal
// flow — so its coordinates are identical on every generated PDF regardless
// of how long the description above it is. This is required so the SignWell
// e-signature integration (api/_lib/signwell.js) can place its
// signature/date/name fields at hard-coded coordinates that always line up.
// If these values change, SIGNWELL_FIELDS in api/_lib/signwell.js must be
// updated to match (coordinates were derived together, see that file).
const APPROVAL_ANCHOR_X = 40
const APPROVAL_ANCHOR_Y = 530
const SIG_BOX_W = 190
const SIG_BOX_H = 48

function approvalBlock(daysText) {
  return {
    absolutePosition: { x: APPROVAL_ANCHOR_X, y: APPROVAL_ANCHOR_Y },
    width: CONTENT_WIDTH,
    stack: [
      {
        columns: [
          { width: '*', text: rtl(daysText || '—'), color: DARK },
          { width: FIELD_LABEL_W, text: rtl('ימי עבודה לחיוב:'), bold: true, color: GREY, alignment: 'right' },
        ],
        columnGap: 8,
        margin: [0, 0, 0, 10],
      },
      {
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack: [
                  { text: rtl('הצהרת הלקוח:'), bold: true, fontSize: 9, color: GREY, margin: [0, 0, 0, 2] },
                  {
                    text: rtl(
                      'אני, החתום/ה מטה, מאשר/ת בזאת את ביצוע התוספת / החריגה המתוארת לעיל, לרבות ימי העבודה לחיוב, וזאת בנוסף להיקף העבודה המקורי שהוזמן מאת ענבר תעשיות פח.',
                    ),
                    fontSize: 9,
                    color: GREY,
                    lineHeight: 1.3,
                  },
                ],
                margin: [10, 8, 10, 8],
              },
            ],
          ],
        },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => '#F4F6F9' },
        margin: [0, 0, 0, 16],
      },
      { text: rtl('פרטי המאשר וחתימה:'), bold: true, fontSize: 11, margin: [0, 0, 0, 10] },
      {
        columns: [
          {
            width: '*',
            margin: [0, 16, 0, 0],
            canvas: [
              { type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH - FIELD_LABEL_W - 8, y2: 0, lineWidth: 1, lineColor: GREY },
            ],
          },
          { width: FIELD_LABEL_W, text: rtl('שם מלא:'), bold: true, color: GREY, alignment: 'right' },
        ],
        columnGap: 8,
      },
      {
        margin: [0, 22, 0, 0],
        columns: [
          {
            width: SIG_BOX_W,
            stack: [
              {
                canvas: [
                  {
                    type: 'rect',
                    x: 0,
                    y: 0,
                    w: SIG_BOX_W,
                    h: SIG_BOX_H,
                    lineWidth: 1,
                    lineColor: GREY,
                    dash: { length: 3, space: 2 },
                  },
                ],
              },
              {
                text: rtl('חתימת הלקוח'),
                fontSize: 8,
                color: GREY,
                alignment: 'right',
                margin: [8, -SIG_BOX_H + 6, 8, 0],
              },
            ],
          },
          { width: 16, text: '' },
          {
            width: '*',
            margin: [0, SIG_BOX_H / 2 - 7, 0, 0],
            columns: [
              {
                width: '*',
                canvas: [{ type: 'line', x1: 0, y1: 0, x2: 110, y2: 0, lineWidth: 1, lineColor: GREY }],
              },
              { width: 92, text: rtl('תאריך החתימה:'), bold: true, color: GREY, alignment: 'right' },
            ],
            columnGap: 8,
          },
        ],
        columnGap: 10,
      },
    ],
  }
}

// exception must include: workers_count, work_days, billable_days,
// days_overridden, work_description, created_at,
// projects { name, city, contact_person, phone, email, clients { name } }
// Returns a Promise<Blob> of the generated PDF. Never triggers a browser
// download itself — pdfmake's own .download() can navigate the page away on
// mobile Safari (it opens the blob in-place instead of saving it), which
// would abort whatever the caller does next (e.g. uploading to Storage).
// Callers should upload the blob first, then open its public URL if they
// want the user to see/save it.
export async function generateExceptionPdf(exception) {
  const project = exception.projects || {}
  const client = project.clients || {}
  const description = (exception.work_description || '').trim()
  const days = Number(exception.billable_days)
  const daysText = `${days % 1 === 0 ? days : days.toFixed(1)} ימי עבודה`

  // Header row: today's date on the left, logo on the right
  const headerDate = {
    text: formatDate(todayISO()),
    fontSize: 10,
    color: GREY,
    alignment: 'left',
    width: '*',
    margin: [0, 6, 0, 0],
  }
  let headerBlock
  try {
    const logo = await fetchLogoDataUrl()
    headerBlock = { columns: [headerDate, { image: logo, width: 130 }], columnGap: 10 }
  } catch {
    headerBlock = {
      columns: [
        headerDate,
        {
          width: 'auto',
          columns: [
            { svg: MARK_SVG, width: 40, margin: [0, 2, 0, 0] },
            {
              stack: [
                { text: rtl('ענבר תעשיות פח'), fontSize: 22, bold: true, color: NAVY },
                { text: rtl('ייצור והתקנה של תעלות מיזוג אוויר'), fontSize: 10, color: GREY },
              ],
              alignment: 'right',
            },
          ],
          columnGap: 10,
        },
      ],
      columnGap: 10,
    }
  }

  // Single-page guarantee: only the description grows, so shrink its type as
  // it gets longer instead of ever flowing to a second page. Wrap width
  // (chars/line for rtlBlock) rises as the font shrinks.
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
    info: { title: 'אישור תוספת / חריגה — ענבר תעשיות פח' },
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
      headerBlock,
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 2, lineColor: NAVY }],
        margin: [0, 12, 0, 20],
      },
      {
        text: rtl('אישור תוספת / חריגה'),
        fontSize: 17,
        bold: true,
        alignment: 'center',
        margin: [0, 0, 0, 4],
      },
      {
        text: rtl('אישור לקוח לביצוע עבודה נוספת שאינה כלולה בהזמנה המקורית'),
        fontSize: 9,
        color: GREY,
        alignment: 'center',
        margin: [0, 0, 0, 20],
      },
      underlineField('לקוח', client.name),
      underlineField('אתר', project.name),
      underlineField('כתובת האתר', project.city),
      {
        text: rtl('תיאור התוספת / החריגה:'),
        bold: true,
        fontSize: 12,
        margin: [0, 0, 0, 8],
      },
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
