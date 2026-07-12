export const PROFILES = {
  team_lead: 'ראש צוות התקנות',
  factory_manager: 'מנהל מפעל',
}

const KEY = 'enbar_profile'

export function getProfile() {
  const p = localStorage.getItem(KEY)
  return PROFILES[p] ? p : null
}

export function setProfile(p) {
  if (PROFILES[p]) localStorage.setItem(KEY, p)
}

export function clearProfile() {
  localStorage.removeItem(KEY)
}

export function homeFor(p) {
  return p === 'team_lead' ? '/home' : '/manager'
}
