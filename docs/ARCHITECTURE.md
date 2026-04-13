# Documentation

## Table of Contents

1. [Project overview](#1-project-overview)
2. [File structure](#2-file-structure)
3. [Data format](#3-data-format)
4. [How the app works](#4-how-the-app-works)
5. [Evaluation algorithm](#5-evaluation-algorithm)
6. [Component reference](#6-component-reference)
7. [Styling system](#7-styling-system)
8. [Extending the app](#8-extending-the-app)

---

## 1. Project overview

Geo Building Evaluator is a frontend-only React application. It has no backend.
You upload GeoJSON files in the browser, the app renders them on a Leaflet map, and — in evaluation mode — runs a spatial matching algorithm to compare predicted buildings against ground truth ones.

**Tech stack**

| Concern | Library |
|---|---|
| UI framework | React 18 |
| Map rendering | Leaflet 1.9 + react-leaflet 4 |
| Spatial indexing | rbush 4 |
| Build tool | Vite 5 |

---

## 2. File structure

```
src/
├── main.jsx               # React root, imports Leaflet CSS
├── App.jsx                # Application shell — state, map, layout
├── index.css              # All styles (dark theme, layout, components)
├── App.css                # Minimal app-level overrides
├── components/
│   ├── FileUpload.jsx     # Four GeoJSON file inputs
│   ├── LayerControls.jsx  # Toggle switches for each layer
│   ├── Legend.jsx         # Color legend (changes with mode)
│   ├── MetricsPanel.jsx   # Evaluation metrics table
│   └── FilterPanel.jsx    # Filter buildings by landuse type
└── utils/
    └── evaluation.js      # Matching algorithm and style functions
```

---

## 3. Data format

All files must be valid **GeoJSON FeatureCollections**.

### Buildings (ground truth and predicted)

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "landuse": "Home" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[lng, lat], [lng, lat], ...]]
      }
    }
  ]
}
```

The only property the app reads is `landuse`. Supported values: `Home`, `Residential`, `Commercial`, `Industrial`, `Public`, `Education`, `Healthcare`, `Religious` — or any custom string.

Both `Polygon` and `MultiPolygon` geometries are supported.

### Roads

```json
{
  "properties": {
    "roadType": "highway",
    "roadName": "Main Street",
    "speed": "60"
  },
  "geometry": { "type": "LineString", ... }
}
```

`roadType`, `roadName`, and `speed` are shown in the tooltip on hover.

### Water

Only geometry is used. No properties are required.

---

## 4. How the app works

### State (all in `App.jsx`)

```
roadData            → uploaded road GeoJSON
waterData           → uploaded water GeoJSON
groundTruthBuildings
predictedBuildings
layers              → { roads, water, groundTruth, predicted } — booleans
mode                → 'visualization' | 'evaluation'
selectedTypes       → array of landuse strings for the type filter
selectedFeature     → feature clicked by the user (for the popup)
```

### Visualization mode

Each dataset is rendered as a `<GeoJSON>` layer directly inside `<MapContainer>` (no base tile layer — the canvas is intentionally blank). Colors are fixed:

| Layer | Color |
|---|---|
| Ground truth buildings | Blue |
| Predicted buildings | Red |
| Roads (normal) | Grey |
| Roads (highway) | Orange |
| Water | Cyan |

### Evaluation mode

When the user switches to "Evaluate", a `useMemo` block calls `calculateBuildingMatches()`. The result is a pair of `Map` objects keyed by GeoJSON feature. Each GeoJSON layer's `style` function looks up the feature in these maps and applies the evaluation color.

### Auto-fit to data

The `<FitBounds>` component (inside `App.jsx`) uses `useMap()` to access the Leaflet map instance. Whenever any dataset changes, it builds a temporary `L.geoJSON` layer, reads its bounds, and calls `map.fitBounds()`. This keeps the view locked to your data regardless of where in the world it is.

### Click popup

Clicking a building fires `e.containerPoint` (pixel coordinates within the map div). The popup is an absolutely-positioned `div` placed at those coordinates, not a Leaflet popup — this avoids re-render issues.

---

## 5. Evaluation algorithm

All logic lives in `src/utils/evaluation.js`.

### Overview

The algorithm matches each predicted building to the nearest ground truth building using centroid distance and a spatial index. It avoids all polygon intersection operations for performance.

**Complexity:** O((n + m) log n) where n = GT buildings, m = predicted buildings.

### Step-by-step

**Step 1 — Compute centroids**

For each feature, `getFeatureCentroid()` extracts the outer ring coordinates and averages them to get a `{x, y}` point (longitude, latitude). For `MultiPolygon` features, the largest ring (by shoelace area) is used.

**Step 2 — Build R-tree index**

All GT centroids are loaded into an `RBush` spatial index. This turns nearest-neighbor lookups from O(n) scans into O(log n) range queries.

**Step 3 — Compute adaptive threshold**

Rather than a fixed distance, the threshold is derived from the data:

1. For every GT centroid, find its nearest GT neighbor using the R-tree.
2. Collect all those nearest-neighbor distances.
3. Take the **median** × 2 as the threshold.

Using the median avoids sensitivity to outliers (e.g. isolated buildings far from the cluster). The result is clamped between ~5 m and ~100 m (in degrees).

**Step 4 — Collect all candidate pairs**

For each predicted centroid, query the R-tree with a bounding box of ± threshold. For every result within the circular threshold (`distSq ≤ thresholdSq`), record a `{ predCentroid, gtCentroid, distSq }` entry. Squared distance is used throughout to avoid unnecessary `Math.sqrt` calls.

**Step 5 — Global greedy assignment**

Sort all candidate pairs by `distSq` ascending. Walk the list: if neither the predicted nor the GT building has been matched yet, assign them. Skip the pair otherwise.

This is the key difference from a naïve approach. A per-prediction greedy loop would assign buildings in iteration order, which is arbitrary. Sorting globally and picking the closest pair first produces a better overall matching.

**Step 6 — Classify and measure**

For each matched pair, compare `feature.properties.landuse`:
- Same type → `correct`
- Different type → `wrong-type`

Unmatched GT features → `unmatchedGT` (geometry has no match in predicted).  
Unmatched predicted features → `unmatchedPred` (geometry has no match in GT).

**Metrics returned:**

```
correctCount               — matched, same type
wrongTypeCount             — matched, different type
unmatchedGroundTruthCount  — GT buildings with no geometric match in predicted
unmatchedPredictedCount    — predicted buildings with no geometric match in GT
totalCount                 — correctCount + wrongTypeCount (matched buildings only)
accuracy                   — correctCount / totalCount × 100 (type accuracy for matched buildings only)
```

**Important:** `accuracy` measures **type classification accuracy only for buildings that matched geometrically**. Unmatched buildings indicate geometry mismatches between data sources, not classification errors.

### Style functions

`getBuildingStyle(source, landuse)` — returns Leaflet style for visualization mode.  
`getEvaluationStyle(status)` — returns Leaflet style based on match status:

| Status | Color | Meaning |
|---|---|---|
| `correct` | Green `#4caf50` | Matched geometry, same type |
| `wrong-type` | Orange `#ff9800` | Matched geometry, different type |
| `unmatchedPred` | Red `#f44336` | Predicted building with no GT geometry match |
| `unmatchedGT` | Blue `#2196f3` | GT building with no predicted geometry match |

---

## 6. Component reference

### `FileUpload.jsx`

Renders four `<input type="file">` elements. On change, reads the file with `FileReader`, parses JSON, validates that `type === 'FeatureCollection'`, then calls the appropriate `onXxxUpload` callback. Shows a green "Loaded" badge when a dataset is present.

Props: `roadData`, `waterData`, `groundTruthBuildings`, `predictedBuildings`, `onRoadUpload`, `onWaterUpload`, `onGroundTruthUpload`, `onPredictedUpload`.

### `LayerControls.jsx`

Renders a toggle switch for each layer that has data. Calls `onToggle(layerName)` when flipped. Only shows switches for layers that are actually loaded (controlled by `hasRoads`, `hasWater`, etc.).

### `Legend.jsx`

Renders different content depending on `mode`. In visualization mode shows source colors; in evaluation mode shows match status colors.

### `MetricsPanel.jsx`

Reads the six metrics out of the `matchedBuildings` object and renders them as labeled rows. Only rendered when `mode === 'evaluation'` and matching has run.

### `FilterPanel.jsx`

Renders one pill button per unique `landuse` value found across both building datasets. Selected types are highlighted. When types are selected, `filterBuildings()` in `App.jsx` filters the GeoJSON before passing it to the `<GeoJSON>` layer. "Show All" clears the selection.

---

## 7. Styling system

All styles are in `src/index.css` using CSS custom properties (variables) defined on `:root`.

**Key variables:**

```css
--bg-primary    #13151a   /* sidebar and page background */
--bg-secondary  #1c1f27   /* raised cards, header */
--bg-tertiary   #242830   /* inputs, toggles */
--accent        #5b8def   /* active states, primary blue */
--text-primary  #e8eaf0
--text-secondary #9198a8
--text-muted    #5c6374
--border        #2d3139
```

To change the accent color globally, update `--accent` and `--accent-dim` on `:root`.

The map canvas background is set via `.leaflet-container { background: #1e2128 }` — a dark neutral that makes colored building polygons stand out.

---

## 8. Extending the app

### Add a new data layer

1. Add a state variable and setter in `App.jsx`.
2. Add a file input in `FileUpload.jsx`.
3. Add a toggle entry in `LayerControls.jsx` (pass `hasNewLayer` prop from `App.jsx`).
4. Add a `<GeoJSON>` block inside `<MapContainer>` in `App.jsx`, gated on `layers.newLayer && newData`.
5. Add a color entry to `Legend.jsx`.

### Add a new metric

1. Compute it inside `buildResult()` in `evaluation.js` and add it to the returned object.
2. Add a `<div className="metric-item">` row in `MetricsPanel.jsx`.

### Change the matching threshold

Edit `computeAdaptiveThreshold()` in `evaluation.js`. The clamping bounds are `MIN_DEG` (≈5 m) and `MAX_DEG` (≈100 m). To use a fixed threshold instead, replace the function body with `return 0.0002` (≈22 m at the equator).
