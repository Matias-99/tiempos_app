import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeEvent, nextActions, summarize, currentPhase, formatDuration } from './trip.js'

const route = [{ id: 1, name: 'S1' }, { id: 2, name: 'S2' }]
const t = (s) => new Date(Date.UTC(2026, 9, 1, 8, 0, s)).toISOString()

test('flujo completo y tiempos (mismos valores que el backend)', () => {
  const evs = []
  const tap = (s, i = 0) => {
    const a = nextActions(route, evs)[i]
    evs.push(makeEvent(a.kind, a.checkpoint, t(s)))
  }
  tap(0); tap(120) // arrancar, salir
  tap(180); tap(210) // S1
  tap(300); tap(300) // S2 en verde
  assert.deepEqual(nextActions(route, evs).map((a) => a.kind), ['end'])
  tap(400)
  const s = summarize(evs)
  assert.equal(s.parking_seconds, 120)
  assert.equal(s.total_seconds, 400)
  assert.deepEqual(s.stops.map((x) => x.seconds), [30, 0])
  assert.deepEqual(s.segments.map((x) => x.seconds), [60, 90, 100])
  assert.equal(s.parking_seconds + s.driving_seconds + s.waiting_seconds, 400)
  assert.deepEqual(nextActions(route, evs), [])
})

test('fase actual', () => {
  const evs = [makeEvent('start', null, t(0)), makeEvent('leave_parking', null, t(5))]
  assert.equal(currentPhase(route, evs).label, 'Hacia S1')
  evs.push(makeEvent('arrive', route[0], t(9)))
  assert.equal(currentPhase(route, evs).label, 'Detenido en S1')
})

test('formato', () => {
  assert.equal(formatDuration(65), '1:05')
  assert.equal(formatDuration(3725), '1:02:05')
  assert.equal(formatDuration(null), '—')
})
