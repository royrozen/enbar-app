import { supabase } from './supabase'
import { normalizePhone } from './auth'
import { todayISO } from './format'

// employees.phone is stored digit-only (no leading +), matching profiles.phone's
// convention elsewhere in the app — normalizePhone() returns +972XXXXXXXXX for
// Supabase Auth OTP, so strip the + before using it against employees/RPCs.
export function normalizeEmployeePhone(input) {
  const withPlus = normalizePhone(input)
  return withPlus ? withPlus.slice(1) : null
}

// Display-only inverse: 972XXXXXXXXX -> 0XXXXXXXXX (local format, no country code).
export function formatEmployeePhone(phone) {
  return phone?.startsWith('972') ? `0${phone.slice(3)}` : phone || ''
}

// D5 (PRD §7) — explicitly a placeholder, replace with the real restaurant
// number before/at launch. Kept as a single named constant so it's easy to find.
export const RESTAURANT_WHATSAPP_NUMBER = '972503338181'

// Hardcoded, not admin-configurable this phase (PRD §6.4). UI-only — the DB
// only enforces order_date = CURRENT_DATE, not time of day (PRD §6.2).
const CUTOFF_HOUR = 12

export function isPastCutoff() {
  return new Date().getHours() >= CUTOFF_HOUR
}

export async function lookupEmployee(phone) {
  const { data, error } = await supabase.rpc('lunch_lookup_employee', { p_phone: phone })
  if (error) throw error
  return data?.[0] || null
}

export async function getOrder(employeeId, date = todayISO()) {
  const { data, error } = await supabase.rpc('lunch_get_order', { p_employee_id: employeeId, p_date: date })
  if (error) throw error
  return data?.[0] || null
}

export async function getLastOrder(employeeId) {
  const { data, error } = await supabase.rpc('lunch_get_last_order', { p_employee_id: employeeId })
  if (error) throw error
  return data?.[0] || null
}

export async function fetchTodaySheet() {
  const { data, error } = await supabase.rpc('lunch_today_sheet')
  if (error) throw error
  return data || []
}

export async function fetchActiveMenuItems() {
  const { data, error } = await supabase
    .from('lunch_menu_items')
    .select('id, category, name')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name')
  if (error) throw error
  return data || []
}

// Inserts today's order, or updates it if existingOrderId is set (from a
// prior getOrder() call) — same form, two outcomes, per PRD §5.1.
//
// Update goes through the lunch_update_order RPC, not a direct table UPDATE:
// lunch_orders SELECT is manager-only (PRD §4), and Postgres RLS requires a
// role to have SELECT visibility on a row before UPDATE/DELETE can even find
// it — confirmed live via EXPLAIN, showed "One-Time Filter: false" for anon.
// The direct-table UPDATE policy is effectively unreachable for anon as a
// result; the RPC (SECURITY DEFINER) bypasses that entirely, same pattern as
// the other 4 read RPCs.
export async function submitOrder({ existingOrderId, employeeId, mainDishId, additionId, salad1Id, salad2Id }) {
  if (existingOrderId) {
    const { error } = await supabase.rpc('lunch_update_order', {
      p_order_id: existingOrderId,
      p_main_dish_id: mainDishId,
      p_addition_id: additionId,
      p_salad_1_id: salad1Id,
      p_salad_2_id: salad2Id,
    })
    if (error) throw error
    return
  }
  const { error } = await supabase.from('lunch_orders').insert({
    employee_id: employeeId,
    order_date: todayISO(),
    main_dish_id: mainDishId,
    addition_id: additionId,
    salad_1_id: salad1Id,
    salad_2_id: salad2Id,
  })
  if (error) throw error
}

// factory_manager-only (RLS) — distinct ordering days per employee in
// [year, month], including employees deactivated mid-month if they ordered
// in the period (PRD §5.4).
export async function fetchMonthlyCounts(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const toDate = new Date(year, month, 0)
  const to = `${year}-${String(month).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('lunch_orders')
    .select('employee_id, order_date, employee:employees!lunch_orders_employee_id_fkey(name, phone)')
    .gte('order_date', from)
    .lte('order_date', to)
  if (error) throw error

  const byEmployee = new Map()
  for (const row of data || []) {
    if (!byEmployee.has(row.employee_id)) {
      byEmployee.set(row.employee_id, {
        employeeId: row.employee_id,
        name: row.employee?.name || '—',
        phone: row.employee?.phone || '',
        days: new Set(),
      })
    }
    byEmployee.get(row.employee_id).days.add(row.order_date)
  }
  return [...byEmployee.values()]
    .map((e) => ({ employeeId: e.employeeId, name: e.name, phone: e.phone, count: e.days.size }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'he'))
}
