export default function SyncBadge({ sync, pending, onRetry }) {
  if (!pending && sync.status === 'ok') return <span className="sync ok">✓ Guardado</span>
  if (sync.status === 'error') {
    return <button className="sync error" onClick={onRetry} title={sync.message}>⚠ {sync.message}</button>
  }
  const text = sync.status === 'offline' ? 'Sin señal · guardado en el teléfono' : 'Sincronizando…'
  return <button className="sync pending" onClick={onRetry}>⟳ {text}</button>
}
