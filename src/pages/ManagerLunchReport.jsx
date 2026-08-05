import { useEffect, useState } from 'react'
import Header from '../components/Header'
import { RefreshIcon, SpinnerIcon, DownloadIcon } from '../components/Icons'
import { fetchMonthlyCounts } from '../lib/lunch'

function currentMonthValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function toCsv(rows) {
  const header = 'עובד,טלפון,ימי הזמנה'
  const lines = rows.map((r) => `"${r.name.replace(/"/g, '""')}",${r.phone},${r.count}`)
  return '﻿' + [header, ...lines].join('\n') // BOM so Excel opens Hebrew correctly
}

export default function ManagerLunchReport() {
  const [month, setMonth] = useState(currentMonthValue)
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    const [year, m] = month.split('-').map(Number)
    setLoading(true)
    setError('')
    try {
      setRows(await fetchMonthlyCounts(year, m))
    } catch {
      setError('הטעינה נכשלה — נסו לרענן')
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  function exportCsv() {
    const blob = new Blob([toCsv(rows || [])], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lunch-report-${month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-dvh manager-desktop">
      <Header backTo="/manager" title="דוח ארוחות חודשי" />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-black">דוח ארוחות חודשי</h1>
          <button className="btn btn-ghost text-sm" onClick={load} disabled={loading}>
            <RefreshIcon size={18} className={loading ? 'spin' : ''} />
            רענון
          </button>
        </div>

        <div className="card mt-4 p-4 flex items-center gap-3 flex-wrap">
          <div>
            <label className="label !text-xs" htmlFor="month">חודש</label>
            <input
              id="month"
              type="month"
              className="input"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <button
            className="btn btn-outline self-end"
            onClick={exportCsv}
            disabled={!rows?.length}
          >
            <DownloadIcon size={18} />
            ייצוא ל-CSV
          </button>
        </div>

        {error && <p className="err mt-3">{error}</p>}

        <ul className="mt-4 flex flex-col gap-2">
          {(rows || []).map((r) => (
            <li key={r.employeeId} className="card p-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-bold">{r.name}</p>
                <p className="text-xs text-primary" dir="ltr">{r.phone}</p>
              </div>
              <p className="text-lg font-black text-accent">{r.count}</p>
            </li>
          ))}
          {rows?.length === 0 && (
            <li className="card p-6 text-center text-primary">אין הזמנות בחודש זה</li>
          )}
          {rows === null && (
            <li className="flex justify-center py-8 text-primary"><SpinnerIcon size={28} /></li>
          )}
        </ul>
      </main>
    </div>
  )
}
