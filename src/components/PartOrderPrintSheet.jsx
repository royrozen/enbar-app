import { PrinterIcon, XIcon } from './Icons'
import { LOGO_URL } from './Logo'
import { formatDate } from '../lib/format'

// Full-screen print preview for one part order's factory sheet. Only the
// .print-sheet subtree survives @media print (see index.css) — a real
// <img>/<table> in the DOM so Hebrew renders correctly without pdfmake's
// bidi workarounds (see src/lib/rtl.js), unlike the extras PDF which is a
// stored/shared document and needs pdfmake for that reason.
export default function PartOrderPrintSheet({ order, onClose }) {
  const project = order.projects || {}
  const lines = order.part_requests || []

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
      <div className="no-print sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-3xl px-4 h-16 flex items-center justify-between gap-2">
          <button onClick={onClose} className="btn btn-ghost !px-2" aria-label="סגירה">
            <XIcon size={22} />
          </button>
          <button onClick={() => window.print()} className="btn btn-accent">
            <PrinterIcon size={18} />
            הדפסה
          </button>
        </div>
      </div>

      <div className="print-sheet mx-auto max-w-3xl px-8 py-10">
        <div className="flex items-start justify-between gap-4">
          <img src={LOGO_URL} alt="ENBAR תעשיות פח" className="h-16 w-auto" style={{ mixBlendMode: 'multiply' }} />
          <p className="text-sm text-gray-600 pt-2">{formatDate(order.created_at)}</p>
        </div>

        <div className="mt-2 border-t-4 border-[#14284D]" />

        <h1 className="mt-6 text-2xl font-black text-center">
          הזמנת חלקים עבור {project.name || 'פרויקט'}
        </h1>

        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 text-base">
          <div className="flex gap-2">
            <dt className="font-bold text-gray-600">תאריך:</dt>
            <dd>{formatDate(order.created_at)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-bold text-gray-600">ראש צוות:</dt>
            <dd>{order.team_leads?.name || '—'}</dd>
          </div>
          <div className="flex gap-2 col-span-2">
            <dt className="font-bold text-gray-600">פרויקט:</dt>
            <dd>
              {project.name || '—'}
              {project.project_code ? ` (${project.project_code})` : ''}
              {project.city ? ` — ${project.city}` : ''}
              {project.clients?.name ? ` · ${project.clients.name}` : ''}
            </dd>
          </div>
        </dl>

        <table className="mt-8 w-full border-collapse text-lg">
          <thead>
            <tr className="border-b-2 border-gray-800">
              <th className="py-3 text-start w-16">✓</th>
              <th className="py-3 text-start">שם החלק</th>
              <th className="py-3 text-start w-24">כמות</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-gray-300">
                <td className="py-4 text-2xl">☐</td>
                <td className="py-4 font-medium">{line.catalog_items?.name || line.other_description}</td>
                <td className="py-4">{line.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {order.notes && (
          <div className="mt-8">
            <p className="font-bold text-gray-600">הערות לייצור:</p>
            <p className="mt-1 whitespace-pre-wrap leading-relaxed">{order.notes}</p>
          </div>
        )}

        <div className="mt-16 grid grid-cols-2 gap-12">
          <div className="border-b border-gray-500 pb-1.5 h-9" />
          <div className="border-b border-gray-500 pb-1.5 h-9" />
          <p className="text-sm text-gray-600">שם העובד שהכין את ההזמנה</p>
          <p className="text-sm text-gray-600">תאריך השלמת ההזמנה</p>
        </div>
      </div>
    </div>
  )
}
