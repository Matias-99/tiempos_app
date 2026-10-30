import { useEffect, useState } from 'react'
import { api } from './api.js'
import { useTrip } from './useTrip.js'
import { useWakeLock } from './hooks.js'
import TripScreen from './components/TripScreen.jsx'
import History from './components/History.jsx'
import Reports from './components/Reports.jsx'
import Settings from './components/Settings.jsx'

const TABS = [
  { id: 'trip', label: 'Viaje', icon: '⏱' },
  { id: 'history', label: 'Historial', icon: '☰' },
  { id: 'reports', label: 'Reportes', icon: '▤' },
  { id: 'settings', label: 'Semáforos', icon: '🚦' },
]

export default function App() {
  const [tab, setTabState] = useState(() => {
    const fromHash = location.hash.slice(1)
    return TABS.some((t) => t.id === fromHash) ? fromHash : 'trip'
  })
  const setTab = (id) => {
    setTabState(id)
    history.replaceState(null, '', id === 'trip' ? location.pathname : `#${id}`)
  }
  const store = useTrip()
  const ongoing = !!store.trip && !store.trip.events.some((e) => e.kind === 'end')
  useWakeLock(ongoing)

  // Promedios para comparar en vivo cada tramo/semáforo con lo habitual.
  const [averages, setAverages] = useState(() => JSON.parse(localStorage.getItem('tv.report') || 'null'))
  useEffect(() => {
    if (ongoing) return
    api.report(90).then(({ report }) => {
      setAverages(report)
      localStorage.setItem('tv.report', JSON.stringify(report))
    }).catch(() => {})
  }, [ongoing])

  return (
    <div className="app">
      <main className="screen">
        {tab === 'trip' && <TripScreen store={store} averages={averages} />}
        {tab === 'history' && <History pending={store.pendingCount} />}
        {tab === 'reports' && <Reports />}
        {tab === 'settings' && <Settings store={store} ongoing={ongoing} />}
      </main>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
