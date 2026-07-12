import { useEffect, useState } from 'react'
import Header from '../components/Header'
import {
  BuildingIcon,
  UsersIcon,
  HardHatIcon,
  PlusIcon,
  SpinnerIcon,
  PackageIcon,
  PencilIcon,
  CheckIcon,
  XIcon,
} from '../components/Icons'
import { supabase } from '../lib/supabase'

const TABS = [
  { key: 'clients', label: 'לקוחות', Icon: UsersIcon },
  { key: 'projects', label: 'פרויקטים', Icon: BuildingIcon },
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

function useAdminList(table, select = '*') {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    const { data, error: err } = await supabase
      .from(table)
      .select(select)
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

  return { items, error, setError, load, toggleActive }
}

function ClientsTab() {
  const { items, error, setError, load, toggleActive } = useAdminList('clients')
  const [form, setForm] = useState({ name: '' })
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [expandedClientId, setExpandedClientId] = useState(null)
  const [clientProjects, setClientProjects] = useState({})
  const [loadingProjects, setLoadingProjects] = useState({})
  const [selectedProject, setSelectedProject] = useState(null)
  const [togglingProjectId, setTogglingProjectId] = useState(null)

  async function add(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      setFormError('יש להזין שם לקוח')
      return
    }
    setFormError('')
    setBusy(true)
    const { error: err } = await supabase.from('clients').insert({
      name: form.name.trim(),
    })
    setBusy(false)
    if (err) {
      setFormError('הוספת הלקוח נכשלה — נסו שוב')
      return
    }
    setForm({ name: '' })
    load()
  }

  async function toggleExpand(clientId) {
    if (expandedClientId === clientId) {
      setExpandedClientId(null)
      return
    }
    setExpandedClientId(clientId)
    if (!clientProjects[clientId]) {
      setLoadingProjects((p) => ({ ...p, [clientId]: true }))
      const { data, error: err } = await supabase
        .from('projects')
        .select('id, name, city, contact_person, phone, email, is_active')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      if (err) {
        console.error('Error fetching projects:', err)
        setClientProjects((p) => ({ ...p, [clientId]: [] }))
      } else {
        setClientProjects((p) => ({ ...p, [clientId]: data || [] }))
      }
      setLoadingProjects((p) => ({ ...p, [clientId]: false }))
    }
  }

  async function toggleProjectActive(project, clientId) {
    if (togglingProjectId) return
    setTogglingProjectId(project.id)
    const { error: err } = await supabase
      .from('projects')
      .update({ is_active: !project.is_active })
      .eq('id', project.id)
    if (err) {
      console.error('Error updating project:', err)
      setTogglingProjectId(null)
      return
    }
    // Update local state
    const updatedProject = { ...project, is_active: !project.is_active }
    setClientProjects((p) => ({
      ...p,
      [clientId]: p[clientId].map((pr) => (pr.id === project.id ? updatedProject : pr)),
    }))
    setSelectedProject(updatedProject)
    setTogglingProjectId(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={add} className="card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <h3 className="font-bold sm:col-span-2">הוספת לקוח חדש</h3>
        <div>
          <label className="label !text-xs" htmlFor="c-name">שם הלקוח *</label>
          <input id="c-name" className="input" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="למשל: י.ד. בנייה בעמ" />
        </div>
        {formError && <p className="err sm:col-span-2">{formError}</p>}
        <div className="sm:col-span-2">
          <button className="btn btn-accent" disabled={busy}>
            {busy ? <SpinnerIcon size={18} /> : <PlusIcon size={18} />}
            הוספת לקוח
          </button>
        </div>
      </form>

      {error && <p className="err">{error}</p>}
      <ul className="flex flex-col gap-2">
        {(items || []).map((c) => (
          <li key={c.id} className="flex flex-col gap-2">
            <div className={`card p-4 flex items-center gap-3 ${c.is_active ? '' : 'opacity-55'}`}>
              <button
                onClick={() => toggleExpand(c.id)}
                className="flex items-center justify-center w-6 h-6 shrink-0 text-primary hover:text-foreground transition-colors"
                title={expandedClientId === c.id ? 'סגור פרויקטים' : 'הצג פרויקטים'}
              >
                <svg className={`w-4 h-4 transition-transform ${expandedClientId === c.id ? 'rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">
                  {c.name}
                  {!c.is_active && <span className="text-xs text-primary font-normal ms-2">(מושבת)</span>}
                </p>
              </div>
              <ActiveToggle item={c} onToggle={() => toggleActive(c)} />
            </div>
            {expandedClientId === c.id && (
              <div className="rounded-2xl border border-border bg-muted p-4 ms-4">
                {loadingProjects[c.id] ? (
                  <div className="flex justify-center py-4 text-primary"><SpinnerIcon size={24} /></div>
                ) : (clientProjects[c.id] || []).length === 0 ? (
                  <p className="text-center text-sm text-primary">אין פרויקטים ללקוח זה</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {clientProjects[c.id].map((p) => (
                      <li key={p.id}>
                        <button
                          onClick={() => setSelectedProject(p)}
                          className={`w-full text-start p-3 rounded-xl border-2 bg-white transition-colors ${
                            p.is_active
                              ? 'border-border hover:border-accent'
                              : 'border-border opacity-50'
                          }`}
                        >
                          <p className="font-semibold text-sm">{p.name}</p>
                          {p.city && <p className="text-xs text-primary">{p.city}</p>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        ))}
        {items?.length === 0 && <li className="card p-6 text-center text-primary">אין לקוחות עדיין</li>}
        {items === null && (
          <li className="flex justify-center py-8 text-primary"><SpinnerIcon size={28} /></li>
        )}
      </ul>

      {selectedProject && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="card w-full max-w-2xl rounded-t-2xl rounded-b-none p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setSelectedProject(null)}
                className="flex items-center justify-center w-6 h-6 shrink-0 text-primary hover:text-foreground transition-colors"
                aria-label="סגירה"
              >
                <XIcon size={18} />
              </button>
              <h2 className="text-2xl font-bold flex-1">{selectedProject.name}</h2>
              <ActiveToggle
                item={selectedProject}
                onToggle={() => toggleProjectActive(selectedProject, expandedClientId)}
                busy={togglingProjectId === selectedProject.id}
              />
            </div>
            <div className="space-y-4">
              {selectedProject.city && (
                <div>
                  <p className="text-xs text-primary font-semibold">כתובת / עיר</p>
                  <p className="text-sm">{selectedProject.city}</p>
                </div>
              )}
              {(selectedProject.contact_person || selectedProject.phone) && (
                <div>
                  <p className="text-xs text-primary font-semibold">איש קשר</p>
                  <p className="text-sm">
                    {[selectedProject.contact_person, selectedProject.phone].filter(Boolean).join(' · ')}
                  </p>
                </div>
              )}
              {selectedProject.email && (
                <div>
                  <p className="text-xs text-primary font-semibold">דוא&quot;ל</p>
                  <p className="text-sm">{selectedProject.email}</p>
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedProject(null)}
              className="btn btn-accent w-full mt-6"
            >
              סגור
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectsTab() {
  const { items, error, setError, load, toggleActive } = useAdminList('projects', '*, clients(name)')
  const [clients, setClients] = useState([])
  const [form, setForm] = useState({ name: '', client_id: '', city: '', contact_person: '', phone: '', email: '' })
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase
      .from('clients')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setClients(data || []))
  }, [])

  async function add(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      setFormError('יש להזין שם פרויקט')
      return
    }
    if (!form.client_id) {
      setFormError('יש לבחור לקוח — לא ניתן ליצור פרויקט ללא לקוח')
      return
    }
    setFormError('')
    setBusy(true)
    const { error: err } = await supabase.from('projects').insert({
      name: form.name.trim(),
      client_id: form.client_id,
      city: form.city.trim() || null,
      contact_person: form.contact_person.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
    })
    setBusy(false)
    if (err) {
      setFormError('הוספת הפרויקט נכשלה — נסו שוב')
      return
    }
    setForm({ name: '', client_id: '', city: '', contact_person: '', phone: '', email: '' })
    load()
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={add} className="card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <h3 className="font-bold sm:col-span-2">הוספת פרויקט חדש</h3>
        <div>
          <label className="label !text-xs" htmlFor="p-name">שם הפרויקט *</label>
          <input id="p-name" className="input" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="למשל: מגדל הזהב — קומות 1-5" />
        </div>
        <div>
          <label className="label !text-xs" htmlFor="p-client">לקוח *</label>
          <select id="p-client" className="input" value={form.client_id}
            onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}>
            <option value="">בחרו לקוח...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label !text-xs" htmlFor="p-city">כתובת / עיר</label>
          <input id="p-city" className="input" value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
        </div>
        <div>
          <label className="label !text-xs" htmlFor="p-contact">איש קשר</label>
          <input id="p-contact" className="input" value={form.contact_person}
            onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))} />
        </div>
        <div>
          <label className="label !text-xs" htmlFor="p-phone">טלפון</label>
          <input id="p-phone" className="input" type="tel" dir="ltr" value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </div>
        <div>
          <label className="label !text-xs" htmlFor="p-email">דוא"ל</label>
          <input id="p-email" className="input" type="email" dir="ltr" value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
        {formError && <p className="err sm:col-span-2">{formError}</p>}
        <div className="sm:col-span-2">
          <button className="btn btn-accent" disabled={busy}>
            {busy ? <SpinnerIcon size={18} /> : <PlusIcon size={18} />}
            הוספת פרויקט
          </button>
        </div>
      </form>

      {clients.length === 0 && (
        <p className="card border-amber-300 bg-amber-50 p-3 text-amber-800 text-sm font-medium">
          אין לקוחות פעילים — הוסיפו קודם לקוח בלשונית ״לקוחות״
        </p>
      )}

      {error && <p className="err">{error}</p>}
      <ul className="flex flex-col gap-2">
        {(items || []).map((p) => (
          <li key={p.id} className={`card p-4 flex items-center gap-3 ${p.is_active ? '' : 'opacity-55'}`}>
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate">
                {p.name}
                {!p.is_active && <span className="text-xs text-primary font-normal ms-2">(מושבת)</span>}
              </p>
              <p className="text-sm text-primary truncate">
                {[p.clients?.name, p.city, p.contact_person, p.phone, p.email].filter(Boolean).join(' · ')}
              </p>
            </div>
            <ActiveToggle item={p} onToggle={() => toggleActive(p)} />
          </li>
        ))}
        {items?.length === 0 && <li className="card p-6 text-center text-primary">אין פרויקטים עדיין</li>}
        {items === null && (
          <li className="flex justify-center py-8 text-primary"><SpinnerIcon size={28} /></li>
        )}
      </ul>
    </div>
  )
}

function LeadsTab() {
  const { items, error, setError, load, toggleActive } = useAdminList('team_leads')
  const [name, setName] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

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
    load()
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={add} className="card p-4">
        <h3 className="font-bold mb-3">הוספת ראש צוות</h3>
        <div className="flex gap-2 items-start flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="שם ראש הצוות" aria-label="שם ראש הצוות" />
            {formError && <p className="err">{formError}</p>}
          </div>
          <button className="btn btn-accent" disabled={busy}>
            {busy ? <SpinnerIcon size={18} /> : <PlusIcon size={18} />}
            הוספה
          </button>
        </div>
        <p className="text-xs text-primary mt-2">
          שימו לב: בשלב הנוכחי הדוחות משויכים אוטומטית לראש הצוות הפעיל הראשון במערכת
        </p>
      </form>

      {error && <p className="err">{error}</p>}
      <ul className="flex flex-col gap-2">
        {(items || []).map((l) => (
          <li key={l.id} className={`card p-4 flex items-center gap-3 ${l.is_active ? '' : 'opacity-55'}`}>
            <p className="flex-1 font-bold truncate">
              {l.name}
              {!l.is_active && <span className="text-xs text-primary font-normal ms-2">(מושבת)</span>}
            </p>
            <ActiveToggle item={l} onToggle={() => toggleActive(l)} />
          </li>
        ))}
        {items?.length === 0 && <li className="card p-6 text-center text-primary">אין ראשי צוות עדיין</li>}
        {items === null && (
          <li className="flex justify-center py-8 text-primary"><SpinnerIcon size={28} /></li>
        )}
      </ul>
    </div>
  )
}

function CatalogTab() {
  const { items, error, setError, load, toggleActive } = useAdminList('catalog_items')
  const [name, setName] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

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
      <form onSubmit={add} className="card p-4">
        <h3 className="font-bold mb-3">הוספת חלק לקטלוג</h3>
        <div className="flex gap-2 items-start flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="שם החלק" aria-label="שם החלק" />
            {formError && <p className="err">{formError}</p>}
          </div>
          <button className="btn btn-accent" disabled={busy}>
            {busy ? <SpinnerIcon size={18} /> : <PlusIcon size={18} />}
            הוספה
          </button>
        </div>
      </form>

      {error && <p className="err">{error}</p>}
      <ul className="flex flex-col gap-2">
        {(items || []).map((c) => (
          <li key={c.id} className={`card p-4 flex items-center gap-3 ${c.is_active ? '' : 'opacity-55'}`}>
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
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-black">ניהול המערכת</h1>
        <p className="text-primary mt-1 text-sm">
          לקוחות, פרויקטים וראשי צוות — השבתה בלבד, ללא מחיקה (ההיסטוריה נשמרת)
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
          {tab === 'projects' && <ProjectsTab />}
          {tab === 'leads' && <LeadsTab />}
          {tab === 'catalog' && <CatalogTab />}
        </div>
      </main>
    </div>
  )
}
