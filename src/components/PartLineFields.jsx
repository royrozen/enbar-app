import { SearchIcon, XIcon } from './Icons'
import { PlusIcon, MinusIcon } from './Icons'

// Catalog-search-or-free-text part picker + quantity stepper for one part
// order line. Shared by the new-order form and the inline order editors on
// the team-lead and manager lists, so the picker only exists in one place.
export default function PartLineFields({
  catalogItems,
  useOther,
  selectedItem,
  catalogSearch,
  otherDescription,
  quantity,
  onChange,
  error = {},
  disabled = false,
}) {
  const filteredCatalog = (() => {
    const q = catalogSearch.trim()
    if (!q) return catalogItems
    return catalogItems.filter((i) => i.name.includes(q))
  })()

  function stepQuantity(delta) {
    const q = Number(quantity) || 0
    onChange({ quantity: Math.min(999, Math.max(1, q + delta)) })
  }

  return (
    <div className="flex flex-col gap-3">
      <div data-error={!!error.part}>
        {!useOther && (
          <>
            {selectedItem ? (
              <div className="input flex items-center justify-between !min-h-[56px]">
                <span className="font-bold">{selectedItem.name}</span>
                <button
                  type="button"
                  onClick={() => onChange({ selectedItem: null })}
                  aria-label="ניקוי בחירה"
                  className="text-primary hover:text-destructive"
                  disabled={disabled}
                >
                  <XIcon size={18} />
                </button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <SearchIcon
                    size={18}
                    className="absolute top-1/2 -translate-y-1/2 start-3 text-primary pointer-events-none"
                  />
                  <input
                    type="text"
                    className="input !ps-10"
                    placeholder="חיפוש חלק בקטלוג..."
                    value={catalogSearch}
                    onChange={(e) => onChange({ catalogSearch: e.target.value })}
                    aria-invalid={!!error.part}
                    disabled={disabled}
                  />
                </div>
                <ul className="mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-border bg-white divide-y divide-border">
                  {filteredCatalog.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="w-full text-start px-4 py-3 hover:bg-muted transition-colors"
                        onClick={() => onChange({ selectedItem: item, catalogSearch: '' })}
                        disabled={disabled}
                      >
                        {item.name}
                      </button>
                    </li>
                  ))}
                  {filteredCatalog.length === 0 && (
                    <li className="px-4 py-3 text-sm text-primary">לא נמצאו חלקים תואמים</li>
                  )}
                </ul>
              </div>
            )}
          </>
        )}

        <label className="mt-2 flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={useOther}
            onChange={(e) => onChange({ useOther: e.target.checked })}
            disabled={disabled}
          />
          החלק לא בקטלוג? בחר &quot;אחר&quot;
        </label>

        {useOther && (
          <textarea
            className="input mt-2"
            rows={3}
            placeholder="תיאור חופשי של החלק החסר..."
            value={otherDescription}
            onChange={(e) => onChange({ otherDescription: e.target.value })}
            aria-invalid={!!error.part}
            disabled={disabled}
          />
        )}

        {error.part && <p className="err">{error.part}</p>}
      </div>

      <div data-error={!!error.quantity}>
        <span className="label">
          כמות <span className="text-destructive">*</span>
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => stepQuantity(-1)}
            disabled={disabled || Number(quantity) <= 1}
            aria-label="הפחתת כמות"
            className="btn btn-outline !min-h-[56px] !w-14 !px-0 !text-2xl shrink-0"
          >
            <MinusIcon size={26} />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            className="input text-center !text-2xl font-black !min-h-[56px]"
            value={quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
            aria-invalid={!!error.quantity}
            aria-label="כמות"
            disabled={disabled}
          />
          <button
            type="button"
            onClick={() => stepQuantity(1)}
            disabled={disabled || Number(quantity) >= 999}
            aria-label="הוספת כמות"
            className="btn btn-outline !min-h-[56px] !w-14 !px-0 !text-2xl shrink-0"
          >
            <PlusIcon size={26} />
          </button>
        </div>
        {error.quantity && <p className="err">{error.quantity}</p>}
      </div>
    </div>
  )
}

export function lineIsFilled(line) {
  return line.useOther ? line.otherDescription.trim().length >= 5 : !!line.selectedItem
}

export function validateLine(line) {
  const err = {}
  if (line.useOther) {
    if (line.otherDescription.trim().length < 5) err.part = 'יש להזין תיאור של 5 תווים לפחות'
  } else if (!line.selectedItem) {
    err.part = 'יש לבחור חלק מהקטלוג'
  }
  const q = Number(line.quantity)
  if (!Number.isInteger(q) || q < 1 || q > 999) err.quantity = 'הכמות חייבת להיות בין 1 ל־999'
  return err
}
