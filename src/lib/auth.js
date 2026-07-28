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

export function signOut() {
  return supabase.auth.signOut()
}
