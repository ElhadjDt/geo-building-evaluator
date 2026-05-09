import { useRef } from 'react'

function FileUpload({
  roadData,
  waterData,
  groundTruthBuildings,
  processedBuildings,
  onRoadUpload,
  onWaterUpload,
  onGroundTruthUpload,
  onProcessedUpload
}) {
  const roadInputRef = useRef(null)
  const waterInputRef = useRef(null)
  const groundTruthInputRef = useRef(null)
  const processedInputRef = useRef(null)

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
        <label>Processed Buildings</label>
        <div className="file-input-wrapper">
          <input
            ref={processedInputRef}
            type="file"
            accept=".geojson,.json"
            onChange={(e) => handleFileChange(e, onProcessedUpload)}
          />
          {processedBuildings && <span className="file-status">Loaded</span>}
        </div>
      </div>
    </div>
  )
}

export default FileUpload
