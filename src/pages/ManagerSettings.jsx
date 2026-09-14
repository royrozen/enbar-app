import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useSearchParams } from "react-router-dom";
import Header from "../components/Header";
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
  RefreshIcon,
  DownloadIcon,
  FactoryIcon,
  CameraIcon,
  QrCodeIcon,
  SearchIcon,
} from "../components/Icons";
import { supabase, PART_PHOTO_BUCKET, machinePartPhotoUrl } from "../lib/supabase";
import { LOGO_URL } from "../components/Logo";
import { compressPhoto } from "../components/PhotoUploader";
import { useAuth } from "../lib/AuthContext";
import {
  normalizeEmployeePhone,
  formatEmployeePhone,
  fetchLunchSettings,
  updateLunchSettings,
  fetchTodayOrders,
  fetchMonthlyCounts,
} from "../lib/lunch";
import { formatDate, todayISO } from "../lib/format";

const TABS = [
  { key: "clients", label: "לקוחות", Icon: UsersIcon },
  { key: "leads", label: "ראשי צוות", Icon: HardHatIcon },
  { key: "catalog", label: "קטלוג חלקים", Icon: PackageIcon },
  { key: "lunch", label: "עובדים", Icon: HardHatIcon },
  { key: "machine-maintenance", label: "תחזוקת מכונות", Icon: FactoryIcon },
];

