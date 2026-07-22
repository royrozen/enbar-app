import { useEffect, useState } from 'react'
import Header from '../components/Header'
import {
  UsersIcon,
  HardHatIcon,
  PlusIcon,
  SpinnerIcon,
  PackageIcon,
  PencilIcon,
  CheckIcon,
  XIcon,
  TrashIcon,
  ChevronDownIcon,
} from '../components/Icons'
import { supabase } from '../lib/supabase'

const TABS = [
  { key: 'clients', label: 'לקוחות', Icon: UsersIcon },
  { key: 'leads', label: 'ראשי צוות', Icon: HardHatIcon },
  { key: 'catalog', label: 'קטלוג חלקים', Icon: PackageIcon },
]

function ActiveToggle({ item, onToggle, busy }) {
  return (
    <button
      className={`btn text-sm !min-h-[40px] ${item.is_active ? 'btn-ghost' : 'btn-outline !border-green-300 !text-green-700'}`}
      disabled={busy}
      onClick={onToggle}
      title={item.is_active ? 'הפריט יוסתר מהרשימות אך ההיסטוריה תישמר' : 'החזרת הפריט לרשימות'}
    >
      {item.is_active ? 'השבתה' : 'הפעלה'}
    </button>
  )
}

// Inline delete confirmation — no modal/window.confirm (app has no dialog primitive).
// Renders a trash button; once clicked, swaps to "למחוק את {name}?" + confirm/cancel.
function DeleteAction({ name, onConfirm, busy, disabled, disabledTitle }) {
  const [confirming, setConfirming] = useState(false)

  if (disabled) {
    return (
      <button
        className="btn btn-ghost text-sm !min-h-[40px] opacity-40 cursor-not-allowed"
        disabled
        title={disabledTitle}
        aria-label="מחיקה"
      >
        <TrashIcon size={16} />
      </button>
    )
  }

  if (!confirming) {
    return (
      <button
        className="btn btn-ghost text-sm !min-h-[40px] hover:!text-destructive"
        onClick={() => setConfirming(true)}
        aria-label="מחיקה"
        title="מחיקה — הפריט יוסתר לצמיתות"
      >
        <TrashIcon size={16} />
      </button>
    )
  }

  return (
    <span className="flex items-center gap-2 flex-wrap">
      <span className="text-sm font-bold text-destructive">למחוק את {name}?</span>
      <button
        className="btn btn-destructive text-sm !min-h-[40px]"
        disabled={busy}
        onClick={async () => {
          await onConfirm()
          setConfirming(false)
        }}
      >
        {busy ? <SpinnerIcon size={16} /> : 'מחיקה'}
      </button>
      <button
        className="btn btn-ghost text-sm !min-h-[40px]"
        disabled={busy}
        onClick={() => setConfirming(false)}
      >
        ביטול
      </button>
    </span>
  )
}

function useAdminList(table, select = '*') {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    const { data, error: err } = await supabase
      .from(table)
      .select(select)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (err) setError('הטעינה נכשלה — נסו לרענן')
    else setItems(data || [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table])

  async function toggleActive(item) {
    const { error: err } = await supabase
      .from(table)
      .update({ is_active: !item.is_active })
      .eq('id', item.id)
    if (err) {
      setError('העדכון נכשל — נסו שוב')
      return
    }
    setItems((list) => list.map((x) => (x.id === item.id ? { ...x, is_active: !x.is_active } : x)))
  }

  async function softDelete(item) {
    const { error: err } = await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', item.id)
    if (err) {
      setError('המחיקה נכשלה — נסו שוב')
      return false
    }
    setItems((list) => list.filter((x) => x.id !== item.id))
    return true
  }

  return { items, error, setError, load, toggleActive, softDelete }
}

const emptyProjectForm = { name: '', city: '', contact_person: '', phone: '', email: '' }

