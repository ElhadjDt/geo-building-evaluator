function FilterPanel({ types, selected, onToggle, onClear }) {
  return (
    <div className="filter-section">
      <h3>Filter by Type</h3>
      <div className="filter-buttons">
        {selected.length > 0 && (
          <button className="filter-btn" onClick={onClear}>
            Show All
          </button>
        )}
        {types.map(type => (
          <button
            key={type}
            className={`filter-btn ${selected.includes(type) ? 'active' : ''}`}
            onClick={() => onToggle(type)}
          >
            {type}
          </button>
        ))}
      </div>
    </div>
  )
}

export default FilterPanel
