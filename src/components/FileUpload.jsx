import { useRef } from 'react'

function FileUpload({
  roadData,
  waterData,
  groundTruthBuildings,
  predictedBuildings,
  onRoadUpload,
  onWaterUpload,
  onGroundTruthUpload,
  onPredictedUpload
}) {
  const roadInputRef = useRef(null)
  const waterInputRef = useRef(null)
  const groundTruthInputRef = useRef(null)
  const predictedInputRef = useRef(null)

  const parseGeoJSON = (file, callback) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result)
        if (data.type !== 'FeatureCollection') {
          alert('Invalid GeoJSON: Must be a FeatureCollection')
          return
        }
        callback(data)
      } catch (err) {
        alert('Invalid GeoJSON file: ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  const handleFileChange = (e, callback) => {
    const file = e.target.files?.[0]
    if (file) {
      parseGeoJSON(file, callback)
    }
  }

  return (
    <div className="upload-section">
      <h3>Data Upload</h3>

      <div className="upload-item">
        <label>Road Data</label>
        <div className="file-input-wrapper">
          <input
            ref={roadInputRef}
            type="file"
            accept=".geojson,.json"
            onChange={(e) => handleFileChange(e, onRoadUpload)}
          />
          {roadData && <span className="file-status">Loaded</span>}
        </div>
      </div>

      <div className="upload-item">
        <label>Water Data</label>
        <div className="file-input-wrapper">
          <input
            ref={waterInputRef}
            type="file"
            accept=".geojson,.json"
            onChange={(e) => handleFileChange(e, onWaterUpload)}
          />
          {waterData && <span className="file-status">Loaded</span>}
        </div>
      </div>

      <div className="upload-item">
        <label>Ground Truth Buildings</label>
        <div className="file-input-wrapper">
          <input
            ref={groundTruthInputRef}
            type="file"
            accept=".geojson,.json"
            onChange={(e) => handleFileChange(e, onGroundTruthUpload)}
          />
          {groundTruthBuildings && <span className="file-status">Loaded</span>}
        </div>
      </div>

      <div className="upload-item">
        <label>Predicted Buildings</label>
        <div className="file-input-wrapper">
          <input
            ref={predictedInputRef}
            type="file"
            accept=".geojson,.json"
            onChange={(e) => handleFileChange(e, onPredictedUpload)}
          />
          {predictedBuildings && <span className="file-status">Loaded</span>}
        </div>
      </div>
    </div>
  )
}

export default FileUpload
