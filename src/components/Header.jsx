import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import Logo from './Logo'
import { BackIcon } from './Icons'
import { PROFILES } from '../lib/profile'
import { useAuth } from '../lib/AuthContext'
import { signOut } from '../lib/auth'
import { supabase } from '../lib/supabase'

export default function Header({ backTo, title }) {
  const nav = useNavigate()
  const { profile, viewAsTeamLead, setViewAsTeamLead } = useAuth()
  const role = profile?.role
  const isManager = role === 'factory_manager'
  const [teamLeads, setTeamLeads] = useState(null)

  useEffect(() => {
    if (!isManager) return
    supabase
      .from('team_leads')
      .select('id, name')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name')
      .then(({ data }) => setTeamLeads(data || []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager])

  async function logout() {
    await signOut()
    nav('/')
  }

  function pickViewAs(lead, detailsEl) {
    setViewAsTeamLead(lead)
    detailsEl?.removeAttribute('open')
    nav('/home')
  }

  function exitViewAs() {
    setViewAsTeamLead(null)
    nav('/manager')
  }

  return (
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-border">
      <div className="mx-auto max-w-5xl px-4 h-16 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {backTo && (
            <button
              onClick={() => nav(backTo)}
              aria-label="חזרה"
              className="btn btn-ghost !px-2 shrink-0"
            >
              <BackIcon size={22} />
            </button>
          )}
          <Link to={role === 'team_lead' ? '/home' : role ? '/manager' : '/'} className="shrink-0" aria-label="מסך ראשי">
            <Logo className="h-9 w-auto" />
          </Link>
          {title && (
            <h1 className="text-lg font-bold truncate ms-2 hidden sm:block">{title}</h1>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isManager && viewAsTeamLead && (
            <>
              <span className="text-xs font-bold text-accent border border-accent/40 rounded-full px-2.5 py-1 bg-accent/10 hidden sm:inline">
                צופה כ: {viewAsTeamLead.name}
              </span>
              <button className="btn btn-ghost text-sm" onClick={exitViewAs}>
                חזרה לתצוגת מנהל
              </button>
            </>
          )}
          {isManager && !viewAsTeamLead && (
            <nav className="flex items-center gap-1 me-1">
              <NavLink
                to="/manager"
                end
                className={({ isActive }) =>
                  `btn btn-ghost text-sm ${isActive ? '!text-accent font-black' : ''}`
                }
              >
                דוחות
              </NavLink>
              <NavLink
                to="/manager/settings"
                className={({ isActive }) =>
                  `btn btn-ghost text-sm ${isActive ? '!text-accent font-black' : ''}`
                }
              >
                ניהול
              </NavLink>
            </nav>
          )}
          {role && !viewAsTeamLead && isManager && (
            <details className="relative">
              <summary className="text-xs text-primary font-medium border border-border rounded-full px-2.5 py-1 bg-muted cursor-pointer list-none select-none">
                {PROFILES[role]}
              </summary>
              <div className="absolute end-0 mt-2 w-52 rounded-xl border border-border bg-white shadow-lg py-1 z-30">
                {teamLeads?.length > 0 ? (
                  teamLeads.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className="w-full text-start px-3 py-2 text-sm hover:bg-muted"
                      onClick={(e) => pickViewAs(l, e.currentTarget.closest('details'))}
                    >
                      צפייה כ-{l.name}
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-sm text-primary">אין ראשי צוות פעילים</p>
                )}
              </div>
            </details>
          )}
          {role && !viewAsTeamLead && !isManager && (
            <span className="text-xs text-primary font-medium hidden md:inline border border-border rounded-full px-2.5 py-1 bg-muted">
              {PROFILES[role]}
            </span>
          )}
          <button className="btn btn-ghost text-sm" onClick={logout}>
            התנתקות
          </button>
        </div>
      </div>
    </header>
  )
}
