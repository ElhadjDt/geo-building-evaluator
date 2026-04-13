import RBush from 'rbush'

/**
 * Calculate centroid of a polygon using simple vertex average
 * @param {Array} coords - Array of [lng, lat] coordinates
 * @returns {Object|null} Centroid {x, y} or null
 */
function calculateCentroid(coords) {
  if (!coords || coords.length < 3) return null

  let sumX = 0, sumY = 0
  let count = 0

  for (const point of coords) {
    // Guard against malformed coordinate pairs
    if (!Array.isArray(point) || point.length < 2) continue
    const x = point[0], y = point[1]
    if (!isFinite(x) || !isFinite(y)) continue
    sumX += x
    sumY += y
    count++
  }

  if (count < 3) return null

  return { x: sumX / count, y: sumY / count }
}

/**
 * Simple shoelace polygon area (for finding largest ring in MultiPolygon)
 * @param {Array} coords - Polygon ring coordinates
 * @returns {number} Absolute area magnitude
 */
function polygonAreaSimple(coords) {
  if (!coords || coords.length < 3) return 0

  let area = 0
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length
    area += coords[i][0] * coords[j][1]
    area -= coords[j][0] * coords[i][1]
  }

  return Math.abs(area) / 2
}

/**
 * Get centroid from a GeoJSON feature (Polygon or MultiPolygon)
 * @param {Object} feature - GeoJSON feature
 * @returns {Object|null} Centroid {x, y} or null
 */
function getFeatureCentroid(feature) {
  if (!feature?.geometry) return null

  const geom = feature.geometry

  if (geom.type === 'Polygon') {
    const ring = geom.coordinates?.[0]
    return ring ? calculateCentroid(ring) : null
  }

  if (geom.type === 'MultiPolygon') {
    // Use centroid of the largest polygon ring
    let largestRing = null
    let largestArea = 0

    for (const poly of (geom.coordinates || [])) {
      const ring = poly?.[0]
      if (!ring) continue
      const area = polygonAreaSimple(ring)
      if (area > largestArea) {
        largestArea = area
        largestRing = ring
      }
    }

    return largestRing ? calculateCentroid(largestRing) : null
  }

  return null
}

/**
 * Squared Euclidean distance — avoids sqrt, used for all comparisons
 */
function squaredDistance(x1, y1, x2, y2) {
  const dx = x1 - x2
  const dy = y1 - y2
  return dx * dx + dy * dy
}

/**
 * Compute an adaptive distance threshold from the GT centroid set.
 *
 * Strategy: for each GT centroid we find its nearest GT neighbor in the
 * R-tree; we take the median of those distances and multiply by 2.
 * Using median rather than mean avoids outlier sensitivity.
 *
 * Falls back to a safe hard-coded default when the dataset is too small
 * to produce a meaningful estimate.
 *
 * @param {Array} gtCentroids - Array of {x, y} centroid objects
 * @param {Object} gtIndex    - Pre-built RBush index over gtCentroids
 * @returns {number} Threshold in degrees (NOT squared)
 */
function computeAdaptiveThreshold(gtCentroids, gtIndex) {
  const FALLBACK = 0.0002 // ~22 m at equator

  if (gtCentroids.length < 2) return FALLBACK

  // Search window slightly larger than a typical building spacing
  const SEARCH_WINDOW = 0.005 // ~550 m — generous upper bound

  const nearestDistances = []

  for (const c of gtCentroids) {
    const results = gtIndex.search({
      minX: c.x - SEARCH_WINDOW,
      minY: c.y - SEARCH_WINDOW,
      maxX: c.x + SEARCH_WINDOW,
      maxY: c.y + SEARCH_WINDOW
    })

    let minDistSq = Infinity
    for (const item of results) {
      const g = item.centroid
      if (g === c) continue // skip self
      const d = squaredDistance(c.x, c.y, g.x, g.y)
      if (d < minDistSq) minDistSq = d
    }

    if (isFinite(minDistSq)) nearestDistances.push(Math.sqrt(minDistSq))
  }

  if (nearestDistances.length === 0) return FALLBACK

  // Median nearest-neighbor distance × 2
  nearestDistances.sort((a, b) => a - b)
  const median = nearestDistances[Math.floor(nearestDistances.length / 2)]
  const threshold = median * 2

  // Clamp: never below ~5 m or above ~100 m (in degrees at equator)
  const MIN_DEG = 0.00005
  const MAX_DEG = 0.001
  return Math.max(MIN_DEG, Math.min(MAX_DEG, threshold))
}

