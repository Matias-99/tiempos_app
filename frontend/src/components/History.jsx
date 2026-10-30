import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useConfirmTap } from '../hooks.js'
import { formatDate, formatDuration, formatTime } from '../trip.js'

export default function History({ pending }) {
  const [trips, setTrips] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)

  const load = () => api.trips().then(({ trips }) => { setTrips(trips); setError('') }).catch((e) => setError(e.message))
  useEffect(() => { load() }, [pending])

  if (error && !trips) return <div className="page"><h1>Historial</h1><p className="muted">No se pudo cargar: {error}</p></div>
  if (!trips) return <div className="page"><h1>Historial</h1><p className="muted">Cargando…</p></div>

  return (
    <div className="page">
      <h1>Historial</h1>
      {pending > 0 && <p className="muted">Hay cambios sin sincronizar todavía.</p>}
      {!trips.length && <p className="muted">Todavía no hay viajes.</p>}
      <ul className="cards">
        {trips.map((t) => (
          <TripCard
            key={t.id}
            trip={t}
            open={open === t.id}
            onToggle={() => setOpen(open === t.id ? null : t.id)}
            onDeleted={() => setTrips(trips.filter((x) => x.id !== t.id))}
          />
        ))}
      </ul>
    </div>
  )
}

function TripCard({ trip, open, onToggle, onDeleted }) {
  const s = trip.summary
  const inProgress = !s.ended_at
  const [armed, tapDelete] = useConfirmTap(() => api.deleteTrip(trip.id).then(onDeleted))
  const stopped = s.stops.filter((x) => x.seconds > 0).length

  return (
    <li className="card">
      <button className="card-head" onClick={onToggle}>
        <span>
          <strong>{formatDate(s.started_at)}</strong>
          <span className="muted"> · {formatTime(s.started_at).slice(0, 5)}</span>
        </span>
        <span className="card-total">{inProgress ? 'en curso' : formatDuration(s.total_seconds)}</span>
      </button>
      <div className="card-sub muted">
        estac. {formatDuration(s.parking_seconds)} · espera {formatDuration(s.waiting_seconds)} · {stopped}/{s.stops.length} semáforos en rojo
      </div>
      {open && (
        <div className="card-body">
          <table>
            <thead><tr><th>Tramo</th><th>Tiempo</th></tr></thead>
            <tbody>
              <tr><td>Estacionamiento origen</td><td>{formatDuration(s.parking_seconds)}</td></tr>
              {s.segments.map((seg, i) => (
                <SegmentRows key={i} seg={seg} stop={s.stops[i]} />
              ))}
            </tbody>
          </table>
          <button className={`btn-danger ${armed ? 'armed' : ''}`} onClick={tapDelete}>
            {armed ? 'Tocar de nuevo para borrar' : 'Borrar viaje'}
          </button>
        </div>
      )}
    </li>
  )
}

function SegmentRows({ seg, stop }) {
  return (
    <>
      <tr className="seg"><td>→ {seg.to}</td><td>{formatDuration(seg.seconds)}</td></tr>
      {stop && (
        <tr className="wait">
          <td>&nbsp;&nbsp;espera {stop.name} <span className="muted">{formatTime(stop.arrived_at)}</span></td>
          <td>{stop.seconds === 0 ? 'verde' : formatDuration(stop.seconds)}</td>
        </tr>
      )}
    </>
  )
}