function ActiveToggle({ item, onToggle, busy }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={item.is_active}
      aria-label={item.is_active ? "השבתת פריט" : "הפעלת פריט"}
      className={`inline-flex h-5 w-8 shrink-0 items-center rounded-full border px-0.5 transition-colors duration-200 ${
        item.is_active
          ? "justify-end border-accent bg-accent"
          : "justify-start border-border bg-muted"
      } ${busy ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
      disabled={busy}
      onClick={onToggle}
      title={
        item.is_active
          ? "הפריט יוסתר מהרשימות אך ההיסטוריה תישמר"
          : "החזרת הפריט לרשימות"
      }
    >
      <span className="inline-block h-3 w-3 rounded-full bg-white shadow" />
    </button>
  );
}

// Phase 2 (maintenance module) — per-employee "גישה למודול תחזוקה" toggle.
// Reachability is already restricted to factory_manager/platform_admin: this
// component only renders inside /manager/settings, which RequireFactoryManager
// gates to those two roles, and the underlying employees UPDATE policy enforces
// the same restriction server-side regardless of UI.
function MaintenanceAccessToggle({ item, onToggle, busy }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={item.maintenance_access_enabled}
      aria-label={
        item.maintenance_access_enabled
          ? "ביטול גישה למודול תחזוקה"
          : "הפעלת גישה למודול תחזוקה"
      }
      className={`inline-flex h-5 w-8 shrink-0 items-center rounded-full border px-0.5 transition-colors duration-200 ${
        item.maintenance_access_enabled
          ? "justify-end border-accent bg-accent"
          : "justify-start border-border bg-muted"
      } ${busy ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
      disabled={busy}
      onClick={onToggle}
      title="גישה למודול תחזוקה"
    >
      <span className="inline-block h-3 w-3 rounded-full bg-white shadow" />
    </button>
  );
}

// Inline delete confirmation — no modal/window.confirm (app has no dialog primitive).
// Renders a trash button; once clicked, swaps to "למחוק את {name}?" + confirm/cancel.
function DeleteAction({ name, onConfirm, busy, disabled, disabledTitle }) {
  const [confirming, setConfirming] = useState(false);

  if (disabled) {
    return (
      <button
        className="btn btn-ghost text-sm !min-h-[34px] opacity-40 cursor-not-allowed"
        disabled
        title={disabledTitle}
        aria-label="מחיקה"
      >
        <TrashIcon size={16} />
      </button>
    );
  }

  if (!confirming) {
    return (
      <button
        className="btn btn-ghost text-sm !min-h-[34px] hover:!text-destructive"
        onClick={() => setConfirming(true)}
        aria-label="מחיקה"
        title="מחיקה — הפריט יוסתר לצמיתות"
      >
        <TrashIcon size={16} />
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 flex-wrap">
      <span className="text-sm font-bold text-destructive">
        למחוק את {name}?
      </span>
      <button
        className="btn btn-destructive text-sm !min-h-[34px]"
        disabled={busy}
        onClick={async () => {
          await onConfirm();
          setConfirming(false);
        }}
      >
        {busy ? <SpinnerIcon size={16} /> : "מחיקה"}
      </button>
      <button
        className="btn btn-ghost text-sm !min-h-[34px]"
        disabled={busy}
        onClick={() => setConfirming(false)}
      >
        ביטול
      </button>
    </span>
  );
}

function useAdminList(table, select = "*") {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    const { data, error: err } = await supabase
      .from(table)
      .select(select)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (err) setError("הטעינה נכשלה — נסו לרענן");
    else setItems(data || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  async function toggleActive(item) {
    const { error: err } = await supabase
      .from(table)
      .update({ is_active: !item.is_active })
      .eq("id", item.id);
    if (err) {
      setError("העדכון נכשל — נסו שוב");
      return;
    }
    setItems((list) =>
      list.map((x) =>
        x.id === item.id ? { ...x, is_active: !x.is_active } : x,
      ),
    );
  }

  async function softDelete(item) {
    const { error: err } = await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", item.id);
    if (err) {
      setError("המחיקה נכשלה — נסו שוב");
      return false;
    }
    setItems((list) => list.filter((x) => x.id !== item.id));
    return true;
  }

  return { items, error, setError, load, toggleActive, softDelete };
}

// Same is_active/soft-delete shape as useAdminList, but for a single row a
// parent component already fetched as part of a larger nested tree (e.g. one
// machine's own parts, one machine within a manually-loaded machines list) —
// so it takes the row's id directly rather than owning a list/load() itself.
function useSoftDeletable(table, id, onChanged) {
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function toggleActive(isActive) {
    setBusy(true);
    await supabase.from(table).update({ is_active: !isActive }).eq("id", id);
    setBusy(false);
    onChanged();
  }

  async function remove() {
    setDeleteBusy(true);
    await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    setDeleteBusy(false);
    onChanged();
  }

  return { busy, deleteBusy, toggleActive, remove };
}

const emptyProjectForm = {
  name: "",
  city: "",
  contact_person: "",
  phone: "",
  email: "",
};

// Shared field set for adding/editing a project under a client (client implicit).
function ProjectForm({
  form,
  setForm,
  error,
  busy,
  onSubmit,
  onCancel,
  submitLabel,
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border-2 border-border bg-white p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
    >
      <div>
        <label className="label !text-xs">שם הפרויקט *</label>
        <input
          className="input"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="למשל: מגדל הזהב — קומות 1-5"
        />
      </div>
      <div>
        <label className="label !text-xs">כתובת / עיר</label>
        <input
          className="input"
          value={form.city}
          onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
        />
      </div>
      <div>
        <label className="label !text-xs">איש קשר</label>
        <input
          className="input"
          value={form.contact_person}
          onChange={(e) =>
            setForm((f) => ({ ...f, contact_person: e.target.value }))
          }
        />
      </div>
      <div>
        <label className="label !text-xs">טלפון</label>
        <input
          className="input"
          type="tel"
          dir="ltr"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label !text-xs">דוא&quot;ל</label>
        <input
          className="input"
          type="email"
          dir="ltr"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
      </div>
      {error && <p className="err sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2 flex gap-2">
        <button className="btn btn-accent" disabled={busy}>
          {busy ? <SpinnerIcon size={18} /> : <CheckIcon size={18} />}
          {submitLabel}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={onCancel}
        >
          ביטול
        </button>
      </div>
    </form>
  );
}

function ClientsTab() {
  const { items, error, setError, load, toggleActive, softDelete } =
    useAdminList(
      "clients",
      "*, projects(id, name, city, contact_person, phone, email, is_active, deleted_at)",
    );
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", registration_number: "" });
  const [addError, setAddError] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  const [expandedId, setExpandedId] = useState(null);

  const [editingClientId, setEditingClientId] = useState(null);
  const [clientEditForm, setClientEditForm] = useState({
    name: "",
    registration_number: "",
  });
  const [clientEditError, setClientEditError] = useState("");
  const [clientEditBusy, setClientEditBusy] = useState(false);

  const [addingProjectFor, setAddingProjectFor] = useState(null);
  const [projectAddForm, setProjectAddForm] = useState(emptyProjectForm);
  const [projectAddError, setProjectAddError] = useState("");
  const [projectAddBusy, setProjectAddBusy] = useState(false);

  const [editingProjectId, setEditingProjectId] = useState(null);
  const [projectEditForm, setProjectEditForm] = useState(emptyProjectForm);
  const [projectEditError, setProjectEditError] = useState("");
  const [projectEditBusy, setProjectEditBusy] = useState(false);

  const [deleteBusy, setDeleteBusy] = useState(false);

  function liveProjects(client) {
    return (client.projects || []).filter((p) => !p.deleted_at);
  }

  async function addClient(e) {
    e.preventDefault();
    if (!addForm.name.trim()) {
      setAddError("יש להזין שם לקוח");
      return;
    }
    setAddError("");
    setAddBusy(true);
    const { error: err } = await supabase.from("clients").insert({
      name: addForm.name.trim(),
      registration_number: addForm.registration_number.trim() || null,
    });
    setAddBusy(false);
    if (err) {
      setAddError("הוספת הלקוח נכשלה — נסו שוב");
      return;
    }
    setAddForm({ name: "", registration_number: "" });
    setShowAdd(false);
    load();
  }

  function startClientEdit(client) {
    setEditingClientId(client.id);
    setClientEditForm({
      name: client.name,
      registration_number: client.registration_number || "",
    });
    setClientEditError("");
  }

  async function saveClientEdit(client) {
    if (!clientEditForm.name.trim()) {
      setClientEditError("יש להזין שם לקוח");
      return;
    }
    setClientEditBusy(true);
    const { error: err } = await supabase
      .from("clients")
      .update({
        name: clientEditForm.name.trim(),
        registration_number: clientEditForm.registration_number.trim() || null,
      })
      .eq("id", client.id);
    setClientEditBusy(false);
    if (err) {
      setClientEditError("השמירה נכשלה — נסו שוב");
      return;
    }
    setEditingClientId(null);
    load();
  }

  async function addProject(e, clientId) {
    e.preventDefault();
    if (!projectAddForm.name.trim()) {
      setProjectAddError("יש להזין שם פרויקט");
      return;
    }
    setProjectAddError("");
    setProjectAddBusy(true);
    const { error: err } = await supabase.from("projects").insert({
      client_id: clientId,
      name: projectAddForm.name.trim(),
      city: projectAddForm.city.trim() || null,
      contact_person: projectAddForm.contact_person.trim() || null,
      phone: projectAddForm.phone.trim() || null,
      email: projectAddForm.email.trim() || null,
    });
    setProjectAddBusy(false);
    if (err) {
      setProjectAddError("הוספת הפרויקט נכשלה — נסו שוב");
      return;
    }
    setProjectAddForm(emptyProjectForm);
    setAddingProjectFor(null);
    load();
  }

  function startProjectEdit(project) {
    setEditingProjectId(project.id);
    setProjectEditForm({
      name: project.name,
      city: project.city || "",
      contact_person: project.contact_person || "",
      phone: project.phone || "",
      email: project.email || "",
    });
    setProjectEditError("");
  }

  async function saveProjectEdit(e, project) {
    e.preventDefault();
    if (!projectEditForm.name.trim()) {
      setProjectEditError("יש להזין שם פרויקט");
      return;
    }
    setProjectEditBusy(true);
    const { error: err } = await supabase
      .from("projects")
      .update({
        name: projectEditForm.name.trim(),
        city: projectEditForm.city.trim() || null,
        contact_person: projectEditForm.contact_person.trim() || null,
        phone: projectEditForm.phone.trim() || null,
        email: projectEditForm.email.trim() || null,
      })
      .eq("id", project.id);
    setProjectEditBusy(false);
    if (err) {
      setProjectEditError("השמירה נכשלה — נסו שוב");
      return;
    }
    setEditingProjectId(null);
    load();
  }

  async function toggleProjectActive(project) {
    const { error: err } = await supabase
      .from("projects")
      .update({ is_active: !project.is_active })
      .eq("id", project.id);
    if (err) {
      setError("העדכון נכשל — נסו שוב");
      return;
    }
    load();
  }

  async function deleteProject(project) {
    setDeleteBusy(true);
    const { error: err } = await supabase
      .from("projects")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", project.id);
    setDeleteBusy(false);
    if (err) {
      setError("המחיקה נכשלה — נסו שוב");
      return;
    }
    load();
  }

  async function deleteClient(client) {
    setDeleteBusy(true);
    await softDelete(client);
    setDeleteBusy(false);
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
        <form
          onSubmit={addClient}
          className="card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <h3 className="font-bold sm:col-span-2">הוספת לקוח חדש</h3>
          <div>
            <label className="label !text-xs" htmlFor="c-name">
              שם הלקוח *
            </label>
            <input
              id="c-name"
              className="input"
              value={addForm.name}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="למשל: י.ד. בנייה בעמ"
              autoFocus
            />
          </div>
          <div>
            <label className="label !text-xs" htmlFor="c-reg">
              ח.פ
            </label>
            <input
              id="c-reg"
              className="input"
              dir="ltr"
              value={addForm.registration_number}
              onChange={(e) =>
                setAddForm((f) => ({
                  ...f,
                  registration_number: e.target.value,
                }))
              }
            />
          </div>
          {addError && <p className="err sm:col-span-2">{addError}</p>}
          <div className="sm:col-span-2 flex gap-2">
            <button className="btn btn-accent" disabled={addBusy}>
              {addBusy ? <SpinnerIcon size={18} /> : <PlusIcon size={18} />}
              הוספת לקוח
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={addBusy}
              onClick={() => setShowAdd(false)}
            >
              ביטול
            </button>
          </div>
        </form>
      )}

      {error && <p className="err">{error}</p>}

      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        {(items || []).map((c) => {
          const projects = liveProjects(c);
          const expanded = expandedId === c.id;
          return (
            <li key={c.id} className={expanded ? "lg:col-span-2" : ""}>
              <div className={`card ${c.is_active ? "" : "opacity-55"}`}>
                <div className="p-4 flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => setExpandedId(expanded ? null : c.id)}
                    className="flex items-center justify-center w-6 h-6 shrink-0 text-primary hover:text-foreground transition-colors"
                    title={expanded ? "סגירה" : "הצגת פרויקטים"}
                    aria-expanded={expanded}
                  >
                    <ChevronDownIcon
                      size={18}
                      className={`transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                  </button>

                  {editingClientId === c.id ? (
                    <div className="flex-1 min-w-[240px] grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="label !text-xs">שם הלקוח *</label>
                        <input
                          className="input !min-h-[30px]"
                          value={clientEditForm.name}
                          onChange={(e) =>
                            setClientEditForm((f) => ({
                              ...f,
                              name: e.target.value,
                            }))
                          }
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="label !text-xs">ח.פ</label>
                        <input
                          className="input !min-h-[30px]"
                          dir="ltr"
                          value={clientEditForm.registration_number}
                          onChange={(e) =>
                            setClientEditForm((f) => ({
                              ...f,
                              registration_number: e.target.value,
                            }))
                          }
                        />
                      </div>
                      {clientEditError && (
                        <p className="err sm:col-span-2">{clientEditError}</p>
                      )}
                      <div className="sm:col-span-2 flex gap-2">
                        <button
                          className="btn btn-outline text-sm !min-h-[34px]"
                          disabled={clientEditBusy}
                          onClick={() => saveClientEdit(c)}
                          aria-label="שמירה"
                        >
                          {clientEditBusy ? (
                            <SpinnerIcon size={16} />
                          ) : (
                            <CheckIcon size={16} />
                          )}
                          שמירה
                        </button>
                        <button
                          className="btn btn-ghost text-sm !min-h-[34px]"
                          disabled={clientEditBusy}
                          onClick={() => setEditingClientId(null)}
                          aria-label="ביטול"
                        >
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
                          {!c.is_active && (
                            <span className="text-xs text-primary font-normal ms-2">
                              (מושבת)
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-primary truncate">
                          {[
                            c.registration_number
                              ? `ח.פ ${c.registration_number}`
                              : null,
                            `${projects.length} פרויקטים`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <button
                          className="btn btn-ghost text-sm !min-h-[34px]"
                          onClick={() => startClientEdit(c)}
                          aria-label="עריכת לקוח"
                        >
                          <PencilIcon size={16} />
                        </button>
                        <ActiveToggle
                          item={c}
                          onToggle={() => toggleActive(c)}
                        />
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
                      <p className="text-center text-sm text-primary py-2">
                        אין פרויקטים ללקוח זה
                      </p>
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
                          className={`rounded-xl border-2 border-border bg-white p-3 flex items-center gap-3 flex-wrap ${p.is_active ? "" : "opacity-55"}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">
                              {p.name}
                              {!p.is_active && (
                                <span className="text-xs text-primary font-normal ms-2">
                                  (מושבת)
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-primary truncate">
                              {[p.city, p.contact_person, p.phone]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            <button
                              className="btn btn-ghost text-sm !min-h-[34px]"
                              onClick={() => startProjectEdit(p)}
                              aria-label="עריכת פרויקט"
                            >
                              <PencilIcon size={16} />
                            </button>
                            <ActiveToggle
                              item={p}
                              onToggle={() => toggleProjectActive(p)}
                            />
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
                            setProjectAddForm(emptyProjectForm);
                            setProjectAddError("");
                            setAddingProjectFor(c.id);
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
          );
        })}
        {items?.length === 0 && (
          <li className="card p-6 text-center text-primary lg:col-span-2">
            אין לקוחות עדיין
          </li>
        )}
        {items === null && (
          <li className="flex justify-center py-8 text-primary lg:col-span-2">
            <SpinnerIcon size={28} />
          </li>
        )}
      </ul>
    </div>
  );
}

function LeadsTab() {
  const { items, error, setError, load, toggleActive, softDelete } =
    useAdminList("team_leads", "*, profiles(id, phone, role)");
  const { session } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [editingLeadId, setEditingLeadId] = useState(null);
  const [leadEditForm, setLeadEditForm] = useState({ name: "", phone: "" });
  const [leadEditError, setLeadEditError] = useState("");
  const [leadEditBusy, setLeadEditBusy] = useState(false);

  function startLeadEdit(lead, linkedProfile) {
    setEditingLeadId(lead.id);
    setLeadEditForm({ name: lead.name, phone: linkedProfile?.phone || "" });
    setLeadEditError("");
  }

  async function saveLeadEdit(lead, linkedProfile) {
    if (!leadEditForm.name.trim()) {
      setLeadEditError("יש להזין שם ראש צוות");
      return;
    }
    setLeadEditBusy(true);
    let res;
    try {
      res = await fetch("/api/admin/update-team-lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          teamLeadId: lead.id,
          name: leadEditForm.name.trim(),
          phone: linkedProfile ? leadEditForm.phone.trim() : "",
        }),
      });
    } catch {
      res = null;
    }
    setLeadEditBusy(false);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setLeadEditError(
        body?.error === "invalid phone"
          ? "מספר טלפון לא תקין — יש להזין מספר נייד ישראלי"
          : "השמירה נכשלה — נסו שוב",
      );
      return;
    }
    setEditingLeadId(null);
    load();
  }

  const activeCount = (items || []).filter((l) => l.is_active).length;

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("יש להזין שם ראש צוות");
      return;
    }
    if (!phone.trim()) {
      setFormError("יש להזין מספר טלפון");
      return;
    }
    setFormError("");
    setBusy(true);
    let res;
    try {
      res = await fetch("/api/admin/create-team-lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
    } catch {
      res = null;
    }
    setBusy(false);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setFormError(
        body?.error === "invalid phone"
          ? "מספר טלפון לא תקין — יש להזין מספר נייד ישראלי"
          : "הוספת ראש הצוות נכשלה — נסו שוב",
      );
      return;
    }
    setName("");
    setPhone("");
    setShowAdd(false);
    load();
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
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="שם ראש הצוות"
                aria-label="שם ראש הצוות"
                autoFocus
              />
            </div>
            <div className="flex-1 min-w-[220px]">
              <input
                className="input"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="050-1234567"
                aria-label="מספר טלפון"
              />
            </div>
            <button className="btn btn-accent" disabled={busy}>
              {busy ? <SpinnerIcon size={18} /> : <PlusIcon size={18} />}
              הוספה
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => setShowAdd(false)}
            >
              ביטול
            </button>
          </div>
          {formError && <p className="err mt-2">{formError}</p>}
        </form>
      )}

      {error && <p className="err">{error}</p>}
      <ul className="flex flex-col gap-2">
        {(items || []).map((l) => {
          const lastActive = l.is_active && activeCount === 1;
          const linkedProfile = Array.isArray(l.profiles)
            ? l.profiles[0]
            : l.profiles;
          return (
            <li
              key={l.id}
              className={`card p-4 flex items-center gap-3 flex-wrap ${l.is_active ? "" : "opacity-55"}`}
            >
              {editingLeadId === l.id ? (
                <div className="flex-1 min-w-[240px] grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="label !text-xs">שם ראש הצוות *</label>
                    <input
                      className="input !min-h-[30px]"
                      value={leadEditForm.name}
                      onChange={(e) =>
                        setLeadEditForm((f) => ({ ...f, name: e.target.value }))
                      }
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="label !text-xs">טלפון</label>
                    <input
                      className="input !min-h-[30px]"
                      dir="ltr"
                      value={leadEditForm.phone}
                      onChange={(e) =>
                        setLeadEditForm((f) => ({
                          ...f,
                          phone: e.target.value,
                        }))
                      }
                      disabled={!linkedProfile}
                      placeholder={linkedProfile ? "" : "אין משתמש מקושר"}
                    />
                  </div>
                  {leadEditError && (
                    <p className="err sm:col-span-2">{leadEditError}</p>
                  )}
                  <div className="sm:col-span-2 flex gap-2">
                    <button
                      className="btn btn-outline text-sm !min-h-[34px]"
                      disabled={leadEditBusy}
                      onClick={() => saveLeadEdit(l, linkedProfile)}
                      aria-label="שמירה"
                    >
                      {leadEditBusy ? (
                        <SpinnerIcon size={16} />
                      ) : (
                        <CheckIcon size={16} />
                      )}
                      שמירה
                    </button>
                    <button
                      className="btn btn-ghost text-sm !min-h-[34px]"
                      disabled={leadEditBusy}
                      onClick={() => setEditingLeadId(null)}
                      aria-label="ביטול"
                    >
                      <XIcon size={16} />
                      ביטול
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold truncate">
                      {l.name}
                      {!l.is_active && (
                        <span className="text-xs text-primary font-normal ms-2">
                          (מושבת)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-primary mt-0.5" dir="ltr">
                      {linkedProfile ? linkedProfile.phone : "אין משתמש מקושר"}
                    </p>
                  </div>
                  <button
                    className="btn btn-ghost text-sm !min-h-[34px]"
                    onClick={() => startLeadEdit(l, linkedProfile)}
                    aria-label="עריכת ראש צוות"
                  >
                    <PencilIcon size={16} />
                  </button>
                  <ActiveToggle item={l} onToggle={() => toggleActive(l)} />
                  <DeleteAction
                    name={l.name}
                    onConfirm={async () => {
                      setDeleteBusy(true);
                      await softDelete(l);
                      setDeleteBusy(false);
                    }}
                    busy={deleteBusy}
                    disabled={lastActive}
                    disabledTitle="לא ניתן למחוק את ראש הצוות הפעיל האחרון — הדוחות משויכים אליו"
                  />
                </>
              )}
            </li>
          );
        })}
        {items?.length === 0 && (
          <li className="card p-6 text-center text-primary">
            אין ראשי צוות עדיין
          </li>
        )}
        {items === null && (
          <li className="flex justify-center py-8 text-primary">
            <SpinnerIcon size={28} />
          </li>
        )}
      </ul>
    </div>
  );
}

