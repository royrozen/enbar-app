const LABELS = {
  report: 'יומן עבודה',
  part: 'הזמנת חלקים',
  exception: 'אישורי עבודה נוספת',
}

export default function TypeChip({ type, className = '' }) {
  if (!LABELS[type]) return null
  return (
    <span
      className={`inline-flex self-start items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-bold text-primary ${className}`}
    >
      {LABELS[type]}
    </span>
  )
}
