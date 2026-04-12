function Legend({ mode }) {
  if (mode === 'visualization') {
    return (
      <div className="legend">
        <h3>Legend</h3>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#2196f3' }}></div>
          <span>Ground Truth Building</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#f44336' }}></div>
          <span>Predicted Building</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#9e9e9e' }}></div>
          <span>Road</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#4fc3f7' }}></div>
          <span>Water</span>
        </div>
      </div>
    )
  }

  return (
    <div className="legend">
      <h3>Evaluation Legend</h3>
      <div className="legend-item">
        <div className="legend-color" style={{ background: '#4caf50' }}></div>
        <span>Correct Prediction (same type, IoU &gt; 0.5)</span>
      </div>
      <div className="legend-item">
        <div className="legend-color" style={{ background: '#ff9800' }}></div>
        <span>Wrong Type (matched but different type)</span>
      </div>
      <div className="legend-item">
        <div className="legend-color" style={{ background: '#f44336' }}></div>
        <span>Extra Building (no ground truth match)</span>
      </div>
      <div className="legend-item">
        <div className="legend-color" style={{ background: '#2196f3' }}></div>
        <span>Missing Building (not detected)</span>
      </div>
    </div>
  )
}

export default Legend
