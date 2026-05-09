function MetricsPanel({ matchedBuildings }) {
  const {
    correctCount,
    wrongTypeCount,
    unmatchedGroundTruthCount,
    unmatchedProcessedCount,
    totalCount,
    accuracy
  } = matchedBuildings

  return (
    <div className="metrics-section">
      <h3>Evaluation Metrics</h3>

      <div className="metric-item">
        <span>Total Matched</span>
        <span className="metric-value">{totalCount}</span>
      </div>

      <div className="metric-item">
        <span>Correct Type Matches</span>
        <span className="metric-value" style={{ color: '#4caf50' }}>{correctCount}</span>
      </div>

      <div className="metric-item">
        <span>Wrong Type</span>
        <span className="metric-value" style={{ color: '#ff9800' }}>{wrongTypeCount}</span>
      </div>

      <div className="metric-item">
        <span>Unmatched Ground Truth</span>
        <span className="metric-value" style={{ color: '#2196f3' }}>{unmatchedGroundTruthCount}</span>
      </div>

      <div className="metric-item">
        <span>Unmatched Processed</span>
        <span className="metric-value" style={{ color: '#f44336' }}>{unmatchedProcessedCount}</span>
      </div>

      <div className="metric-item">
        <span>Type Accuracy</span>
        <span className="metric-value">{accuracy.toFixed(1)}%</span>
      </div>
    </div>
  )
}

export default MetricsPanel
