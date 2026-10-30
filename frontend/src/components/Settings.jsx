import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useConfirmTap } from '../hooks.js'

export default function Settings({ store, ongoing }) {
  const { checkpoints, setCheckpoints, refreshCheckpoints } = store
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { refreshCheckpoints() }, [refreshCheckpoints])

  const run = (promise) =>
    promise.then(({ checkpoints }) => { setCheckpoints(checkpoints); setError('') }).catch((e) => setError(e.message))

  const move = (index, delta) => {
    const ids = checkpoints.map((c) => c.id)
    const j = index + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    run(api.reorderCheckpoints(ids))
  }

  const add = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    run(api.addCheckpoint(name.trim())).then(() => setName(''))
  }

  return (
    <div className="page">
      <h1>Semáforos</h1>
      <p className="muted">
        Puntos de control en orden de recorrido. Los cambios aplican desde el próximo viaje
        {ongoing ? ' (el viaje en curso mantiene su ruta)' : ''}. Desactivá un semáforo en lugar de borrarlo para conservar sus estadísticas agrupadas.
      </p>
      {error && <p className="error-text">{error}</p>}
      <ul className="cp-list">
        {checkpoints.map((c, i) => (
          <CheckpointRow
            key={c.id}
            cp={c}
            first={i === 0}
            last={i === checkpoints.length - 1}
            onUp={() => move(i, -1)}
            onDown={() => move(i, 1)}
            onRename={(n) => run(api.updateCheckpoint(c.id, { name: n }))}
            onToggle={() => run(api.updateCheckpoint(c.id, { active: !c.active }))}
            onDelete={() => run(api.deleteCheckpoint(c.id))}
          />
        ))}
      </ul>
      <form className="add-form" onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Semáforo ${checkpoints.length + 1}`} />
        <button type="submit">Agregar</button>
      </form>
    </div>
  )
}

function CheckpointRow({ cp, first, last, onUp, onDown, onRename, onToggle, onDelete }) {
  const [armed, tapDelete] = useConfirmTap(onDelete)
  const [draft, setDraft] = useState(cp.name)
  useEffect(() => setDraft(cp.name), [cp.name])

  return (
    <li className={`cp ${cp.active ? '' : 'inactive'}`}>
      <div className="cp-move">
        <button onClick={onUp} disabled={first} aria-label="Subir">▲</button>
        <button onClick={onDown} disabled={last} aria-label="Bajar">▼</button>
      </div>
      <input
        className="cp-name"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() && draft !== cp.name && onRename(draft.trim())}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <button className="cp-toggle" onClick={onToggle}>{cp.active ? 'Activo' : 'Inactivo'}</button>
      <button className={`cp-delete ${armed ? 'armed' : ''}`} onClick={tapDelete} aria-label="Borrar">
        {armed ? '¿Borrar?' : '✕'}
      </button>
    </li>
  )
}
