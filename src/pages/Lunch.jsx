import { useEffect, useState } from 'react'
import Logo from '../components/Logo'
import { SpinnerIcon, CheckIcon } from '../components/Icons'
import {
  normalizeEmployeePhone,
  isPastCutoff,
  lookupEmployee,
  getOrder,
  getLastOrder,
  fetchActiveMenuItems,
  submitOrder,
} from '../lib/lunch'

function LockedNotice() {
  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="card p-6 w-full max-w-sm text-center">
        <Logo className="h-10 w-auto mx-auto mb-4" />
        <p className="text-lg font-black">ההזמנות ליום היום ננעלו</p>
        <p className="text-sm text-primary mt-2">ניתן להזמין שוב מחר</p>
      </div>
    </div>
  )
}

function PhoneEntry({ onMatched }) {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const normalized = normalizeEmployeePhone(phone)
    if (!normalized) {
      setError('מספר טלפון לא תקין')
      return
    }
    setError('')
    setBusy(true)
    let employee
    try {
      employee = await lookupEmployee(normalized)
    } catch {
      setBusy(false)
      setError('השליחה נכשלה — נסו שוב')
      return
    }
    setBusy(false)
    if (!employee) {
      setError('טלפון לא רשום במערכת')
      return
    }
    onMatched(employee)
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <form onSubmit={submit} className="card p-6 w-full max-w-sm flex flex-col gap-4">
        <Logo className="h-10 w-auto mx-auto" />
        <h1 className="text-lg font-black text-center">הזמנת ארוחת צהריים</h1>
        <div>
          <label className="label" htmlFor="phone">מספר טלפון</label>
          <input
            id="phone"
            className="input"
            dir="ltr"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="050-1234567"
            autoFocus
          />
        </div>
        {error && <p className="err">{error}</p>}
        <button className="btn btn-accent" disabled={busy}>
          {busy ? <SpinnerIcon size={18} /> : null}
          המשך
        </button>
      </form>
    </div>
  )
}

const emptySelection = { mainDishId: '', additionId: '', salad1Id: '', salad2Id: '' }

function OrderForm({ employee }) {
  const [menuItems, setMenuItems] = useState(null)
  const [existingOrderId, setExistingOrderId] = useState(null)
  const [selection, setSelection] = useState(emptySelection)
  const [prefillSource, setPrefillSource] = useState(null) // 'today' | 'last' | null
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    async function load() {
      const items = await fetchActiveMenuItems()
      const activeIds = new Set(items.map((i) => i.id))
      setMenuItems(items)

      const today = await getOrder(employee.employee_id)
      if (today) {
        setExistingOrderId(today.order_id)
        setPrefillSource('today')
        setSelection({
          mainDishId: today.main_dish_id || '',
          additionId: today.addition_id || '',
          salad1Id: today.salad_1_id || '',
          salad2Id: today.salad_2_id || '',
        })
        return
      }

      const last = await getLastOrder(employee.employee_id)
      if (last) {
        setPrefillSource('last')
        setSelection({
          mainDishId: activeIds.has(last.main_dish_id) ? last.main_dish_id : '',
          additionId: activeIds.has(last.addition_id) ? last.addition_id : '',
          salad1Id: activeIds.has(last.salad_1_id) ? last.salad_1_id : '',
          salad2Id: activeIds.has(last.salad_2_id) ? last.salad_2_id : '',
        })
      }
    }
    load().catch(() => setError('הטעינה נכשלה — נסו לרענן את הדף'))
  }, [employee.employee_id])

  if (menuItems === null) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <SpinnerIcon size={28} />
      </div>
    )
  }

  const mainDishes = menuItems.filter((i) => i.category === 'main_dish')
  const additions = menuItems.filter((i) => i.category === 'addition')
  const salads = menuItems.filter((i) => i.category === 'salad')

  async function submit(e) {
    e.preventDefault()
    if (!selection.mainDishId || !selection.additionId || !selection.salad1Id || !selection.salad2Id) {
      setError('יש למלא את כל השדות')
      return
    }
    if (selection.salad1Id === selection.salad2Id) {
      setError('יש לבחור שני סלטים שונים')
      return
    }
    setError('')
    setBusy(true)
    try {
      await submitOrder({
        existingOrderId,
        employeeId: employee.employee_id,
        mainDishId: selection.mainDishId,
        additionId: selection.additionId,
        salad1Id: selection.salad1Id,
        salad2Id: selection.salad2Id,
      })
      setDone(true)
    } catch {
      setError('השמירה נכשלה — נסו שוב')
    }
    setBusy(false)
  }

  if (done) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4">
        <div className="card p-6 w-full max-w-sm text-center">
          <CheckIcon size={32} className="mx-auto text-accent" />
          <p className="text-lg font-black mt-2">ההזמנה נשמרה</p>
          <p className="text-sm text-primary mt-1">{employee.employee_name}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-8">
      <form onSubmit={submit} className="card p-6 w-full max-w-sm flex flex-col gap-4">
        <Logo className="h-10 w-auto mx-auto" />
        <h1 className="text-lg font-black text-center">{employee.employee_name}</h1>
        {prefillSource === 'today' && (
          <p className="text-xs text-primary text-center">כבר הזמנת היום — ניתן לעדכן ולשלוח שוב</p>
        )}
        {prefillSource === 'last' && (
          <p className="text-xs text-primary text-center">מולא לפי ההזמנה הקודמת שלך — ניתן לשנות</p>
        )}

        <div>
          <label className="label !text-xs">מנה עיקרית *</label>
          <select className="input" value={selection.mainDishId}
            onChange={(e) => setSelection((s) => ({ ...s, mainDishId: e.target.value }))}>
            <option value="">בחירה</option>
            {mainDishes.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>

        <div>
          <label className="label !text-xs">תוספת *</label>
          <select className="input" value={selection.additionId}
            onChange={(e) => setSelection((s) => ({ ...s, additionId: e.target.value }))}>
            <option value="">בחירה</option>
            {additions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>

        <div>
          <label className="label !text-xs">סלט 1 *</label>
          <select className="input" value={selection.salad1Id}
            onChange={(e) => setSelection((s) => ({ ...s, salad1Id: e.target.value }))}>
            <option value="">בחירה</option>
            {salads.filter((i) => i.id !== selection.salad2Id).map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label !text-xs">סלט 2 *</label>
          <select className="input" value={selection.salad2Id}
            onChange={(e) => setSelection((s) => ({ ...s, salad2Id: e.target.value }))}>
            <option value="">בחירה</option>
            {salads.filter((i) => i.id !== selection.salad1Id).map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        </div>

        {error && <p className="err">{error}</p>}
        <button className="btn btn-accent" disabled={busy}>
          {busy ? <SpinnerIcon size={18} /> : null}
          {existingOrderId ? 'עדכון הזמנה' : 'שליחת הזמנה'}
        </button>
      </form>
    </div>
  )
}

export default function Lunch() {
  const [employee, setEmployee] = useState(null)

  if (isPastCutoff()) return <LockedNotice />
  if (!employee) return <PhoneEntry onMatched={setEmployee} />
  return <OrderForm employee={employee} />
}
