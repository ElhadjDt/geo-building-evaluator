import { useCallback, useEffect, useRef } from 'react'
import { HIGHLIGHT_STYLE } from '../utils/evaluation'

const HOVER_OUT_DELAY_MS = 40 // lets a following mouseover cancel the reset when moving between features

/**
 * Highlights every layer of the hovered type in an L.geoJSON layer, falling
 * back to `selectedType` when nothing is hovered. Hover restyles paths without
 * touching React state, so the parent doesn't re-render on mouse movement.
 *
 * Returns `attach(geoJson, getType)`, to call each time the L.geoJSON layer is
 * built. It groups the layers by `getType(feature)`, binds the hover handlers,
 * and returns a cleanup function. Features whose type is null or undefined are
 * never highlighted.
 *
 * @param {*} selectedType - Type to keep highlighted when nothing is hovered
 * @returns {Function} attach
 */
export default function useTypeHighlight(selectedType) {
  const geoJsonRef = useRef(null)
  const layersByTypeRef = useRef(new Map())
  const highlightedTypeRef = useRef(null)

  // Read from the long-lived Leaflet handlers, which must not capture stale values
  const selectedTypeRef = useRef(selectedType)
  selectedTypeRef.current = selectedType

  const setHighlight = useCallback((type) => {
    const nextType = type ?? null
    if (nextType === highlightedTypeRef.current) return

    layersByTypeRef.current.get(highlightedTypeRef.current)?.forEach(layer => geoJsonRef.current.resetStyle(layer))
    layersByTypeRef.current.get(nextType)?.forEach(layer => layer.setStyle?.(HIGHLIGHT_STYLE))
    highlightedTypeRef.current = nextType
  }, [])

  const attach = useCallback((geoJson, getType) => {
    const layersByType = new Map()
    let hoverOutTimer = null

    geoJson.eachLayer(layer => {
      const type = getType(layer.feature)

      if (type !== undefined && type !== null) {
        if (!layersByType.has(type)) layersByType.set(type, [])
        layersByType.get(type).push(layer)
      }

      layer.on({
        mouseover: () => {
          clearTimeout(hoverOutTimer)
          setHighlight(type ?? selectedTypeRef.current)
        },
        mouseout: () => {
          clearTimeout(hoverOutTimer)
          hoverOutTimer = setTimeout(() => setHighlight(selectedTypeRef.current), HOVER_OUT_DELAY_MS)
        }
      })
    })

    geoJsonRef.current = geoJson
    layersByTypeRef.current = layersByType
    highlightedTypeRef.current = null
    setHighlight(selectedTypeRef.current)

    return () => clearTimeout(hoverOutTimer)
  }, [setHighlight])

  useEffect(() => {
    setHighlight(selectedType)
  }, [selectedType, setHighlight])

  return attach
}
