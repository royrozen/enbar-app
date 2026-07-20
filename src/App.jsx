import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { getProfile } from './lib/profile'
import ProfilePicker from './pages/ProfilePicker'
import Home from './pages/Home'
import History from './pages/History'
import ReportNew from './pages/ReportNew'
import ReportView from './pages/ReportView'
import ManagerDashboard from './pages/ManagerDashboard'
import ManagerReport from './pages/ManagerReport'
import ManagerSettings from './pages/ManagerSettings'
import PartRequestNew from './pages/PartRequestNew'
import ManagerParts from './pages/ManagerParts'
import ExceptionNew from './pages/ExceptionNew'
import ExceptionView from './pages/ExceptionView'
import ManagerExceptions from './pages/ManagerExceptions'

// Phase-1 stopgap: a single shared password gates the admin area, since there
// is no real auth yet (see CLAUDE.md). Not meant to withstand a determined
// attacker reading the client bundle — just stops casual/accidental access.
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'enbar2026'
const ADMIN_UNLOCK_KEY = 'enbar_admin_unlocked'

function AdminGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(ADMIN_UNLOCK_KEY) === '1')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')

  if (unlocked) return children

  function submit(e) {
    e.preventDefault()
    if (pw === ADMIN_PASSWORD) {
      sessionStorage.setItem(ADMIN_UNLOCK_KEY, '1')
      setUnlocked(true)
    } else {
      setErr('סיסמה שגויה')
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-10">
      <h1 className="text-xl font-black mb-6">אזור ניהול — נדרשת סיסמה</h1>
      <form onSubmit={submit} className="w-full max-w-sm flex flex-col gap-3">
        <input
          type="password"
          value={pw}
          onChange={(e) => {
            setPw(e.target.value)
            setErr('')
          }}
          placeholder="סיסמה"
          autoFocus
          className="input"
        />
        {err && <p className="err">{err}</p>}
        <button type="submit" className="btn-accent btn w-full">
          כניסה
        </button>
      </form>
    </main>
  )
}

function RequireProfile({ children }) {
  return getProfile() ? children : <Navigate to="/" replace />
}

function RequireManager({ children }) {
  const p = getProfile()
  if (!p) return <Navigate to="/" replace />
  if (p === 'team_lead') return <Navigate to="/home" replace />
  return <AdminGate>{children}</AdminGate>
}

// Admin area — factory manager only. Installation manager is redirected to the dashboard.
function RequireFactoryManager({ children }) {
  const p = getProfile()
  if (!p) return <Navigate to="/" replace />
  if (p === 'team_lead') return <Navigate to="/home" replace />
  if (p !== 'factory_manager') return <Navigate to="/manager" replace />
  return <AdminGate>{children}</AdminGate>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProfilePicker />} />
      <Route path="/home" element={<RequireProfile><Home /></RequireProfile>} />
      <Route path="/history" element={<RequireProfile><History /></RequireProfile>} />
      <Route path="/report/new" element={<RequireProfile><ReportNew /></RequireProfile>} />
      <Route path="/report/:id" element={<RequireProfile><ReportView /></RequireProfile>} />
      <Route path="/parts/new" element={<RequireProfile><PartRequestNew /></RequireProfile>} />
      <Route path="/exceptions/new" element={<RequireProfile><ExceptionNew /></RequireProfile>} />
      <Route path="/exceptions/:id" element={<RequireProfile><ExceptionView backTo="/home" /></RequireProfile>} />
      <Route path="/manager" element={<RequireManager><ManagerDashboard /></RequireManager>} />
      <Route path="/manager/report/:id" element={<RequireManager><ManagerReport /></RequireManager>} />
      <Route path="/manager/parts" element={<RequireManager><ManagerParts /></RequireManager>} />
      <Route path="/manager/exceptions" element={<RequireManager><ManagerExceptions /></RequireManager>} />
      <Route path="/manager/exceptions/:id" element={<RequireManager><ExceptionView backTo="/manager/exceptions" /></RequireManager>} />
      <Route path="/manager/settings" element={<RequireFactoryManager><ManagerSettings /></RequireFactoryManager>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
