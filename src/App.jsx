import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { SpinnerIcon } from './components/Icons'
import Login from './pages/Login'
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

function AuthLoading() {
  return (
    <div className="min-h-dvh flex items-center justify-center text-primary">
      <SpinnerIcon size={32} />
    </div>
  )
}

function RequireProfile({ children }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <AuthLoading />
  if (!session || !profile) return <Navigate to="/" replace />
  return children
}

function RequireManager({ children }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <AuthLoading />
  if (!session || !profile) return <Navigate to="/" replace />
  if (profile.role === 'team_lead') return <Navigate to="/home" replace />
  return children
}

// Admin area — factory manager only. Installation manager is redirected to the dashboard.
function RequireFactoryManager({ children }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <AuthLoading />
  if (!session || !profile) return <Navigate to="/" replace />
  if (profile.role === 'team_lead') return <Navigate to="/home" replace />
  if (profile.role !== 'factory_manager') return <Navigate to="/manager" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Login />} />
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
    </AuthProvider>
  )
}
