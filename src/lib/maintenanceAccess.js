import { supabase } from './supabase'

// Live maintenance-module access check, for Phase 6/7 routes to call.
// Re-reads employees.maintenance_access_enabled on every call (via the
// same employee_access_match() predicate the Phase 1 self-provisioning
// RLS policy trusts) rather than caching it — access can be revoked after
// a factory_worker's profiles row already exists, and this must reflect
// that without requiring a logout. hasAccess is only meaningful for
// role === 'factory_worker'; other roles get hasAccess: null since this
// module doesn't define their access policy.
export async function getModuleAccess(profile) {
  if (!profile) return { role: null, hasAccess: false }
  if (profile.role !== 'factory_worker') {
    return { role: profile.role, hasAccess: null }
  }
  if (!profile.employee_id) return { role: profile.role, hasAccess: false }
  const { data, error } = await supabase.rpc('employee_access_match', {
    p_employee_id: profile.employee_id,
    p_phone: profile.phone,
  })
  return { role: profile.role, hasAccess: !error && data === true }
}
