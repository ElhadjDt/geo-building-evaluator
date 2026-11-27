import { formatCount, getIepInfo, iepLabel } from '../utils/ingressEgress'

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}:</span>
      <span className="detail-value">{value}</span>
    </div>
  )
}

/**
 * Click-popup rows for an ingress/egress point: its road, capacity, outgoing commuters
 * (with the split by occupation) and incoming workers.
 * @param {Object} feature - An IngressEgress feature
 */
function IepDetails({ feature }) {
  const info = getIepInfo(feature)

  return (
    <>
      <DetailRow label="Road" value={iepLabel(info)} />
      {info.name && info.highway && <DetailRow label="Road Type" value={info.highway} />}
      {info.lanes !== undefined && <DetailRow label="Lanes" value={info.lanes} />}
      {info.speed !== undefined && <DetailRow label="Speed" value={`${info.speed} km/h`} />}
      {info.capacity !== undefined && <DetailRow label="Capacity" value={info.capacity.toLocaleString()} />}
      <DetailRow label="Outgoing" value={formatCount(info.outgoing)} />
      <DetailRow label="Incoming" value={formatCount(info.incoming)} />
      {info.outgoingByType.length > 0 && (
        <>
          <div className="detail-subheading">Outgoing by occupation</div>
          {info.outgoingByType.map(({ type, count }) => (
            <DetailRow key={type} label={type} value={count.toLocaleString()} />
          ))}
        </>
      )}
    </>
  )
}

export default IepDetails
