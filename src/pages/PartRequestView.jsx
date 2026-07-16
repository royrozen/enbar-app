import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Header from '../components/Header'
import StatusBadge from '../components/StatusBadge'
import Lightbox from '../components/Lightbox'
import PhotoUploader from '../components/PhotoUploader'
import {
  SpinnerIcon,
  CalendarIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  MinusIcon,
  SearchIcon,
  XIcon,
} from '../components/Icons'
import { supabase, partPhotoUrl, PART_PHOTO_BUCKET } from '../lib/supabase'
import { formatDate, PART_STATUS_LABELS, isToday } from '../lib/format'

const SELECT = '*, projects(name, city, clients(name)), catalog_items(name)'

export default function PartRequestView() {
  const { id } = useParams()
  const [request, setRequest] = useState(null)
  const [error, setError] = useState('')
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const [editing, setEditing] = useState(false)
  const [catalogItems, setCatalogItems] = useState([])
  const [useOther, setUseOther] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [otherDescription, setOtherDescription] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [newPhoto, setNewPhoto] = useState([])
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveWarning, setSaveWarning] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error: err } = await supabase.from('part_requests').select(SELECT).eq('id', id).single()
      if (cancelled) return
      if (err || !data) setError('הבקשה לא נמצאה')
      else setRequest(data)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  const partName = request?.catalog_items?.name || request?.other_description
  const editable = request ? isToday(request.created_at) && request.status === 'pending' : false

  function stepQuantity(delta) {
    const q = Number(quantity) || 0
    setQuantity(Math.min(999, Math.max(1, q + delta)))
  }

  async function startEdit() {
    setUseOther(!request.catalog_item_id)
    setSelectedItem(request.catalog_items ? { id: request.catalog_item_id, name: request.catalog_items.name } : null)
    setCatalogSearch('')
    setOtherDescription(request.other_description || '')
    setQuantity(request.quantity)
    setNotes(request.notes || '')
    setNewPhoto([])
    setErrors({})
    setSaveError('')
    setSaveWarning('')
    setEditing(true)
    if (!catalogItems.length) {
      const { data } = await supabase
        .from('catalog_items')
        .select('id, name')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name')
      setCatalogItems(data || [])
    }
  }

  function cancelEdit() {
    setEditing(false)
  }

  function validate() {
    const errs = {}
    if (useOther) {
      if (otherDescription.trim().length < 5) errs.part = 'יש להזין תיאור של 5 תווים לפחות'
    } else if (!selectedItem) {
      errs.part = 'יש לבחור חלק מהקטלוג'
    }
    const q = Number(quantity)
    if (!Number.isInteger(q) || q < 1 || q > 999) errs.quantity = 'הכמות חייבת להיות בין 1 ל־999'
    return errs
  }

  async function save() {
    if (saving) return
    setSaveError('')
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length) {
      document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setSaving(true)
    try {
      const patch = {
        catalog_item_id: useOther ? null : selectedItem.id,
        other_description: useOther ? otherDescription.trim() : null,
        quantity: Number(quantity),
        notes: notes.trim() || null,
      }
      if (newPhoto.length) {
        try {
          const path = `parts/${request.id}/${crypto.randomUUID()}.jpg`
          const { error: upErr } = await supabase.storage
            .from(PART_PHOTO_BUCKET)
            .upload(path, newPhoto[0].file, { contentType: 'image/jpeg' })
          if (upErr) throw upErr
          patch.photo_path = path
        } catch {
          setSaveWarning('שימו לב: התמונה לא הועלתה בגלל בעיית רשת')
        }
      }

      const { error: updErr } = await supabase.from('part_requests').update(patch).eq('id', request.id)
      if (updErr) throw updErr

      const { data: refreshed } = await supabase.from('part_requests').select(SELECT).eq('id', request.id).single()
      if (refreshed) setRequest(refreshed)
      setEditing(false)
    } catch {
      setSaveError('שמירת השינויים נכשלה — בדקו את חיבור האינטרנט ונסו שוב')
    } finally {
      setSaving(false)
    }
  }

  const filteredCatalog = (() => {
    const q = catalogSearch.trim()
    if (!q) return catalogItems
    return catalogItems.filter((i) => i.name.includes(q))
  })()

  return (
    <div className="min-h-dvh pb-32">
      <Header backTo="/home" title={editing ? 'עריכת בקשה' : 'בקשת חלק'} />
      <main className="mx-auto max-w-lg px-4 py-6">
        {error && (
          <div className="card border-destructive/40 bg-red-50 p-4 text-destructive font-medium">{error}</div>
        )}
        {!request && !error && (
          <div className="flex justify-center py-10 text-primary">
            <SpinnerIcon size={32} />
          </div>
        )}
        {request && !editing && (
          <div className="flex flex-col gap-5">
            <div className="card p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <h1 className="text-xl font-black flex items-center gap-2">
                  <PackageIcon size={20} className="text-accent shrink-0" />
                  {partName}
                </h1>
                <div className="flex items-center gap-2">
                  <StatusBadge status={request.status} labels={PART_STATUS_LABELS} size="lg" />
                  {editable && (
                    <button type="button" onClick={startEdit} className="btn btn-outline !min-h-[40px] text-sm">
                      <PencilIcon size={16} />
                      עריכה
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-primary mt-1">
                {request.projects?.name}
                {request.projects?.clients?.name ? ` · ${request.projects.clients.name}` : ''}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-primary">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon size={16} />
                  {formatDate(request.created_at)}
                </span>
                <span>כמות: {request.quantity}</span>
              </div>
            </div>

            {request.photo_path && (
              <section className="card p-5">
                <h2 className="font-bold mb-2">תמונה</h2>
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="aspect-square w-32 rounded-xl overflow-hidden border border-border bg-muted hover:opacity-90 transition-opacity"
                  aria-label="הגדלת תמונה"
                >
                  <img
                    src={partPhotoUrl(request.photo_path)}
                    alt="תמונה של החלק"
                    className="h-full w-full object-cover"
                  />
                </button>
                {lightboxOpen && (
                  <Lightbox src={partPhotoUrl(request.photo_path)} onClose={() => setLightboxOpen(false)} />
                )}
              </section>
            )}

            {request.notes && (
              <section className="card p-5">
                <h2 className="font-bold mb-2">הערות לייצור</h2>
                <p className="whitespace-pre-wrap leading-relaxed">{request.notes}</p>
              </section>
            )}
          </div>
        )}

        {request && editing && (
          <div className="flex flex-col gap-6">
            <div data-error={!!errors.part}>
              {!useOther && (
                <>
                  {selectedItem ? (
                    <div className="input flex items-center justify-between !min-h-[56px]">
                      <span className="font-bold">{selectedItem.name}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedItem(null)}
                        aria-label="ניקוי בחירה"
                        className="text-primary hover:text-destructive"
                        disabled={saving}
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
                          onChange={(e) => setCatalogSearch(e.target.value)}
                          aria-invalid={!!errors.part}
                          disabled={saving}
                        />
                      </div>
                      <ul className="mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-border bg-white divide-y divide-border">
                        {filteredCatalog.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              className="w-full text-start px-4 py-3 hover:bg-muted transition-colors"
                              onClick={() => {
                                setSelectedItem(item)
                                setCatalogSearch('')
                              }}
                              disabled={saving}
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
                  onChange={(e) => setUseOther(e.target.checked)}
                  disabled={saving}
                />
                החלק לא בקטלוג? בחר &quot;אחר&quot;
              </label>

              {useOther && (
                <textarea
                  className="input mt-2"
                  rows={3}
                  placeholder="תיאור חופשי של החלק החסר..."
                  value={otherDescription}
                  onChange={(e) => setOtherDescription(e.target.value)}
                  aria-invalid={!!errors.part}
                  disabled={saving}
                />
              )}

              {errors.part && <p className="err">{errors.part}</p>}
            </div>

            <div data-error={!!errors.quantity}>
              <span className="label">
                כמות <span className="text-destructive">*</span>
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => stepQuantity(-1)}
                  disabled={saving || Number(quantity) <= 1}
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
                  onChange={(e) => setQuantity(e.target.value)}
                  aria-invalid={!!errors.quantity}
                  aria-label="כמות"
                  disabled={saving}
                />
                <button
                  type="button"
                  onClick={() => stepQuantity(1)}
                  disabled={saving || Number(quantity) >= 999}
                  aria-label="הוספת כמות"
                  className="btn btn-outline !min-h-[56px] !w-14 !px-0 !text-2xl shrink-0"
                >
                  <PlusIcon size={26} />
                </button>
              </div>
              {errors.quantity && <p className="err">{errors.quantity}</p>}
            </div>

            {request.photo_path && !newPhoto.length && (
              <div>
                <span className="label">תמונה קיימת</span>
                <div className="aspect-square w-32 rounded-xl overflow-hidden border border-border bg-muted">
                  <img
                    src={partPhotoUrl(request.photo_path)}
                    alt="תמונה של החלק"
                    className="h-full w-full object-cover"
                  />
                </div>
                <p className="mt-1.5 text-xs text-primary">הוספת תמונה חדשה תחליף את התמונה הקיימת</p>
              </div>
            )}
            <PhotoUploader
              label="תמונה חדשה"
              hint="תמונה אחת בלבד — נדחסת אוטומטית"
              photos={newPhoto}
              onChange={setNewPhoto}
              remaining={1 - newPhoto.length}
              disabled={saving}
            />

            <div>
              <label htmlFor="notes" className="label">
                הערות לייצור
              </label>
              <textarea
                id="notes"
                className="input"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>
        )}
      </main>

      {request && editing && (
        <div className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-lg flex flex-col gap-2">
            {saveError && <p className="err !mt-0 text-center font-bold">{saveError}</p>}
            {saveWarning && (
              <p className="text-center text-sm font-medium text-amber-800">{saveWarning}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="btn btn-outline flex-1 !min-h-[56px]"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="btn btn-accent flex-[2] !min-h-[56px] !text-lg"
              >
                {saving ? <SpinnerIcon size={22} /> : 'שמירה'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
