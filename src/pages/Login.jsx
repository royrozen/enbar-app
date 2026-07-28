import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import Logo from '../components/Logo'
import { SpinnerIcon } from '../components/Icons'
import { normalizePhone, sendOtp, verifyOtp } from '../lib/auth'
import { useAuth } from '../lib/AuthContext'

const RESEND_SECONDS = 60

export default function Login() {
  const { session, profile, loading, authError, clearAuthError } = useAuth()
  const [step, setStep] = useState('phone')
  const [phoneInput, setPhoneInput] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (authError) setError(authError)
  }, [authError])

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [resendIn])

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-primary">
        <SpinnerIcon size={32} />
      </div>
    )
  }

  // Already have a valid session + profile — skip straight to the right home screen.
  if (session && profile) {
    return <Navigate to={profile.role === 'team_lead' ? '/home' : '/manager'} replace />
  }

  async function submitPhone(e) {
    e.preventDefault()
    clearAuthError()
    const normalized = normalizePhone(phoneInput)
    if (!normalized) {
      setError('מספר טלפון לא תקין')
      return
    }
    setError('')
    setBusy(true)
    try {
      const { error: err } = await sendOtp(normalized)
      if (err) {
        setError('שליחת הקוד נכשלה — נסו שוב')
        return
      }
      setPhone(normalized)
      setOtp('')
      setStep('otp')
      setResendIn(RESEND_SECONDS)
    } catch {
      setError('שליחת הקוד נכשלה — נסו שוב')
    } finally {
      setBusy(false)
    }
  }

  async function submitOtp(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { error: err } = await verifyOtp(phone, otp)
      if (err) {
        setError('הקוד שהוזן שגוי, נסה שוב')
      }
      // On success, AuthContext picks up the new session via
      // onAuthStateChange; this component re-renders into the
      // session+profile branch above once the profile row resolves.
    } catch {
      setError('האימות נכשל — בדקו את חיבור האינטרנט ונסו שוב')
    } finally {
      setBusy(false)
    }
  }

  function changeNumber() {
    setStep('phone')
    setOtp('')
    setError('')
    setResendIn(0)
  }

  async function resend() {
    if (resendIn > 0 || busy) return
    setBusy(true)
    try {
      const { error: err } = await sendOtp(phone)
      if (err) {
        setError('שליחת הקוד נכשלה — נסו שוב')
        return
      }
      setResendIn(RESEND_SECONDS)
    } catch {
      setError('שליחת הקוד נכשלה — נסו שוב')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-10">
      <Logo className="h-16 w-auto" />

      {step === 'phone' ? (
        <form onSubmit={submitPhone} className="mt-10 w-full max-w-sm flex flex-col gap-3">
          <label className="label" htmlFor="phone">
            מספר טלפון
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            className="input text-center"
            placeholder="05X-XXXXXXX"
            value={phoneInput}
            onChange={(e) => {
              setPhoneInput(e.target.value)
              setError('')
            }}
            autoFocus
          />
          {error && <p className="err">{error}</p>}
          <button type="submit" className="btn btn-accent w-full !min-h-[56px]" disabled={busy}>
            {busy ? <SpinnerIcon size={18} /> : 'שלח קוד אימות'}
          </button>
        </form>
      ) : (
        <form onSubmit={submitOtp} className="mt-10 w-full max-w-sm flex flex-col gap-3">
          <label className="label" htmlFor="otp">
            {`הזן את הקוד שנשלח למספר ${phoneInput}`}
          </label>
          <input
            id="otp"
            type="text"
            inputMode="numeric"
            dir="ltr"
            maxLength={6}
            className="input text-center !text-2xl font-black"
            value={otp}
            onChange={(e) => {
              setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
              setError('')
            }}
            autoFocus
          />
          {error && <p className="err">{error}</p>}
          <button
            type="submit"
            className="btn btn-accent w-full !min-h-[56px]"
            disabled={busy || otp.length !== 6}
          >
            {busy ? <SpinnerIcon size={18} /> : 'אימות'}
          </button>
          <button
            type="button"
            className="btn btn-ghost text-sm"
            disabled={resendIn > 0 || busy}
            onClick={resend}
          >
            {resendIn > 0 ? `שלח שוב בעוד ${resendIn} שניות` : 'שלח קוד מחדש'}
          </button>
          <button
            type="button"
            className="btn btn-ghost text-sm"
            disabled={busy}
            onClick={changeNumber}
          >
            שינוי מספר טלפון
          </button>
        </form>
      )}
    </main>
  )
}
