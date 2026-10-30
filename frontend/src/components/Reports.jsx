import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { formatDuration } from '../trip.js'

const PERIODS = [
  { id: '7', label: '7 días' },
  { id: '30', label: '30 días' },
  { id: '90', label: '90 días' },
  { id: 'all', label: 'Todo' },
]

export default function Reports() {
  const [days, setDays] = useState('30')
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setReport(null)
    api.report(days).then(({ report }) => { setReport(report); setError('') }).catch((e) => setError(e.message))
  }, [days])

  return (
    <div className="page">
      <h1>Reportes</h1>
      <div className="chips">
        {PERIODS.map((p) => (
          <button key={p.id} className={days === p.id ? 'active' : ''} onClick={() => setDays(p.id)}>{p.label}</button>
        ))}
      </div>
      {error && <p className="muted">No se pudo cargar: {error}</p>}
      {!report && !error && <p className="muted">Cargando…</p>}
      {report && report.trip_count === 0 && <p className="muted">No hay viajes finalizados en este período.</p>}
      {report && report.trip_count > 0 && (
        <>
          <p className="muted">{report.trip_count} viajes finalizados</p>
          <div className="summary-grid">
            <Stat label="Viaje completo (prom)" value={report.total.avg} big
                  extra={`mín ${formatDuration(report.total.min)} · máx ${formatDuration(report.total.max)}`} />
            <Stat label="Estacionamiento" value={report.parking.avg} />
            <Stat label="En movimiento" value={report.driving.avg} />
            <Stat label="En semáforos" value={report.waiting.avg} />
          </div>

          <h2>Por tramo</h2>
          <StatsTable
            rows={report.segments.map((s) => ({ key: `${s.from}→${s.to}`, label: <>{s.from}<br />→ {s.to}</>, ...s }))}
          />

          <h2>Por semáforo (espera)</h2>
          <StatsTable
            rows={report.checkpoints.map((c) => ({
              key: c.name,
              label: <>{c.name}<br /><span className="muted">verde {Math.round((c.green_count / c.count) * 100)}%</span></>,
              ...c,
            }))}
          />
        </>
      )}
    </div>
  )
}

function Stat({ label, value, big, extra }) {
  return (
    <div className={`stat ${big ? 'stat-big' : ''}`}>
      <span className="stat-value">{formatDuration(value)}</span>
      <span className="stat-label">{label}</span>
      {extra && <span className="stat-extra">{extra}</span>}
    </div>
  )
}

function StatsTable({ rows }) {
  return (
    <table className="stats">
      <thead><tr><th></th><th>Prom</th><th>Mín</th><th>Máx</th><th>n</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.label}</td>
            <td><strong>{formatDuration(r.avg)}</strong></td>
            <td>{formatDuration(r.min)}</td>
            <td>{formatDuration(r.max)}</td>
            <td>{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
