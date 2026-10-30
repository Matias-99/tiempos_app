import { useMemo } from 'react'
import { useConfirmTap, useNow } from '../hooks.js'
import {
  ARRIVE, DEPART, END, LEAVE_PARKING, START,
  currentPhase, formatDuration, formatTime, nextActions, summarize,
} from '../trip.js'
import SyncBadge from './SyncBadge.jsx'

const PRIMARY = {
  [START]: { title: 'ARRANCAR', sub: () => 'Inicio de viaje', tone: 'go' },
  [LEAVE_PARKING]: { title: 'SALIR ESTACIONAMIENTO', sub: () => 'Fin del tiempo en estacionamiento', tone: 'blue' },
  [ARRIVE]: { title: 'LLEGADA', sub: (cp) => cp.name, tone: 'stop' },
  [DEPART]: { title: 'SALIDA', sub: (cp) => cp.name, tone: 'go' },
  [END]: { title: 'LLEGADA PORTA', sub: () => 'Fin de viaje', tone: 'finish' },
}

const secsBetween = (a, b) => (new Date(b) - new Date(a)) / 1000

/** Filas del registro, de la más reciente a la más vieja. */
function logRows(events) {
  const rows = []
  let lastMove = null
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const next = events[i + 1]
    if (ev.kind === START) {
      rows.push({ time: ev.timestamp, label: 'Arrancar' })
    } else if (ev.kind === LEAVE_PARKING) {
      rows.push({ time: ev.timestamp, label: 'Salir estacionamiento', detail: `estac. ${formatDuration(secsBetween(events[0].timestamp, ev.timestamp))}` })
      lastMove = ev.timestamp
    } else if (ev.kind === ARRIVE) {
      const tramo = `tramo ${formatDuration(secsBetween(lastMove, ev.timestamp))}`
      if (next?.kind === DEPART && next.timestamp === ev.timestamp) {
        rows.push({ time: ev.timestamp, label: `${ev.checkpoint_name} en verde`, detail: tramo, tone: 'go' })
        lastMove = next.timestamp
        i++
      } else {
        rows.push({ time: ev.timestamp, label: `Llegada ${ev.checkpoint_name}`, detail: tramo, tone: 'stop' })
      }
    } else if (ev.kind === DEPART) {
      const arrived = events[i - 1].timestamp
      rows.push({ time: ev.timestamp, label: `Salida ${ev.checkpoint_name}`, detail: `espera ${formatDuration(secsBetween(arrived, ev.timestamp))}`, tone: 'go' })
      lastMove = ev.timestamp
    } else if (ev.kind === END) {
      rows.push({ time: ev.timestamp, label: 'Llegada Porta', detail: `tramo ${formatDuration(secsBetween(lastMove, ev.timestamp))}`, tone: 'finish' })
    }
  }
  return rows.reverse()
}

function averageFor(phase, averages) {
  if (!averages) return null
  if (phase.kind === 'parking') return averages.parking?.avg
  if (phase.kind === 'driving') return averages.segments?.find((s) => s.from === phase.from && s.to === phase.to)?.avg
  if (phase.kind === 'stopped') return averages.checkpoints?.find((c) => c.name === phase.name)?.avg
  return null
}

export default function TripScreen({ store, averages }) {
  const { trip, checkpoints, act, passGreen, undo, sync, pendingCount, flush } = store
  const events = trip?.events ?? []
  const finished = events.some((e) => e.kind === END)
  const route = trip && !finished ? trip.route : checkpoints.filter((c) => c.active)
  const running = events.length > 0 && !finished
  const now = useNow(running)

  const actions = finished ? [{ kind: START, checkpoint: null }] : nextActions(route, events)
  const primary = actions[0]
  const canEndEarly = primary.kind === ARRIVE
  const summary = useMemo(() => summarize(events), [events])
  const phase = finished ? { kind: 'done' } : currentPhase(route, events)
  const avg = averageFor(phase, averages)

  const total = finished ? summary.total_seconds : running ? (now - new Date(events[0].timestamp)) / 1000 : 0
  const partial = phase.since ? (now - new Date(phase.since)) / 1000 : null
  const passedCount = events.filter((e) => e.kind === DEPART).length

  const [undoArmed, tapUndo] = useConfirmTap(undo)
  const [endArmed, tapEnd] = useConfirmTap(() => act({ kind: END, checkpoint: null }))

  const cfg = PRIMARY[primary.kind]

  return (
    <div className="trip">
      <header className="trip-head">
        <SyncBadge sync={sync} pending={pendingCount} onRetry={flush} />
        <div className={`total ${running ? 'live' : ''}`}>{formatDuration(total)}</div>
        <div className="phase">
          {phase.kind === 'idle' && <span>Listo · {route.length} semáforos en la ruta</span>}
          {phase.kind === 'done' && <span>Viaje finalizado</span>}
          {phase.since && (
            <>
              <span className={`phase-label phase-${phase.kind}`}>{phase.label}</span>
              <span className="phase-time">{formatDuration(partial)}</span>
              {avg != null && (
                <span className={`phase-avg ${partial > avg ? 'over' : ''}`}>prom {formatDuration(avg)}</span>
              )}
            </>
          )}
        </div>
        {(running || finished) && trip.route.length > 0 && (
          <div className="progress">
            {trip.route.map((cp, i) => (
              <span
                key={cp.id}
                title={cp.name}
                className={i < passedCount ? 'done' : i === passedCount && running ? 'current' : ''}
              />
            ))}
          </div>
        )}
      </header>

      {finished ? (
        <div className="summary-grid">
          <Stat label="Total" value={summary.total_seconds} big />
          <Stat label="Estacionamiento" value={summary.parking_seconds} />
          <Stat label="En movimiento" value={summary.driving_seconds} />
          <Stat label="En semáforos" value={summary.waiting_seconds} />
        </div>
      ) : null}

      <ol className="log">
        {logRows(events).map((r, i) => (
          <li key={i} className={r.tone ? `log-${r.tone}` : ''}>
            <span className="log-time">{formatTime(r.time)}</span>
            <span className="log-label">{r.label}</span>
            <span className="log-detail">{r.detail}</span>
          </li>
        ))}
      </ol>

      <div className="actions">
        {(running || finished) && (
          <div className="secondary">
            <button className={`btn-secondary ${undoArmed ? 'armed' : ''}`} onClick={tapUndo}>
              {undoArmed ? '¿Deshacer?' : '↶ Deshacer'}
            </button>
            {canEndEarly && (
              <button className="btn-secondary btn-green" onClick={() => passGreen(primary.checkpoint)}>
                Pasé en verde
              </button>
            )}
            {canEndEarly && (
              <button className={`btn-secondary ${endArmed ? 'armed' : ''}`} onClick={tapEnd}>
                {endArmed ? '¿Finalizar?' : 'Fin'}
              </button>
            )}
          </div>
        )}
        <button className={`btn-primary tone-${cfg.tone}`} onClick={() => act(primary)}>
          <span className="btn-title">{finished ? 'NUEVO VIAJE' : cfg.title}</span>
          <span className="btn-sub">{cfg.sub(primary.checkpoint)}</span>
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value, big }) {
  return (
    <div className={`stat ${big ? 'stat-big' : ''}`}>
      <span className="stat-value">{formatDuration(value)}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}
