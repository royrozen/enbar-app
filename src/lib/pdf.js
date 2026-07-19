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

function detailRow(label, value) {
  return [
    { text: rtl(value || '—'), color: DARK, margin: [0, 2, 0, 2] },
    { text: rtl(label), bold: true, color: GREY, margin: [0, 2, 0, 2] },
  ]
}

function signatureField(label) {
  return {
    width: '*',
    stack: [
      {
        canvas: [
          { type: 'line', x1: 0, y1: 0, x2: 140, y2: 0, lineWidth: 1, lineColor: GREY },
        ],
        alignment: 'center',
      },
      { text: rtl(label), alignment: 'center', fontSize: 10, color: GREY, margin: [0, 6, 0, 0] },
    ],
  }
}

// exception must include: workers_count, work_days, billable_days,
// days_overridden, work_description, created_at,
// projects { name, city, contact_person, phone, email, clients { name } }
// Returns a Promise<Blob> of the generated PDF (no download by default —
// callers upload the bytes to Storage and share/view via the public URL).
export async function generateExceptionPdf(exception, { download = false } = {}) {
  const project = exception.projects || {}
  const client = project.clients || {}
  const description = (exception.work_description || '').trim()
  const days = Number(exception.billable_days)
  const daysText = `${days % 1 === 0 ? days : days.toFixed(1)} ימי עבודה`

  let headerBlock
  try {
    const logo = await fetchLogoDataUrl()
    headerBlock = { image: logo, width: 130, alignment: 'right' }
  } catch {
    headerBlock = {
      columns: [
        { svg: MARK_SVG, width: 40, margin: [0, 2, 0, 0] },
        {
          width: '*',
          stack: [
            { text: rtl('ענבר תעשיות פח'), fontSize: 22, bold: true, color: NAVY },
            { text: rtl('ייצור והתקנה של תעלות מיזוג אוויר'), fontSize: 10, color: GREY },
          ],
          alignment: 'right',
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

  const detailsBody = [
    detailRow('פרויקט', project.city ? `${project.name} — ${project.city}` : project.name),
    detailRow('לקוח', client.name),
  ]
  if (project.contact_person || project.phone) {
    detailsBody.push(
      detailRow('איש קשר', [project.contact_person, project.phone].filter(Boolean).join(' · ')),
    )
  }
  if (project.email) detailsBody.push(detailRow('דוא"ל', project.email))
  detailsBody.push(detailRow('מספר עובדים', String(exception.workers_count)))
  detailsBody.push(detailRow('משך העבודה', `${exception.work_days} ימים`))
  detailsBody.push(detailRow('כמות ימים לחיוב', daysText))
  detailsBody.push(detailRow('תאריך הדיווח', formatDate(exception.created_at)))
  detailsBody.push(detailRow('תאריך הפקת המסמך', formatDate(todayISO())))

  const dd = {
    pageSize: 'A4',
    pageMargins: [40, 36, 40, 50],
    info: { title: 'דוח חריגים ותוספות — ענבר תעשיות פח' },
    defaultStyle: {
      font: 'Heebo',
      fontSize: 11,
      color: DARK,
      alignment: 'right',
      lineHeight: 1.3,
    },
    footer: () => ({
      text: rtl('ענבר תעשיות פח · חיפה · הופק באמצעות מערכת דוחות העבודה'),
      alignment: 'center',
      fontSize: 8,
      color: GREY,
      margin: [40, 14, 40, 0],
    }),
    content: [
      headerBlock,
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: NAVY }],
        margin: [0, 12, 0, 20],
      },
      {
        text: rtl('דוח חריגים ותוספות'),
        fontSize: 17,
        bold: true,
        alignment: 'center',
        margin: [0, 0, 0, 4],
      },
      {
        text: rtl('מסמך לאישור הלקוח — נא לחתום ולהחזיר. ללא חתימה העבודה לא תבוצע.'),
        fontSize: 9,
        color: GREY,
        alignment: 'center',
        margin: [0, 0, 0, 18],
      },
      {
        table: { widths: ['*', 120], body: detailsBody },
        layout: {
          hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
          vLineWidth: () => 0,
          hLineColor: () => LIGHT,
          paddingTop: () => 5,
          paddingBottom: () => 5,
        },
      },
      {
        text: rtl('תיאור העבודה הנדרשת'),
        bold: true,
        fontSize: 12,
        margin: [0, 22, 0, 8],
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
      },
      {
        text: rtl('אישור הלקוח'),
        bold: true,
        fontSize: 12,
        margin: [0, 30, 0, 6],
      },
      {
        text: rtl('אנו מאשרים את ביצוע העבודה המפורטת במסמך זה ואת חיוב ימי העבודה שצוינו.'),
        fontSize: 10,
        color: GREY,
        margin: [0, 0, 0, 28],
      },
      {
        // Visual RTL: first field (name) is rightmost, so it comes last in the array
        columns: [signatureField('חתימה'), signatureField('תאריך'), signatureField('שם החותם')],
        columnGap: 26,
      },
    ],
  }

  const pdf = pdfMake.createPdf(dd)
  if (download) pdf.download(`enbar-exception-${String(exception.created_at).slice(0, 10)}.pdf`)
  return new Promise((resolve) => pdf.getBlob(resolve))
}
