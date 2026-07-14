export default function StatusChips({ value, onChange, options }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold border-2 transition-colors duration-200 ${
              active
                ? 'bg-accent border-accent text-white'
                : 'bg-white border-border text-primary hover:border-accent'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
