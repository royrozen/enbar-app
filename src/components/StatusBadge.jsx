import { STATUS_LABELS } from '../lib/format'

const styles = {
  pending: 'bg-amber-100 text-amber-800 border-amber-300',
  sent: 'bg-blue-100 text-blue-800 border-blue-300',
  approved: 'bg-green-100 text-green-800 border-green-300',
  rejected: 'bg-red-100 text-red-700 border-red-300',
}

export default function StatusBadge({ status, size = 'sm', className = '' }) {
  if (!status || !STATUS_LABELS[status]) return null
  const sizeCls = size === 'lg' ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-0.5 text-xs'
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border font-bold ${sizeCls} ${styles[status]} ${className}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