function CatalogTab() {
  const { items, error, setError, load, toggleActive, softDelete } =
    useAdminList("catalog_items");
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("יש להזין שם חלק");
      return;
    }
    setFormError("");
    setBusy(true);
    const { error: err } = await supabase
      .from("catalog_items")
      .insert({ name: name.trim() });
    setBusy(false);
    if (err) {
      setFormError("הוספת החלק נכשלה — נסו שוב");
      return;
    }
    setName("");
    setShowAdd(false);
    load();
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditValue(item.name);
    setEditError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue("");
    setEditError("");
  }

  async function saveEdit(item) {
    if (!editValue.trim()) {
      setEditError("יש להזין שם חלק");
      return;
    }
    setEditBusy(true);
    const { error: err } = await supabase
      .from("catalog_items")
      .update({ name: editValue.trim() })
      .eq("id", item.id);
    setEditBusy(false);
    if (err) {
      setEditError("השמירה נכשלה — נסו שוב");
      return;
    }
    setEditingId(null);
    load();
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
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="שם החלק"
                aria-label="שם החלק"
                autoFocus
              />
              {formError && <p className="err">{formError}</p>}
            </div>
            <button className="btn btn-accent" disabled={busy}>
              {busy ? <SpinnerIcon size={18} /> : <PlusIcon size={18} />}
              הוספה
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => setShowAdd(false)}
            >
              ביטול
            </button>
          </div>
        </form>
      )}

      {error && <p className="err">{error}</p>}
      <ul className="flex flex-col gap-2">
        {(items || []).map((c) => (
          <li
            key={c.id}
            className={`card p-4 flex items-center gap-3 flex-wrap ${c.is_active ? "" : "opacity-55"}`}
          >
            {editingId === c.id ? (
              <div className="flex-1 min-w-0">
                <input
                  className="input !min-h-[30px]"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  autoFocus
                />
                {editError && <p className="err">{editError}</p>}
              </div>
            ) : (
              <p className="flex-1 font-bold truncate">
                {c.name}
                {!c.is_active && (
                  <span className="text-xs text-primary font-normal ms-2">
                    (מושבת)
                  </span>
                )}
              </p>
            )}

            {editingId === c.id ? (
              <>
                <button
                  className="btn btn-outline text-sm !min-h-[34px]"
                  disabled={editBusy}
                  onClick={() => saveEdit(c)}
                  aria-label="שמירה"
                >
                  {editBusy ? (
                    <SpinnerIcon size={16} />
                  ) : (
                    <CheckIcon size={16} />
                  )}
                </button>
                <button
                  className="btn btn-ghost text-sm !min-h-[34px]"
                  disabled={editBusy}
                  onClick={cancelEdit}
                  aria-label="ביטול"
                >
                  <XIcon size={16} />
                </button>
              </>
            ) : (
              <button
                className="btn btn-ghost text-sm !min-h-[34px]"
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
                setDeleteBusy(true);
                await softDelete(c);
                setDeleteBusy(false);
              }}
              busy={deleteBusy}
            />
          </li>
        ))}
        {items?.length === 0 && (
          <li className="card p-6 text-center text-primary">
            אין חלקים בקטלוג עדיין
          </li>
        )}
        {items === null && (
          <li className="flex justify-center py-8 text-primary">
            <SpinnerIcon size={28} />
          </li>
        )}
      </ul>
    </div>
  );
}

// Phase 3: תחזוקת מכונות — machine list, add/edit, per-machine period
// assignment with inline machine-owned tasks (§6.3 — task_name is plain
// text, never a shared catalog), and QR display (machines.id, never
// machine_no — §9 storage/route guardrail).

const WEEKDAY_LABELS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי"]; // 0-5, Sun-Fri only

function describeAnchor(mp, kind) {
  if (kind === "weekly") return `יום ${WEEKDAY_LABELS[mp.weekday] || ""}`;
  if (kind === "monthly") return `ה-${mp.day_of_month} לחודש`;
  if (kind === "triannual" || kind === "yearly")
    return `${mp.anchor_day}/${mp.anchor_month}`;
  return "";
}

// Mobile/accordion QR display — inline canvas + PNG download. Desktop pane
// uses the print-ready sticker flow (printMachineQr) instead, in its header.
function MachineQr({ machineId, machineNo }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, machineId, { width: 160, margin: 1 });
    }
  }, [machineId]);

  function download() {
    const a = document.createElement("a");
    a.href = canvasRef.current.toDataURL("image/png");
    a.download = `machine-${String(machineNo).padStart(3, "0")}-qr.png`;
    a.click();
  }

  return (
    <div className="flex flex-col items-center gap-2 shrink-0">
      <canvas ref={canvasRef} className="rounded-lg border border-border" />
      <button
        type="button"
        className="btn btn-outline text-sm !min-h-[34px]"
        onClick={download}
      >
        <DownloadIcon size={16} />
        הורדת QR להדפסה
      </button>
    </div>
  );
}

function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

