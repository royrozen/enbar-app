import { EXCEPTION_STATUS_LABELS } from '../lib/format'

const styles = {
  pending: 'bg-amber-100 text-amber-800 border-amber-300',
  sent: 'bg-blue-100 text-blue-800 border-blue-300',
  approved: 'bg-green-100 text-green-800 border-green-300',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-300',
  ready: 'bg-green-100 text-green-800 border-green-300',
}

export default function StatusBadge({ status, size = 'sm', className = '', labels = EXCEPTION_STATUS_LABELS }) {
  if (!status || !labels[status]) return null
  const sizeCls = size === 'lg' ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-0.5 text-xs'
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border font-bold ${sizeCls} ${styles[status]} ${className}`}
    >
      {labels[status]}
    </span>
  )
}