// Shared field set for adding/editing a project under a client (client implicit).
function ProjectForm({ form, setForm, error, busy, onSubmit, onCancel, submitLabel }) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border-2 border-border bg-white p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
    >
      <div>
        <label className="label !text-xs">שם הפרויקט *</label>
        <input className="input" value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="למשל: מגדל הזהב — קומות 1-5" />
      </div>
      <div>
        <label className="label !text-xs">כתובת / עיר</label>
        <input className="input" value={form.city}
          onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
      </div>
      <div>
        <label className="label !text-xs">איש קשר</label>
        <input className="input" value={form.contact_person}
          onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))} />
      </div>
      <div>
        <label className="label !text-xs">טלפון</label>
        <input className="input" type="tel" dir="ltr" value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
      </div>
      <div className="sm:col-span-2">
        <label className="label !text-xs">דוא&quot;ל</label>
        <input className="input" type="email" dir="ltr" value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
      </div>
      {error && <p className="err sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2 flex gap-2">
        <button className="btn btn-accent" disabled={busy}>
          {busy ? <SpinnerIcon size={18} /> : <CheckIcon size={18} />}
          {submitLabel}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>
          ביטול
        </button>
      </div>
    </form>
  )
}

function ClientsTab() {
  const { items, error, setError, load, toggleActive, softDelete } = useAdminList(
    'clients',
    '*, projects(id, name, city, contact_person, phone, email, is_active, deleted_at)',
  )
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', registration_number: '' })
  const [addError, setAddError] = useState('')
  const [addBusy, setAddBusy] = useState(false)

  const [expandedId, setExpandedId] = useState(null)

  const [editingClientId, setEditingClientId] = useState(null)
  const [clientEditForm, setClientEditForm] = useState({ name: '', registration_number: '' })
  const [clientEditError, setClientEditError] = useState('')
  const [clientEditBusy, setClientEditBusy] = useState(false)

  const [addingProjectFor, setAddingProjectFor] = useState(null)
  const [projectAddForm, setProjectAddForm] = useState(emptyProjectForm)
  const [projectAddError, setProjectAddError] = useState('')
  const [projectAddBusy, setProjectAddBusy] = useState(false)

  const [editingProjectId, setEditingProjectId] = useState(null)
  const [projectEditForm, setProjectEditForm] = useState(emptyProjectForm)
  const [projectEditError, setProjectEditError] = useState('')
  const [projectEditBusy, setProjectEditBusy] = useState(false)

  const [deleteBusy, setDeleteBusy] = useState(false)

  function liveProjects(client) {
    return (client.projects || []).filter((p) => !p.deleted_at)
  }

  async function addClient(e) {
    e.preventDefault()
    if (!addForm.name.trim()) {
      setAddError('יש להזין שם לקוח')
      return
    }
    setAddError('')
    setAddBusy(true)
    const { error: err } = await supabase.from('clients').insert({
      name: addForm.name.trim(),
      registration_number: addForm.registration_number.trim() || null,
    })
    setAddBusy(false)
    if (err) {
      setAddError('הוספת הלקוח נכשלה — נסו שוב')
      return
    }
    setAddForm({ name: '', registration_number: '' })
    setShowAdd(false)
    load()
  }

  function startClientEdit(client) {
    setEditingClientId(client.id)
    setClientEditForm({ name: client.name, registration_number: client.registration_number || '' })
    setClientEditError('')
  }

  async function saveClientEdit(client) {
    if (!clientEditForm.name.trim()) {
      setClientEditError('יש להזין שם לקוח')
      return
    }
    setClientEditBusy(true)
    const { error: err } = await supabase
      .from('clients')
      .update({
        name: clientEditForm.name.trim(),
        registration_number: clientEditForm.registration_number.trim() || null,
      })
      .eq('id', client.id)
    setClientEditBusy(false)
    if (err) {
      setClientEditError('השמירה נכשלה — נסו שוב')
      return
    }
    setEditingClientId(null)
    load()
  }

  async function addProject(e, clientId) {
    e.preventDefault()
    if (!projectAddForm.name.trim()) {
      setProjectAddError('יש להזין שם פרויקט')
      return
    }
    setProjectAddError('')
    setProjectAddBusy(true)
    const { error: err } = await supabase.from('projects').insert({
      client_id: clientId,
      name: projectAddForm.name.trim(),
      city: projectAddForm.city.trim() || null,
      contact_person: projectAddForm.contact_person.trim() || null,
      phone: projectAddForm.phone.trim() || null,
      email: projectAddForm.email.trim() || null,
    })
    setProjectAddBusy(false)
    if (err) {
      setProjectAddError('הוספת הפרויקט נכשלה — נסו שוב')
      return
    }
    setProjectAddForm(emptyProjectForm)
    setAddingProjectFor(null)
    load()
  }

  function startProjectEdit(project) {
    setEditingProjectId(project.id)
    setProjectEditForm({
      name: project.name,
      city: project.city || '',
      contact_person: project.contact_person || '',
      phone: project.phone || '',
      email: project.email || '',
    })
    setProjectEditError('')
  }

  async function saveProjectEdit(e, project) {
    e.preventDefault()
    if (!projectEditForm.name.trim()) {
      setProjectEditError('יש להזין שם פרויקט')
      return
    }
    setProjectEditBusy(true)
    const { error: err } = await supabase
      .from('projects')
      .update({
        name: projectEditForm.name.trim(),
        city: projectEditForm.city.trim() || null,
        contact_person: projectEditForm.contact_person.trim() || null,
        phone: projectEditForm.phone.trim() || null,
        email: projectEditForm.email.trim() || null,
      })
      .eq('id', project.id)
    setProjectEditBusy(false)
    if (err) {
      setProjectEditError('השמירה נכשלה — נסו שוב')
      return
    }
    setEditingProjectId(null)
    load()
  }

  async function toggleProjectActive(project) {
    const { error: err } = await supabase
      .from('projects')
      .update({ is_active: !project.is_active })
      .eq('id', project.id)
    if (err) {
      setError('העדכון נכשל — נסו שוב')
      return
    }
    load()
  }

  async function deleteProject(project) {
    setDeleteBusy(true)
    const { error: err } = await supabase
      .from('projects')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', project.id)
    setDeleteBusy(false)
    if (err) {
      setError('המחיקה נכשלה — נסו שוב')
      return
    }
    load()
  }

  async function deleteClient(client) {
    setDeleteBusy(true)
    await softDelete(client)
    setDeleteBusy(false)
  }

  return (
    <div className="flex flex-col gap-4">
      {!showAdd ? (
        <div>
          <button className="btn btn-accent" onClick={() => setShowAdd(true)}>
            <PlusIcon size={18} />
            הוספת לקוח חדש
          </button>
        </div>
      ) : (
        <form onSubmit={addClient} className="card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <h3 className="font-bold sm:col-span-2">הוספת לקוח חדש</h3>
          <div>
            <label className="label !text-xs" htmlFor="c-name">שם הלקוח *</label>
            <input id="c-name" className="input" value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="למשל: י.ד. בנייה בעמ" autoFocus />
          </div>
          <div>
            <label className="label !text-xs" htmlFor="c-reg">ח.פ</label>
            <input id="c-reg" className="input" dir="ltr" value={addForm.registration_number}
              onChange={(e) => setAddForm((f) => ({ ...f, registration_number: e.target.value }))} />
          </div>
          {addError && <p className="err sm:col-span-2">{addError}</p>}
          <div className="sm:col-span-2 flex gap-2">
            <button className="btn btn-accent" disabled={addBusy}>
              {addBusy ? <SpinnerIcon size={18} /> : <PlusIcon size={18} />}
              הוספת לקוח
            </button>
            <button type="button" className="btn btn-ghost" disabled={addBusy}
              onClick={() => setShowAdd(false)}>
              ביטול
            </button>
          </div>
        </form>
      )}

      {error && <p className="err">{error}</p>}

      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        {(items || []).map((c) => {
          const projects = liveProjects(c)
          const expanded = expandedId === c.id
          return (
            <li key={c.id} className={expanded ? 'lg:col-span-2' : ''}>
              <div className={`card ${c.is_active ? '' : 'opacity-55'}`}>
                <div className="p-4 flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => setExpandedId(expanded ? null : c.id)}
                    className="flex items-center justify-center w-6 h-6 shrink-0 text-primary hover:text-foreground transition-colors"
                    title={expanded ? 'סגירה' : 'הצגת פרויקטים'}
                    aria-expanded={expanded}
                  >
                    <ChevronDownIcon
                      size={18}
                      className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {editingClientId === c.id ? (
                    <div className="flex-1 min-w-[240px] grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="label !text-xs">שם הלקוח *</label>
                        <input className="input !min-h-[44px]" value={clientEditForm.name}
                          onChange={(e) => setClientEditForm((f) => ({ ...f, name: e.target.value }))}
                          autoFocus />
                      </div>
                      <div>
                        <label className="label !text-xs">ח.פ</label>
                        <input className="input !min-h-[44px]" dir="ltr" value={clientEditForm.registration_number}
                          onChange={(e) => setClientEditForm((f) => ({ ...f, registration_number: e.target.value }))} />
                      </div>
                      {clientEditError && <p className="err sm:col-span-2">{clientEditError}</p>}
                      <div className="sm:col-span-2 flex gap-2">
                        <button className="btn btn-outline text-sm !min-h-[40px]" disabled={clientEditBusy}
                          onClick={() => saveClientEdit(c)} aria-label="שמירה">
                          {clientEditBusy ? <SpinnerIcon size={16} /> : <CheckIcon size={16} />}
                          שמירה
                        </button>
                        <button className="btn btn-ghost text-sm !min-h-[40px]" disabled={clientEditBusy}
                          onClick={() => setEditingClientId(null)} aria-label="ביטול">
                          <XIcon size={16} />
                          ביטול
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate">
                          {c.name}
                          {!c.is_active && <span className="text-xs text-primary font-normal ms-2">(מושבת)</span>}
                        </p>
                        <p className="text-sm text-primary truncate">
                          {[
                            c.registration_number ? `ח.פ ${c.registration_number}` : null,
                            `${projects.length} פרויקטים`,
                          ].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <button className="btn btn-ghost text-sm !min-h-[40px]"
                          onClick={() => startClientEdit(c)} aria-label="עריכת לקוח">
                          <PencilIcon size={16} />
                        </button>
                        <ActiveToggle item={c} onToggle={() => toggleActive(c)} />
                        <DeleteAction
                          name={c.name}
                          onConfirm={() => deleteClient(c)}
                          busy={deleteBusy}
                          disabled={projects.length > 0}
                          disabledTitle="יש למחוק קודם את הפרויקטים של הלקוח"
                        />
                      </div>
                    </>
                  )}
                </div>

                {expanded && (
                  <div className="border-t border-border bg-muted rounded-b-2xl p-4 flex flex-col gap-2">
                    {projects.length === 0 && (
                      <p className="text-center text-sm text-primary py-2">אין פרויקטים ללקוח זה</p>
                    )}

                    {projects.map((p) =>
                      editingProjectId === p.id ? (
                        <ProjectForm
                          key={p.id}
                          form={projectEditForm}
                          setForm={setProjectEditForm}
                          error={projectEditError}
                          busy={projectEditBusy}
                          onSubmit={(e) => saveProjectEdit(e, p)}
                          onCancel={() => setEditingProjectId(null)}
                          submitLabel="שמירה"
                        />
                      ) : (
                        <div
                          key={p.id}
                          className={`rounded-xl border-2 border-border bg-white p-3 flex items-center gap-3 flex-wrap ${p.is_active ? '' : 'opacity-55'}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">
                              {p.name}
                              {!p.is_active && <span className="text-xs text-primary font-normal ms-2">(מושבת)</span>}
                            </p>
                            <p className="text-xs text-primary truncate">
                              {[p.city, p.contact_person, p.phone].filter(Boolean).join(' · ') || '—'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            <button className="btn btn-ghost text-sm !min-h-[40px]"
                              onClick={() => startProjectEdit(p)} aria-label="עריכת פרויקט">
                              <PencilIcon size={16} />
                            </button>
                            <ActiveToggle item={p} onToggle={() => toggleProjectActive(p)} />
                            <DeleteAction
                              name={p.name}
                              onConfirm={() => deleteProject(p)}
                              busy={deleteBusy}
                            />
                          </div>
                        </div>
                      ),
                    )}

                    {addingProjectFor === c.id ? (
                      <ProjectForm
                        form={projectAddForm}
                        setForm={setProjectAddForm}
                        error={projectAddError}
                        busy={projectAddBusy}
                        onSubmit={(e) => addProject(e, c.id)}
                        onCancel={() => setAddingProjectFor(null)}
                        submitLabel="הוספת פרויקט"
                      />
                    ) : (
                      <div>
                        <button
                          className="btn btn-outline text-sm"
                          onClick={() => {
                            setProjectAddForm(emptyProjectForm)
                            setProjectAddError('')
                            setAddingProjectFor(c.id)
                          }}
                        >
                          <PlusIcon size={16} />
                          הוספת פרויקט חדש
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          )
        })}
        {items?.length === 0 && (
          <li className="card p-6 text-center text-primary lg:col-span-2">אין לקוחות עדיין</li>
        )}
        {items === null && (
          <li className="flex justify-center py-8 text-primary lg:col-span-2"><SpinnerIcon size={28} /></li>
        )}
      </ul>
    </div>
  )
}

function LeadsTab() {
  const { items, error, setError, load, toggleActive, softDelete } = useAdminList('team_leads')
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const activeCount = (items || []).filter((l) => l.is_active).length

  async function add(e) {
    e.preventDefault()
    if (!name.trim()) {
      setFormError('יש להזין שם ראש צוות')
      return
    }
    setFormError('')
    setBusy(true)
    const { error: err } = await supabase.from('team_leads').insert({ name: name.trim() })
    setBusy(false)
    if (err) {
      setFormError('הוספת ראש הצוות נכשלה — נסו שוב')
      return
    }
    setName('')
    setShowAdd(false)
    load()
  }

  return (
    <div className="flex flex-col gap-4">
      {!showAdd ? (
        <div>
          <button className="btn btn-accent" onClick={() => setShowAdd(true)}>
            <PlusIcon size={18} />
            הוסף ראש צוות
          </button>
        </div>
      ) : (
        <form onSubmit={add} className="card p-4">
          <h3 className="font-bold mb-3">הוספת ראש צוות</h3>
          <div className="flex gap-2 items-start flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="שם ראש הצוות" aria-label="שם ראש הצוות" autoFocus />
              {formError && <p className="err">{formError}</p>}
            </div>
            <button className="btn btn-accent" disabled={busy}>
              {busy ? <SpinnerIcon size={18} /> : <PlusIcon size={18} />}
              הוספה
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setShowAdd(false)}>
              ביטול
            </button>
          </div>
          <p className="text-xs text-primary mt-2">
            שימו לב: בשלב הנוכחי הדוחות משויכים אוטומטית לראש הצוות הפעיל הראשון במערכת
          </p>
        </form>
      )}

      {error && <p className="err">{error}</p>}
      <ul className="flex flex-col gap-2">
        {(items || []).map((l) => {
          const lastActive = l.is_active && activeCount === 1
          return (
            <li key={l.id} className={`card p-4 flex items-center gap-3 flex-wrap ${l.is_active ? '' : 'opacity-55'}`}>
              <p className="flex-1 font-bold truncate">
                {l.name}
                {!l.is_active && <span className="text-xs text-primary font-normal ms-2">(מושבת)</span>}
              </p>
              <ActiveToggle item={l} onToggle={() => toggleActive(l)} />
              <DeleteAction
                name={l.name}
                onConfirm={async () => {
                  setDeleteBusy(true)
                  await softDelete(l)
                  setDeleteBusy(false)
                }}
                busy={deleteBusy}
                disabled={lastActive}
                disabledTitle="לא ניתן למחוק את ראש הצוות הפעיל האחרון — הדוחות משויכים אליו"
              />
            </li>
          )
        })}
        {items?.length === 0 && <li className="card p-6 text-center text-primary">אין ראשי צוות עדיין</li>}
        {items === null && (
          <li className="flex justify-center py-8 text-primary"><SpinnerIcon size={28} /></li>
        )}
      </ul>
    </div>
  )
}

function CatalogTab() {
  const { items, error, setError, load, toggleActive, softDelete } = useAdminList('catalog_items')
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [editError, setEditError] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  async function add(e) {
    e.preventDefault()
    if (!name.trim()) {
      setFormError('יש להזין שם חלק')
      return
    }
    setFormError('')
    setBusy(true)
    const { error: err } = await supabase.from('catalog_items').insert({ name: name.trim() })
    setBusy(false)
    if (err) {
      setFormError('הוספת החלק נכשלה — נסו שוב')
      return
    }
    setName('')
    setShowAdd(false)
    load()
  }

  function startEdit(item) {
    setEditingId(item.id)
    setEditValue(item.name)
    setEditError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditValue('')
    setEditError('')
  }

  async function saveEdit(item) {
    if (!editValue.trim()) {
      setEditError('יש להזין שם חלק')
      return
    }
    setEditBusy(true)
    const { error: err } = await supabase
      .from('catalog_items')
      .update({ name: editValue.trim() })
      .eq('id', item.id)
    setEditBusy(false)
    if (err) {
      setEditError('השמירה נכשלה — נסו שוב')
      return
    }
    setEditingId(null)
    load()
  }

  return (
    <div className="flex flex-col gap-4">
      {!showAdd ? (
        <div>
          <button className="btn btn-accent" onClick={() => setShowAdd(true)}>
            <PlusIcon size={18} />
            הוספת חלק
          </button>
        </div>
      ) : (
        <form onSubmit={add} className="card p-4">
          <h3 className="font-bold mb-3">הוספת חלק לקטלוג</h3>
          <div className="flex gap-2 items-start flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="שם החלק" aria-label="שם החלק" autoFocus />
              {formError && <p className="err">{formError}</p>}
            </div>
            <button className="btn btn-accent" disabled={busy}>
              {busy ? <SpinnerIcon size={18} /> : <PlusIcon size={18} />}
              הוספה
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setShowAdd(false)}>
              ביטול
            </button>
          </div>
        </form>
      )}

      {error && <p className="err">{error}</p>}
      <ul className="flex flex-col gap-2">
        {(items || []).map((c) => (
          <li key={c.id} className={`card p-4 flex items-center gap-3 flex-wrap ${c.is_active ? '' : 'opacity-55'}`}>
            {editingId === c.id ? (
              <div className="flex-1 min-w-0">
                <input
                  className="input !min-h-[44px]"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  autoFocus
                />
                {editError && <p className="err">{editError}</p>}
              </div>
            ) : (
              <p className="flex-1 font-bold truncate">
                {c.name}
                {!c.is_active && <span className="text-xs text-primary font-normal ms-2">(מושבת)</span>}
              </p>
            )}

            {editingId === c.id ? (
              <>
                <button
                  className="btn btn-outline text-sm !min-h-[40px]"
                  disabled={editBusy}
                  onClick={() => saveEdit(c)}
                  aria-label="שמירה"
                >
                  {editBusy ? <SpinnerIcon size={16} /> : <CheckIcon size={16} />}
                </button>
                <button
                  className="btn btn-ghost text-sm !min-h-[40px]"
                  disabled={editBusy}
                  onClick={cancelEdit}
                  aria-label="ביטול"
                >
                  <XIcon size={16} />
                </button>
              </>
            ) : (
              <button
                className="btn btn-ghost text-sm !min-h-[40px]"
                onClick={() => startEdit(c)}
                aria-label="עריכת שם"
              >
                <PencilIcon size={16} />
              </button>
            )}

            <ActiveToggle item={c} onToggle={() => toggleActive(c)} />
            <DeleteAction
              name={c.name}
              onConfirm={async () => {
                setDeleteBusy(true)
                await softDelete(c)
                setDeleteBusy(false)
              }}
              busy={deleteBusy}
            />
          </li>
        ))}
        {items?.length === 0 && <li className="card p-6 text-center text-primary">אין חלקים בקטלוג עדיין</li>}
        {items === null && (
          <li className="flex justify-center py-8 text-primary"><SpinnerIcon size={28} /></li>
        )}
      </ul>
    </div>
  )
}

export default function ManagerSettings() {
  const [tab, setTab] = useState('clients')

  return (
    <div className="min-h-dvh">
      <Header backTo="/manager" title="ניהול המערכת" />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <h1 className="text-2xl font-black">ניהול המערכת</h1>
        <p className="text-primary mt-1 text-sm">
          לקוחות, פרויקטים וראשי צוות — מחיקה מסתירה את הפריט לצמיתות, ההיסטוריה נשמרת
        </p>

        <div className="mt-5 flex gap-2 border-b border-border">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-3 font-bold text-sm border-b-2 -mb-px transition-colors duration-200 ${
                tab === key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-primary hover:text-foreground'
              }`}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {tab === 'clients' && <ClientsTab />}
          {tab === 'leads' && <LeadsTab />}
          {tab === 'catalog' && <CatalogTab />}
        </div>
      </main>
    </div>
  )
}