// Opens a small print-ready window with the machine's QR sticker (logo,
// machine name/number, QR) and triggers the browser print dialog on it.
async function printMachineQr(machine) {
  // Open synchronously, inside the click's own call stack — Safari blocks
  // window.open() called after an await (post-microtask), treating it as no
  // longer a direct result of the user gesture. Fill in the content once the
  // (async) QR render resolves, using the handle we already have.
  const win = window.open("", "_blank", "width=420,height=560");
  if (!win) return;
  const qrDataUrl = await QRCode.toDataURL(machine.id, { width: 320, margin: 1 });
  const machineNo = String(machine.machine_no).padStart(3, "0");
  win.document.write(`<!doctype html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8" />
<title>מדבקת QR — מכונה #${machineNo}</title>
<style>
  @page { margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Heebo, system-ui, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 24px;
    text-align: center;
    color: #16233d;
  }
  img.logo { height: 88px; width: auto; object-fit: contain; }
  .badge {
    font-family: monospace;
    font-size: 13px;
    color: #14284d;
    border: 1px solid rgba(20, 40, 77, 0.2);
    background: rgba(20, 40, 77, 0.08);
    border-radius: 6px;
    padding: 2px 10px;
  }
  h1 { font-size: 22px; margin: 0; }
  p.sub { font-size: 14px; color: #51637c; margin: 0; }
  img.qr {
    width: 240px;
    height: 240px;
    border: 1px solid #dce3ec;
    border-radius: 12px;
    margin-top: 6px;
  }
</style>
</head>
<body>
  <img class="logo" src="${LOGO_URL}" alt="ENBAR" />
  <span class="badge">#${machineNo}</span>
  <h1>${escapeHtml(machine.name)}</h1>
  ${machine.location ? `<p class="sub">${escapeHtml(machine.location)}</p>` : ""}
  <img class="qr" src="${qrDataUrl}" alt="QR" />
  <script>window.onload = () => window.print();</script>
</body>
</html>`);
  win.document.close();
}

function TaskRow({ task, onSaved, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(task.task_name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!value.trim()) {
      setError("יש להזין טקסט משימה");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase
      .from("machine_period_tasks")
      .update({ task_name: value.trim() })
      .eq("id", task.id);
    setBusy(false);
    if (err) {
      setError("השמירה נכשלה — נסו שוב");
      return;
    }
    setEditing(false);
    onSaved(value.trim());
  }

  async function remove() {
    setBusy(true);
    const { error: err } = await supabase
      .from("machine_period_tasks")
      .delete()
      .eq("id", task.id);
    setBusy(false);
    if (!err) onDeleted();
  }

  if (editing) {
    return (
      <li className="flex items-center gap-2">
        <input
          className="input !min-h-[30px] flex-1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        <button
          className="btn btn-outline text-sm !min-h-[30px]"
          disabled={busy}
          onClick={save}
          aria-label="שמירה"
        >
          {busy ? <SpinnerIcon size={14} /> : <CheckIcon size={14} />}
        </button>
        <button
          className="btn btn-ghost text-sm !min-h-[30px]"
          disabled={busy}
          onClick={() => {
            setEditing(false);
            setValue(task.task_name);
            setError("");
          }}
          aria-label="ביטול"
        >
          <XIcon size={14} />
        </button>
        {error && <p className="err w-full">{error}</p>}
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 group">
      <span className="flex-1 text-sm">{task.task_name}</span>
      <button
        className="btn btn-ghost text-sm !min-h-[28px] !p-1.5"
        onClick={() => setEditing(true)}
        aria-label="עריכה"
      >
        <PencilIcon size={14} />
      </button>
      <button
        className="btn btn-ghost text-sm !min-h-[28px] !p-1.5 hover:!text-destructive"
        disabled={busy}
        onClick={remove}
        aria-label="מחיקה"
      >
        {busy ? <SpinnerIcon size={14} /> : <TrashIcon size={14} />}
      </button>
    </li>
  );
}

function AddTaskForm({ machinePeriodId, sortOrder, taskNameOptions, onAdded }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listId = `task-names-${machinePeriodId}`;

  async function add(e) {
    e.preventDefault();
    if (!value.trim()) {
      setError("יש להזין טקסט משימה");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.from("machine_period_tasks").insert({
      machine_period_id: machinePeriodId,
      task_name: value.trim(),
      sort_order: sortOrder,
    });
    setBusy(false);
    if (err) {
      setError("ההוספה נכשלה — נסו שוב");
      return;
    }
    onAdded(value.trim());
    setValue("");
  }

  return (
    <form onSubmit={add} className="flex items-center gap-2 mt-1">
      <input
        className="input !min-h-[30px] flex-1"
        list={listId}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="הוספת משימה"
      />
      <datalist id={listId}>
        {taskNameOptions.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <button
        className="btn btn-outline text-sm !min-h-[30px]"
        disabled={busy}
        aria-label="הוספת משימה"
      >
        {busy ? <SpinnerIcon size={14} /> : <PlusIcon size={14} />}
      </button>
      {error && <p className="err">{error}</p>}
    </form>
  );
}

function PeriodCard({ period, taskNameOptions, onChanged }) {
  const kind = period.maintenance_periods.schedule_kind;
  const tasks = [...period.machine_period_tasks].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <p className="font-bold text-sm">{period.maintenance_periods.name}</p>
        <p className="text-xs text-primary">
          {describeAnchor(period, kind)} · תאריך יעד הבא:{" "}
          {formatDate(period.next_due_date)}
        </p>
      </div>
      <ul className="flex flex-col gap-1">
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            onSaved={onChanged}
            onDeleted={onChanged}
          />
        ))}
        {tasks.length === 0 && (
          <li className="text-xs text-primary">אין משימות עדיין</li>
        )}
      </ul>
      <AddTaskForm
        machinePeriodId={period.id}
        sortOrder={tasks.length}
        taskNameOptions={taskNameOptions}
        onAdded={onChanged}
      />
    </div>
  );
}

const emptyPeriodAnchor = {
  period_id: "",
  weekday: 0,
  day_of_month: 1,
  anchor_month: 1,
  anchor_day: 1,
};

// Yearly/triannual anchors are month+day only, no year — but a native
// <input type="date"> needs a full date to display. 2024 is a leap year so
// Feb 29 is always selectable regardless of the real current year; the year
// itself is discarded on every read (see onChange below).
const ANCHOR_PICKER_YEAR = 2024;

