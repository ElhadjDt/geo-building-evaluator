import { useState } from 'react'
import { formatCount, getIepInfo, iepLabel } from '../utils/ingressEgress'

function sumOrUndefined(values) {
  return values.some(value => value === undefined) ? undefined : values.reduce((sum, value) => sum + value, 0)
}

/**
 * Totals over the visible ingress/egress points, with a collapsible list of each one's
 * outgoing commuters and incoming workers, largest road capacity first.
 * @param {Array<Object>} ieps - The visible IngressEgress features
 */
function IngressEgressPanel({ ieps }) {
  const [open, setOpen] = useState(false)
  const infos = ieps.map(getIepInfo).sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0))

  return (
    <div className="metrics-section">
      <h3>
        <button className="collapsible-header" onClick={() => setOpen(prev => !prev)}>
          <span>Ingress / Egress ({infos.length})</span>
          <span>{open ? '▾' : '▸'}</span>
        </button>
      </h3>

      <div className="metric-item">
        <span>Outgoing commuters</span>
        <span className="metric-value">{formatCount(sumOrUndefined(infos.map(info => info.outgoing)))}</span>
      </div>
      <div className="metric-item">
        <span>Incoming workers</span>
        <span className="metric-value">{formatCount(sumOrUndefined(infos.map(info => info.incoming)))}</span>
      </div>

      {open && (
        <>
          <div className="metric-item iep-list-heading">
            <span>Road</span>
            <span>Out / In</span>
          </div>
          {infos.map((info, index) => (
            <div className="metric-item" key={index}>
              <span>{iepLabel(info)}</span>
              <span className="metric-value">
                {formatCount(info.outgoing)} / {formatCount(info.incoming)}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export default IngressEgressPanel
