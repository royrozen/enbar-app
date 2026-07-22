import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Header from "../components/Header";
import StatusBadge from "../components/StatusBadge";
import PhotoUploader from "../components/PhotoUploader";
import Lightbox from "../components/Lightbox";
import {
  SpinnerIcon,
  CalendarIcon,
  UsersIcon,
  AlertIcon,
  PencilIcon,
  PlusIcon,
  MinusIcon,
  UploadIcon,
  FileTextIcon,
  SendIcon,
  ClipboardIcon,
} from "../components/Icons";
import {
  supabase,
  exceptionPhotoUrl,
  signedDocUrl,
  EXCEPTION_PHOTO_BUCKET,
  EXCEPTION_DOC_BUCKET,
  SIGNED_DOC_BUCKET,
} from "../lib/supabase";
import { formatDate, MAX_EXCEPTION_DESCRIPTION_LENGTH } from "../lib/format";
import { getProfile, PROFILES } from "../lib/profile";
import { autoBillableDays } from "./ExceptionNew";

const MAX_PHOTOS = 3;
const SELECT =
  "*, projects(name, city, contact_person, phone, email, clients(name)), team_leads(name), exception_photos(*)";

// backTo differs per area; the component itself is identical for both profiles.
export default function ExceptionView({ backTo = "/home" }) {
  const { id } = useParams();
  const [log, setLog] = useState(null);
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [workers, setWorkers] = useState(1);
  const [workDays, setWorkDays] = useState(1);
  const [desc, setDesc] = useState("");
  const [daysOverridden, setDaysOverridden] = useState(false);
  const [manualDays, setManualDays] = useState("");
  const [newPhotos, setNewPhotos] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveWarning, setSaveWarning] = useState("");

  // Share / signed state
  const [sharePhone, setSharePhone] = useState("");
  const [docUploading, setDocUploading] = useState(false);
  const [docError, setDocError] = useState("");

  // SignWell e-signature send
  const [signBusy, setSignBusy] = useState(false);
  const [signError, setSignError] = useState("");
  const [signingLink, setSigningLink] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error: err } = await supabase
        .from("exception_logs")
        .select(SELECT)
        .eq("id", id)
        .single();
      if (cancelled) return;
      if (err || !data) setError("היומן לא נמצא");
      else {
        setLog(data);
        setSharePhone(data.projects?.phone || "");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const locked = log?.status === "approved";
  const photos = [...(log?.exception_photos || [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const days = log ? Number(log.billable_days) : 0;
  const daysText = days % 1 === 0 ? String(days) : days.toFixed(1);
  const billableDaysEdit = daysOverridden
    ? manualDays
    : autoBillableDays(workers, workDays);

  async function refresh() {
    const { data } = await supabase
      .from("exception_logs")
      .select(SELECT)
      .eq("id", id)
      .single();
    if (data) setLog(data);
  }

  function startEdit() {
    setWorkers(log.workers_count);
    setWorkDays(log.work_days);
    setDesc(log.work_description);
    setDaysOverridden(log.days_overridden);
    setManualDays(log.days_overridden ? Number(log.billable_days) : "");
    setNewPhotos([]);
    setErrors({});
    setSaveError("");
    setSaveWarning("");
    setEditing(true);
  }

  function validate() {
    const errs = {};
    const w = Number(workers);
    if (!Number.isInteger(w) || w < 1 || w > 50)
      errs.workers = "מספר העובדים חייב להיות בין 1 ל־50";
    const d = Number(workDays);
    if (!Number.isInteger(d) || d < 1 || d > 99)
      errs.workDays = "משך העבודה חייב להיות בין 1 ל־99 ימים";
    if (desc.trim().length < 5)
      errs.desc = "יש להזין תיאור עבודה של 5 תווים לפחות";
    else if (desc.trim().length > MAX_EXCEPTION_DESCRIPTION_LENGTH)
      errs.desc = `התיאור ארוך מדי — עד ${MAX_EXCEPTION_DESCRIPTION_LENGTH} תווים (המסמך לחתימה חייב להישאר בעמוד אחד)`;
    const b = Number(billableDaysEdit);
    if (!Number.isFinite(b) || b < 0.5 || b > 999)
      errs.days = "כמות הימים לחיוב חייבת להיות בין 0.5 ל־999";
    return errs;
  }

  async function save() {
    if (saving) return;
    setSaveError("");
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      // Any edit invalidates whatever was already sent — back to ממתין.
      const by = PROFILES[getProfile()] || "לא ידוע";
      const { error: updErr } = await supabase
        .from("exception_logs")
        .update({
          workers_count: Number(workers),
          work_days: Number(workDays),
          work_description: desc.trim(),
          billable_days: Number(billableDaysEdit),
          days_overridden: daysOverridden,
          status: "pending",
          status_updated_by: by,
        })
        .eq("id", log.id);
      if (updErr) throw updErr;

      const startSort = photos.length;
      let failed = 0;
      for (let i = 0; i < newPhotos.length; i++) {
        try {
          const path = `exceptions/${log.id}/${crypto.randomUUID()}.jpg`;
          const { error: upErr } = await supabase.storage
            .from(EXCEPTION_PHOTO_BUCKET)
            .upload(path, newPhotos[i].file, { contentType: "image/jpeg" });
          if (upErr) throw upErr;
          const { error: rowErr } = await supabase
            .from("exception_photos")
            .insert({
              exception_id: log.id,
              storage_path: path,
              sort_order: startSort + i,
            });
          if (rowErr) throw rowErr;
        } catch {
          failed++;
        }
      }
      if (failed > 0)
        setSaveWarning(
          `שימו לב: ${failed} מתוך ${newPhotos.length} תמונות לא הועלו`,
        );

      await refresh();
      setEditing(false);
    } catch {
      setSaveError("שמירת השינויים נכשלה — נסו שוב");
    } finally {
      setSaving(false);
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // The one send action: generates the PDF, uploads it (pdf_path — also
  // gates the signed-document upload below), sends it to SignWell for
  // signature, then opens WhatsApp with the signing link. Safe to click
  // again after "sent" — creates a fresh SignWell document each time,
  // same as re-generating did before this was merged into one button.
  async function sendForSignature() {
    if (!log || signBusy || locked) return;
    setSignBusy(true);
    setSignError("");
    setSigningLink("");
    try {
      const { generateExceptionPdfV2 } = await import("../lib/pdfV2");
      const blob = await generateExceptionPdfV2(log);

      const path = `exceptions/${log.id}/${crypto.randomUUID()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from(EXCEPTION_DOC_BUCKET)
        .upload(path, blob, { contentType: "application/pdf" });
      if (upErr) throw upErr;

      const pdfBase64 = await blobToBase64(blob);
      const by = PROFILES[getProfile()] || "לא ידוע";
      const res = await fetch("/api/extras/send-for-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exceptionId: log.id, pdfBase64, by }),
      });
      if (!res.ok) throw new Error("send failed");
      const { signingUrl } = await res.json();

      const { error: updErr } = await supabase
        .from("exception_logs")
        .update({ pdf_path: path })
        .eq("id", log.id);
      if (updErr) throw updErr;
      await refresh();

      const name = log.projects?.contact_person || log.projects?.clients?.name || "לקוח";
      const project = log.projects?.name || "";
      const text = encodeURIComponent(
        `שלום ${name}\nמצורף קישור לאישור וחתימה על תוספת/חריגה בפרויקט ${project}\n${signingUrl}\nענבר תעשיות פח`,
      );
      const phone = (log.projects?.phone || "").replace(/[^\d]/g, "").replace(/^0/, "972");
      if (phone) {
        window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
      } else {
        setSigningLink(signingUrl);
      }
    } catch {
      setSignError("שליחה לחתימה נכשלה — נסו שוב");
    } finally {
      setSignBusy(false);
    }
  }

  async function copySigningLink() {
    try {
      await navigator.clipboard.writeText(signingLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* clipboard unavailable — link is still shown for manual copy */
    }
  }

  function shareSignedDocWhatsApp() {
    const url = signedDocUrl(log.signed_path);
    const text = encodeURIComponent(
      `שלום, מצורף המסמך החתום לאישור חריגים ותוספות מענבר תעשיות פח:\n${url}`,
    );
    const phone = sharePhone.replace(/[^\d]/g, "").replace(/^0/, "972");
    const wa = phone
      ? `https://wa.me/${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(wa, "_blank");
  }

  function exceptionDocPublicUrl() {
    return supabase.storage
      .from(EXCEPTION_DOC_BUCKET)
      .getPublicUrl(log.pdf_path).data.publicUrl;
  }

  async function uploadSignedDoc(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || docUploading || locked || !log.pdf_path) return;
    setDocUploading(true);
    setDocError("");
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const path = `exceptions/${log.id}/signed-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(SIGNED_DOC_BUCKET)
        .upload(path, file, { contentType: file.type || "application/pdf" });
      if (upErr) throw upErr;
      const by = PROFILES[getProfile()] || "לא ידוע";
      // Uploading the signed form IS the approval (PRD D2) — atomic with the path.
      const { error: updErr } = await supabase
        .from("exception_logs")
        .update({
          signed_path: path,
          status: "approved",
          status_updated_by: by,
        })
        .eq("id", log.id);
      if (updErr) throw updErr;
      setLog((l) => ({
        ...l,
        signed_path: path,
        status: "approved",
        status_updated_by: by,
      }));
    } catch {
      setDocError("העלאת המסמך נכשלה — נסו שוב");
    } finally {
      setDocUploading(false);
    }
  }

  return (
    <div className={`min-h-dvh ${editing ? "pb-32" : ""}`}>
      <Header
        backTo={backTo}
        title={editing ? "עריכת יומן חריגים" : "יומן חריגים"}
      />
      <main className="mx-auto max-w-3xl px-4 py-6">
        {error && (
          <div className="card border-destructive/40 bg-red-50 p-4 text-destructive font-medium">
            {error}
          </div>
        )}
        {!log && !error && (
          <div className="flex justify-center py-10 text-primary">
            <SpinnerIcon size={32} />
          </div>
        )}

        {log && !editing && (
          <div className="flex flex-col gap-5">
            {/* Summary */}
            <div className="card p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-xl font-black flex items-center gap-2">
                    <AlertIcon size={20} className="text-accent shrink-0" />
                    {log.projects?.name}
                    {log.exception_no != null && (
                      <span className="text-sm text-primary font-normal">#{log.exception_no}</span>
                    )}
                  </h1>
                  <p className="text-sm text-primary mt-0.5">
                    לקוח: {log.projects?.clients?.name || "—"}
                    {log.projects?.city ? ` · ${log.projects.city}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={log.status} size="lg" />
                  {!locked && (
                    <button
                      type="button"
                      onClick={startEdit}
                      className="btn btn-outline !min-h-[40px] text-sm"
                    >
                      <PencilIcon size={16} />
                      עריכה
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-primary">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon size={16} />
                  {formatDate(log.created_at)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <UsersIcon size={16} />
                  {log.workers_count} עובדים
                </span>
                <span>משך: {log.work_days} ימים</span>
                <span className="font-bold text-accent">
                  {daysText} ימי חיוב
                  {log.days_overridden && (
                    <span className="text-xs text-amber-700 ms-1">
                      (הוזן ידנית)
                    </span>
                  )}
                </span>
              </div>
              {log.status_updated_by && (
                <p className="text-xs text-primary mt-2">
                  עדכון אחרון על ידי: {log.status_updated_by}
                </p>
              )}
            </div>

            {/* Description + photos */}
            <section className="card p-5">
              <h2 className="font-bold mb-2">תיאור העבודה הנדרשת</h2>
              <p className="whitespace-pre-wrap leading-relaxed">
                {log.work_description}
              </p>
              {photos.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                  {photos.map((p) => {
                    const url = exceptionPhotoUrl(p.storage_path);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setLightbox(url)}
                        className="aspect-square rounded-xl overflow-hidden border border-border bg-muted hover:opacity-90 transition-opacity"
                        aria-label="הגדלת תמונה"
                      >
                        <img
                          src={url}
                          alt="תמונה מהשטח"
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              )}
              {lightbox && (
                <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
              )}
            </section>

            {/* Send to client — disabled once the client's signed doc is in */}
            <section
              className={`card p-5 ${locked ? "opacity-50 pointer-events-none" : ""}`}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <h2 className="font-bold">דוח לאישור הלקוח</h2>
                <div className="flex items-center gap-3">
                  <StatusBadge status={log.status} />
                  {log.pdf_path && (
                    <a
                      href={exceptionDocPublicUrl()}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-bold text-accent underline inline-flex items-center gap-1"
                    >
                      <FileTextIcon size={14} />
                      צפייה בדוח
                    </a>
                  )}
                </div>
              </div>

              <button
                type="button"
                className="btn btn-accent w-full sm:w-auto"
                onClick={sendForSignature}
                disabled={signBusy || locked}
              >
                {signBusy ? <SpinnerIcon size={18} /> : <SendIcon size={18} />}
                {log.status === "sent"
                  ? "שליחה חוזרת לחתימה"
                  : "הפקת דוח ושליחה לחתימה"}
              </button>
              {signError && <p className="err">{signError}</p>}

              {log.status === "sent" && (
                <p className="mt-2 text-sm font-bold text-blue-800">
                  נשלח לחתימה — ממתין לחתימת הלקוח
                </p>
              )}

              {signingLink && (
                <div className="mt-3 rounded-xl border-2 border-accent/40 bg-muted p-4">
                  <p className="font-bold text-sm mb-2">
                    ללקוח אין מספר וואטסאפ שמור — אפשר להעתיק את קישור החתימה ולשלוח ידנית
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      dir="ltr"
                      readOnly
                      value={signingLink}
                      className="input !min-h-[44px] flex-1 min-w-0 text-sm"
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={copySigningLink}
                    >
                      <ClipboardIcon size={16} />
                      {linkCopied ? "הועתק!" : "העתקת קישור"}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Signed form — disabled until a PDF has been generated at least once */}
            <section
              className={`card p-5 ${!log.pdf_path && !log.signed_path ? "opacity-60" : ""}`}
            >
              <h2 className="font-bold mb-1">המסמך החתום מהלקוח</h2>
              <p className="text-xs text-primary mb-3">
                {log.pdf_path || log.signed_path
                  ? "העלאת המסמך החתום מסמנת את היומן כ״אושר ע״י הלקוח״ ונועלת אותו"
                  : "יש להפיק קודם את דוח החריגים — רק אחרי הפקה ושליחה ללקוח ניתן להעלות מסמך חתום"}
              </p>
              {log.signed_path ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <a
                    href={signedDocUrl(log.signed_path)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-outline"
                  >
                    <FileTextIcon size={18} />
                    צפייה במסמך החתום
                  </a>
                  {log.status === "approved" && (
                    <button
                      type="button"
                      className="btn btn-success"
                      onClick={shareSignedDocWhatsApp}
                    >
                      <SendIcon size={16} />
                      שליחה בוואטסאפ
                    </button>
                  )}
                </div>
              ) : (
                <label
                  className={`btn btn-accent w-full sm:w-auto cursor-pointer ${
                    locked || !log.pdf_path
                      ? "opacity-50 pointer-events-none"
                      : ""
                  }`}
                  title={!log.pdf_path ? "יש להפיק קודם את דוח החריגים" : ""}
                >
                  {docUploading ? (
                    <SpinnerIcon size={18} />
                  ) : (
                    <UploadIcon size={18} />
                  )}
                  העלאת המסמך החתום
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={uploadSignedDoc}
                    disabled={docUploading || locked || !log.pdf_path}
                  />
                </label>
              )}
              {docError && <p className="err">{docError}</p>}
            </section>
          </div>
        )}

        {log && editing && (
          <div className="flex flex-col gap-6">
            <div data-error={!!errors.workers}>
              <span className="label">
                מספר עובדים <span className="text-destructive">*</span>
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setWorkers(Math.max(1, Number(workers) - 1))}
                  disabled={saving || Number(workers) <= 1}
                  aria-label="הפחתת עובד"
                  className="btn btn-outline !min-h-[56px] !w-14 !px-0 !text-2xl shrink-0"
                >
                  <MinusIcon size={26} />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  className="input text-center !text-2xl font-black !min-h-[56px]"
                  value={workers}
                  onChange={(e) => setWorkers(e.target.value)}
                  aria-invalid={!!errors.workers}
                  aria-label="מספר עובדים"
                  disabled={saving}
                />
                <button
                  type="button"
                  onClick={() => setWorkers(Math.min(50, Number(workers) + 1))}
                  disabled={saving || Number(workers) >= 50}
                  aria-label="הוספת עובד"
                  className="btn btn-outline !min-h-[56px] !w-14 !px-0 !text-2xl shrink-0"
                >
                  <PlusIcon size={26} />
                </button>
              </div>
              {errors.workers && <p className="err">{errors.workers}</p>}
            </div>

            <div data-error={!!errors.workDays}>
              <span className="label">
                משך העבודה (ימים) <span className="text-destructive">*</span>
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setWorkDays(Math.max(1, Number(workDays) - 1))}
                  disabled={saving || Number(workDays) <= 1}
                  aria-label="הפחתת יום"
                  className="btn btn-outline !min-h-[56px] !w-14 !px-0 !text-2xl shrink-0"
                >
                  <MinusIcon size={26} />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={99}
                  className="input text-center !text-2xl font-black !min-h-[56px]"
                  value={workDays}
                  onChange={(e) => setWorkDays(e.target.value)}
                  aria-invalid={!!errors.workDays}
                  aria-label="משך העבודה בימים"
                  disabled={saving}
                />
                <button
                  type="button"
                  onClick={() =>
                    setWorkDays(Math.min(99, Number(workDays) + 1))
                  }
                  disabled={saving || Number(workDays) >= 99}
                  aria-label="הוספת יום"
                  className="btn btn-outline !min-h-[56px] !w-14 !px-0 !text-2xl shrink-0"
                >
                  <PlusIcon size={26} />
                </button>
              </div>
              {errors.workDays && <p className="err">{errors.workDays}</p>}
            </div>

            <div data-error={!!errors.desc}>
              <label htmlFor="e-desc" className="label">
                תיאור העבודה הנדרשת <span className="text-destructive">*</span>
              </label>
              <textarea
                id="e-desc"
                className="input"
                rows={4}
                maxLength={MAX_EXCEPTION_DESCRIPTION_LENGTH}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                aria-invalid={!!errors.desc}
                disabled={saving}
              />
              <p className="mt-1 text-xs text-primary text-left" dir="ltr">
                {desc.length}/{MAX_EXCEPTION_DESCRIPTION_LENGTH}
              </p>
              {errors.desc && <p className="err">{errors.desc}</p>}
            </div>

            <div
              data-error={!!errors.days}
              className="card p-4 border-accent/40"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="label !mb-0">
                  כמות ימים לחיוב <span className="text-destructive">*</span>
                </span>
                {daysOverridden ? (
                  <button
                    type="button"
                    className="btn btn-ghost text-sm !min-h-[36px]"
                    onClick={() => {
                      setDaysOverridden(false);
                      setManualDays("");
                    }}
                    disabled={saving}
                  >
                    חישוב אוטומטי
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost text-sm !min-h-[36px]"
                    onClick={() => {
                      setManualDays(autoBillableDays(workers, workDays));
                      setDaysOverridden(true);
                    }}
                    disabled={saving}
                  >
                    <PencilIcon size={14} />
                    עריכה ידנית
                  </button>
                )}
              </div>
              {daysOverridden ? (
                <>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0.5}
                    max={999}
                    step={0.5}
                    className="input text-center !text-2xl font-black !min-h-[56px] mt-2"
                    value={manualDays}
                    onChange={(e) => setManualDays(e.target.value)}
                    aria-invalid={!!errors.days}
                    aria-label="כמות ימים לחיוב"
                    disabled={saving}
                  />
                  <p className="mt-1.5 text-xs text-amber-800 font-medium">
                    הוזן ידנית — הנוסחה האוטומטית מושבתת
                  </p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-black text-accent mt-2 text-center">
                    {billableDaysEdit}
                  </p>
                  <p className="mt-1.5 text-xs text-primary text-center">
                    חישוב אוטומטי: {workers} עובדים × חצי יום × {workDays} ימים
                  </p>
                </>
              )}
              {errors.days && <p className="err">{errors.days}</p>}
            </div>

            {photos.length > 0 && (
              <div>
                <span className="label">תמונות קיימות</span>
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                  {photos.map((p) => (
                    <div
                      key={p.id}
                      className="aspect-square rounded-xl overflow-hidden border border-border bg-muted"
                    >
                      <img
                        src={exceptionPhotoUrl(p.storage_path)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-primary">
                  אי אפשר להסיר תמונות קיימות — ניתן רק להוסיף
                </p>
              </div>
            )}
            <PhotoUploader
              label="הוספת תמונות"
              photos={newPhotos}
              onChange={setNewPhotos}
              remaining={MAX_PHOTOS - photos.length - newPhotos.length}
              disabled={saving}
            />
          </div>
        )}
      </main>

      {log && editing && (
        <div className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-3xl flex flex-col gap-2">
            {saveError && (
              <p className="err !mt-0 text-center font-bold">{saveError}</p>
            )}
            {saveWarning && (
              <p className="text-center text-sm font-medium text-amber-800">
                {saveWarning}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
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
                {saving ? <SpinnerIcon size={22} /> : "שמירה"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