function AddPeriodForm({ machineId, availablePeriods, onAdded }) {
  const [form, setForm] = useState(emptyPeriodAnchor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selected = availablePeriods.find((p) => p.id === form.period_id);
  const kind = selected?.schedule_kind;

  async function add(e) {
    e.preventDefault();
    if (!form.period_id) {
      setError("יש לבחור מחזור טיפול");
      return;
    }
    setBusy(true);
    const { data: dueDate, error: rpcErr } = await supabase.rpc(
      "compute_next_due_date",
      {
        p_schedule_kind: kind,
        p_current_due: todayISO(),
        p_weekday: kind === "weekly" ? form.weekday : null,
        p_day_of_month: kind === "monthly" ? form.day_of_month : null,
        p_anchor_month:
          kind === "triannual" || kind === "yearly" ? form.anchor_month : null,
        p_anchor_day:
          kind === "triannual" || kind === "yearly" ? form.anchor_day : null,
        p_interval_years: selected.interval_years,
      },
    );
    if (rpcErr) {
      setBusy(false);
      setError("חישוב תאריך היעד נכשל — נסו שוב");
      return;
    }
    const { error: err } = await supabase.from("machine_periods").insert({
      machine_id: machineId,
      period_id: form.period_id,
      weekday: kind === "weekly" ? form.weekday : null,
      day_of_month: kind === "monthly" ? form.day_of_month : null,
      anchor_month:
        kind === "triannual" || kind === "yearly" ? form.anchor_month : null,
      anchor_day:
        kind === "triannual" || kind === "yearly" ? form.anchor_day : null,
      next_due_date: dueDate,
    });
    setBusy(false);
    if (err) {
      setError("ההוספה נכשלה — נסו שוב");
      return;
    }
    setForm(emptyPeriodAnchor);
    onAdded();
  }

  if (availablePeriods.length === 0) return null;

  return (
    <form
      onSubmit={add}
      className="rounded-lg border border-dashed border-border p-3 flex items-center gap-2 flex-wrap"
    >
      <select
        className="input !min-h-[30px] !w-auto shrink-0"
        value={form.period_id}
        onChange={(e) =>
          setForm((f) => ({ ...f, period_id: e.target.value }))
        }
      >
        <option value="">הוספת מחזור טיפול</option>
        {availablePeriods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {kind === "weekly" && (
        <select
          className="input !min-h-[30px] !w-auto shrink-0"
          value={form.weekday}
          onChange={(e) =>
            setForm((f) => ({ ...f, weekday: Number(e.target.value) }))
          }
        >
          {WEEKDAY_LABELS.map((label, i) => (
            <option key={i} value={i}>
              יום {label}
            </option>
          ))}
        </select>
      )}

      {kind === "monthly" && (
        <input
          type="number"
          min={1}
          max={28}
          className="input !min-h-[30px] !w-20"
          value={form.day_of_month}
          onChange={(e) =>
            setForm((f) => ({ ...f, day_of_month: Number(e.target.value) }))
          }
          aria-label="יום בחודש"
        />
      )}

      {(kind === "triannual" || kind === "yearly") && (
        <input
          type="date"
          className="input !min-h-[30px] !w-auto"
          value={`${ANCHOR_PICKER_YEAR}-${String(form.anchor_month).padStart(2, "0")}-${String(form.anchor_day).padStart(2, "0")}`}
          onChange={(e) => {
            if (!e.target.value) return;
            const [, m, d] = e.target.value.split("-").map(Number);
            setForm((f) => ({ ...f, anchor_month: m, anchor_day: d }));
          }}
          aria-label="תאריך עוגן (חודש ויום בלבד — השנה אינה נשמרת)"
        />
      )}

      <button className="btn btn-outline text-sm !min-h-[30px]" disabled={busy}>
        {busy ? <SpinnerIcon size={14} /> : <PlusIcon size={14} />}
        הוספה
      </button>
      {error && <p className="err w-full">{error}</p>}
    </form>
  );
}

// Phase 4: parts catalog, per machine. Photo compression mirrors the
// existing report/exception photo-upload pattern (browser-image-compression,
// same options), machine-parts is a public bucket like exception-photos.
const emptyPartForm = {
  name: "",
  store_name: "",
  store_phone: "",
  store_sku: "",
  purchase_price: "",
  purchase_date: "",
  shelf_location: "",
  quantity: "",
};

function PartPhotoPicker({ preview, onChange }) {
  const inputRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    onChange(await compressPhoto(file));
  }

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-16 h-16 rounded-lg border-2 border-dashed border-border bg-white text-primary hover:border-accent hover:text-accent transition-colors flex items-center justify-center overflow-hidden"
        aria-label="בחירת תמונה"
      >
        {preview ? (
          <img src={preview} alt="" className="w-full h-full object-cover" />
        ) : (
          <CameraIcon size={22} />
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

function PartForm({ machineId, initial, onDone, onCancel, submitLabel }) {
  const [form, setForm] = useState(initial || emptyPartForm);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(
    initial?.photo_storage_path
      ? machinePartPhotoUrl(initial.photo_storage_path)
      : null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function pickPhoto(file) {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("יש להזין שם חלק");
      return;
    }
    setBusy(true);
    const row = {
      name: form.name.trim(),
      store_name: form.store_name.trim() || null,
      store_phone: form.store_phone.trim() || null,
      store_sku: form.store_sku.trim() || null,
      purchase_price: form.purchase_price === "" ? null : Number(form.purchase_price),
      purchase_date: form.purchase_date || null,
      shelf_location: form.shelf_location.trim() || null,
      quantity: form.quantity === "" ? null : Number(form.quantity),
    };

    if (initial?.id) {
      const { error: err } = await supabase
        .from("machine_parts")
        .update(row)
        .eq("id", initial.id);
      if (err) {
        setBusy(false);
        setError("השמירה נכשלה — נסו שוב");
        return;
      }
      if (photoFile) {
        const path = `parts/${initial.id}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from(PART_PHOTO_BUCKET)
          .upload(path, photoFile, { contentType: "image/jpeg" });
        if (!upErr) {
          await supabase
            .from("machine_parts")
            .update({ photo_storage_path: path })
            .eq("id", initial.id);
        }
      }
    } else {
      const { data: part, error: err } = await supabase
        .from("machine_parts")
        .insert({ machine_id: machineId, ...row })
        .select()
        .single();
      if (err) {
        setBusy(false);
        setError("ההוספה נכשלה — נסו שוב");
        return;
      }
      if (photoFile) {
        const path = `parts/${part.id}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from(PART_PHOTO_BUCKET)
          .upload(path, photoFile, { contentType: "image/jpeg" });
        if (!upErr) {
          await supabase
            .from("machine_parts")
            .update({ photo_storage_path: path })
            .eq("id", part.id);
        }
      }
    }
    setBusy(false);
    onDone();
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-border p-3 grid grid-cols-1 sm:grid-cols-2 gap-3"
    >
      <div className="sm:col-span-2 flex items-start gap-3">
        <PartPhotoPicker preview={photoPreview} onChange={pickPhoto} />
        <div className="flex-1">
          <label className="label !text-xs">שם החלק *</label>
          <input
            className="input !min-h-[36px]"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            autoFocus
          />
        </div>
      </div>
      <div>
        <label className="label !text-xs">כמות</label>
        <input
          type="number"
          min={0}
          className="input !min-h-[36px]"
          value={form.quantity}
          onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
        />
      </div>
      <div>
        <label className="label !text-xs">מיקום מדף</label>
        <input
          className="input !min-h-[36px]"
          value={form.shelf_location}
          onChange={(e) =>
            setForm((f) => ({ ...f, shelf_location: e.target.value }))
          }
        />
      </div>
      <div>
        <label className="label !text-xs">שם ספק</label>
        <input
          className="input !min-h-[36px]"
          value={form.store_name}
          onChange={(e) =>
            setForm((f) => ({ ...f, store_name: e.target.value }))
          }
        />
      </div>
      <div>
        <label className="label !text-xs">טלפון ספק</label>
        <input
          className="input !min-h-[36px]"
          dir="ltr"
          value={form.store_phone}
          onChange={(e) =>
            setForm((f) => ({ ...f, store_phone: e.target.value }))
          }
        />
      </div>
      <div>
        <label className="label !text-xs">מק״ט ספק</label>
        <input
          className="input !min-h-[36px]"
          dir="ltr"
          value={form.store_sku}
          onChange={(e) =>
            setForm((f) => ({ ...f, store_sku: e.target.value }))
          }
        />
      </div>
      <div>
        <label className="label !text-xs">מחיר רכישה</label>
        <input
          type="number"
          min={0}
          step="0.01"
          className="input !min-h-[36px]"
          value={form.purchase_price}
          onChange={(e) =>
            setForm((f) => ({ ...f, purchase_price: e.target.value }))
          }
        />
      </div>
      <div>
        <label className="label !text-xs">תאריך רכישה</label>
        <input
          type="date"
          className="input !min-h-[36px]"
          value={form.purchase_date}
          onChange={(e) =>
            setForm((f) => ({ ...f, purchase_date: e.target.value }))
          }
        />
      </div>
      {error && <p className="err sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2 flex gap-2">
        <button className="btn btn-accent text-sm !min-h-[34px]" disabled={busy}>
          {busy ? <SpinnerIcon size={16} /> : <CheckIcon size={16} />}
          {submitLabel}
        </button>
        <button
          type="button"
          className="btn btn-ghost text-sm !min-h-[34px]"
          disabled={busy}
          onClick={onCancel}
        >
          ביטול
        </button>
      </div>
    </form>
  );
}

function PartRow({ part, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { busy, deleteBusy, toggleActive, remove } = useSoftDeletable(
    "machine_parts",
    part.id,
    onChanged,
  );

  if (editing) {
    return (
      <PartForm
        initial={part}
        submitLabel="שמירה"
        onDone={() => {
          setEditing(false);
          onChanged();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const detailRows = [
    part.quantity != null && ["כמות", String(part.quantity)],
    part.shelf_location && ["מדף", part.shelf_location],
    part.store_name && ["חנות", part.store_name],
    part.store_phone && ["טלפון חנות", part.store_phone],
    part.store_sku && ["מק״ט בחנות", part.store_sku],
    part.purchase_price != null && ["מחיר רכישה", `${part.purchase_price} ₪`],
    part.purchase_date && ["תאריך רכישה", formatDate(part.purchase_date)],
  ].filter(Boolean);

  return (
    <div
      className={`rounded-lg border border-border p-2 ${part.is_active ? "" : "opacity-55"}`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 min-w-0 flex items-center gap-3 text-start"
          aria-expanded={expanded}
        >
          {part.photo_storage_path ? (
            <img
              src={machinePartPhotoUrl(part.photo_storage_path)}
              alt=""
              className="w-12 h-12 rounded-lg object-cover border border-border shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg border border-dashed border-border shrink-0 flex items-center justify-center text-primary">
              <CameraIcon size={18} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">
              <span className="text-primary font-normal">#{part.part_no}</span>{" "}
              {part.name}
              {!part.is_active && (
                <span className="text-xs text-primary font-normal ms-2">
                  (מושבת)
                </span>
              )}
            </p>
            <p className="text-xs text-primary truncate">
              {[
                part.quantity != null && `כמות: ${part.quantity}`,
                part.shelf_location && `מדף: ${part.shelf_location}`,
                part.store_name,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <ChevronDownIcon
            size={16}
            className={`shrink-0 text-primary transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
        <ActiveToggle
          item={part}
          onToggle={() => toggleActive(part.is_active)}
          busy={busy}
        />
        <button
          className="btn btn-ghost text-sm !min-h-[30px] !p-1.5"
          onClick={() => setEditing(true)}
          aria-label="עריכה"
        >
          <PencilIcon size={16} />
        </button>
        <DeleteAction name={part.name} onConfirm={remove} busy={deleteBusy} />
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-border flex gap-3">
          {part.photo_storage_path && (
            <img
              src={machinePartPhotoUrl(part.photo_storage_path)}
              alt=""
              className="w-28 h-28 rounded-lg object-cover border border-border shrink-0"
            />
          )}
          {detailRows.length > 0 ? (
            <dl className="flex-1 min-w-0 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {detailRows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-primary">{label}</dt>
                  <dd className="font-medium truncate">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-primary">אין פרטים נוספים</p>
          )}
        </div>
      )}
    </div>
  );
}

function PartsSection({ machineId, parts, onChanged, variant = "list" }) {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div
        className={
          variant === "pane"
            ? "flex flex-col gap-2 xl:grid xl:grid-cols-2 xl:items-start"
            : "flex flex-col gap-2"
        }
      >
        {parts.map((p) => (
          <PartRow key={p.id} part={p} onChanged={onChanged} />
        ))}
      </div>
      {parts.length === 0 && !showAdd && (
        <p className="text-xs text-primary">אין חלקים עדיין</p>
      )}
      {showAdd ? (
        <PartForm
          machineId={machineId}
          submitLabel="הוספת חלק"
          onDone={() => {
            setShowAdd(false);
            onChanged();
          }}
          onCancel={() => setShowAdd(false)}
        />
      ) : (
        <div>
          <button
            type="button"
            className="btn btn-outline text-sm !min-h-[34px]"
            onClick={() => setShowAdd(true)}
          >
            <PlusIcon size={16} />
            הוספת חלק
          </button>
        </div>
      )}
    </div>
  );
}

const emptyMachineForm = { name: "", location: "" };

function MachineCard({
  machine,
  expanded,
  onToggleExpand,
  periods,
  taskNameOptions,
  onChanged,
  variant = "list",
}) {
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(emptyMachineForm);
  const [editError, setEditError] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [detailTab, setDetailTab] = useState("periods");
  const { busy, deleteBusy, toggleActive, remove } = useSoftDeletable(
    "machines",
    machine.id,
    onChanged,
  );

  function startEdit() {
    setEditForm({ name: machine.name, location: machine.location || "" });
    setEditError("");
    setEditing(true);
  }

  async function saveEdit() {
    if (!editForm.name.trim()) {
      setEditError("יש להזין שם מכונה");
      return;
    }
    setSaveBusy(true);
    const { error: err } = await supabase
      .from("machines")
      .update({
        name: editForm.name.trim(),
        location: editForm.location.trim() || null,
      })
      .eq("id", machine.id);
    setSaveBusy(false);
    if (err) {
      setEditError("השמירה נכשלה — נסו שוב");
      return;
    }
    setEditing(false);
    onChanged();
  }

  const attachedPeriods = machine.machine_periods.filter((mp) => !mp.deleted_at);
  const availablePeriods = periods.filter(
    (p) => !attachedPeriods.some((mp) => mp.period_id === p.id),
  );

  const Root = variant === "pane" ? "div" : "li";
  const showDetail = variant === "pane" ? true : expanded;

  return (
    <Root
      className={
        variant === "pane"
          ? `flex flex-col gap-4 ${machine.is_active ? "" : "opacity-55"}`
          : `card ${machine.is_active ? "" : "opacity-55"}`
      }
    >
      <div className={variant === "pane" ? "flex items-center gap-3 flex-wrap" : "p-4 flex items-center gap-3 flex-wrap"}>
        {variant === "list" && (
          <button
            onClick={onToggleExpand}
            className="flex items-center justify-center w-6 h-6 shrink-0 text-primary hover:text-foreground transition-colors"
            title={expanded ? "סגירה" : "הצגת פרטים"}
            aria-expanded={expanded}
          >
            <ChevronDownIcon
              size={18}
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        )}

        {editing ? (
          <div className="flex-1 min-w-[240px] grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              className="input !min-h-[30px]"
              value={editForm.name}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="שם המכונה"
              autoFocus
            />
            <input
              className="input !min-h-[30px]"
              value={editForm.location}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, location: e.target.value }))
              }
              placeholder="מיקום"
            />
            {editError && <p className="err sm:col-span-2">{editError}</p>}
            <div className="sm:col-span-2 flex gap-2">
              <button
                className="btn btn-outline text-sm !min-h-[34px]"
                disabled={saveBusy}
                onClick={saveEdit}
              >
                {saveBusy ? <SpinnerIcon size={16} /> : <CheckIcon size={16} />}
                שמירה
              </button>
              <button
                className="btn btn-ghost text-sm !min-h-[34px]"
                disabled={saveBusy}
                onClick={() => setEditing(false)}
              >
                <XIcon size={16} />
                ביטול
              </button>
            </div>
          </div>
        ) : (
          <>
          {variant === "pane" ? (
            <p className="flex-1 min-w-0 font-bold truncate flex items-center gap-2">
              <span className="shrink-0 inline-flex items-center justify-center rounded-md border border-accent/20 bg-accent/10 text-accent font-mono text-xs px-1.5 py-0.5 tabular-nums">
                {String(machine.machine_no).padStart(3, "0")}
              </span>
              <span className="truncate">
                {machine.name}
                {machine.location && (
                  <span className="text-primary font-normal"> · {machine.location}</span>
                )}
                {!machine.is_active && (
                  <span className="text-xs text-primary font-normal ms-2">
                    (מושבת)
                  </span>
                )}
              </span>
            </p>
          ) : (
            <p className="flex-1 min-w-0 font-bold truncate">
              #{String(machine.machine_no).padStart(3, "0")} {machine.name}
              {machine.location && (
                <span className="text-primary font-normal"> · {machine.location}</span>
              )}
              {!machine.is_active && (
                <span className="text-xs text-primary font-normal ms-2">
                  (מושבת)
                </span>
              )}
            </p>
          )}
            <ActiveToggle
              item={machine}
              onToggle={() => toggleActive(machine.is_active)}
              busy={busy}
            />
            {variant === "pane" && (
              <button
                type="button"
                className="btn btn-ghost text-sm !min-h-[34px] !p-1.5"
                onClick={() => printMachineQr(machine)}
                aria-label="הדפסת מדבקת QR"
                title="הדפסת מדבקת QR"
              >
                <QrCodeIcon size={16} />
              </button>
            )}
            <button
              className="btn btn-ghost text-sm !min-h-[34px]"
              onClick={startEdit}
              aria-label="עריכה"
            >
              <PencilIcon size={16} />
            </button>
            <DeleteAction
              name={machine.name}
              onConfirm={remove}
              busy={deleteBusy}
            />
          </>
        )}
      </div>

      {showDetail && (
        <div
          className={
            variant === "pane"
              ? ""
              : "border-t border-border p-4 flex flex-col gap-4 sm:flex-row-reverse sm:items-start"
          }
        >
          {variant === "list" && (
            <MachineQr machineId={machine.id} machineNo={machine.machine_no} />
          )}
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            <div className="flex gap-1">
              {[
                { key: "periods", label: "מחזורי טיפול" },
                { key: "parts", label: "חלקים" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDetailTab(key)}
                  className={`px-3 py-1.5 rounded-full text-sm font-bold transition-colors duration-200 ${
                    detailTab === key
                      ? "bg-accent text-white"
                      : "bg-muted text-primary hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {detailTab === "periods" ? (
              variant === "pane" ? (
                <>
                  <div className="flex flex-col gap-3 xl:grid xl:grid-cols-2 xl:items-start">
                    {attachedPeriods.map((p) => (
                      <PeriodCard
                        key={p.id}
                        period={p}
                        taskNameOptions={taskNameOptions}
                        onChanged={onChanged}
                      />
                    ))}
                  </div>
                  <AddPeriodForm
                    machineId={machine.id}
                    availablePeriods={availablePeriods}
                    onAdded={onChanged}
                  />
                </>
              ) : (
                <>
                  {attachedPeriods.map((p) => (
                    <PeriodCard
                      key={p.id}
                      period={p}
                      taskNameOptions={taskNameOptions}
                      onChanged={onChanged}
                    />
                  ))}
                  <AddPeriodForm
                    machineId={machine.id}
                    availablePeriods={availablePeriods}
                    onAdded={onChanged}
                  />
                </>
              )
            ) : (
              <PartsSection
                machineId={machine.id}
                parts={machine.machine_parts.filter((p) => !p.deleted_at)}
                onChanged={onChanged}
                variant={variant}
              />
            )}
          </div>
        </div>
      )}
    </Root>
  );
}

function MachineMaintenanceTab() {
  const [machines, setMachines] = useState(null);
  const [periods, setPeriods] = useState([]);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(emptyMachineForm);
  const [addError, setAddError] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [search, setSearch] = useState("");

  // Desktop split-pane selection: keep it pointed at a real machine once the
  // list loads, and fall back to the first one if the selected machine is
  // gone (e.g. deleted).
  useEffect(() => {
    if (!machines) return;
    if (!machines.some((m) => m.id === selectedId)) {
      setSelectedId(machines[0]?.id ?? null);
    }
  }, [machines, selectedId]);

  async function load() {
    const { data, error: err } = await supabase
      .from("machines")
      .select(
        "*, machine_periods(*, maintenance_periods(name, schedule_kind, interval_years), machine_period_tasks(*)), machine_parts(*)",
      )
      .is("deleted_at", null)
      .order("machine_no");
    if (err) setError("הטעינה נכשלה — נסו לרענן");
    else setMachines(data || []);
  }

  useEffect(() => {
    load();
    supabase
      .from("maintenance_periods")
      .select("*")
      .order("sort_order")
      .then(({ data }) => setPeriods(data || []));
  }, []);

  const filteredMachines = (machines || []).filter((m) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      String(m.machine_no).padStart(3, "0").includes(q) ||
      (m.location || "").toLowerCase().includes(q)
    );
  });

  const taskNameOptions = Array.from(
    new Set(
      (machines || []).flatMap((m) =>
        m.machine_periods.flatMap((mp) =>
          mp.machine_period_tasks.map((t) => t.task_name),
        ),
      ),
    ),
  );

  async function addMachine(e) {
    e.preventDefault();
    if (!addForm.name.trim()) {
      setAddError("יש להזין שם מכונה");
      return;
    }
    setAddError("");
    setAddBusy(true);
    const { data, error: err } = await supabase
      .from("machines")
      .insert({
        name: addForm.name.trim(),
        location: addForm.location.trim() || null,
      })
      .select()
      .single();
    setAddBusy(false);
    if (err) {
      setAddError("הוספת המכונה נכשלה — נסו שוב");
      return;
    }
    setAddForm(emptyMachineForm);
    setShowAdd(false);
    await load();
    setExpandedId(data.id);
    setSelectedId(data.id);
  }

  return (
    <div className="flex flex-col gap-4">
      {!showAdd ? (
        <div>
          <button className="btn btn-accent" onClick={() => setShowAdd(true)}>
            <PlusIcon size={18} />
            הוספת מכונה
          </button>
        </div>
      ) : (
        <form
          onSubmit={addMachine}
          className="card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <h3 className="font-bold sm:col-span-2">הוספת מכונה חדשה</h3>
          <div>
            <label className="label !text-xs">שם המכונה *</label>
            <input
              className="input"
              value={addForm.name}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, name: e.target.value }))
              }
              autoFocus
            />
          </div>
          <div>
            <label className="label !text-xs">מיקום</label>
            <input
              className="input"
              value={addForm.location}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, location: e.target.value }))
              }
            />
          </div>
          {addError && <p className="err sm:col-span-2">{addError}</p>}
          <div className="sm:col-span-2 flex gap-2">
            <button className="btn btn-accent" disabled={addBusy}>
              {addBusy ? <SpinnerIcon size={18} /> : <PlusIcon size={18} />}
              הוספה
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={addBusy}
              onClick={() => setShowAdd(false)}
            >
              ביטול
            </button>
          </div>
        </form>
      )}

      {error && <p className="err">{error}</p>}

      <div className="relative">
        <SearchIcon
          size={18}
          className="absolute top-1/2 -translate-y-1/2 start-3 text-primary pointer-events-none"
        />
        <input
          type="text"
          className="input !ps-10"
          placeholder="חיפוש מכונה לפי שם, מספר או מיקום..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Mobile / tablet: accordion list, unchanged. */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {filteredMachines.map((m) => (
          <MachineCard
            key={m.id}
            machine={m}
            expanded={expandedId === m.id}
            onToggleExpand={() =>
              setExpandedId(expandedId === m.id ? null : m.id)
            }
            periods={periods}
            taskNameOptions={taskNameOptions}
            onChanged={load}
          />
        ))}
        {machines?.length > 0 && filteredMachines.length === 0 && (
          <li className="card p-6 text-center text-primary">
            לא נמצאו מכונות התואמות לחיפוש
          </li>
        )}
        {machines?.length === 0 && (
          <li className="card p-6 text-center text-primary">
            אין מכונות עדיין
          </li>
        )}
        {machines === null && (
          <li className="flex justify-center py-8 text-primary">
            <SpinnerIcon size={28} />
          </li>
        )}
      </ul>

      {/* Desktop: split console — machine roster on one side, full detail
          for the selected machine always visible on the other. */}
      <div className="hidden lg:flex gap-4 items-start">
        <ul className="w-72 shrink-0 card p-1.5 flex flex-col gap-0.5 max-h-[75vh] overflow-y-auto">
          {filteredMachines.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setSelectedId(m.id)}
                className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-start transition-colors duration-150 ${
                  selectedId === m.id
                    ? "bg-accent text-white"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                <span
                  className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                    m.is_active
                      ? selectedId === m.id
                        ? "bg-white"
                        : "bg-success"
                      : selectedId === m.id
                        ? "bg-white/40"
                        : "bg-border"
                  }`}
                />
                <span
                  className={`shrink-0 font-mono text-xs tabular-nums ${
                    selectedId === m.id ? "text-white/80" : "text-primary"
                  }`}
                >
                  {String(m.machine_no).padStart(3, "0")}
                </span>
                <span className="flex-1 min-w-0 truncate font-bold">
                  {m.name}
                </span>
              </button>
            </li>
          ))}
          {machines?.length > 0 && filteredMachines.length === 0 && (
            <li className="p-4 text-center text-sm text-primary">
              לא נמצאו מכונות
            </li>
          )}
          {machines?.length === 0 && (
            <li className="p-4 text-center text-sm text-primary">
              אין מכונות עדיין
            </li>
          )}
          {machines === null && (
            <li className="flex justify-center py-8 text-primary">
              <SpinnerIcon size={24} />
            </li>
          )}
        </ul>

        <div className="flex-1 min-w-0 card p-4">
          {(() => {
            const selected = (machines || []).find((m) => m.id === selectedId);
            if (!selected) {
              return (
                <p className="text-center text-primary py-8">
                  {machines === null ? "" : "בחרו מכונה כדי להציג פרטים"}
                </p>
              );
            }
            return (
              <MachineCard
                key={selected.id}
                machine={selected}
                periods={periods}
                taskNameOptions={taskNameOptions}
                onChanged={load}
                variant="pane"
              />
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// Reusable <details> section with optional action button in the header.
// Uses native open/toggle behavior while still allowing controlled state.
function CollapsibleSection({
  title,
  count,
  headerAction,
  open,
  onOpenChange,
  children,
}) {
  return (
    <details
      className="group rounded-xl border-2 border-border bg-white"
      open={open}
      onToggle={(e) => onOpenChange?.(e.currentTarget.open)}
    >
      <summary className="flex items-center justify-between gap-2 p-4 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2">
          <span className="font-bold">
            {title}
            {typeof count === "number" ? ` (${count})` : ""}
          </span>
          {headerAction && (
            <div
              className="flex items-center"
              onClick={(e) => e.preventDefault()}
            >
              {headerAction}
            </div>
          )}
        </div>
        <ChevronDownIcon
          size={18}
          className="transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  );
}

function LunchEmployeesSection() {
  const { items, error, setError, load, toggleActive } = useAdminList(
    "employees",
    "id, name, phone, is_active, maintenance_access_enabled, created_at",
  );
  const [showAdd, setShowAdd] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "" });
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const [maintenanceAccessBusyId, setMaintenanceAccessBusyId] = useState(null);

  async function toggleMaintenanceAccess(item) {
    setMaintenanceAccessBusyId(item.id);
    const { error: err } = await supabase
      .from("employees")
      .update({ maintenance_access_enabled: !item.maintenance_access_enabled })
      .eq("id", item.id);
    setMaintenanceAccessBusyId(null);
    if (err) {
      setError("העדכון נכשל — נסו שוב");
      return;
    }
    load();
  }

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("יש להזין שם");
      return;
    }
    const normalized = normalizeEmployeePhone(phone);
    if (!normalized) {
      setFormError("מספר טלפון לא תקין — יש להזין מספר נייד ישראלי");
      return;
    }
    setFormError("");
    setBusy(true);
    const { error: err } = await supabase
      .from("employees")
      .insert({ name: name.trim(), phone: normalized });
    setBusy(false);
    if (err) {
      setFormError(
        err.code === "23505"
          ? "מספר טלפון זה כבר רשום במערכת"
          : "ההוספה נכשלה — נסו שוב",
      );
      return;
    }
    setName("");
    setPhone("");
    setShowAdd(false);
    load();
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      phone: item.phone ? formatEmployeePhone(item.phone) : "",
    });
    setEditError("");
  }

  async function saveEdit(item) {
    if (!editForm.name.trim()) {
      setEditError("יש להזין שם");
      return;
    }
    const normalized = normalizeEmployeePhone(editForm.phone);
    if (!normalized) {
      setEditError("מספר טלפון לא תקין — יש להזין מספר נייד ישראלי");
      return;
    }
    setEditBusy(true);
    const { error: err } = await supabase
      .from("employees")
      .update({ name: editForm.name.trim(), phone: normalized })
      .eq("id", item.id);
    setEditBusy(false);
    if (err) {
      setEditError(
        err.code === "23505"
          ? "מספר טלפון זה כבר רשום במערכת"
          : "השמירה נכשלה — נסו שוב",
      );
      return;
    }
    setEditingId(null);
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="err">{error}</p>}
      <CollapsibleSection
        title="רשימת עובדים"
        count={items?.length}
        open={drawerOpen}
        onOpenChange={(nextOpen) => {
          setDrawerOpen(nextOpen);
          if (!nextOpen) setShowAdd(false);
        }}
        headerAction={
          drawerOpen && (
            <button
              className="btn btn-accent text-sm !min-h-[30px]"
              disabled={showAdd}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowAdd(true);
              }}
            >
              <PlusIcon size={16} />
              הוספת עובד
            </button>
          )
        }
      >
        {showAdd && (
          <form onSubmit={add} className="card p-4 mb-3">
            <h3 className="font-bold mb-3">הוספת עובד</h3>
            <div className="flex gap-2 items-start flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="שם העובד"
                  aria-label="שם העובד"
                  autoFocus
                />
              </div>
              <div className="flex-1 min-w-[220px]">
                <input
                  className="input"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="050-1234567"
                  aria-label="מספר טלפון"
                />
              </div>
              <button className="btn btn-accent" disabled={busy}>
                {busy ? <SpinnerIcon size={18} /> : <PlusIcon size={18} />}
                הוספה
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => setShowAdd(false)}
              >
                ביטול
              </button>
            </div>
            {formError && <p className="err mt-2">{formError}</p>}
          </form>
        )}
        <ul className="flex flex-col gap-2">
          {(items || []).map((item) => (
            <li
              key={item.id}
              className={`card p-4 flex items-center gap-3 flex-wrap ${item.is_active ? "" : "opacity-55"}`}
            >
              {editingId === item.id ? (
                <div className="flex-1 min-w-[240px] grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="label !text-xs">שם *</label>
                    <input
                      className="input !min-h-[30px]"
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, name: e.target.value }))
                      }
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="label !text-xs">טלפון</label>
                    <input
                      className="input !min-h-[30px]"
                      dir="ltr"
                      value={editForm.phone}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, phone: e.target.value }))
                      }
                    />
                  </div>
                  {editError && (
                    <p className="err sm:col-span-2">{editError}</p>
                  )}
                  <div className="sm:col-span-2 flex gap-2">
                    <button
                      className="btn btn-outline text-sm !min-h-[34px]"
                      disabled={editBusy}
                      onClick={() => saveEdit(item)}
                      aria-label="שמירה"
                    >
                      {editBusy ? (
                        <SpinnerIcon size={16} />
                      ) : (
                        <CheckIcon size={16} />
                      )}
                      שמירה
                    </button>
                    <button
                      className="btn btn-ghost text-sm !min-h-[34px]"
                      disabled={editBusy}
                      onClick={() => setEditingId(null)}
                      aria-label="ביטול"
                    >
                      <XIcon size={16} />
                      ביטול
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold truncate">
                      {item.name}
                      {!item.is_active && (
                        <span className="text-xs text-primary font-normal ms-2">
                          (מושבת)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-primary text-right" dir="ltr">
                      {item.phone ? formatEmployeePhone(item.phone) : "—"}
                    </p>
                  </div>
                  <button
                    className="btn btn-ghost text-sm !min-h-[34px]"
                    onClick={() => startEdit(item)}
                    aria-label="עריכת עובד"
                  >
                    <PencilIcon size={16} />
                  </button>
                  <span className="flex items-center gap-1.5 text-xs text-primary">
                    גישה לתחזוקה
                    <MaintenanceAccessToggle
                      item={item}
                      onToggle={() => toggleMaintenanceAccess(item)}
                      busy={maintenanceAccessBusyId === item.id}
                    />
                  </span>
                  <ActiveToggle
                    item={item}
                    onToggle={() => toggleActive(item)}
                  />
                </>
              )}
            </li>
          ))}
          {items?.length === 0 && (
            <li className="card p-6 text-center text-primary">
              אין עובדים עדיין
            </li>
          )}
          {items === null && (
            <li className="flex justify-center py-8 text-primary">
              <SpinnerIcon size={28} />
            </li>
          )}
        </ul>
      </CollapsibleSection>
    </div>
  );
}

const MENU_CATEGORY_LABELS = {
  main_dish: "מנה עיקרית",
  addition: "תוספת",
  salad: "סלט",
};

function LunchMenuSection() {
  const { items, error, setError, load, toggleActive } = useAdminList(
    "lunch_menu_items",
    "id, category, name, is_active, created_at",
  );
  const [showAdd, setShowAdd] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("main_dish");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("יש להזין שם");
      return;
    }
    setFormError("");
    setBusy(true);
    const { error: err } = await supabase
      .from("lunch_menu_items")
      .insert({ name: name.trim(), category });
    setBusy(false);
    if (err) {
      setFormError("ההוספה נכשלה — נסו שוב");
      return;
    }
    setName("");
    setShowAdd(false);
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="err">{error}</p>}
      <CollapsibleSection
        title="פריטי תפריט"
        count={items?.length}
        open={drawerOpen}
        onOpenChange={(nextOpen) => {
          setDrawerOpen(nextOpen);
          if (!nextOpen) setShowAdd(false);
        }}
        headerAction={
          drawerOpen && (
            <button
              className="btn btn-accent text-sm !min-h-[30px]"
              disabled={showAdd}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowAdd(true);
              }}
            >
              <PlusIcon size={16} />
              הוספת פריט
            </button>
          )
        }
      >
        {showAdd && (
          <form onSubmit={add} className="card p-4 mb-3">
            <h3 className="font-bold mb-3">הוספת פריט לתפריט</h3>
            <div className="flex gap-2 items-start flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="שם הפריט"
                  aria-label="שם הפריט"
                  autoFocus
                />
              </div>
              <select
                className="input flex-1 min-w-[160px]"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="קטגוריה"
              >
                {Object.entries(MENU_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button className="btn btn-accent" disabled={busy}>
                {busy ? <SpinnerIcon size={18} /> : <PlusIcon size={18} />}
                הוספה
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => setShowAdd(false)}
              >
                ביטול
              </button>
            </div>
            {formError && <p className="err mt-2">{formError}</p>}
          </form>
        )}
        {items === null ? (
          <div className="flex justify-center py-8 text-primary">
            <SpinnerIcon size={28} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {Object.entries(MENU_CATEGORY_LABELS).map(([cat, label]) => {
              const catItems = items.filter((i) => i.category === cat);
              return (
                <div key={cat}>
                  <p className="text-xs font-bold text-primary mb-2">{label}</p>
                  <ul className="flex flex-col gap-2">
                    {catItems.map((item) => (
                      <li
                        key={item.id}
                        className={`card p-4 flex items-center gap-3 flex-wrap ${item.is_active ? "" : "opacity-55"}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-bold truncate">
                            {item.name}
                            {!item.is_active && (
                              <span className="text-xs text-primary font-normal ms-2">
                                (מושבת)
                              </span>
                            )}
                          </p>
                        </div>
                        <ActiveToggle
                          item={item}
                          onToggle={() => toggleActive(item)}
                        />
                      </li>
                    ))}
                    {catItems.length === 0 && (
                      <li className="card p-4 text-center text-sm text-primary">
                        אין פריטים בקטגוריה זו
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}

function LunchCutoffSection() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchLunchSettings()
      .then(setSettings)
      .catch(() => setError("הטעינה נכשלה — נסו לרענן"));
  }, []);

  async function save(next) {
    setError("");
    setSaved(false);
    setBusy(true);
    try {
      await updateLunchSettings(next);
      setSettings(next);
      setSaved(true);
    } catch {
      setError("השמירה נכשלה — נסו שוב");
    }
    setBusy(false);
  }

  if (!settings) {
    return (
      <div className="card p-4 flex justify-center">
        <SpinnerIcon size={20} />
      </div>
    );
  }

  return (
    <div className="card p-4 flex flex-col gap-3">
      <h3 className="font-bold">נעילת הזמנות</h3>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.cutoffEnabled}
          disabled={busy}
          onChange={(e) => save({ ...settings, cutoffEnabled: e.target.checked })}
        />
        נעילה אוטומטית בשעה קבועה (כיבוי = פתוח כל היום)
      </label>
      {settings.cutoffEnabled && (
        <div className="flex items-center gap-2">
          <label className="label !text-xs" htmlFor="cutoff-time">שעת נעילה</label>
          <input
            id="cutoff-time"
            type="time"
            className="input !w-32"
            value={settings.cutoffTime.slice(0, 5)}
            disabled={busy}
            onChange={(e) => save({ ...settings, cutoffTime: e.target.value })}
          />
        </div>
      )}
      {error && <p className="err">{error}</p>}
      {saved && !error && <p className="text-xs text-primary">נשמר</p>}
    </div>
  );
}

