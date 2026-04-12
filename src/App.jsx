import { useState, useMemo, useEffect } from 'react'
import { MapContainer, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import FileUpload from './components/FileUpload'
import LayerControls from './components/LayerControls'
import Legend from './components/Legend'
import MetricsPanel from './components/MetricsPanel'
import FilterPanel from './components/FilterPanel'
import { calculateBuildingMatches, getBuildingStyle, getEvaluationStyle } from './utils/evaluation'
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
  const [predictedBuildings, setPredictedBuildings] = useState(null)

  // Layer visibility state
  const [layers, setLayers] = useState({
    roads: true,
    water: true,
    groundTruth: true,
    predicted: true
  })

  // Filter state
  const [selectedTypes, setSelectedTypes] = useState([])

  // Popup state
  const [selectedFeature, setSelectedFeature] = useState(null)

  // Calculate building matches when in evaluation mode
  const matchedBuildings = useMemo(() => {
    if (mode !== 'evaluation' || !groundTruthBuildings || !predictedBuildings) {
      return null
    }
    return calculateBuildingMatches(groundTruthBuildings, predictedBuildings)
  }, [mode, groundTruthBuildings, predictedBuildings])

  // Collect all datasets for FitBounds
  const allDatasets = useMemo(
    () => [roadData, waterData, groundTruthBuildings, predictedBuildings],
    [roadData, waterData, groundTruthBuildings, predictedBuildings]
  )

  // Get all building types for filtering
  const buildingTypes = useMemo(() => {
    const types = new Set()
    groundTruthBuildings?.features?.forEach(f => { if (f.properties?.landuse) types.add(f.properties.landuse) })
    predictedBuildings?.features?.forEach(f => { if (f.properties?.landuse) types.add(f.properties.landuse) })
    return Array.from(types).sort()
  }, [groundTruthBuildings, predictedBuildings])

  const filterBuildings = (data) => {
    if (!data || selectedTypes.length === 0) return data
    return {
      ...data,
      features: data.features.filter(f =>
        !f.properties?.landuse || selectedTypes.includes(f.properties.landuse)
      )
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
          <p>Compare predicted vs ground truth data</p>
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
            predictedBuildings={predictedBuildings}
            onRoadUpload={setRoadData}
            onWaterUpload={setWaterData}
            onGroundTruthUpload={setGroundTruthBuildings}
            onPredictedUpload={setPredictedBuildings}
          />

          {/* Layer Controls */}
          <LayerControls
            layers={layers}
            onToggle={toggleLayer}
            hasRoads={!!roadData}
            hasWater={!!waterData}
            hasGroundTruth={!!groundTruthBuildings}
            hasPredicted={!!predictedBuildings}
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
        </div>
      </div>

      {/* Map */}
      <div className="map-container">
        {!roadData && !waterData && !groundTruthBuildings && !predictedBuildings && (
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
                  if (match?.status === 'unmatched') return getEvaluationStyle('missing')
                  return getEvaluationStyle(match?.status || 'missing')
                }
                return getBuildingStyle('groundTruth', feature.properties?.landuse)
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
                    <p>Type: ${feature.properties?.landuse || 'Unknown'}</p>
                  </div>
                `, { sticky: true })
              }}
            />
          )}

          {/* Predicted Buildings */}
          {layers.predicted && predictedBuildings && (
            <GeoJSON
              key={mode + '-pred-' + (matchedBuildings ? 'eval' : 'vis')}
              data={filterBuildings(predictedBuildings)}
              style={(feature) => {
                if (mode === 'evaluation' && matchedBuildings) {
                  const match = matchedBuildings.predictedMatches.get(feature)
                  if (match?.status === 'unmatched') return getEvaluationStyle('extra')
                  if (match?.status === 'wrong-type') return getEvaluationStyle('wrong-type')
                  return getEvaluationStyle('correct')
                }
                return getBuildingStyle('predicted', feature.properties?.landuse)
              }}
              onEachFeature={(feature, layer) => {
                layer.on('click', (e) => {
                  e.originalEvent.stopPropagation()
                  let matchInfo = null
                  if (mode === 'evaluation' && matchedBuildings) {
                    const match = matchedBuildings.predictedMatches.get(feature)
                    if (match) matchInfo = { status: match.status, distance: match.distance, matchedFeature: match.matchedFeature }
                  }
                  onFeatureClick(feature, e.containerPoint, matchInfo)
                })
                layer.bindTooltip(`
                  <div class="custom-tooltip">
                    <h4>Predicted</h4>
                    <p>Type: ${feature.properties?.landuse || 'Unknown'}</p>
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
              <div className="detail-row">
                <span className="detail-label">Type:</span>
                <span className="detail-value">{selectedFeature.feature.properties?.landuse || 'Unknown'}</span>
              </div>
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
                    <div className="detail-row">
                      <span className="detail-label">Matched Type:</span>
                      <span className="detail-value">{selectedFeature.matchInfo.matchedFeature.properties?.landuse || 'Unknown'}</span>
                    </div>
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
