import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Logo from '../components/Logo'
import Lightbox from '../components/Lightbox'
import { SpinnerIcon, AlertIcon, CheckCircleIcon } from '../components/Icons'
import { supabase, SIGNED_DOC_BUCKET, exceptionPhotoUrl } from '../lib/supabase'
import { formatDate, todayISO } from '../lib/format'

const CONSENT_TEXT = 'אני מאשר/ת שקראתי את התוכן לעיל ומסכים/ה לחתום עליו'

// Minimal signature capture canvas — pointer events cover mouse/touch/pen,
// no dependency needed for a plain draw-a-line pad.
function SignaturePad({ canvasRef, onChange }) {
  const drawingRef = useRef(false)
  const hasInkRef = useRef(false)

  function pos(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e) {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const { x, y } = pos(e)
    drawingRef.current = true
    ctx.beginPath()
    ctx.moveTo(x, y)
    canvas.setPointerCapture(e.pointerId)
  }

  function move(e) {
    if (!drawingRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#16233D'
    ctx.stroke()
    if (!hasInkRef.current) {
      hasInkRef.current = true
      onChange(true)
    }
  }

  function end() {
    drawingRef.current = false
  }

  function clear() {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    hasInkRef.current = false
    onChange(false)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={520}
        height={200}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full rounded-xl border-2 border-dashed border-border bg-white touch-none"
        style={{ touchAction: 'none', aspectRatio: '520 / 200' }}
      />
      <button type="button" className="btn btn-outline !min-h-[32px] !px-3 text-xs mt-2" onClick={clear}>
        ניקוי וציור מחדש
      </button>
    </div>
  )
}

export default function SignRequest() {
  const { token } = useParams()
  const [state, setState] = useState('loading') // loading | expired | signed | form | done
  const [data, setData] = useState(null)
  const [hasSignature, setHasSignature] = useState(false)
  const [fullName, setFullName] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: row, error } = await supabase.rpc('get_signature_request_public', { p_token: token })
      if (cancelled) return
      if (error || !row) {
        setState('expired')
        return
      }
      if (row.status === 'expired' || new Date(row.expires_at) < new Date()) {
        setState('expired')
        return
      }
      setData(row)
      setFullName(row.contact_person || row.client_name || '')
      setState(row.status === 'signed' ? 'signed' : 'form')
    }
    load()
    return () => {
      cancelled = true
    }
  }, [token])

  async function submit() {
    if (submitting || !hasSignature || !consent || !fullName.trim()) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const signatureDataUrl = canvasRef.current.toDataURL('image/png')
      const signedDateText = formatDate(todayISO())
      const exceptionData = {
        work_description: data.work_description,
        billable_days: data.billable_days,
        exception_no: data.exception_no,
        exception_photos: data.photos || [],
        projects: { name: data.project_name, city: data.project_city, clients: { name: data.client_name } },
      }
      const { generateExceptionPdfV2 } = await import('../lib/pdfV2')
      const blob = await generateExceptionPdfV2(exceptionData, {
        signatureDataUrl,
        signedDateText,
        fullName: fullName.trim(),
        consentText: CONSENT_TEXT,
      })

      const path = `exceptions/${data.exception_id}/signed-${token}.pdf`
      const { error: upErr } = await supabase.storage
        .from(SIGNED_DOC_BUCKET)
        .upload(path, blob, { contentType: 'application/pdf' })
      if (upErr) throw upErr

      const { error: rpcErr } = await supabase.rpc('submit_client_signature', {
        p_token: token,
        p_signed_pdf_path: path,
      })
      if (rpcErr) throw rpcErr

      setState('done')
    } catch {
      setSubmitError('השליחה נכשלה — נסו שוב')
    } finally {
      setSubmitting(false)
    }
  }

  const days = data ? Number(data.billable_days) : 0
  const daysText = days % 1 === 0 ? String(days) : days.toFixed(1)

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 py-8">
      <Logo className="h-10 w-auto mb-6" />

      {state === 'loading' && (
        <div className="flex justify-center py-16 text-primary">
          <SpinnerIcon size={32} />
        </div>
      )}

      {state === 'expired' && (
        <div className="card p-8 max-w-md w-full text-center">
          <AlertIcon size={40} className="mx-auto mb-3 text-destructive" />
          <p className="font-bold text-lg">הקישור פג תוקף</p>
        </div>
      )}

      {(state === 'signed' || state === 'done') && (
        <div className="card p-8 max-w-md w-full text-center">
          <CheckCircleIcon size={56} className="mx-auto mb-3 text-success" />
          <p className="font-bold text-lg">תודה, האישור נשלח בהצלחה</p>
        </div>
      )}

      {state === 'form' && data && (
        <div className="w-full max-w-lg flex flex-col gap-5">
          <section className="card p-5">
            <h1 className="text-xl font-black mb-1">אישור עבודה נוספת</h1>
            <p className="text-sm text-primary mb-3">
              {data.client_name}
              {data.project_name ? ` · ${data.project_name}` : ''}
              {data.project_city ? ` · ${data.project_city}` : ''}
            </p>
            <p className="whitespace-pre-wrap leading-relaxed">{data.work_description}</p>
            <p className="mt-3 font-bold text-accent">{daysText} ימי עבודה לחיוב</p>
            {data.photos?.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2.5">
                {[...data.photos]
                  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  .map((p, i) => {
                    const url = exceptionPhotoUrl(p.storage_path)
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setLightbox(url)}
                        className="aspect-square rounded-xl overflow-hidden border border-border bg-muted hover:opacity-90 transition-opacity"
                        aria-label="הגדלת תמונה"
                      >
                        <img src={url} alt="תמונה מהשטח" loading="lazy" className="h-full w-full object-cover" />
                      </button>
                    )
                  })}
              </div>
            )}
            {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
          </section>

          <section className="card p-5">
            <h2 className="font-bold mb-3">חתימה</h2>

            <label className="label" htmlFor="signer-name">
              שם מלא של החותם/ת <span className="text-destructive">*</span>
            </label>
            <input
              id="signer-name"
              type="text"
              className="input mb-4"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="שם מלא"
            />

            <SignaturePad canvasRef={canvasRef} onChange={setHasSignature} />

            <label className="flex items-start gap-2 mt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1"
              />
              <span className="text-sm">{CONSENT_TEXT}</span>
            </label>

            {submitError && <p className="err">{submitError}</p>}

            <button
              type="button"
              className="btn btn-accent w-full !min-h-[56px] mt-4"
              disabled={!hasSignature || !consent || !fullName.trim() || submitting}
              onClick={submit}
            >
              {submitting ? <SpinnerIcon size={20} /> : 'שליחת האישור'}
            </button>
          </section>
        </div>
      )}
    </div>
  )
}
