/**
 * SVG path → MaskVertex converter.
 *
 * Parses the SVG path strings produced by the shape generators / getShapePath
 * (M/L/H/V/C/Q/A/Z, absolute and relative) and converts them into the bezier
 * vertex model used by mask editing. The resulting vertices are expressed in
 * the same local pixel space as the source path — callers normalize to 0-1
 * relative to item bounds before persisting.
 *
 * The vertex model encodes each segment as a cubic bezier:
 *   cp1 = position + outHandle,  cp2 = next.position + inHandle
 * so lines carry zero handles, quadratics are lifted to cubics, and arcs are
 * approximated with the standard endpoint→center cubic conversion.
 */

import type { MaskVertex } from '@/types/masks'

type Point = [number, number]

const MERGE_EPSILON = 1e-6

/** Split an SVG path string into (command letter, numeric args) tokens. */
function tokenizePath(path: string): Array<{ type: string; args: number[] }> {
  const tokens: Array<{ type: string; args: number[] }> = []
  const re = /[MLCQAZmlcqaz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g
  let match: RegExpExecArray | null
  let currentType: string | null = null
  const args: number[] = []

  while ((match = re.exec(path)) !== null) {
    const token = match[0]!
    if (/[MLCQAZmlcqaz]/.test(token)) {
      if (currentType !== null) {
        tokens.push({ type: currentType, args: [...args] })
        args.length = 0
      }
      currentType = token
    } else {
      args.push(parseFloat(token))
    }
  }
  if (currentType !== null) {
    tokens.push({ type: currentType, args })
  }
  return tokens
}

/** Signed angle between two 2D vectors. */
function angleBetween(ux: number, uy: number, vx: number, vy: number): number {
  const dot = ux * vx + uy * vy
  const len = Math.hypot(ux, uy) * Math.hypot(vx, vy)
  const angle = Math.acos(Math.min(1, Math.max(-1, dot / (len || 1))))
  return ux * vy - uy * vx < 0 ? -angle : angle
}

/**
 * Convert one SVG arc (endpoint parameterization) into one or more cubic
 * bezier segments (start point, two control points, end point), each spanning
 * at most 90°. Returns empty when start equals end.
 */
function arcToCubicSegments(
  x0: number,
  y0: number,
  rx: number,
  ry: number,
  xAxisRotationDeg: number,
  largeArcFlag: number,
  sweepFlag: number,
  x1: number,
  y1: number,
): Array<{ c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }> {
  if (x0 === x1 && y0 === y1) return []

  rx = Math.abs(rx)
  ry = Math.abs(ry)
  const phi = (xAxisRotationDeg * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)

  // Step 1: transform to the arc's rotated frame
  const dx = (x0 - x1) / 2
  const dy = (y0 - y1) / 2
  const x1p = cosPhi * dx + sinPhi * dy
  const y1p = -sinPhi * dx + cosPhi * dy

  // Correct radii when they are too small for the chord
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    const scale = Math.sqrt(lambda)
    rx *= scale
    ry *= scale
  }

  // Step 2: compute the center
  const rx2 = rx * rx
  const ry2 = ry * ry
  const x1p2 = x1p * x1p
  const y1p2 = y1p * y1p
  const radicand = (rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2) / (rx2 * y1p2 + ry2 * x1p2)
  const coef = (largeArcFlag === sweepFlag ? -1 : 1) * Math.sqrt(Math.max(0, radicand))
  const cxp = (coef * rx * y1p) / ry
  const cyp = (coef * -ry * x1p) / rx
  const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x1) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y1) / 2

  // Step 3: compute start angle and sweep delta
  const ux = (x1p - cxp) / rx
  const uy = (y1p - cyp) / ry
  const vx = (-x1p - cxp) / rx
  const vy = (-y1p - cyp) / ry
  const theta1 = angleBetween(1, 0, ux, uy)
  let deltaTheta = angleBetween(ux, uy, vx, vy)
  if (sweepFlag && deltaTheta < 0) deltaTheta += 2 * Math.PI
  if (!sweepFlag && deltaTheta > 0) deltaTheta -= 2 * Math.PI

  // Step 4: split into ≤90° segments and approximate each with a cubic
  const segmentCount = Math.max(1, Math.ceil(Math.abs(deltaTheta) / (Math.PI / 2)))
  const delta = deltaTheta / segmentCount
  const kappa = (4 / 3) * Math.tan(delta / 4)

  const pointAt = (theta: number): Point => {
    const cosT = Math.cos(theta)
    const sinT = Math.sin(theta)
    return [
      cx + rx * cosT * cosPhi - ry * sinT * sinPhi,
      cy + rx * cosT * sinPhi + ry * sinT * cosPhi,
    ]
  }
  const derivAt = (theta: number): Point => {
    const cosT = Math.cos(theta)
    const sinT = Math.sin(theta)
    return [-rx * sinT * cosPhi - ry * cosT * sinPhi, -rx * sinT * sinPhi + ry * cosT * cosPhi]
  }

  const segments: Array<{
    c1x: number
    c1y: number
    c2x: number
    c2y: number
    x: number
    y: number
  }> = []
  let theta = theta1
  for (let i = 0; i < segmentCount; i++) {
    const nextTheta = theta + delta
    const start = pointAt(theta)
    const end = pointAt(nextTheta)
    const dStart = derivAt(theta)
    const dEnd = derivAt(nextTheta)
    segments.push({
      c1x: start[0] + kappa * dStart[0],
      c1y: start[1] + kappa * dStart[1],
      c2x: end[0] - kappa * dEnd[0],
      c2y: end[1] - kappa * dEnd[1],
      x: end[0],
      y: end[1],
    })
    theta = nextTheta
  }
  return segments
}

