import { useCallback, useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { HIGHLIGHT_STYLE, applyRename, getBuildingStyle, getEvaluationStyle, resolveType } from '../utils/evaluation'

const BUILDINGS_PANE = 'buildings'
const BUILDINGS_PANE_Z_INDEX = 450 // above Leaflet's overlay pane (400), where roads and water live
const HOVER_OUT_DELAY_MS = 40 // lets a following mouseover cancel the reset when moving between buildings

const SOURCE_CONFIG = {
  groundTruth: { label: 'Ground Truth', matchesKey: 'groundTruthMatches', unmatchedStatus: 'unmatchedGT' },
  processed: { label: 'Processed', matchesKey: 'processedMatches', unmatchedStatus: 'unmatchedPred' }
}

function buildTooltip(feature, source, type, classCount) {
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
  const geoJsonRef = useRef(null)
  const layersByTypeRef = useRef(new Map())
  const highlightedTypeRef = useRef(null)

  // Read from the long-lived Leaflet handlers, which must not capture stale values
  const selectedTypeRef = useRef(selectedType)
  selectedTypeRef.current = selectedType
  const onFeatureClickRef = useRef(onFeatureClick)
  onFeatureClickRef.current = onFeatureClick

  const setHighlight = useCallback((type) => {
    const nextType = type ?? null
    if (nextType === highlightedTypeRef.current) return

    layersByTypeRef.current.get(highlightedTypeRef.current)?.forEach(layer => geoJsonRef.current.resetStyle(layer))
    layersByTypeRef.current.get(nextType)?.forEach(layer => layer.setStyle?.(HIGHLIGHT_STYLE))
    highlightedTypeRef.current = nextType
  }, [])

  useEffect(() => {
    if (!map.getPane(BUILDINGS_PANE)) {
      map.createPane(BUILDINGS_PANE).style.zIndex = BUILDINGS_PANE_Z_INDEX
    }

    const sourceByFeature = new Map(buildings.map(({ feature, source }) => [feature, source]))
    const layersByType = new Map()
    let hoverOutTimer = null

    const getMatch = (feature) => {
      const { matchesKey } = SOURCE_CONFIG[sourceByFeature.get(feature)]
      return matchedBuildings?.[matchesKey].get(feature)
    }

    const geoJson = L.geoJSON(
      { type: 'FeatureCollection', features: buildings.map(({ feature }) => feature) },
      {
        pane: BUILDINGS_PANE,
        style: (feature) => {
          const source = sourceByFeature.get(feature)
          if (matchedBuildings) {
            return getEvaluationStyle(getMatch(feature)?.status || SOURCE_CONFIG[source].unmatchedStatus)
          }
          return getBuildingStyle(source, resolveType(feature))
        },
        onEachFeature: (feature, layer) => {
          const source = sourceByFeature.get(feature)
          const type = applyRename(resolveType(feature), typeRenames)

          if (type !== undefined && type !== null) {
            if (!layersByType.has(type)) layersByType.set(type, [])
            layersByType.get(type).push(layer)
          }

          layer.on({
            click: (e) => {
              // Leaflet only honours its own flag, set here, when bubbling to the map
              L.DomEvent.stopPropagation(e)
              const match = getMatch(feature)
              const matchInfo = match
                ? { status: match.status, distance: match.distance, matchedFeature: match.matchedFeature }
                : null
              onFeatureClickRef.current(feature, e.containerPoint, matchInfo, source)
            },
            mouseover: () => {
              clearTimeout(hoverOutTimer)
              setHighlight(type ?? selectedTypeRef.current)
            },
            mouseout: () => {
              clearTimeout(hoverOutTimer)
              hoverOutTimer = setTimeout(() => setHighlight(selectedTypeRef.current), HOVER_OUT_DELAY_MS)
            }
          })

          layer.bindTooltip(buildTooltip(feature, source, type, classCounts.get(type)), { sticky: true })
        }
      }
    ).addTo(map)

    geoJsonRef.current = geoJson
    layersByTypeRef.current = layersByType
    highlightedTypeRef.current = null
    setHighlight(selectedTypeRef.current)

    return () => {
      clearTimeout(hoverOutTimer)
      geoJson.remove()
    }
  }, [map, buildings, matchedBuildings, typeRenames, classCounts, setHighlight])

  useEffect(() => {
    setHighlight(selectedType)
  }, [selectedType, setHighlight])

  return null
}

export default BuildingsLayer
