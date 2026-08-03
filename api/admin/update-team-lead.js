import { supabaseAdmin } from '../_lib/supabaseAdmin.js'

// Same normalization as src/lib/auth.js's normalizePhone — duplicated because
// that module imports the browser Supabase client (import.meta.env), which
// doesn't exist in this Node serverless runtime.
function normalizePhone(input) {
  const digits = (input || '').replace(/\D/g, '')
  const local = digits.startsWith('972') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits
  if (!/^5\d{8}$/.test(local)) return null
  return `+972${local}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) {
    res.status(401).json({ error: 'missing token' })
    return
  }

  const { teamLeadId, name, phone } = req.body || {}
  if (!teamLeadId) {
    res.status(400).json({ error: 'teamLeadId is required' })
    return
  }
  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' })
    return
  }
  const normalizedPhone = phone?.trim() ? normalizePhone(phone) : null
  if (phone?.trim() && !normalizedPhone) {
    res.status(400).json({ error: 'invalid phone' })
    return
  }

  const admin = supabaseAdmin()

  const { data: callerData, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !callerData?.user) {
    res.status(401).json({ error: 'invalid session' })
    return
  }

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', callerData.user.id)
    .single()
  if (callerProfile?.role !== 'factory_manager') {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  const { error: tlErr } = await admin
    .from('team_leads')
    .update({ name: name.trim() })
    .eq('id', teamLeadId)
  if (tlErr) {
    console.error('update-team-lead: team_leads update failed', tlErr)
    res.status(500).json({ error: 'update_failed' })
    return
  }

  if (normalizedPhone) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('team_lead_id', teamLeadId)
      .eq('role', 'team_lead')
      .single()

    if (profile) {
      // Auth login matches against auth.users.phone, not profiles.phone —
      // both must be updated together or the old number keeps working
      // (and the new one creates an orphaned auth user with no profile).
      const { error: authErr } = await admin.auth.admin.updateUserById(profile.id, {
        phone: normalizedPhone,
        phone_confirm: true,
      })
      if (authErr) {
        console.error('update-team-lead: auth phone update failed', authErr)
        res.status(500).json({ error: 'update_failed' })
        return
      }

      const { error: profileErr } = await admin
        .from('profiles')
        .update({ phone: normalizedPhone.replace('+', '') })
        .eq('id', profile.id)
      if (profileErr) {
        console.error('update-team-lead: profile phone update failed', profileErr)
        res.status(500).json({ error: 'update_failed' })
        return
      }
    }
  }

  res.status(200).json({ ok: true })
}
