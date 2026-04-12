function LayerControls({ layers, onToggle, hasRoads, hasWater, hasGroundTruth, hasPredicted }) {
  return (
    <div className="layer-toggles">
      <h3>Layers</h3>

      {hasWater && (
        <div className="layer-item">
          <label className="layer-label">
            <div className="layer-color" style={{ background: '#4fc3f7' }}></div>
            Water
          </label>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={layers.water}
              onChange={() => onToggle('water')}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      )}

      {hasRoads && (
        <div className="layer-item">
          <label className="layer-label">
            <div className="layer-color" style={{ background: '#9e9e9e' }}></div>
            Roads
          </label>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={layers.roads}
              onChange={() => onToggle('roads')}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      )}

      {hasGroundTruth && (
        <div className="layer-item">
          <label className="layer-label">
            <div className="layer-color" style={{ background: '#2196f3' }}></div>
            Ground Truth
          </label>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={layers.groundTruth}
              onChange={() => onToggle('groundTruth')}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      )}

      {hasPredicted && (
        <div className="layer-item">
          <label className="layer-label">
            <div className="layer-color" style={{ background: '#f44336' }}></div>
            Predicted
          </label>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={layers.predicted}
              onChange={() => onToggle('predicted')}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      )}
    </div>
  )
}

export default LayerControls
