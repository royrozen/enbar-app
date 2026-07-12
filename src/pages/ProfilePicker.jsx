import { Navigate, useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import { HardHatIcon, FactoryIcon } from '../components/Icons'
import { getProfile, setProfile, homeFor } from '../lib/profile'

const options = [
  {
    key: 'team_lead',
    label: 'ראש צוות התקנות',
    desc: 'דיווח יומי מהשטח',
    Icon: HardHatIcon,
    accent: true,
  },
  {
    key: 'factory_manager',
    label: 'מנהל מפעל',
    desc: 'מעקב דוחות, אישור חריגות וניהול לקוחות ופרויקטים',
    Icon: FactoryIcon,
    accent: false,
  },
]

export default function ProfilePicker() {
  const nav = useNavigate()
  const existing = getProfile()

  // Returning visitor skips straight to their home screen.
  if (existing) return <Navigate to={homeFor(existing)} replace />

  function pick(key) {
    setProfile(key)
    nav(homeFor(key))
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-10">
      <Logo className="h-16 w-auto" />
      <p className="mt-2 text-primary font-medium">דוחות עבודה יומיים</p>

      <h1 className="mt-10 mb-6 text-2xl font-black">מי נכנס למערכת?</h1>

      <div className="w-full max-w-sm flex flex-col gap-4">
        {options.map(({ key, label, desc, Icon, accent }) => (
          <button
            key={key}
            onClick={() => pick(key)}
            className={`${accent ? 'btn-accent' : 'btn-outline'} btn w-full !justify-start gap-4 !rounded-2xl px-5 py-4 min-h-[72px] text-start`}
          >
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                accent ? 'bg-white/20 text-white' : 'bg-muted text-primary'
              }`}
            >
              <Icon size={26} />
            </span>
            <span className="flex flex-col items-start">
              <span className="text-lg font-black leading-tight">{label}</span>
              <span className={`text-sm font-normal ${accent ? 'text-white/70' : 'text-primary'}`}>
                {desc}
              </span>
            </span>
          </button>
        ))}
      </div>

      <p className="mt-10 text-xs text-primary text-center">
        הבחירה נשמרת במכשיר זה — אפשר להחליף פרופיל בכל שלב
      </p>
    </main>
  )
}