/**
 * Get style for building based on source and landuse
 * @param {string} source  - 'groundTruth' or 'predicted'
 * @param {string} landuse - Building type
 * @returns {Object} Leaflet style object
 */
export function getBuildingStyle(source, landuse) {
  const baseColor = source === 'groundTruth' ? '#2196f3' : '#f44336'

  const opacityMap = {
    'Home': 0.7,
    'Residential': 0.7,
    'Commercial': 0.6,
    'Industrial': 0.5,
    'Public': 0.6,
    'Education': 0.6,
    'Healthcare': 0.6,
    'Religious': 0.5
  }

  return {
    color: baseColor,
    fillColor: baseColor,
    fillOpacity: opacityMap[landuse] || 0.6,
    weight: 1,
    opacity: 0.9
  }
}

/**
 * Get style for evaluation mode
 * @param {string} status - 'correct' | 'wrong-type' | 'unmatchedPred' | 'unmatchedGT'
 * @returns {Object} Leaflet style object
 */
export function getEvaluationStyle(status) {
  const colorMap = {
    'correct': '#4caf50',
    'wrong-type': '#ff9800',
    'unmatchedPred': '#f44336',
    'unmatchedGT': '#2196f3'
  }

  return {
    color: colorMap[status],
    fillColor: colorMap[status],
    fillOpacity: status === 'missing' ? 0.4 : 0.6,
    weight: status === 'missing' ? 2 : 1,
    opacity: 0.9,
    dashArray: status === 'missing' ? '5, 5' : null
  }
}

/**
 * Centroid-based building matching with global greedy assignment.
 *
 * Algorithm:
 *  1. Compute centroids for all GT and predicted buildings          O(n + m)
 *  2. Build R-tree over GT centroids                                O(n log n)
 *  3. Compute adaptive distance threshold from GT nearest-neighbors O(n log n)
 *  4. For every predicted centroid query candidates within threshold O(m log n)
 *  5. Accumulate ALL (pred, gt, distSq) candidate pairs
 *  6. Sort ALL candidates by distance ascending                     O(k log k)
 *  7. Greedy globally-optimal assignment:
 *       pick smallest distance first; skip if pred or gt is taken   O(k)
 *  8. Compute metrics
 *
 * Global greedy (step 6-7) avoids order-dependent bias of the original
 * per-prediction greedy loop and produces a better overall matching.
 *
 * @param {Object} groundTruth - Ground truth GeoJSON FeatureCollection
 * @param {Object} predicted   - Predicted GeoJSON FeatureCollection
 * @returns {Object} Match results and metrics
 */
