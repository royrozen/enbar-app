import { createClient } from '@supabase/supabase-js'

// Server-only client — uses the service role key so it can write regardless
// of RLS policies. Must never be imported from client (src/) code.
export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}
