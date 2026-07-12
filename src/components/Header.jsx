import { Link, NavLink, useNavigate } from 'react-router-dom'
import Logo from './Logo'
import { BackIcon } from './Icons'
import { getProfile, clearProfile, PROFILES, homeFor } from '../lib/profile'

export default function Header({ backTo, title }) {
  const nav = useNavigate()
  const profile = getProfile()
  const isManager = profile === 'factory_manager'

  function switchProfile() {
    clearProfile()
    nav('/')
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
          <Link to={profile ? homeFor(profile) : '/'} className="shrink-0" aria-label="מסך ראשי">
            <Logo className="h-9 w-auto" />
          </Link>
          {title && (
            <h1 className="text-lg font-bold truncate ms-2 hidden sm:block">{title}</h1>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isManager && (
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
          {profile && (
            <span className="text-xs text-primary font-medium hidden md:inline border border-border rounded-full px-2.5 py-1 bg-muted">
              {PROFILES[profile]}
            </span>
          )}
          <button className="btn btn-ghost text-sm" onClick={switchProfile}>
            החלף פרופיל
          </button>
        </div>
      </div>
    </header>
  )
}
