import { useState, useMemo, useEffect } from 'react'
import { MapContainer, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import FileUpload from './components/FileUpload'
import LayerControls from './components/LayerControls'
import Legend from './components/Legend'
import MetricsPanel from './components/MetricsPanel'
import FilterPanel from './components/FilterPanel'
import TypeRenamePanel from './components/TypeRenamePanel'
import { calculateBuildingMatches, getBuildingStyle, getEvaluationStyle, resolveType, applyRename } from './utils/evaluation'
import './App.css'

/**
 * Auto-fits the map to the bounds of all loaded data whenever it changes.
 */
function FitBounds({ datasets }) {
  const map = useMap()

  useEffect(() => {
    const allFeatures = datasets.flatMap(d => d?.features ?? [])
    if (allFeatures.length === 0) return

    try {
      const layer = L.geoJSON({ type: 'FeatureCollection', features: allFeatures })
      const bounds = layer.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20] })
      }
    } catch {
      // ignore malformed geometries
    }
  }, [datasets, map])

  return null
}

function App() {
  const [mode, setMode] = useState('visualization') // 'visualization' | 'evaluation'

  // Data state
  const [roadData, setRoadData] = useState(null)
  const [waterData, setWaterData] = useState(null)
  const [groundTruthBuildings, setGroundTruthBuildings] = useState(null)
  const [processedBuildings, setProcessedBuildings] = useState(null)

  // Layer visibility state
  const [layers, setLayers] = useState({
    roads: true,
    water: true,
    groundTruth: true,
    processed: true
  })

  // Filter state
  const [selectedTypes, setSelectedTypes] = useState([])

  // Type rename state: { rawType: displayName }
  const [typeRenames, setTypeRenames] = useState({})

  // Popup state
  const [selectedFeature, setSelectedFeature] = useState(null)

  // Calculate building matches when in evaluation mode
  const matchedBuildings = useMemo(() => {
    if (mode !== 'evaluation' || !groundTruthBuildings || !processedBuildings) {
      return null
    }
    return calculateBuildingMatches(groundTruthBuildings, processedBuildings, typeRenames)
  }, [mode, groundTruthBuildings, processedBuildings, typeRenames])

  // Collect all datasets for FitBounds
  const allDatasets = useMemo(
    () => [roadData, waterData, groundTruthBuildings, processedBuildings],
    [roadData, waterData, groundTruthBuildings, processedBuildings]
  )

  // Get all building types for filtering
  const buildingTypes = useMemo(() => {
    const types = new Set()
    groundTruthBuildings?.features?.forEach(f => {
      const t = applyRename(resolveType(f), typeRenames)
      if (t) types.add(t)
    })
    processedBuildings?.features?.forEach(f => {
      const t = applyRename(resolveType(f), typeRenames)
      if (t) types.add(t)
    })
    return Array.from(types).sort()
  }, [groundTruthBuildings, processedBuildings, typeRenames])

  const filterBuildings = (data) => {
    if (!data || selectedTypes.length === 0) return data
    return {
      ...data,
      features: data.features.filter(f => {
        const t = applyRename(resolveType(f), typeRenames)
        return !t || selectedTypes.includes(t)
      })
    }
  }

  const toggleLayer = (layer) => {
    setLayers(prev => ({ ...prev, [layer]: !prev[layer] }))
  }

  const onFeatureClick = (feature, containerPoint, matchInfo = null) => {
    setSelectedFeature({ feature, latlng: containerPoint, matchInfo })
  }

  const closePopup = () => setSelectedFeature(null)

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>Geo Building Evaluator</h1>
          <p>Compare processed vs ground truth data</p>
        </div>

        <div className="sidebar-content">
          {/* Mode Toggle */}
          <div className="mode-toggle">
            <button
              className={mode === 'visualization' ? 'active' : ''}
              onClick={() => setMode('visualization')}
            >
              Visualize
            </button>
            <button
              className={mode === 'evaluation' ? 'active' : ''}
              onClick={() => setMode('evaluation')}
            >
              Evaluate
            </button>
          </div>

          {/* File Upload */}
          <FileUpload
            roadData={roadData}
            waterData={waterData}
            groundTruthBuildings={groundTruthBuildings}
            processedBuildings={processedBuildings}
            onRoadUpload={setRoadData}
            onWaterUpload={setWaterData}
            onGroundTruthUpload={setGroundTruthBuildings}
            onProcessedUpload={setProcessedBuildings}
          />

          {/* Layer Controls */}
          <LayerControls
            layers={layers}
            onToggle={toggleLayer}
            hasRoads={!!roadData}
            hasWater={!!waterData}
            hasGroundTruth={!!groundTruthBuildings}
            hasProcessed={!!processedBuildings}
          />

          {/* Metrics (Evaluation Mode) */}
          {mode === 'evaluation' && matchedBuildings && (
            <MetricsPanel matchedBuildings={matchedBuildings} />
          )}

          {/* Legend */}
          <Legend mode={mode} />

          {/* Filter Panel */}
          {buildingTypes.length > 0 && (
            <FilterPanel
              types={buildingTypes}
              selected={selectedTypes}
              onToggle={(type) => {
                setSelectedTypes(prev =>
                  prev.includes(type)
                    ? prev.filter(t => t !== type)
                    : [...prev, type]
                )
              }}
              onClear={() => setSelectedTypes([])}
            />
          )}

          {/* Type Rename Panel */}
          <TypeRenamePanel
            renames={typeRenames}
            onAdd={(from, to) => setTypeRenames(prev => ({ ...prev, [from]: to }))}
            onRemove={(from) => setTypeRenames(prev => {
              const next = { ...prev }
              delete next[from]
              return next
            })}
          />
        </div>
      </div>

      {/* Map */}
      <div className="map-container">
        {!roadData && !waterData && !groundTruthBuildings && !processedBuildings && (
          <div className="map-empty-hint">Upload GeoJSON files to begin</div>
        )}
        <MapContainer
          center={[0, 0]}
          zoom={2}
          style={{ height: '100%', width: '100%' }}
          onClick={closePopup}
        >
          {/* Auto-fit to loaded data */}
          <FitBounds datasets={allDatasets} />

          {/* Water Layer */}
          {layers.water && waterData && (
            <GeoJSON
              key={waterData.features.length + '-water'}
              data={waterData}
              style={() => ({
                color: '#4fc3f7',
                fillColor: '#4fc3f7',
                fillOpacity: 0.5,
                weight: 1
              })}
            />
          )}

          {/* Road Layer */}
          {layers.roads && roadData && (
            <GeoJSON
              key={roadData.features.length + '-roads'}
              data={roadData}
              style={(feature) => ({
                color: feature.properties?.roadType === 'highway' ? '#ff9800' : '#9e9e9e',
                weight: feature.properties?.roadType === 'highway' ? 4 : 2,
                opacity: 0.8
              })}
              onEachFeature={(feature, layer) => {
                layer.bindTooltip(`
                  <div class="custom-tooltip">
                    <h4>${feature.properties?.roadName || 'Unknown Road'}</h4>
                    <p>Type: ${feature.properties?.roadType || 'N/A'}</p>
                    <p>Speed: ${feature.properties?.speed || 'N/A'}</p>
                  </div>
                `, { sticky: true })
              }}
            />
          )}

          {/* Ground Truth Buildings */}
          {layers.groundTruth && groundTruthBuildings && (
            <GeoJSON
              key={mode + '-gt-' + (matchedBuildings ? 'eval' : 'vis')}
              data={filterBuildings(groundTruthBuildings)}
              style={(feature) => {
                if (mode === 'evaluation' && matchedBuildings) {
                  const match = matchedBuildings.groundTruthMatches.get(feature)
                  return getEvaluationStyle(match?.status || 'unmatchedGT')
                }
                return getBuildingStyle('groundTruth', resolveType(feature))
              }}
              onEachFeature={(feature, layer) => {
                layer.on('click', (e) => {
                  e.originalEvent.stopPropagation()
                  let matchInfo = null
                  if (mode === 'evaluation' && matchedBuildings) {
                    const match = matchedBuildings.groundTruthMatches.get(feature)
                    if (match) matchInfo = { status: match.status, distance: match.distance, matchedFeature: match.matchedFeature }
                  }
                  onFeatureClick(feature, e.containerPoint, matchInfo)
                })
                layer.bindTooltip(`
                  <div class="custom-tooltip">
                    <h4>Ground Truth</h4>
                    ${applyRename(resolveType(feature), typeRenames) ? `<p>Type: ${applyRename(resolveType(feature), typeRenames)}</p>` : ''}
                    ${feature.properties?.citisketch_class !== undefined && feature.properties?.source_method ? `<p>Source Method: ${feature.properties.source_method}</p>` : ''}
                  </div>
                `, { sticky: true })
              }}
            />
          )}

          {/* Processed Buildings */}
          {layers.processed && processedBuildings && (
            <GeoJSON
              key={mode + '-proc-' + (matchedBuildings ? 'eval' : 'vis')}
              data={filterBuildings(processedBuildings)}
              style={(feature) => {
                if (mode === 'evaluation' && matchedBuildings) {
                  const match = matchedBuildings.processedMatches.get(feature)
                  return getEvaluationStyle(match?.status || 'unmatchedPred')
                }
                return getBuildingStyle('processed', resolveType(feature))
              }}
              onEachFeature={(feature, layer) => {
                layer.on('click', (e) => {
                  e.originalEvent.stopPropagation()
                  let matchInfo = null
                  if (mode === 'evaluation' && matchedBuildings) {
                    const match = matchedBuildings.processedMatches.get(feature)
                    if (match) matchInfo = { status: match.status, distance: match.distance, matchedFeature: match.matchedFeature }
                  }
                  onFeatureClick(feature, e.containerPoint, matchInfo)
                })
                layer.bindTooltip(`
                  <div class="custom-tooltip">
                    <h4>Processed</h4>
                    ${applyRename(resolveType(feature), typeRenames) ? `<p>Type: ${applyRename(resolveType(feature), typeRenames)}</p>` : ''}
                    ${feature.properties?.citisketch_class !== undefined && feature.properties?.source_method ? `<p>Source Method: ${feature.properties.source_method}</p>` : ''}
                  </div>
                `, { sticky: true })
              }}
            />
          )}
        </MapContainer>

        {/* Popup for selected feature */}
        {selectedFeature && (
          <div
            className="feature-popup"
            style={{
              position: 'absolute',
              left: selectedFeature.latlng.x + 10,
              top: selectedFeature.latlng.y - 10,
              transform: 'translateY(-100%)',
              zIndex: 1001
            }}
          >
            <div className="popup-content">
              <h4>{selectedFeature.matchInfo ? 'Building Match Details' : 'Building Details'}</h4>
              {applyRename(resolveType(selectedFeature.feature), typeRenames) && (
                <div className="detail-row">
                  <span className="detail-label">Type:</span>
                  <span className="detail-value">{applyRename(resolveType(selectedFeature.feature), typeRenames)}</span>
                </div>
              )}
              {selectedFeature.feature.properties?.citisketch_class !== undefined &&
                selectedFeature.feature.properties?.source_method && (
                <div className="detail-row">
                  <span className="detail-label">Source Method:</span>
                  <span className="detail-value">{selectedFeature.feature.properties.source_method}</span>
                </div>
              )}
              {selectedFeature.matchInfo && (
                <>
                  <div className="detail-row">
                    <span className="detail-label">Status:</span>
                    <span className={`detail-value match-status ${selectedFeature.matchInfo.status}`}>
                      {selectedFeature.matchInfo.status}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Distance:</span>
                    <span className="detail-value">{selectedFeature.matchInfo.distance?.toFixed(1)} m</span>
                  </div>
                  {selectedFeature.matchInfo.matchedFeature && (
                    <>
                      {applyRename(resolveType(selectedFeature.matchInfo.matchedFeature), typeRenames) && (
                        <div className="detail-row">
                          <span className="detail-label">Matched Type:</span>
                          <span className="detail-value">{applyRename(resolveType(selectedFeature.matchInfo.matchedFeature), typeRenames)}</span>
                        </div>
                      )}
                      {selectedFeature.matchInfo.matchedFeature.properties?.citisketch_class !== undefined &&
                        selectedFeature.matchInfo.matchedFeature.properties?.source_method && (
                        <div className="detail-row">
                          <span className="detail-label">Matched Source Method:</span>
                          <span className="detail-value">{selectedFeature.matchInfo.matchedFeature.properties.source_method}</span>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
