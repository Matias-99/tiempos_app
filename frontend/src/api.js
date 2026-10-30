async function request(method, url, body) {
  const res = await fetch(`/api/${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Error ${res.status}`)
    err.status = res.status
    throw err
  }
  return data
}

export const api = {
  checkpoints: () => request('GET', 'checkpoints'),
  addCheckpoint: (name) => request('POST', 'checkpoints', { name }),
  updateCheckpoint: (id, changes) => request('PATCH', `checkpoints/${id}`, changes),
  deleteCheckpoint: (id) => request('DELETE', `checkpoints/${id}`),
  reorderCheckpoints: (ids) => request('POST', 'checkpoints/reorder', { ids }),
  trips: (limit = 100) => request('GET', `trips?limit=${limit}`),
  activeTrip: () => request('GET', 'trips/active'),
  putTrip: (trip) => request('PUT', `trips/${trip.id}`, { route: trip.route, events: trip.events }),
  updateTrip: (id, changes) => request('PATCH', `trips/${id}`, changes),
  deleteTrip: (id) => request('DELETE', `trips/${id}`),
  report: (days) => request('GET', `reports?days=${days}`),
}
