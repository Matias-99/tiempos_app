import { useEffect, useRef, useState } from 'react'

/** Fecha actual que se refresca mientras `active` sea true. */
export function useNow(active, ms = 500) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [active, ms])
  return now
}

/** Mantiene la pantalla encendida durante el viaje (si el navegador lo permite). */
export function useWakeLock(active) {
  const lock = useRef(null)
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    const acquire = () => {
      if (document.visibilityState === 'visible') {
        navigator.wakeLock.request('screen').then((l) => (lock.current = l)).catch(() => {})
      }
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      document.removeEventListener('visibilitychange', acquire)
      lock.current?.release().catch(() => {})
      lock.current = null
    }
  }, [active])
}

/** Primer toque arma la acción, el segundo (dentro de `ms`) la confirma. */
export function useConfirmTap(onConfirm, ms = 3000) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const id = setTimeout(() => setArmed(false), ms)
    return () => clearTimeout(id)
  }, [armed, ms])
  const tap = () => {
    if (armed) {
      setArmed(false)
      onConfirm()
    } else {
      setArmed(true)
    }
  }
  return [armed, tap]
}
