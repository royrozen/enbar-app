import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { fetchProfile, signOut as authSignOut } from './auth'

const AuthCtx = createContext(null)
const VIEW_AS_KEY = 'enbar_view_as_team_lead'

// session === undefined -> still checking for an existing session.
// session === null -> confirmed signed out.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [authError, setAuthError] = useState('')
  // Manager-only "view as team lead" — a UI-level filter over the manager's
  // own session, not a real identity switch. Read access already works via
  // the manager's existing SELECT-all RLS policies; nothing here grants any
  // new access. { id, name } or null.
  const [viewAsTeamLead, setViewAsTeamLeadState] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(VIEW_AS_KEY)) || null
    } catch {
      return null
    }
  })

  function setViewAsTeamLead(teamLead) {
    setViewAsTeamLeadState(teamLead)
    if (teamLead) sessionStorage.setItem(VIEW_AS_KEY, JSON.stringify(teamLead))
    else sessionStorage.removeItem(VIEW_AS_KEY)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadProfile() {
      if (!session?.user) {
        setProfile(null)
        return
      }
      const p = await fetchProfile(session.user.id)
      if (cancelled) return
      if (!p) {
        setAuthError('אין לך הרשאה לגשת לאפליקציה. פנה למנהל המערכת.')
        await authSignOut()
        return
      }
      if (!p.is_active) {
        setAuthError('החשבון הושבת. פנה למנהל המערכת.')
        await authSignOut()
        return
      }
      setProfile(p)
      if (p.role !== 'factory_manager') setViewAsTeamLead(null)
    }
    loadProfile()
    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(() => {
    // session is `undefined` while still loading, `null` once confirmed
    // signed out — only the latter should drop view-as.
    if (session === null) setViewAsTeamLead(null)
  }, [session])

  const loading = session === undefined || (!!session && !profile && !authError)

  return (
    <AuthCtx.Provider
      value={{
        session,
        profile,
        loading,
        authError,
        clearAuthError: () => setAuthError(''),
        viewAsTeamLead,
        setViewAsTeamLead,
      }}
    >
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  return useContext(AuthCtx)
}
