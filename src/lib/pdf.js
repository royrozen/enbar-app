import pdfMake from 'pdfmake/build/pdfmake'
import { heeboRegular, heeboBold } from './heeboFonts'
import { rtl, rtlBlock } from './rtl'
import { formatDate, todayISO } from './format'

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

// Brand mark (no text — text is drawn with the embedded Heebo font)
const MARK_SVG =
  '<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">' +
  '<rect x="2" y="4" width="36" height="9" rx="2" fill="#14284D"/>' +
  '<rect x="8" y="16" width="30" height="9" rx="2" fill="#51637C"/>' +
  '<rect x="14" y="28" width="24" height="9" rx="2" fill="#AEBBCB"/>' +
  '</svg>'

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

// report must include: report_date, extras_description, extras_edited,
// projects { name, city, contact_person, phone, email, clients { name } }
export function generateExtrasPdf(report) {
  const project = report.projects || {}
  const client = project.clients || {}
  const extraText = (report.extras_edited || report.extras_description || '').trim()

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
  detailsBody.push(detailRow('תאריך הדיווח', formatDate(report.report_date)))
  detailsBody.push(detailRow('תאריך הפקת המסמך', formatDate(todayISO())))

  const dd = {
    pageSize: 'A4',
    pageMargins: [40, 36, 40, 50],
    info: { title: 'אישור תוספת/חריגה — ענבר תעשיות פח' },
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
      {
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
      },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: NAVY }],
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
        text: rtl('מסמך לאישור הלקוח — נא לחתום ולהחזיר'),
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
        text: rtl('תיאור התוספת / החריגה'),
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
                text: rtlBlock(extraText || 'לא צוין', 78),
                margin: [12, 12, 12, 12],
                lineHeight: 1.45,
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
        text: rtl('אנו מאשרים את ביצוע התוספת/החריגה המפורטת במסמך זה, בתנאים שסוכמו.'),
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

  pdfMake.createPdf(dd).download(`enbar-extra-${report.report_date}.pdf`)
}