function TodayOrders() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchTodayOrders());
    } catch {
      setError("הטעינה נכשלה — נסו לרענן");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-bold">הזמנות היום — {formatDate(todayISO())}</h3>
        <button className="btn btn-ghost text-sm" onClick={load} disabled={loading}>
          <RefreshIcon size={18} className={loading ? "spin" : ""} />
          רענון
        </button>
      </div>

      {error && <p className="err mt-2">{error}</p>}

      <ul className="mt-3 flex flex-col gap-2">
        {(rows || []).map((o) => (
          <li key={o.id} className="rounded-xl border-2 border-border p-3 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <p className="font-bold truncate">{o.employeeName}</p>
              <p className="text-xs text-primary" dir="ltr">{o.employeePhone}</p>
            </div>
            <div className="flex-[2] min-w-[220px] text-sm text-primary">
              {[o.mainDish, o.addition, o.salad1, o.salad2].filter(Boolean).join(" · ")}
            </div>
          </li>
        ))}
        {rows?.length === 0 && (
          <li className="p-6 text-center text-primary">עדיין לא הוזמנו ארוחות היום</li>
        )}
        {rows === null && (
          <li className="flex justify-center py-8 text-primary"><SpinnerIcon size={28} /></li>
        )}
      </ul>
    </div>
  );
}