/**
 * Parse an SVG path string into MaskVertex[] in local pixel coordinates.
 * Returns the vertices plus whether the path is closed. The final vertex is
 * merged into the first when the path returns exactly to its start point, so
 * closed shapes like circles produce a clean loop of distinct anchors.
 */
export function parseSvgPathToMaskVertices(path: string): {
  vertices: MaskVertex[]
  closed: boolean
} {
  const tokens = tokenizePath(path)
  const vertices: MaskVertex[] = []
  let current: Point = [0, 0]
  let hasStart = false
  let closed = false

  const addVertex = (position: Point, inHandle: Point, outHandle: Point) => {
    vertices.push({
      position: [...position] as Point,
      inHandle: [...inHandle] as Point,
      outHandle: [...outHandle] as Point,
    })
    current = position
  }

  /** Add a cubic segment and its endpoint vertex, merging back to start. */
  const addCubic = (c1: Point, c2: Point, end: Point, prev: Point) => {
    const startVertex = vertices[vertices.length - 1]
    if (startVertex) {
      startVertex.outHandle = [c1[0] - prev[0], c1[1] - prev[1]]
    }
    const inHandle: Point = [c2[0] - end[0], c2[1] - end[1]]
    if (
      vertices.length > 0 &&
      Math.abs(end[0] - vertices[0]!.position[0]) < MERGE_EPSILON &&
      Math.abs(end[1] - vertices[0]!.position[1]) < MERGE_EPSILON
    ) {
      vertices[0]!.inHandle = inHandle
      current = end
      return
    }
    addVertex(end, inHandle, [0, 0])
  }

  for (const token of tokens) {
    const type = token.type
    const upper = type.toUpperCase()
    const isRelative = type !== upper
    const args = token.args

    const readPoint = (index: number): Point => {
      const x = args[index]!
      const y = args[index + 1]!
      return isRelative ? [current[0] + x, current[1] + y] : [x, y]
    }

    switch (upper) {
      case 'M': {
        if (args.length >= 2) {
          const point = readPoint(0)
          if (!hasStart) {
            hasStart = true
            addVertex(point, [0, 0], [0, 0])
          } else {
            // Treat following coordinate pairs as lineto
            addVertex(point, [0, 0], [0, 0])
          }
        }
        for (let i = 2; i + 1 < args.length; i += 2) {
          const point = readPoint(i)
          addVertex(point, [0, 0], [0, 0])
        }
        break
      }
      case 'L': {
        for (let i = 0; i + 1 < args.length; i += 2) {
          const point = readPoint(i)
          addVertex(point, [0, 0], [0, 0])
        }
        break
      }
      case 'H': {
        const x = isRelative ? current[0] + args[0]! : args[0]!
        addVertex([x, current[1]], [0, 0], [0, 0])
        break
      }
      case 'V': {
        const y = isRelative ? current[1] + args[0]! : args[0]!
        addVertex([current[0], y], [0, 0], [0, 0])
        break
      }
      case 'C': {
        for (let i = 0; i + 5 < args.length; i += 6) {
          const prev = current
          const c1 = readPoint(i)
          const c2 = readPoint(i + 2)
          const end = readPoint(i + 4)
          addCubic(c1, c2, end, prev)
        }
        break
      }
      case 'Q': {
        for (let i = 0; i + 3 < args.length; i += 4) {
          const prev = current
          const q = readPoint(i)
          const end = readPoint(i + 2)
          // Lift the quadratic to an equivalent cubic
          const c1: Point = [
            prev[0] + (2 / 3) * (q[0] - prev[0]),
            prev[1] + (2 / 3) * (q[1] - prev[1]),
          ]
          const c2: Point = [end[0] + (2 / 3) * (q[0] - end[0]), end[1] + (2 / 3) * (q[1] - end[1])]
          addCubic(c1, c2, end, prev)
        }
        break
      }
      case 'A': {
        for (let i = 0; i + 6 < args.length; i += 7) {
          const prev = current
          const arcSegments = arcToCubicSegments(
            prev[0],
            prev[1],
            args[i]!,
            args[i + 1]!,
            args[i + 2]!,
            args[i + 3]!,
            args[i + 4]!,
            isRelative ? prev[0] + args[i + 5]! : args[i + 5]!,
            isRelative ? prev[1] + args[i + 6]! : args[i + 6]!,
          )
          for (const seg of arcSegments) {
            addCubic([seg.c1x, seg.c1y], [seg.c2x, seg.c2y], [seg.x, seg.y], current)
          }
        }
        break
      }
      case 'Z': {
        closed = true
        break
      }
      default: {
        break
      }
    }
  }

  return { vertices, closed }
}

/**
 * Normalize local-pixel MaskVertex[] into 0-1 coordinates relative to item
 * bounds. Handles scale along the same axes as positions.
 */
export function normalizeMaskVertices(
  vertices: MaskVertex[],
  width: number,
  height: number,
): MaskVertex[] {
  const w = width > 0 ? width : 1
  const h = height > 0 ? height : 1
  return vertices.map((vertex) => ({
    ...vertex,
    position: [vertex.position[0] / w, vertex.position[1] / h] as Point,
    inHandle: [vertex.inHandle[0] / w, vertex.inHandle[1] / h] as Point,
    outHandle: [vertex.outHandle[0] / w, vertex.outHandle[1] / h] as Point,
  }))
}

/** Convenience wrapper: parse + normalize an SVG path to item-local 0-1 vertices. */
export function svgPathToMaskVertices(
  path: string,
  width: number,
  height: number,
): { vertices: MaskVertex[]; closed: boolean } {
  const parsed = parseSvgPathToMaskVertices(path)
  return { vertices: normalizeMaskVertices(parsed.vertices, width, height), closed: parsed.closed }
}