export function calculateBuildingMatches(groundTruth, predicted) {
  const gtFeatures = groundTruth?.features || []
  const predFeatures = predicted?.features || []

  // --- Step 1: Compute centroids ---

  const gtCentroids = []
  for (const feature of gtFeatures) {
    const c = getFeatureCentroid(feature)
    if (c) {
      c.feature = feature
      gtCentroids.push(c)
    }
  }

  const predCentroids = []
  for (const feature of predFeatures) {
    const c = getFeatureCentroid(feature)
    if (c) {
      c.feature = feature
      predCentroids.push(c)
    }
  }

  // Initialise match records for all valid features
  const groundTruthMatches = new Map()
  const predictedMatches = new Map()

  for (const c of gtCentroids) {
    groundTruthMatches.set(c.feature, { status: 'unmatchedGT', distance: Infinity, matchedFeature: null })
  }
  for (const c of predCentroids) {
    predictedMatches.set(c.feature, { status: 'unmatchedPred', distance: Infinity, matchedFeature: null })
  }

  // Edge case: nothing to match
  if (gtCentroids.length === 0 || predCentroids.length === 0) {
    return buildResult(groundTruthMatches, predictedMatches, gtCentroids.length, predCentroids.length)
  }

  // --- Step 2: Build R-tree over GT centroids ---

  const gtIndex = new RBush()
  gtIndex.load(gtCentroids.map(c => ({
    minX: c.x,
    minY: c.y,
    maxX: c.x,
    maxY: c.y,
    centroid: c
  })))

  // --- Step 3: Adaptive threshold ---

  const threshold = computeAdaptiveThreshold(gtCentroids, gtIndex)
  const thresholdSq = threshold * threshold

  // --- Step 4 + 5: Collect ALL candidate pairs ---

  // Each entry: { predCentroid, gtCentroid, distSq }
  const candidates = []

  for (const predC of predCentroids) {
    const bbox = {
      minX: predC.x - threshold,
      minY: predC.y - threshold,
      maxX: predC.x + threshold,
      maxY: predC.y + threshold
    }

    const nearby = gtIndex.search(bbox)
    for (const item of nearby) {
      const gtC = item.centroid
      const distSq = squaredDistance(predC.x, predC.y, gtC.x, gtC.y)

      // Confirm within circular threshold (bbox is a square approximation)
      if (distSq <= thresholdSq) {
        candidates.push({ predCentroid: predC, gtCentroid: gtC, distSq })
      }
    }
  }

  // --- Step 6: Sort by distance ascending ---
  candidates.sort((a, b) => a.distSq - b.distSq)

  // --- Step 7: Global greedy assignment ---

  const matchedGt = new Set()
  const matchedPred = new Set()

  for (const { predCentroid, gtCentroid, distSq } of candidates) {
    const predFeature = predCentroid.feature
    const gtFeature = gtCentroid.feature

    // Skip if either is already matched
    if (matchedPred.has(predFeature) || matchedGt.has(gtFeature)) continue

    matchedPred.add(predFeature)
    matchedGt.add(gtFeature)

    const gtType = gtFeature.properties?.landuse
    const predType = predFeature.properties?.landuse
    const status = gtType === predType ? 'correct' : 'wrong-type'

    // Convert to approximate metres only at record time (single sqrt per match)
    const distMeters = Math.sqrt(distSq) * 111000

    groundTruthMatches.set(gtFeature, { status, distance: distMeters, matchedFeature: predFeature })
    predictedMatches.set(predFeature, { status, distance: distMeters, matchedFeature: gtFeature })
  }

  // --- Step 8: Metrics ---
  return buildResult(groundTruthMatches, predictedMatches, gtCentroids.length, predCentroids.length)
}

/**
 * Aggregate match maps into the result object returned to callers.
 * @param {Map} groundTruthMatches
 * @param {Map} predictedMatches
 * @param {number} gtTotal  - GT features with valid centroids
 * @param {number} predTotal - Pred features with valid centroids
 * @returns {Object}
 */
function buildResult(groundTruthMatches, predictedMatches, gtTotal, predTotal) {
  let correctCount = 0
  let wrongTypeCount = 0
  let unmatchedGroundTruthCount = 0
  let unmatchedPredictedCount = 0

  for (const match of groundTruthMatches.values()) {
    if (match.status === 'correct') correctCount++
    else if (match.status === 'wrong-type') wrongTypeCount++
    else if (match.status === 'unmatchedGT') unmatchedGroundTruthCount++
  }

  for (const match of predictedMatches.values()) {
    if (match.status === 'unmatchedPred') unmatchedPredictedCount++
  }

  const totalCount = correctCount + wrongTypeCount
  const accuracy = totalCount > 0 ? (correctCount / totalCount) * 100 : 0

  return {
    groundTruthMatches,
    predictedMatches,
    correctCount,
    wrongTypeCount,
    unmatchedGroundTruthCount,
    unmatchedPredictedCount,
    totalCount,
    accuracy
  }
}
