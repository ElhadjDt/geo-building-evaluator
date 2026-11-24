import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import useTypeHighlight from '../hooks/useTypeHighlight'
import { getRoadInfo, ROAD_DIRECTION, ONE_WAY_ROAD_COLOR } from '../utils/evaluation'

const ROAD_STYLE = { color: '#9e9e9e', weight: 2, opacity: 0.8 }
const ONE_WAY_ROAD_STYLE = { ...ROAD_STYLE, color: ONE_WAY_ROAD_COLOR }
const NUMERIC_SPEED = /^\d+(\.\d+)?$/
const ARROW_SIZE_PX = 14
// a right-pointing triangle, rotated to the road's travel direction
const ARROW_PATH = 'M1,1 L13,7 L1,13 z'

function buildTooltip({ name, type, maxspeed, direction }) {
  const speedLabel = maxspeed && NUMERIC_SPEED.test(maxspeed) ? `${maxspeed} km/h` : maxspeed
  return `
    <div class="custom-tooltip">
      <h4>${name || 'Unnamed Road'}</h4>
      <p>Type: ${type || 'N/A'}</p>
      <p>Max Speed: ${speedLabel || 'N/A'}</p>
      <p>Direction: ${direction === ROAD_DIRECTION.TWO_WAY ? 'Two-way' : 'One-way'}</p>
    </div>
  `
}

function isOneWay(feature) {
  return getRoadInfo(feature).direction !== ROAD_DIRECTION.TWO_WAY
}

/** The line's points, or the first part's for a MultiLineString */
function lineCoordinates(geometry) {
  if (geometry?.type === 'LineString') return geometry.coordinates
  if (geometry?.type === 'MultiLineString') return geometry.coordinates[0]
  return null
}

/**
 * Where to draw a one-way road's arrow: the point halfway along the line, and
 * the travel direction there as a screen angle in degrees, clockwise from east.
 * Angles are taken in Web Mercator, the map's projection, so they match the screen.
 */
function arrowPlacement(coordinates, direction) {
  const projected = coordinates.map(([lng, lat]) => L.CRS.EPSG3857.project(L.latLng(lat, lng)))
  const segmentLengths = projected.slice(1).map((point, i) => point.distanceTo(projected[i]))
  let distanceLeft = segmentLengths.reduce((total, length) => total + length, 0) / 2
  let segment = 0
  while (segment < segmentLengths.length - 1 && distanceLeft > segmentLengths[segment]) {
    distanceLeft -= segmentLengths[segment]
    segment += 1
  }
  const from = projected[segment]
  const to = projected[segment + 1]
  const fraction = segmentLengths[segment] ? distanceLeft / segmentLengths[segment] : 0
  const halfway = L.CRS.EPSG3857.unproject(L.point(from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction))
  // projected y grows northward while screen y grows southward
  const forwardAngle = Math.atan2(-(to.y - from.y), to.x - from.x) * 180 / Math.PI
  return { halfway, angle: direction === ROAD_DIRECTION.BACKWARD ? forwardAngle + 180 : forwardAngle }
}

/** A non-interactive arrow marker on a one-way road, or null for a two-way road */
function directionArrow(feature) {
  const { direction } = getRoadInfo(feature)
  const coordinates = lineCoordinates(feature.geometry)
  if (direction === ROAD_DIRECTION.TWO_WAY || !coordinates || coordinates.length < 2) return null

  const { halfway, angle } = arrowPlacement(coordinates, direction)
  const icon = L.divIcon({
    className: 'road-direction-arrow',
    iconSize: [ARROW_SIZE_PX, ARROW_SIZE_PX],
    html: `<svg width="${ARROW_SIZE_PX}" height="${ARROW_SIZE_PX}" style="transform: rotate(${angle}deg)">
             <path d="${ARROW_PATH}" fill="${ONE_WAY_ROAD_COLOR}" stroke="#000" stroke-width="1" />
           </svg>`
  })
  return L.marker(halfway, { icon, interactive: false, keyboard: false })
}

/**
 * Renders the road network and highlights roads of the same type on hover or
 * selection. Manages Leaflet directly for the same reason as BuildingsLayer:
 * react-leaflet's <GeoJSON> style prop would overwrite highlights on each render.
 *
 * With `showDirections`, one-way roads are drawn in ONE_WAY_ROAD_COLOR with an
 * arrow halfway along them pointing in their travel direction.
 *
 * @param {Object} roads - Road FeatureCollection
 * @param {*} selectedType - Road type to keep highlighted when nothing is hovered
 * @param {boolean} showDirections - Whether to color one-way roads and draw their arrows
 * @param {Function} onRoadClick - Called with the clicked road's type
 */
function RoadsLayer({ roads, selectedType, showDirections, onRoadClick }) {
  const map = useMap()
  const attachHighlight = useTypeHighlight(selectedType)
  const onRoadClickRef = useRef(onRoadClick)
  onRoadClickRef.current = onRoadClick

  useEffect(() => {
    const geoJson = L.geoJSON(roads, {
      style: feature => (showDirections && isOneWay(feature) ? ONE_WAY_ROAD_STYLE : ROAD_STYLE),
      onEachFeature: (feature, layer) => {
        const info = getRoadInfo(feature)
        layer.on('click', (e) => {
          // Keeps the click from reaching the map, which would clear the selection
          L.DomEvent.stopPropagation(e)
          onRoadClickRef.current(info.type ?? null)
        })
        layer.bindTooltip(buildTooltip(info), { sticky: true })
      }
    }).addTo(map)

    const detachHighlight = attachHighlight(geoJson, feature => getRoadInfo(feature).type)

    return () => {
      detachHighlight()
      geoJson.remove()
    }
  }, [map, roads, showDirections, attachHighlight])

  useEffect(() => {
    if (!showDirections) return undefined
    const arrows = L.layerGroup(roads.features.map(directionArrow).filter(Boolean)).addTo(map)
    return () => arrows.remove()
  }, [map, roads, showDirections])

  return null
}

export default RoadsLayer
