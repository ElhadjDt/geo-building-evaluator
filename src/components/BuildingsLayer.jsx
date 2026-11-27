import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import useTypeHighlight from '../hooks/useTypeHighlight'
import { applyRename, getBuildingStyle, getEvaluationStyle, resolveType } from '../utils/evaluation'
import { formatCount, getIepInfo, iepLabel, isIngressEgress } from '../utils/ingressEgress'

const BUILDINGS_PANE = 'buildings'
const BUILDINGS_PANE_Z_INDEX = 450 // above Leaflet's overlay pane (400), where roads and water live

const SOURCE_CONFIG = {
  groundTruth: { label: 'Ground Truth', matchesKey: 'groundTruthMatches', unmatchedStatus: 'unmatchedGT' },
  processed: { label: 'Processed', matchesKey: 'processedMatches', unmatchedStatus: 'unmatchedPred' }
}

// Leaflet's default pin, recoloured by the `iep-marker` class in index.css
const IEP_ICON = new L.Icon.Default({ className: 'iep-marker' })

function buildIepTooltip(feature, source) {
  const info = getIepInfo(feature)
  return `
    <div class="custom-tooltip">
      <h4>${SOURCE_CONFIG[source].label} · Ingress / Egress</h4>
      <p>Road: ${iepLabel(info)}${info.name && info.highway ? ` (${info.highway})` : ''}</p>
      <p>Outgoing: ${formatCount(info.outgoing)}</p>
      <p>Incoming: ${formatCount(info.incoming)}</p>
    </div>
  `
}

function buildTooltip(feature, source, type, classCount) {
  if (isIngressEgress(feature)) return buildIepTooltip(feature, source)
  return `
    <div class="custom-tooltip">
      <h4>${SOURCE_CONFIG[source].label}</h4>
      ${type ? `<p>Type: ${type}</p>` : ''}
      ${classCount ? `<p>Class Count: ${classCount}</p>` : ''}
      ${feature.properties?.citisketch_class !== undefined && feature.properties?.source_method ? `<p>Source Method: ${feature.properties.source_method}</p>` : ''}
    </div>
  `
}

/**
 * Renders both building datasets as one Leaflet layer and highlights buildings
 * of the same class on hover or selection.
 *
 * Paint order follows the order of `buildings`, so callers pass them largest
 * first to keep small polygons clickable. Do not call bringToFront on these
 * layers: it would break that order.
 *
 * This manages Leaflet directly because react-leaflet's <GeoJSON> never updates
 * its `data`, and its `style` prop would overwrite highlights on each render.
 *
 * @param {Array} buildings - { feature, source } entries, in paint order
 * @param {Object|null} matchedBuildings - Evaluation results, null outside evaluation
 * @param {Object} typeRenames - Map of { rawType: displayName }
 * @param {Map} classCounts - Number of visible buildings per class
 * @param {*} selectedType - Class to keep highlighted when nothing is hovered
 * @param {Function} onFeatureClick - Called with (feature, containerPoint, matchInfo, source)
 */
function BuildingsLayer({ buildings, matchedBuildings, typeRenames, classCounts, selectedType, onFeatureClick }) {
  const map = useMap()
  const attachHighlight = useTypeHighlight(selectedType)

  // Read from the long-lived Leaflet handlers, which must not capture stale values
  const onFeatureClickRef = useRef(onFeatureClick)
  onFeatureClickRef.current = onFeatureClick

  useEffect(() => {
    if (!map.getPane(BUILDINGS_PANE)) {
      map.createPane(BUILDINGS_PANE).style.zIndex = BUILDINGS_PANE_Z_INDEX
    }

    const sourceByFeature = new Map(buildings.map(({ feature, source }) => [feature, source]))
    const getType = (feature) => applyRename(resolveType(feature), typeRenames)

    const getMatch = (feature) => {
      const { matchesKey } = SOURCE_CONFIG[sourceByFeature.get(feature)]
      return matchedBuildings?.[matchesKey].get(feature)
    }

    const geoJson = L.geoJSON(
      { type: 'FeatureCollection', features: buildings.map(({ feature }) => feature) },
      {
        pane: BUILDINGS_PANE,
        pointToLayer: (feature, latlng) => isIngressEgress(feature) ? L.marker(latlng, { icon: IEP_ICON }) : L.marker(latlng),
        style: (feature) => {
          const source = sourceByFeature.get(feature)
          if (matchedBuildings) {
            return getEvaluationStyle(getMatch(feature)?.status || SOURCE_CONFIG[source].unmatchedStatus)
          }
          return getBuildingStyle(source, resolveType(feature))
        },
        onEachFeature: (feature, layer) => {
          const source = sourceByFeature.get(feature)
          const type = getType(feature)

          layer.on('click', (e) => {
            // Leaflet only honours its own flag, set here, when bubbling to the map
            L.DomEvent.stopPropagation(e)
            const match = getMatch(feature)
            const matchInfo = match
              ? { status: match.status, distance: match.distance, matchedFeature: match.matchedFeature }
              : null
            onFeatureClickRef.current(feature, e.containerPoint, matchInfo, source)
          })

          layer.bindTooltip(buildTooltip(feature, source, type, classCounts.get(type)), { sticky: true })
        }
      }
    ).addTo(map)

    const detachHighlight = attachHighlight(geoJson, getType)

    return () => {
      detachHighlight()
      geoJson.remove()
    }
  }, [map, buildings, matchedBuildings, typeRenames, classCounts, attachHighlight])

  return null
}

export default BuildingsLayer
