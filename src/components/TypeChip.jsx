import { ClipboardIcon, PackageIcon, AlertIcon } from './Icons'

// Same icon-per-type language already used on the /manager stat cards
// (ClipboardIcon/PackageIcon/AlertIcon), reused here for at-a-glance
// scanning of a merged reports/parts/exceptions list.
const CONFIG = {
  report: { label: 'יומן עבודה', Icon: ClipboardIcon },
  part: { label: 'הזמנת חלקים', Icon: PackageIcon },
  exception: { label: 'אישורי עבודה נוספת', Icon: AlertIcon },
}

export default function TypeChip({ type, className = '' }) {
  const cfg = CONFIG[type]
  if (!cfg) return null
  const { label, Icon } = cfg
  return (
    <span
      className={`inline-flex self-start items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-bold text-primary ${className}`}
    >
      <Icon size={12} className="shrink-0" />
      {label}
    </span>
  )
}
