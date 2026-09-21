import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Header from '../components/Header'
import { AlertIcon, CheckCircleIcon, ClipboardIcon, SpinnerIcon } from '../components/Icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { formatDate } from '../lib/format'
import { getModuleAccess } from '../lib/maintenanceAccess'

// Calendar week Sunday-Friday containing `today`, as ISO date strings.
// Built from local date parts, not toISOString(), so an evening visit
// doesn't land on the previous UTC day.
function currentWeekRange() {
  const toISO = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const sunday = new Date()
  sunday.setDate(sunday.getDate() - sunday.getDay())
  const friday = new Date(sunday)
  friday.setDate(sunday.getDate() + 5)
  return [toISO(sunday), toISO(friday)]
}

// formatDate() takes an ISO *date*; a timestamptz needs converting to local
// time first, or a late-evening check-off shows the previous day.
function formatTimestamp(ts) {
  const d = new Date(ts)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export default function Maintenance() {
  const { machineId } = useParams()
  const { session, profile, loading: authLoading } = useAuth()

  const [access, setAccess] = useState(null) // { role, hasAccess }
  const [machine, setMachine] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [checked, setChecked] = useState({}) // { [taskId]: boolean } — this visit only
  // Tasks already checked off earlier this week (by anyone), { [taskId]: ISO date }.
  const [alreadyDone, setAlreadyDone] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [done, setDone] = useState(null) // { closedCount, totalCount }

  const [weekStart, weekEnd] = useMemo(currentWeekRange, [])

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    getModuleAccess(profile).then((a) => {
      if (!cancelled) setAccess(a)
    })
    return () => {
      cancelled = true
    }
  }, [profile])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('machines')
      .select(
        '*, machine_periods(id, next_due_date, is_active, deleted_at, maintenance_periods(name), machine_period_tasks(id, task_name, sort_order))',
      )
      .eq('id', machineId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setLoadError('המכונה לא נמצאה')
          return
        }
        setMachine(data)
      })
    return () => {
      cancelled = true
    }
  }, [machineId])

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    supabase
      .rpc('machine_week_checked_tasks', {
        p_machine_id: machineId,
        p_week_start: weekStart,
        p_week_end: weekEnd,
      })
      .then(({ data }) => {
        if (cancelled) return
        const map = {}
        for (const row of data || []) map[row.machine_period_task_id] = row.checked_at
        setAlreadyDone(map)
      })
    return () => {
      cancelled = true
    }
  }, [machineId, profile, weekStart, weekEnd])

  if (authLoading || !session || !profile) return null // RequireProfile handles the redirect

  // hasAccess is only meaningful for factory_worker; other roles pass through
  // (maintenance_access() on the DB side always grants them access too).
  const blocked = access?.role === 'factory_worker' && access.hasAccess === false

  if (access === null || alreadyDone === null || (machine === null && !loadError)) {
    return (
      <div className="min-h-dvh">
        <Header backTo="/manager" />
        <main className="mx-auto max-w-lg px-4 py-16 text-center text-primary">
          <SpinnerIcon size={32} className="mx-auto" />
        </main>
      </div>
    )
  }

  if (blocked) {
    return (
      <div className="min-h-dvh">
        <Header backTo="/manager" />
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <AlertIcon size={56} className="mx-auto text-amber-600" />
          <p className="mt-5 text-lg font-bold">אין לך הרשאה למודול תחזוקה</p>
          <p className="mt-2 text-primary">פנה למנהל המערכת</p>
        </main>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-dvh">
        <Header backTo="/manager" />
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <AlertIcon size={56} className="mx-auto text-destructive" />
          <p className="mt-5 text-lg font-bold text-destructive">{loadError}</p>
        </main>
      </div>
    )
  }

  // Everything due on or before the end of this week — deliberately NOT
  // bounded below by weekStart. Bounding it that way made a period that was
  // never completed drop off the checklist the moment its week ended, which
  // is precisely when it most needs to be shown. Overdue ones sort first and
  // are flagged, so late work escalates instead of disappearing.
  const duePeriods = (machine.machine_periods || [])
    .filter((mp) => mp.is_active && !mp.deleted_at)
    .filter((mp) => mp.next_due_date <= weekEnd)
    .map((mp) => ({
      ...mp,
      overdue: mp.next_due_date < weekStart,
      machine_period_tasks: [...mp.machine_period_tasks].sort((a, b) => a.sort_order - b.sort_order),
    }))
    .sort((a, b) =>
      a.overdue === b.overdue
        ? a.next_due_date.localeCompare(b.next_due_date)
        : a.overdue
          ? -1
          : 1,
    )

  // A task checked off earlier this week is already recorded — it stays
  // checked and locked until its period rolls over to a new due date.
  const isDone = (taskId) => !!alreadyDone[taskId] || !!checked[taskId]

  function toggleTask(taskId) {
    if (alreadyDone[taskId]) return
    setChecked((c) => ({ ...c, [taskId]: !c[taskId] }))
  }

  async function submit() {
    if (submitting) return
    setSubmitError('')
    setSubmitting(true)
    try {
      const { data: visit, error: visitErr } = await supabase
        .from('maintenance_visits')
        .insert({ machine_id: machine.id, profile_id: session.user.id })
        .select()
        .single()
      if (visitErr) throw visitErr

      let closedCount = 0
      for (const period of duePeriods) {
        const tasks = period.machine_period_tasks
        const fullyCompleted = tasks.length > 0 && tasks.every((t) => isDone(t.id))

        const { data: log, error: logErr } = await supabase
          .from('machine_period_logs')
          .insert({
            visit_id: visit.id,
            machine_period_id: period.id,
            due_date_snapshot: period.next_due_date,
            fully_completed: fullyCompleted,
          })
          .select()
          .single()
        if (logErr) throw logErr

        if (tasks.length > 0) {
          const { error: taskErr } = await supabase.from('machine_period_log_tasks').insert(
            tasks.map((t) => ({
              log_id: log.id,
              machine_period_task_id: t.id,
              is_checked: isDone(t.id),
            })),
          )
          if (taskErr) throw taskErr
        }

        if (fullyCompleted) {
          await supabase.rpc('advance_machine_period', { p_log_id: log.id })
          closedCount++
        }
      }

      setDone({ closedCount, totalCount: duePeriods.length })
      window.scrollTo(0, 0)
    } catch {
      setSubmitError('שליחת הדיווח נכשלה — בדקו את חיבור האינטרנט ונסו שוב')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-dvh">
        <Header backTo="/manager" />
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <CheckCircleIcon size={72} className="mx-auto text-success" />
          <h1 className="mt-5 text-2xl font-black">הדיווח נשלח ✓</h1>
          <p className="mt-2 text-primary">
            {done.closedCount} מתוך {done.totalCount} מחזורי טיפול נסגרו במלואם
          </p>
          <Link to={`/maintenance/${machineId}/fault`} className="btn btn-outline w-full mt-10">
            דיווח תקלה / שבר
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-dvh pb-32">
      <Header backTo="/manager" title={machine.name} />
      <main className="mx-auto max-w-lg px-4 py-6">
        <h1 className="text-2xl font-black">{machine.name}</h1>
        <p className="text-primary text-sm mt-1">
          {'מכונה #' + String(machine.machine_no).padStart(3, '0')}
          {machine.location ? ` — ${machine.location}` : ''}
        </p>

        <Link
          to={`/maintenance/${machineId}/fault`}
          className="btn btn-outline w-full mt-6 flex items-center justify-center gap-2"
        >
          <AlertIcon size={18} />
          דיווח תקלה / שבר
        </Link>

        {duePeriods.length === 0 ? (
          <div className="card p-4 mt-8 text-center text-primary">
            <ClipboardIcon size={32} className="mx-auto mb-2 text-primary/60" />
            אין משימות תחזוקה השבוע למכונה זו
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
            className="flex flex-col gap-6 mt-8"
          >
            {duePeriods.map((period) => (
              <div key={period.id} className="card p-4">
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <p className="font-bold">{period.maintenance_periods.name}</p>
                  <span className={period.overdue ? 'font-medium text-destructive' : 'font-medium text-primary'}>
                    {formatDate(period.next_due_date)}
                  </span>
                  {period.overdue && (
                    <span className="text-xs font-bold text-destructive border border-destructive/40 bg-red-50 rounded-full px-2 py-0.5">
                      באיחור
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {period.machine_period_tasks.map((task) => {
                    const doneAt = alreadyDone[task.id]
                    return (
                      <label key={task.id} className="flex items-center gap-3 py-1.5">
                        <input
                          type="checkbox"
                          className="w-5 h-5 shrink-0"
                          checked={isDone(task.id)}
                          onChange={() => toggleTask(task.id)}
                          disabled={submitting || !!doneAt}
                        />
                        <span className={doneAt ? 'text-primary' : ''}>
                          {task.task_name}
                          {doneAt && (
                            <span className="text-success font-medium"> ✓ {formatTimestamp(doneAt)}</span>
                          )}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}

            {submitError && <p className="err">{submitError}</p>}

            <button type="submit" className="btn btn-accent w-full !min-h-[56px]" disabled={submitting}>
              {submitting ? <SpinnerIcon size={18} /> : 'שליחה'}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
