// Reglas del flujo y cálculo de tiempos. Espejo de backend/trips/logic.py: mantener en sincronía.

export const START = 'start'
export const LEAVE_PARKING = 'leave_parking'
export const ARRIVE = 'arrive'
export const DEPART = 'depart'
export const END = 'end'

export const ORIGIN_LABEL = 'Estacionamiento origen'
export const PORTA_LABEL = 'Estacionamiento Porta'

/** Acciones válidas: [{kind, checkpoint|null}] */
export function nextActions(route, events) {
  if (!events.length) return [{ kind: START, checkpoint: null }]
  const last = events[events.length - 1]
  if (last.kind === START) return [{ kind: LEAVE_PARKING, checkpoint: null }]
  if (last.kind === ARRIVE) {
    return [{ kind: DEPART, checkpoint: { id: last.checkpoint_id, name: last.checkpoint_name } }]
  }
  if (last.kind === LEAVE_PARKING || last.kind === DEPART) {
    const passed = events.filter((e) => e.kind === DEPART).length
    if (passed < route.length) {
      return [{ kind: ARRIVE, checkpoint: route[passed] }, { kind: END, checkpoint: null }]
    }
    return [{ kind: END, checkpoint: null }]
  }
  return []
}

export function makeEvent(kind, checkpoint, timestamp) {
  return {
    kind,
    checkpoint_id: checkpoint ? checkpoint.id : null,
    checkpoint_name: checkpoint ? checkpoint.name : '',
    timestamp,
  }
}

const secs = (a, b) => (a && b ? (new Date(b) - new Date(a)) / 1000 : null)

/** Mismo resultado que logic.summarize del backend. */
export function summarize(events) {
  const at = (kind) => events.find((e) => e.kind === kind)?.timestamp ?? null
  const start = at(START)
  const leave = at(LEAVE_PARKING)
  const end = at(END)

  const stops = []
  const segments = []
  let prev = { label: ORIGIN_LABEL, time: leave }
  let open = null
  for (const ev of events) {
    if (ev.kind === ARRIVE) {
      segments.push({ from: prev.label, to: ev.checkpoint_name, seconds: secs(prev.time, ev.timestamp) })
      open = { name: ev.checkpoint_name, arrived_at: ev.timestamp, departed_at: null, seconds: null }
      stops.push(open)
    } else if (ev.kind === DEPART && open) {
      open.departed_at = ev.timestamp
      open.seconds = secs(open.arrived_at, ev.timestamp)
      prev = { label: open.name, time: ev.timestamp }
      open = null
    } else if (ev.kind === END) {
      segments.push({ from: prev.label, to: PORTA_LABEL, seconds: secs(prev.time, ev.timestamp) })
    }
  }
  const sum = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) : null)
  return {
    started_at: start,
    left_parking_at: leave,
    ended_at: end,
    parking_seconds: secs(start, leave),
    total_seconds: secs(start, end),
    driving_seconds: sum(segments.map((s) => s.seconds).filter((s) => s !== null)),
    waiting_seconds: sum(stops.map((s) => s.seconds).filter((s) => s !== null)),
    stops,
    segments,
  }
}

/** Qué está pasando ahora: para el cronómetro parcial en vivo. */
export function currentPhase(route, events) {
  if (!events.length) return { kind: 'idle' }
  const last = events[events.length - 1]
  switch (last.kind) {
    case START:
      return { kind: 'parking', since: last.timestamp, label: 'En estacionamiento' }
    case ARRIVE:
      return { kind: 'stopped', since: last.timestamp, label: `Detenido en ${last.checkpoint_name}`, name: last.checkpoint_name }
    case LEAVE_PARKING:
    case DEPART: {
      const next = nextActions(route, events).find((a) => a.kind === ARRIVE)
      const from = last.kind === DEPART ? last.checkpoint_name : ORIGIN_LABEL
      const to = next ? next.checkpoint.name : PORTA_LABEL
      return { kind: 'driving', since: last.timestamp, label: `Hacia ${to}`, from, to }
    }
    default:
      return { kind: 'done' }
  }
}

export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—'
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export function formatTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
}
