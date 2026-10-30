import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api.js'
import { ARRIVE, DEPART, START, makeEvent } from './trip.js'

// Todo se guarda primero en el teléfono y después se sincroniza: así un tap registra
// la hora exacta aunque no haya señal (p. ej. en un estacionamiento subterráneo).

const load = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value))

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID()
  // crypto.randomUUID solo existe en contextos seguros (https / localhost)
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const TAP_GUARD_MS = 700 // evita registrar dos eventos por un doble toque
const RETRY_MS = 5000

export function useTrip() {
  const [trip, setTripState] = useState(() => load('tv.trip', null))
  const [checkpoints, setCheckpointsState] = useState(() => load('tv.checkpoints', []))
  const [outbox, setOutbox] = useState(() => load('tv.outbox', {}))
  const [sync, setSync] = useState({ status: 'ok', message: '' })
  const outboxRef = useRef(outbox)
  const lastTap = useRef(0)
  const flushing = useRef(false)
  const retryTimer = useRef(null)

  const setTrip = useCallback((t) => {
    setTripState(t)
    save('tv.trip', t)
  }, [])

  const setCheckpoints = useCallback((list) => {
    setCheckpointsState(list)
    save('tv.checkpoints', list)
  }, [])

  const updateOutbox = useCallback((fn) => {
    const next = fn(outboxRef.current)
    outboxRef.current = next
    save('tv.outbox', next)
    setOutbox(next)
  }, [])

  const flush = useCallback(async () => {
    if (flushing.current) return
    flushing.current = true
    clearTimeout(retryTimer.current)
    try {
      for (const entry of Object.values(outboxRef.current)) {
        await api.putTrip(entry)
        // Solo se borra si no hubo otro tap mientras se enviaba.
        updateOutbox((ob) => {
          if (ob[entry.id]?.version !== entry.version) return ob
          const { [entry.id]: _, ...rest } = ob
          return rest
        })
      }
      setSync({ status: 'ok', message: '' })
    } catch (err) {
      const offline = !err.status
      setSync({ status: offline ? 'offline' : 'error', message: offline ? 'Sin conexión' : err.message })
      retryTimer.current = setTimeout(flush, RETRY_MS)
    } finally {
      flushing.current = false
    }
    if (Object.keys(outboxRef.current).length) {
      // Cambios hechos durante el envío.
      clearTimeout(retryTimer.current)
      retryTimer.current = setTimeout(flush, 300)
    }
  }, [updateOutbox])

  useEffect(() => {
    if (Object.keys(outbox).length) flush()
  }, [outbox, flush])

  useEffect(() => {
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [flush])

  const refreshCheckpoints = useCallback(async () => {
    try {
      const { checkpoints: list } = await api.checkpoints()
      setCheckpoints(list)
      return list
    } catch {
      return null
    }
  }, [setCheckpoints])

  // Al abrir: semáforos actualizados y, si este teléfono no tiene viaje, retomar uno abierto en el servidor.
  useEffect(() => {
    refreshCheckpoints()
    if (!load('tv.trip', null)) {
      api.activeTrip().then(({ trip: remote }) => {
        if (remote && !load('tv.trip', null)) {
          setTrip({ id: remote.id, route: remote.route, events: remote.events })
        }
      }).catch(() => {})
    }
  }, [refreshCheckpoints, setTrip])

  const commit = useCallback((next) => {
    setTrip(next.events.length ? next : null)
    updateOutbox((ob) => ({
      ...ob,
      [next.id]: { id: next.id, route: next.route, events: next.events, version: (ob[next.id]?.version ?? 0) + 1 },
    }))
  }, [setTrip, updateOutbox])

  const guard = () => {
    const now = Date.now()
    if (now - lastTap.current < TAP_GUARD_MS) return null
    lastTap.current = now
    navigator.vibrate?.(40)
    return new Date(now).toISOString()
  }

  /** Registra una acción de nextActions(). */
  const act = useCallback((action) => {
    const ts = guard()
    if (!ts) return
    if (action.kind === START) {
      const route = checkpoints.filter((c) => c.active).map(({ id, name }) => ({ id, name }))
      commit({ id: uuid(), route, events: [makeEvent(START, null, ts)] })
    } else {
      commit({ ...trip, events: [...trip.events, makeEvent(action.kind, action.checkpoint, ts)] })
    }
  }, [checkpoints, trip, commit])

  /** Semáforo en verde: llegada y salida con la misma hora (espera 0). */
  const passGreen = useCallback((checkpoint) => {
    const ts = guard()
    if (!ts) return
    commit({ ...trip, events: [...trip.events, makeEvent(ARRIVE, checkpoint, ts), makeEvent(DEPART, checkpoint, ts)] })
  }, [trip, commit])

  const undo = useCallback(() => {
    if (!trip?.events.length) return
    const evs = trip.events
    const last = evs[evs.length - 1]
    const prev = evs[evs.length - 2]
    const wasGreen = last.kind === DEPART && prev?.kind === ARRIVE && prev.timestamp === last.timestamp
    navigator.vibrate?.([30, 50, 30])
    commit({ ...trip, events: evs.slice(0, wasGreen ? -2 : -1) })
  }, [trip, commit])

  const pendingCount = Object.keys(outbox).length
  return { trip, checkpoints, refreshCheckpoints, setCheckpoints, act, passGreen, undo, sync, pendingCount, flush }
}
