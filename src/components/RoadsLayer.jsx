import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import useTypeHighlight from '../hooks/useTypeHighlight'
import { getRoadInfo } from '../utils/evaluation'

const ROAD_STYLE = { color: '#9e9e9e', weight: 2, opacity: 0.8 }
const NUMERIC_SPEED = /^\d+(\.\d+)?$/

function buildTooltip({ name, type, maxspeed }) {
  const speedLabel = maxspeed && NUMERIC_SPEED.test(maxspeed) ? `${maxspeed} km/h` : maxspeed
  return `
    <div class="custom-tooltip">
      <h4>${name || 'Unnamed Road'}</h4>
      <p>Type: ${type || 'N/A'}</p>
      <p>Max Speed: ${speedLabel || 'N/A'}</p>
    </div>
  `
}

/**
 * Renders the road network and highlights roads of the same type on hover or
 * selection. Manages Leaflet directly for the same reason as BuildingsLayer:
 * react-leaflet's <GeoJSON> style prop would overwrite highlights on each render.
 *
 * @param {Object} roads - Road FeatureCollection
 * @param {*} selectedType - Road type to keep highlighted when nothing is hovered
 * @param {Function} onRoadClick - Called with the clicked road's type
 */
function RoadsLayer({ roads, selectedType, onRoadClick }) {
  const map = useMap()
  const attachHighlight = useTypeHighlight(selectedType)
  const onRoadClickRef = useRef(onRoadClick)
  onRoadClickRef.current = onRoadClick

  useEffect(() => {
    const geoJson = L.geoJSON(roads, {
      style: () => ROAD_STYLE,
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
  }, [map, roads, attachHighlight])

  return null
}

export default RoadsLayer
