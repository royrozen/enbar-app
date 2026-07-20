import { useState } from 'react'
import PartLineFields, { validateLine } from './PartLineFields'
import StatusBadge from './StatusBadge'
import {
  CalendarIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  SendIcon,
  CheckIcon,
  PrinterIcon,
  SpinnerIcon,
} from './Icons'
import { supabase } from '../lib/supabase'
import { formatDate, PART_STATUS_LABELS } from '../lib/format'
import { getProfile, PROFILES } from '../lib/profile'

function lineFromRow(row) {
  return {
    key: row.id,
    id: row.id,
    useOther: !row.catalog_item_id,
    selectedItem: row.catalog_item_id ? { id: row.catalog_item_id, name: row.catalog_items?.name } : null,
    catalogSearch: '',
    otherDescription: row.other_description || '',
    quantity: row.quantity,
  }
}

function newLine() {
  return {
    key: crypto.randomUUID(),
    id: null,
    useOther: false,
    selectedItem: null,
    catalogSearch: '',
    otherDescription: '',
    quantity: 1,
  }
}

// Renders one part order (project/client/team-lead header, its line items,
// notes, status) fully inline — no navigation to a detail page. When the
// order is still 'pending', both roles can edit quantities and add/remove
// lines in place; the manager additionally gets the status control and a
// print action. `order` is the raw Supabase row: id, status,
// status_updated_by, notes, created_at, projects(name, city, clients(name)),
// team_leads(name), part_requests(id, quantity, catalog_item_id,
// other_description, catalog_items(name)).
export default function PartOrderCard({ order, manager = false, onChanged, onPrint }) {
  const [editing, setEditing] = useState(false)
  const [catalogItems, setCatalogItems] = useState(null)
  const [lines, setLines] = useState([])
  const [lineErrors, setLineErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState('')

  const requestLines = order.part_requests || []
  const editable = order.status === 'pending'

  async function startEdit() {
    setLines(requestLines.map(lineFromRow))
    setLineErrors({})
    setSaveError('')
    setEditing(true)
    if (!catalogItems) {
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

  function updateLine(key, patch) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function removeLine(key) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls))
  }

  function addLine() {
    setLines((ls) => [...ls, newLine()])
  }

  async function save() {
    if (saving) return
    const errs = {}
    for (const line of lines) {
      const le = validateLine(line)
      if (Object.keys(le).length) errs[line.key] = le
    }
    setLineErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    setSaveError('')
    try {
      const originalIds = requestLines.map((r) => r.id)
      const currentIds = lines.filter((l) => l.id).map((l) => l.id)
      const removedIds = originalIds.filter((id) => !currentIds.includes(id))

      const ops = []
      if (removedIds.length) {
        ops.push(supabase.from('part_requests').delete().in('id', removedIds))
      }
      for (const line of lines) {
        const patch = {
          catalog_item_id: line.useOther ? null : line.selectedItem.id,
          other_description: line.useOther ? line.otherDescription.trim() : null,
          quantity: Number(line.quantity),
        }
        if (line.id) {
          ops.push(supabase.from('part_requests').update(patch).eq('id', line.id))
        } else {
          ops.push(supabase.from('part_requests').insert({ ...patch, order_id: order.id }))
        }
      }
      const results = await Promise.all(ops)
      const failed = results.find((r) => r.error)
      if (failed) throw failed.error

      setEditing(false)
      onChanged?.()
    } catch {
      setSaveError('שמירת השינויים נכשלה — בדקו את חיבור האינטרנט ונסו שוב')
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(status) {
    if (statusBusy) return
    setStatusBusy(true)
    setStatusError('')
    try {
      const updatedBy = PROFILES[getProfile()] || 'לא ידוע'
      const { error } = await supabase
        .from('part_orders')
        .update({ status, status_updated_by: updatedBy })
        .eq('id', order.id)
      if (error) throw error
      onChanged?.()
    } catch {
      setStatusError('עדכון הסטטוס נכשל — נסו שוב')
    } finally {
      setStatusBusy(false)
    }
  }

  function statusActions() {
    const s = order.status
    if (s === 'pending') {
      return (
        <button className="btn btn-outline flex-1" disabled={statusBusy} onClick={() => setStatus('in_progress')}>
          <SendIcon size={18} />
          התחלת טיפול
        </button>
      )
    }
    if (s === 'in_progress') {
      return (
        <button className="btn btn-success flex-1" disabled={statusBusy} onClick={() => setStatus('ready')}>
          <CheckIcon size={18} />
          מוכן לאיסוף
        </button>
      )
    }
    return (
      <button className="btn btn-outline flex-1" disabled={statusBusy} onClick={() => setStatus('in_progress')}>
        החזרה ל&quot;בטיפול&quot;
      </button>
    )
  }

  const project = order.projects || {}
  const client = project.clients || {}

  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold flex items-center gap-2">
            <PackageIcon size={18} className="text-accent shrink-0" />
            {project.name || 'פרויקט'}
            {client.name ? <span className="text-primary font-normal"> · {client.name}</span> : null}
          </h3>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-primary">
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon size={15} />
              {formatDate(order.created_at)}
            </span>
            {manager && order.team_leads?.name && <span>ראש צוות: {order.team_leads.name}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} labels={PART_STATUS_LABELS} />
          {manager && onPrint && (
            <button
              type="button"
              onClick={() => onPrint(order)}
              className="btn btn-outline !min-h-[36px] !px-3 text-sm"
            >
              <PrinterIcon size={16} />
              הדפסת הזמנה
            </button>
          )}
          {editable && !editing && (
            <button
              type="button"
              onClick={startEdit}
              aria-label="עריכת הזמנה"
              className="btn btn-outline !min-h-[36px] !px-3 text-sm"
            >
              <PencilIcon size={16} />
              עריכה
            </button>
          )}
        </div>
      </div>

      {!editing && (
        <ul className="mt-3 divide-y divide-border border-t border-border">
          {requestLines.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="font-medium">{r.catalog_items?.name || r.other_description}</span>
              <span className="text-sm text-primary shrink-0">כמות: {r.quantity}</span>
            </li>
          ))}
        </ul>
      )}

      {!editing && order.notes && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs font-bold text-primary mb-1">הערות לייצור</p>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{order.notes}</p>
        </div>
      )}

      {editing && (
        <div className="mt-3 pt-3 border-t border-border flex flex-col gap-4">
          {catalogItems === null ? (
            <div className="flex justify-center py-6 text-primary">
              <SpinnerIcon size={24} />
            </div>
          ) : (
            <>
              {lines.map((line, idx) => (
                <div key={line.key} className="rounded-xl border border-border p-3 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary">פריט {idx + 1}</span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        aria-label="הסרת פריט"
                        className="text-primary hover:text-destructive"
                        disabled={saving}
                      >
                        <TrashIcon size={18} />
                      </button>
                    )}
                  </div>
                  <PartLineFields
                    catalogItems={catalogItems}
                    useOther={line.useOther}
                    selectedItem={line.selectedItem}
                    catalogSearch={line.catalogSearch}
                    otherDescription={line.otherDescription}
                    quantity={line.quantity}
                    onChange={(patch) => updateLine(line.key, patch)}
                    error={lineErrors[line.key] || {}}
                    disabled={saving}
                  />
                </div>
              ))}

              <button type="button" onClick={addLine} disabled={saving} className="btn btn-outline w-full">
                <PlusIcon size={18} />
                הוספת פריט נוסף
              </button>

              {saveError && <p className="err !mt-0 text-center font-bold">{saveError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={cancelEdit} disabled={saving} className="btn btn-outline flex-1">
                  ביטול
                </button>
                <button type="button" onClick={save} disabled={saving} className="btn btn-accent flex-[2]">
                  {saving ? <SpinnerIcon size={20} /> : 'שמירה'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {manager && !editing && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-2 flex-1">{statusActions()}</div>
            {order.status_updated_by && (
              <p className="text-xs text-primary">עודכן ע&quot;י: {order.status_updated_by}</p>
            )}
          </div>
          {statusError && <p className="err">{statusError}</p>}
        </div>
      )}
    </li>
  )
}
