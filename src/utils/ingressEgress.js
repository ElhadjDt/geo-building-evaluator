/**
 * Ingress/egress points (IEPs): the community's road exits, written by the AutoCalibration
 * job step as point features of class `IngressEgress` in the processed buildings.
 *
 * Each carries the outgoing commuters as `jobSeeds` ([{ type, count }], total in `job_total`)
 * and the incoming workers as `activityHooks.PRIMARY_WORK`. Nested values are read whether
 * they arrive as objects or as JSON strings.
 */

export const IEP_CLASS = 'IngressEgress'

// Citisketch's names for the IEP property holding its arrivals, and for the arrivals who work here
const ACTIVITY_HOOKS = 'activityHooks'
const INCOMING_ACTIVITY = 'PRIMARY_WORK'

export function isIngressEgress(feature) {
  return feature?.properties?.citisketch_class === IEP_CLASS
}

/**
 * A nested property as an object or array, parsing it when it was stored as a JSON string
 * @param {*} value - Raw property value
 * @returns {*} The parsed value, or undefined when missing or unreadable
 */
function readNested(value) {
  if (typeof value !== 'string') return value ?? undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function numberOrUndefined(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Everything the map shows for an IEP
 * @param {Object} feature - An IngressEgress feature
 * @returns {Object} { highway, name, lanes, speed, capacity, outgoing, outgoingByType, incoming }.
 *   `incoming` is undefined when the data has no activityHooks.PRIMARY_WORK (written before it existed).
 *   `outgoingByType` is [{ type, count }], largest first.
 */
export function getIepInfo(feature) {
  const props = feature?.properties ?? {}
  const outgoingByType = (readNested(props.jobSeeds) ?? [])
    .filter(seed => seed && numberOrUndefined(seed.count) !== undefined)
    .sort((a, b) => b.count - a.count)
  const seededOutgoing = outgoingByType.reduce((sum, seed) => sum + seed.count, 0)

  return {
    highway: props.highway || undefined,
    name: props.name || undefined,
    lanes: numberOrUndefined(props.lanes),
    speed: numberOrUndefined(props.speed),
    capacity: numberOrUndefined(props.capacity),
    outgoing: numberOrUndefined(props.job_total) ?? seededOutgoing,
    outgoingByType,
    incoming: numberOrUndefined(readNested(props[ACTIVITY_HOOKS])?.[INCOMING_ACTIVITY])
  }
}

/**
 * A short label for an IEP: its road name, else its road type
 * @param {Object} info - From getIepInfo
 */
export function iepLabel(info) {
  return info.name ?? info.highway ?? 'Unnamed road'
}

export function formatCount(value) {
  return value === undefined ? 'not in data' : value.toLocaleString()
}
