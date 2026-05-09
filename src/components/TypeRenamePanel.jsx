import { useState } from 'react'

function TypeRenamePanel({ renames, onAdd, onRemove }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const handleAdd = () => {
    const f = from.trim()
    const t = to.trim()
    if (!f || !t || f === t) return
    onAdd(f, t)
    setFrom('')
    setTo('')
  }

  const hasRenames = Object.keys(renames).length > 0

  return (
    <div className="rename-section">
      <h3>Type Renames</h3>
      <div className="rename-input-row">
        <input
          className="rename-input"
          placeholder="From"
          value={from}
          onChange={e => setFrom(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <span className="rename-arrow">→</span>
        <input
          className="rename-input"
          placeholder="To"
          value={to}
          onChange={e => setTo(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button className="rename-add-btn" onClick={handleAdd}>Add</button>
      </div>
      {hasRenames && (
        <div className="rename-list">
          {Object.entries(renames).map(([f, t]) => (
            <div key={f} className="rename-tag">
              <span>{f} → {t}</span>
              <button className="rename-remove-btn" onClick={() => onRemove(f)}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default TypeRenamePanel
