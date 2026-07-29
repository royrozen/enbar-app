import { createClient } from '@supabase/supabase-js'

// Fallback defaults so the app builds/runs even without a .env file.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://svsuntixvxwwuggtqsws.supabase.co'
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2c3VudGl4dnh3d3VnZ3Rxc3dzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MDgxNzYsImV4cCI6MjA5OTE4NDE3Nn0.bV1HJ1dW4lQbqh3WnnqABaWFnot2_baKez0YqtwFwkU'

export const supabase = createClient(url, anonKey)

export const PHOTO_BUCKET = 'report-photos'
export const SIGNED_DOC_BUCKET = 'signed-approvals'
export const EXCEPTION_PHOTO_BUCKET = 'exception-photos'
export const EXCEPTION_DOC_BUCKET = 'exception-docs'

export const IN_APP_EXPIRY = 300 // 5 min — viewed immediately after generation
export const SHARE_EXPIRY = 86400 // 24h — baked into a WhatsApp message opened later

export async function photoUrl(storagePath, expiresIn = IN_APP_EXPIRY) {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(storagePath, expiresIn)
  if (error) throw error
  return data.signedUrl
}

export async function photoUrls(storagePaths, expiresIn = IN_APP_EXPIRY) {
  if (!storagePaths.length) return {}
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(storagePaths, expiresIn)
  if (error) throw error
  const map = {}
  data.forEach((d, i) => { map[storagePaths[i]] = d.signedUrl })
  return map
}

export async function signedDocUrl(storagePath, expiresIn = IN_APP_EXPIRY) {
  const { data, error } = await supabase.storage.from(SIGNED_DOC_BUCKET).createSignedUrl(storagePath, expiresIn)
  if (error) throw error
  return data.signedUrl
}

// exception-photos stays public this phase (see Phase 3 PRD Non-Goals) — unchanged.
export function exceptionPhotoUrl(storagePath) {
  return supabase.storage.from(EXCEPTION_PHOTO_BUCKET).getPublicUrl(storagePath).data.publicUrl
}

export function exceptionDocUrl(storagePath) {
  return supabase.storage.from(EXCEPTION_DOC_BUCKET).getPublicUrl(storagePath).data.publicUrl
}

// Single active team lead in Phase 1 — reports are attributed automatically.
export async function fetchActiveTeamLead() {
  const { data, error } = await supabase
    .from('team_leads')
    .select('*')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw error
  return data?.[0] || null
}
