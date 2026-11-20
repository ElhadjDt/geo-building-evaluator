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
You upload GeoJSON files in the browser, the app renders them on a Leaflet map, and — in evaluation mode — runs a spatial matching algorithm to compare processed buildings against ground truth ones.

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
│   ├── FilterPanel.jsx    # Filter buildings by type
│   ├── BuildingsLayer.jsx # Building rendering, overlap order, class highlight
│   ├── RoadsLayer.jsx     # Road rendering, tooltip, road type highlight
│   └── TypeRenamePanel.jsx # Map raw type values to display names
├── hooks/
│   └── useTypeHighlight.js # Shared hover and selection highlight by type
└── utils/
    └── evaluation.js      # Matching algorithm, style functions, resolveType, applyRename
```

---

## 3. Data format

All files must be valid **GeoJSON FeatureCollections**.

### Buildings (ground truth and processed)

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
    },
    {
      "type": "Feature",
      "properties": { 
        "citisketch_class": "Residential",
        "source_method": "model_v2"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[lng, lat], [lng, lat], ...]]
      }
    }
  ]
}
```

**Building type field:** Each feature must have either a `landuse` or `citisketch_class` property (the app auto-detects which). If both are present, `citisketch_class` takes precedence. Examples: `Home`, `Residential`, `Commercial`, `Industrial`, `Public`, `Education`, `Healthcare`, `Religious` — or any custom string.

**Additional properties:** When using `citisketch_class`, you may optionally include a `source_method` property to document the classification method. This is displayed in tooltips and popups, and the collapsible "Source Methods" sidebar panel lists each method with its count of visible buildings.

Both `Polygon` and `MultiPolygon` geometries are supported.

### Roads

```json
{
  "properties": {
    "highway": "primary",
    "name": "Main Street",
    "maxspeed": "60"
  },
  "geometry": { "type": "LineString", ... }
}
```

`name`, `highway` (the road type), and `maxspeed` are shown in the tooltip on hover, read by `getRoadInfo()`. These are the OSM keys written by the AutoCalibration road pipeline. The legacy `roadName`, `roadType`, and `speed` keys are still read as fallbacks. List values (from merged OSMnx edges) are joined with commas, and a purely numeric max speed is shown in km/h.

### Water

Only geometry is used. No properties are required.

---

## 4. How the app works

### State (all in `App.jsx`)

```
roadData            → uploaded road GeoJSON
waterData           → uploaded water GeoJSON
groundTruthBuildings
processedBuildings
layers              → { roads, water, groundTruth, processed } — booleans
mode                → 'visualization' | 'evaluation'
selectedTypes       → array of building type strings for the type filter
typeRenames         → { rawType: displayName } — user-defined rename mappings
selectedFeature     → feature clicked by the user (for the popup)
selectedRoadType    → road type kept highlighted after a road click
```

### Visualization mode

Water is rendered as a `<GeoJSON>` layer directly inside `<MapContainer>`, roads by `<RoadsLayer>`, and both building datasets together by `<BuildingsLayer>` (no base tile layer, the canvas is intentionally blank). Colors are fixed:

| Layer | Color |
|---|---|
| Ground truth buildings | Blue |
| Processed buildings | Red |
| Roads | Grey |
| Water | Cyan |

### Evaluation mode

When the user switches to "Evaluate", a `useMemo` block calls `calculateBuildingMatches()`. The result is a pair of `Map` objects keyed by GeoJSON feature. The `style` function in `BuildingsLayer` looks up the feature in these maps and applies the evaluation color.

### Auto-fit to data

The `<FitBounds>` component (inside `App.jsx`) uses `useMap()` to access the Leaflet map instance. Whenever any dataset changes, it builds a temporary `L.geoJSON` layer, reads its bounds, and calls `map.fitBounds()`. This keeps the view locked to your data regardless of where in the world it is.

### Click popup

Clicking a building fires `e.containerPoint` (pixel coordinates within the map div). The popup is an absolutely-positioned `div` placed at those coordinates, not a Leaflet popup, which avoids re-render issues. Clicking the empty map closes it.

### Overlapping buildings

`visibleBuildings` in `App.jsx` merges the visible, filtered buildings from both datasets and sorts them by `getFeatureArea()`, largest first. Paint order follows that order, so a small polygon always sits above a larger one and both can be clicked. Polygons with identical footprints have equal area, so only the top one (processed) is clickable.

### Class highlight

Hovering a building highlights every building of the same class, across both datasets and in both modes, using the renamed type. Clicking a building keeps its class highlighted until another building or the empty map is clicked. Buildings with no type don't trigger a highlight.

The tooltip and click popup show how many buildings are in the class, labelled `Class Count`. `classCounts` in `App.jsx` counts the visible buildings, so the number matches what is highlighted and changes with layer toggles, filters, and renames.

### Road type highlight

Hovering a road highlights every road of the same type (the `highway` value from `getRoadInfo()`). Clicking a road keeps its type highlighted until another road, a building, or the empty map is clicked. Only one selection exists at a time: clicking a road closes the building popup, and clicking a building clears the road selection. Roads with no type don't trigger a highlight.

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

For each processed centroid, query the R-tree with a bounding box of ± threshold. For every result within the circular threshold (`distSq ≤ thresholdSq`), record a `{ processedCentroid, gtCentroid, distSq }` entry. Squared distance is used throughout to avoid unnecessary `Math.sqrt` calls.

**Step 5 — Global greedy assignment**

Sort all candidate pairs by `distSq` ascending. Walk the list: if neither the processed nor the GT building has been matched yet, assign them. Skip the pair otherwise.

