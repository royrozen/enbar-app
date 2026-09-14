import { supabase } from './supabase'

// Israeli mobile numbers only: 05X-XXXXXXX (10 digits, local) -> +972XXXXXXXXX.
// Rejects anything that isn't a 9-digit local number starting with 5 once the
// leading 0 (or +972/972 prefix) is stripped.
export function normalizePhone(input) {
  const digits = (input || '').replace(/\D/g, '')
  const local = digits.startsWith('972') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits
  if (!/^5\d{8}$/.test(local)) return null
  return `+972${local}`
}

export function sendOtp(phone) {
  return supabase.auth.signInWithOtp({ phone })
}

export function verifyOtp(phone, token) {
  return supabase.auth.verifyOtp({ phone, token, type: 'sms' })
}

export async function fetchProfile(userId) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
  return data || null
}

// First-login self-provisioning for factory workers (PRD §4.0). Runs under
// the user's own ordinary session — resolve_own_employee() and the
// `factory_worker self-provision` RLS INSERT policy on `profiles` are the
// actual gate; this is just the client-side attempt. Returns true if a
// profiles row now exists (freshly created or resolved to nothing to try),
// false if Postgres rejected it (phone not a matching, active,
// access-enabled employee).
export async function provisionFactoryWorker(session) {
  const { data: matches } = await supabase.rpc('resolve_own_employee')
  const match = matches?.[0]
  if (!match) return false
  const { error } = await supabase.from('profiles').insert({
    id: session.user.id,
    role: 'factory_worker',
    phone: session.user.phone,
    employee_id: match.employee_id,
    display_name: match.display_name,
  })
  return !error
}

export function signOut() {
  return supabase.auth.signOut()
}
