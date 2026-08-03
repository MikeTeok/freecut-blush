/**
 * Mask tracking outline utilities (pure).
 *
 * Shared by the mask-tracking service and its tests. No DOM or store
 * dependencies — callers feed in pixel contours and get evenly resampled
 * closed outlines back.
 */

/** Fixed vertex count every tracked mask frame is resampled to. Kept modest so
 *  the animated path renders through the GPU path pipeline (cap 32) fallback
 *  while staying high enough to describe a real object silhouette. */
export const DEFAULT_TRACKED_PATH_VERTICES = 48

/**
 * Resample a closed outline (ordered pixel points; the last point connects back
 * to the first) to exactly `count` points uniformly distributed by arc length.
 * The first returned point corresponds to the outline's first input point, so
 * vertex 0 stays spatially stable across frames.
 */
export function sampleClosedOutlineByArcLength(
  points: ReadonlyArray<[number, number]>,
  count: number,
): Array<[number, number]> {
  if (count <= 0) return []
  if (points.length === 0) return []
  if (points.length === 1) return Array.from({ length: count }, () => points[0]!)
  if (count === 1) return [points[0]!]

  const segmentCount = points.length
  const cumulative: number[] = new Array(segmentCount + 1)
  cumulative[0] = 0
  let total = 0
  for (let i = 0; i < segmentCount; i++) {
    const a = points[i]!
    const b = points[(i + 1) % segmentCount]!
    total += Math.hypot(b[0] - a[0], b[1] - a[1])
    cumulative[i + 1] = total
  }
  if (total <= 0) return Array.from({ length: count }, () => points[0]!)

  const result: Array<[number, number]> = []
  let segmentIndex = 0
  for (let k = 0; k < count; k++) {
    const target = (total * k) / count
    while (segmentIndex < segmentCount && cumulative[segmentIndex + 1]! < target) {
      segmentIndex++
    }
    const start = cumulative[segmentIndex]!
    const end = cumulative[segmentIndex + 1]!
    const span = end - start
    const t = span <= 0 ? 0 : (target - start) / span
    const a = points[segmentIndex % segmentCount]!
    const b = points[(segmentIndex + 1) % segmentCount]!
    result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  return result
}
