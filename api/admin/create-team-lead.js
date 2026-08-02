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

  const { name, phone } = req.body || {}
  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' })
    return
  }
  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone) {
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

  let createdUserId = null
  let createdTeamLeadId = null
  try {
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      phone: normalizedPhone,
      phone_confirm: true,
    })
    if (createErr) throw createErr
    createdUserId = newUser.user.id

    const { data: newTeamLead, error: tlErr } = await admin
      .from('team_leads')
      .insert({ name: name.trim() })
      .select()
      .single()
    if (tlErr) throw tlErr
    createdTeamLeadId = newTeamLead.id

    const { error: profileErr } = await admin.from('profiles').insert({
      id: newUser.user.id,
      role: 'team_lead',
      team_lead_id: newTeamLead.id,
      phone: normalizedPhone.replace('+', ''),
      is_active: true,
    })
    if (profileErr) throw profileErr

    res.status(200).json({ teamLeadId: newTeamLead.id })
  } catch (err) {
    console.error('create-team-lead failed', err)
    // best-effort cleanup so a partial failure doesn't leave an orphaned
    // auth user or team_leads row with no working login behind it
    if (createdTeamLeadId) await admin.from('team_leads').delete().eq('id', createdTeamLeadId)
    if (createdUserId) await admin.auth.admin.deleteUser(createdUserId)
    res.status(500).json({ error: 'create_failed' })
  }
}