function MonthlyReportSection() {
  function currentMonthValue() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function toCsv(rows) {
    const header = "עובד,ימי הזמנה";
    const lines = rows.map((r) => `"${r.name.replace(/"/g, '""')}",${r.count}`);
    return "﻿" + [header, ...lines].join("\n"); // BOM so Excel opens Hebrew correctly
  }

  const [month, setMonth] = useState(currentMonthValue);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const [year, m] = month.split("-").map(Number);
    setLoading(true);
    setError("");
    try {
      setRows(await fetchMonthlyCounts(year, m));
    } catch {
      setError("הטעינה נכשלה — נסו לרענן");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  function exportCsv() {
    const blob = new Blob([toCsv(rows || [])], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lunch-report-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-bold">דוח ארוחות חודשי</h3>
        <button className="btn btn-ghost text-sm" onClick={load} disabled={loading}>
          <RefreshIcon size={18} className={loading ? "spin" : ""} />
          רענון
        </button>
      </div>

      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <div>
          <label className="label !text-xs" htmlFor="lunch-month">חודש</label>
          <input
            id="lunch-month"
            type="month"
            className="input"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <div>
          <label className="label !text-xs invisible">ייצוא</label>
          <button className="btn btn-outline" onClick={exportCsv} disabled={!rows?.length}>
            <DownloadIcon size={18} />
            ייצוא ל-CSV
          </button>
        </div>
      </div>

      {error && <p className="err">{error}</p>}

      <ul className="flex flex-col gap-2">
        {(rows || []).map((r) => (
          <li key={r.employeeId} className="card p-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-bold">{r.name}</p>
              <p className="text-xs text-primary" dir="ltr">{r.phone}</p>
            </div>
            <p className="text-lg font-black text-accent">{r.count}</p>
          </li>
        ))}
        {rows?.length === 0 && (
          <li className="card p-6 text-center text-primary">אין הזמנות בחודש זה</li>
        )}
        {rows === null && (
          <li className="flex justify-center py-8 text-primary"><SpinnerIcon size={28} /></li>
        )}
      </ul>
    </div>
  );
}

const LUNCH_SUB_TABS = [
  { key: "roster", label: "עובדים" },
  { key: "orders", label: "הזמנות צהריים" },
  { key: "report", label: "דוח ארוחות חודשי" },
];

function LunchTab() {
  const [subTab, setSubTab] = useState("roster");

  return (
    <div>
      <div className="flex gap-1 flex-wrap mb-4">
        {LUNCH_SUB_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`px-3 py-2 rounded-full text-sm font-bold transition-colors duration-200 ${
              subTab === key
                ? "bg-accent text-white"
                : "bg-muted text-primary hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === "roster" && <LunchEmployeesSection />}
      {subTab === "orders" && (
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="font-bold mb-3">תפריט</h3>
            <LunchMenuSection />
          </div>
          <LunchCutoffSection />
          <TodayOrders />
        </div>
      )}
      {subTab === "report" && <MonthlyReportSection />}
    </div>
  );
}

const TAB_KEYS = TABS.map((t) => t.key);

export default function ManagerSettings() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState(TAB_KEYS.includes(tabParam) ? tabParam : "clients");

  return (
    <div className="min-h-dvh manager-desktop">
      <Header backTo="/manager" title="ניהול המערכת" />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <h1 className="text-2xl font-black">ניהול המערכת</h1>
        <p className="text-primary mt-1 text-sm">
          לקוחות, פרויקטים וראשי צוות — מחיקה מסתירה את הפריט לצמיתות, ההיסטוריה
          נשמרת
        </p>

        <div className="mt-5 flex gap-2 border-b border-border overflow-x-auto overflow-y-hidden">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-3 font-bold text-sm border-b-2 -mb-px shrink-0 whitespace-nowrap transition-colors duration-200 ${
                tab === key
                  ? "border-accent text-accent"
                  : "border-transparent text-primary hover:text-foreground"
              }`}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {tab === "clients" && <ClientsTab />}
          {tab === "leads" && <LeadsTab />}
          {tab === "catalog" && <CatalogTab />}
          {tab === "lunch" && <LunchTab />}
          {tab === "machine-maintenance" && <MachineMaintenanceTab />}
        </div>
      </main>
    </div>
  );
}
