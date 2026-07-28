import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { fetchProfile, signOut as authSignOut } from './auth'

const AuthCtx = createContext(null)

// session === undefined -> still checking for an existing session.
// session === null -> confirmed signed out.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [authError, setAuthError] = useState('')

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
    }
    loadProfile()
    return () => {
      cancelled = true
    }
  }, [session])

  const loading = session === undefined || (!!session && !profile && !authError)

  return (
    <AuthCtx.Provider
      value={{ session, profile, loading, authError, clearAuthError: () => setAuthError('') }}
    >
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  return useContext(AuthCtx)
}
