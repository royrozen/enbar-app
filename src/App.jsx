import { Routes, Route, Navigate } from 'react-router-dom'
import { getProfile } from './lib/profile'
import ProfilePicker from './pages/ProfilePicker'
import Home from './pages/Home'
import ReportNew from './pages/ReportNew'
import ReportView from './pages/ReportView'
import ManagerDashboard from './pages/ManagerDashboard'
import ManagerReport from './pages/ManagerReport'
import ManagerSettings from './pages/ManagerSettings'

function RequireProfile({ children }) {
  return getProfile() ? children : <Navigate to="/" replace />
}

function RequireManager({ children }) {
  const p = getProfile()
  if (!p) return <Navigate to="/" replace />
  if (p === 'team_lead') return <Navigate to="/home" replace />
  return children
}

// Admin area — factory manager only. Installation manager is redirected to the dashboard.
function RequireFactoryManager({ children }) {
  const p = getProfile()
  if (!p) return <Navigate to="/" replace />
  if (p === 'team_lead') return <Navigate to="/home" replace />
  if (p !== 'factory_manager') return <Navigate to="/manager" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProfilePicker />} />
      <Route path="/home" element={<RequireProfile><Home /></RequireProfile>} />
      <Route path="/report/new" element={<RequireProfile><ReportNew /></RequireProfile>} />
      <Route path="/report/:id" element={<RequireProfile><ReportView /></RequireProfile>} />
      <Route path="/manager" element={<RequireManager><ManagerDashboard /></RequireManager>} />
      <Route path="/manager/report/:id" element={<RequireManager><ManagerReport /></RequireManager>} />
      <Route path="/manager/settings" element={<RequireFactoryManager><ManagerSettings /></RequireFactoryManager>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
