/**
 * Mask bitmap tracer.
 *
 * Converts a MobileSAM segmentation bitmap (alpha channel) into normalized
 * `MaskVertex[]` suitable for a `shapeType === 'path'` ShapeItem. Uses
 * marching squares to extract the boundary contour, then Ramer–Douglas–Peucker
 * to simplify the polyline so the result is tractable in the path editor.
 *
 * Pure module: no DOM/canvas dependencies — callers pass the raw RGBA data.
 */

import type { MaskVertex } from '@/types/masks'

export interface MaskBitmapSource {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** Pixels with alpha at or below this value are treated as background. */
export const DEFAULT_MASK_ALPHA_THRESHOLD = 32
/** Simplification tolerance in source pixels. */
export const DEFAULT_MASK_TRACE_TOLERANCE_PX = 1.5
/** Upper bound on the number of vertices produced. */
export const DEFAULT_MASK_MAX_VERTICES = 600

export interface MaskTraceOptions {
  alphaThreshold?: number
  tolerancePx?: number
  maxVertices?: number
}

// Marching squares lookup. A square's case is a 4-bit mask of its foreground
// corners: BL=1, BR=2, TR=4, TL=8. Each entry lists the boundary segments the
// square contributes as pairs of edge indices:
//   0 = bottom (between BL and BR)
//   1 = right  (between BR and TR)
//   2 = top    (between TR and TL)
//   3 = left   (between TL and BL)
// A boundary crosses an edge exactly when that edge's two corners differ, and
// consecutive crossings around the square are joined into segments.
const MARCHING_SQUARES_TABLE: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [],
  [[0, 3]], // 1  BL
  [[0, 1]], // 2  BR
  [[3, 1]], // 3  BL+BR
  [[1, 2]], // 4  TR
  [
    [0, 3],
    [1, 2],
  ], // 5  BL+TR (saddle)
  [[0, 2]], // 6  BR+TR
  [[3, 2]], // 7  BL+BR+TR
  [[2, 3]], // 8  TL
  [[0, 2]], // 9  BL+TL
  [
    [0, 1],
    [3, 2],
  ], // 10 BR+TL (saddle)
  [[1, 2]], // 11 BL+BR+TL
  [[3, 1]], // 12 TR+TL
  [[0, 1]], // 13 BL+TR+TL
  [[0, 3]], // 14 BR+TR+TL
  [],
]

/**
 * Crossing point of a boundary segment with a square edge, in half-pixel units
 * so coordinates stay integers (safe as map keys). Convert to pixels by /2.
 */
function edgeCrossing(squareX: number, squareY: number, edge: number): [number, number] {
  switch (edge) {
    case 0:
      return [squareX * 2 + 1, squareY * 2]
    case 1:
      return [squareX * 2 + 2, squareY * 2 + 1]
    case 2:
      return [squareX * 2 + 1, squareY * 2 + 2]
    default:
      return [squareX * 2, squareY * 2 + 1]
  }
}

function squaredDistance(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}

function perpendicularDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared
  const projectionX = a[0] + t * dx
  const projectionY = a[1] + t * dy
  return Math.hypot(p[0] - projectionX, p[1] - projectionY)
}

/** Ramer–Douglas–Peucker simplification of an open polyline. */
export function simplifyPolyline(
  points: ReadonlyArray<[number, number]>,
  tolerancePx: number,
): Array<[number, number]> {
  if (points.length <= 2) return [...points]
  let maxDistance = 0
  let index = -1
  const first = points[0]!
  const last = points[points.length - 1]!
  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i]!, first, last)
    if (distance > maxDistance) {
      maxDistance = distance
      index = i
    }
  }
  if (maxDistance <= tolerancePx) return [first, last]
  const left = simplifyPolyline(points.slice(0, index + 1), tolerancePx)
  const right = simplifyPolyline(points.slice(index), tolerancePx)
  return left.slice(0, -1).concat(right)
}

/** Simplify a closed loop (implicitly connected end-to-start). */
export function simplifyRing(
  points: ReadonlyArray<[number, number]>,
  tolerancePx: number,
): Array<[number, number]> {
  if (points.length <= 3) return [...points]

  // Split the ring at an approximate diameter so each half is an open
  // polyline with distinct endpoints (RDP on a closed chain where the first
  // and last points coincide collapses incorrectly).
  let indexA = 0
  let farthestFromStart = 0
  for (let i = 1; i < points.length; i++) {
    if (
      squaredDistance(points[i]!, points[0]!) >
      squaredDistance(points[farthestFromStart]!, points[0]!)
    ) {
      farthestFromStart = i
    }
  }
  indexA = farthestFromStart
  let indexB = indexA
  for (let i = 0; i < points.length; i++) {
    if (
      squaredDistance(points[i]!, points[indexA]!) >
      squaredDistance(points[indexB]!, points[indexA]!)
    ) {
      indexB = i
    }
  }

  const chainA: Array<[number, number]> = []
  const chainB: Array<[number, number]> = []
  for (let step = 0; step <= points.length; step++) {
    const index = (indexA + step) % points.length
    chainA.push(points[index]!)
    if (index === indexB) break
  }
  for (let step = 0; step <= points.length; step++) {
    const index = (indexB + step) % points.length
    chainB.push(points[index]!)
    if (index === indexA) break
  }

  const simplifiedA = simplifyPolyline(chainA, tolerancePx)
  const simplifiedB = simplifyPolyline(chainB, tolerancePx)
  let result = simplifiedA.slice(0, -1).concat(simplifiedB)

  if (result.length < 3) return result
  const deduped: Array<[number, number]> = []
  for (const point of result) {
    const previous = deduped[deduped.length - 1]
    if (previous && previous[0] === point[0] && previous[1] === point[1]) continue
    deduped.push(point)
  }
  // The split re-visits the start point at the end; drop it so the ring is an
  // open list whose last point implicitly closes back to the first.
  const first = deduped[0]
  const last = deduped[deduped.length - 1]
  if (deduped.length > 1 && first && last && first[0] === last[0] && first[1] === last[1]) {
    deduped.pop()
  }
  return deduped
}