This is the key difference from a naïve approach. A per-processed greedy loop would assign buildings in iteration order, which is arbitrary. Sorting globally and picking the closest pair first produces a better overall matching.

**Step 6 — Classify and measure**

For each matched pair, resolve the type from either `landuse` or `citisketch_class` (whichever is present; `citisketch_class` takes precedence), then compare:
- Same type → `correct`
- Different type → `wrong-type`

Unmatched GT features → `unmatchedGT` (geometry has no match in processed).  
Unmatched processed features → `unmatchedPred` (geometry has no match in GT).

**Metrics returned:**

```
correctCount               — matched, same type
wrongTypeCount             — matched, different type
unmatchedGroundTruthCount  — GT buildings with no geometric match in processed
unmatchedProcessedCount    — processed buildings with no geometric match in GT
totalCount                 — correctCount + wrongTypeCount (matched buildings only)
accuracy                   — correctCount / totalCount × 100 (type accuracy for matched buildings only)
```

**Important:** `accuracy` measures **type classification accuracy only for buildings that matched geometrically**. Unmatched buildings indicate geometry mismatches between data sources, not classification errors.

### Utility functions

`resolveType(feature)` — extracts the building type from a feature. Returns `citisketch_class` if present, otherwise falls back to `landuse`. Returns `undefined` if neither property exists.

`applyRename(type, renames)` — maps a raw type string through the user-defined rename table. Returns the display name if a mapping exists, otherwise returns the original type unchanged.

Both functions are exported from `evaluation.js` and used in `App.jsx` wherever a type value is read.

### Style functions

`getBuildingStyle(source, type)` — returns Leaflet style for visualization mode. `type` is the resolved value from `resolveType()`.  
`getEvaluationStyle(status)` — returns Leaflet style based on match status:

| Status | Color | Meaning |
|---|---|---|
| `correct` | Green `#4caf50` | Matched geometry, same type |
| `wrong-type` | Orange `#ff9800` | Matched geometry, different type |
| `unmatchedPred` | Red `#f44336` | Processed building with no GT geometry match |
| `unmatchedGT` | Blue `#2196f3` | GT building with no processed geometry match |

`HIGHLIGHT_STYLE`: style overrides for highlighted buildings and roads, a yellow outline with a stronger fill, keeping the fill color so source or match status stays readable.

---

## 6. Component reference

### `FileUpload.jsx`

Renders four `<input type="file">` elements. On change, reads the file with `FileReader`, parses JSON, validates that `type === 'FeatureCollection'`, then calls the appropriate `onXxxUpload` callback. Shows a green "Loaded" badge when a dataset is present.

Props: `roadData`, `waterData`, `groundTruthBuildings`, `processedBuildings`, `onRoadUpload`, `onWaterUpload`, `onGroundTruthUpload`, `onProcessedUpload`.

### `LayerControls.jsx`

Renders a toggle switch for each layer that has data. Calls `onToggle(layerName)` when flipped. Only shows switches for layers that are actually loaded (controlled by `hasRoads`, `hasWater`, etc.).

### `Legend.jsx`

Renders different content depending on `mode`. In visualization mode shows source colors; in evaluation mode shows match status colors.

### `MetricsPanel.jsx`

Reads the six metrics out of the `matchedBuildings` object and renders them as labeled rows. Only rendered when `mode === 'evaluation'` and matching has run.

### `FilterPanel.jsx`

Renders one pill button per unique building type value found across both building datasets (from either `landuse` or `citisketch_class` fields). Selected types are highlighted. When types are selected, the `visibleBuildings` memo in `App.jsx` filters the features before passing them to `BuildingsLayer`. "Show All" clears the selection.

### `BuildingsLayer.jsx`

Renders both building datasets as one `L.geoJSON` layer in a dedicated `buildings` pane above roads and water, and handles building tooltips, clicks, and the class highlight. It manages Leaflet directly and renders nothing itself, because react-leaflet's `<GeoJSON>` never updates its `data`, and its `style` prop would overwrite highlights on each render. The layer is rebuilt when the buildings, matches, or renames change. Hover restyles paths without touching React state, so `App` doesn't re-render on mouse movement. Never call `bringToFront` on these layers, since it would break the overlap order.

Props: `buildings`, `matchedBuildings`, `typeRenames`, `classCounts`, `selectedType`, `onFeatureClick`.

### `RoadsLayer.jsx`

Renders the road network as one `L.geoJSON` layer in the default overlay pane, below the buildings, with a fixed grey style. Binds the name, type, and max speed tooltip and reports road clicks to `App` with the road's type. Like `BuildingsLayer`, it manages Leaflet directly so highlights survive re-renders, and it is rebuilt when a new road file is loaded.

Props: `roads`, `selectedType`, `onRoadClick`.

### `useTypeHighlight.js`

Hook shared by `BuildingsLayer` and `RoadsLayer`. It returns `attach(geoJson, getType)`, which groups an `L.geoJSON` layer's paths by type, binds hover handlers that apply `HIGHLIGHT_STYLE` to every path of the hovered type, and falls back to the hook's `selectedType` when nothing is hovered. A short delay on mouseout avoids flicker when moving between features. Hover restyles paths without touching React state.

### `TypeRenamePanel.jsx`

Lets the user define display-name aliases for raw type values found in the GeoJSON. Each rename maps a raw string (e.g. `"Home"`) to a display name (e.g. `"Residential"`). Renames are applied everywhere a type is shown — tooltips, popups, the filter panel, and evaluation matching — via `applyRename()` in `evaluation.js`. The active rename map lives in `typeRenames` state in `App.jsx` and is passed down as a prop.

Props: `renames` (current `{ rawType: displayName }` map), `onAdd(from, to)`, `onRemove(from)`.

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
