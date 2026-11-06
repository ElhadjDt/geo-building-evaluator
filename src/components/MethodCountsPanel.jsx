import { useState } from 'react'

/**
 * Collapsible list of source methods and how many visible buildings use each.
 * @param {Array<[string, number]>} counts - [method, count] pairs, sorted for display
 */
function MethodCountsPanel({ counts }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="metrics-section">
      <h3>
        <button className="collapsible-header" onClick={() => setOpen(prev => !prev)}>
          <span>Source Methods ({counts.length})</span>
          <span>{open ? '▾' : '▸'}</span>
        </button>
      </h3>

      {open && counts.map(([method, count]) => (
        <div className="metric-item" key={method}>
          <span>{method}</span>
          <span className="metric-value">{count}</span>
        </div>
      ))}
    </div>
  )
}

export default MethodCountsPanel