/**
 * Extract the largest boundary contour of the foreground mask as an ordered
 * list of pixel-coordinate points. The returned list is open; its last point
 * connects back to the first to close the loop.
 */
export function traceMaskContourPixels(
  source: MaskBitmapSource,
  alphaThreshold = DEFAULT_MASK_ALPHA_THRESHOLD,
): Array<[number, number]> {
  const { width, height, data } = source
  if (width <= 0 || height <= 0) return []
  const isForeground = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false
    return (data[(y * width + x) * 4 + 3] ?? 0) > alphaThreshold
  }

  const adjacency = new Map<string, string[]>()
  const keyOf = (point: [number, number]): string => `${point[0]},${point[1]}`
  const addSegment = (a: [number, number], b: [number, number]) => {
    if (a[0] === b[0] && a[1] === b[1]) return
    const keyA = keyOf(a)
    const keyB = keyOf(b)
    const neighborsA = adjacency.get(keyA)
    if (neighborsA) {
      if (!neighborsA.includes(keyB)) neighborsA.push(keyB)
    } else {
      adjacency.set(keyA, [keyB])
    }
    const neighborsB = adjacency.get(keyB)
    if (neighborsB) {
      if (!neighborsB.includes(keyA)) neighborsB.push(keyA)
    } else {
      adjacency.set(keyB, [keyA])
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const caseIndex =
        (isForeground(x, y) ? 1 : 0) |
        (isForeground(x + 1, y) ? 2 : 0) |
        (isForeground(x + 1, y + 1) ? 4 : 0) |
        (isForeground(x, y + 1) ? 8 : 0)
      const segments = MARCHING_SQUARES_TABLE[caseIndex] ?? []
      for (const [edgeA, edgeB] of segments) {
        addSegment(edgeCrossing(x, y, edgeA), edgeCrossing(x, y, edgeB))
      }
    }
  }

  if (adjacency.size === 0) return []

  const visited = new Set<string>()
  const loops: Array<Array<[number, number]>> = []
  for (const [startKey] of adjacency) {
    if (visited.has(startKey)) continue
    if ((adjacency.get(startKey)?.length ?? 0) !== 2) continue
    const loop: Array<[number, number]> = []
    let currentKey = startKey
    let previousKey: string | null = null
    let guard = 0
    while (guard++ < adjacency.size + 2) {
      visited.add(currentKey)
      const [pointX, pointY] = currentKey.split(',').map(Number)
      loop.push([(pointX ?? 0) / 2, (pointY ?? 0) / 2])
      const neighbors = adjacency.get(currentKey) ?? []
      const nextKey = neighbors.find((candidate) => candidate !== previousKey)
      if (nextKey === undefined) break
      previousKey = currentKey
      currentKey = nextKey
      if (currentKey === startKey) break
    }
    if (loop.length >= 3) loops.push(loop)
  }

  if (loops.length === 0) return []
  let best = loops[0]!
  for (const loop of loops) {
    if (loop.length > best.length) best = loop
  }
  return best
}

/**
 * Trace a mask bitmap into normalized (0-1 canvas) `MaskVertex[]` for a
 * `shapeType === 'path'` shape. Returns an empty array when the mask is empty
 * or too degenerate to form a polygon.
 */
export function maskToPathVertices(
  source: MaskBitmapSource,
  options: MaskTraceOptions = {},
): MaskVertex[] {
  const {
    alphaThreshold = DEFAULT_MASK_ALPHA_THRESHOLD,
    tolerancePx = DEFAULT_MASK_TRACE_TOLERANCE_PX,
    maxVertices = DEFAULT_MASK_MAX_VERTICES,
  } = options
  const contour = traceMaskContourPixels(source, alphaThreshold)
  if (contour.length < 3) return []

  let tolerance = tolerancePx
  let ring = simplifyRing(contour, tolerance)
  let guard = 0
  while (ring.length > maxVertices && guard++ < 8) {
    tolerance *= 1.5
    ring = simplifyRing(contour, tolerance)
  }
  if (ring.length < 3) return []

  const { width, height } = source
  return ring.map(([pointX, pointY]) => ({
    position: [
      Math.min(1, Math.max(0, pointX / width)),
      Math.min(1, Math.max(0, pointY / height)),
    ] as [number, number],
    inHandle: [0, 0] as [number, number],
    outHandle: [0, 0] as [number, number],
    tangentMode: 'corner',
  }))
}
