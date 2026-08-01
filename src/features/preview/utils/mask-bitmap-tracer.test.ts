import { describe, expect, it } from 'vitest'
import {
  maskToPathVertices,
  simplifyRing,
  traceMaskContourPixels,
  type MaskBitmapSource,
} from './mask-bitmap-tracer'

function makeMask(width: number, height: number, foreground: Set<number>): MaskBitmapSource {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      if (foreground.has(index)) {
        data[index * 4 + 3] = 255
      }
    }
  }
  return { width, height, data }
}

function filledRect(
  width: number,
  height: number,
  left: number,
  top: number,
  w: number,
  h: number,
) {
  const foreground = new Set<number>()
  for (let y = top; y < top + h; y++) {
    for (let x = left; x < left + w; x++) {
      if (x >= 0 && y >= 0 && x < width && y < height) foreground.add(y * width + x)
    }
  }
  return foreground
}

describe('traceMaskContourPixels', () => {
  it('returns an empty list for an empty mask', () => {
    const source = makeMask(8, 8, new Set())
    expect(traceMaskContourPixels(source)).toEqual([])
  })

  it('traces an isolated single pixel as a tiny closed loop', () => {
    const source = makeMask(8, 8, new Set([3 * 8 + 3]))
    const contour = traceMaskContourPixels(source)
    expect(contour.length).toBeGreaterThanOrEqual(3)
  })

  it('traces a solid rectangle as a closed loop around its bounds', () => {
    const source = makeMask(12, 12, filledRect(12, 12, 2, 2, 6, 6))
    const contour = traceMaskContourPixels(source)
    expect(contour.length).toBeGreaterThanOrEqual(4)

    const xs = contour.map(([x]) => x)
    const ys = contour.map(([, y]) => y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    // The contour wraps the 6x6 rectangle that occupies x/y in [2, 8).
    // Marching squares crosses at edge midpoints, so the polygon sits ~0.5px
    // inset from the mask bounds.
    expect(minX).toBeLessThanOrEqual(3)
    expect(maxX).toBeGreaterThanOrEqual(7)
    expect(minY).toBeLessThanOrEqual(2.5)
    expect(maxY).toBeGreaterThanOrEqual(7)
    // Width/height spans roughly the rectangle size (within a pixel of slack).
    expect(maxX - minX).toBeGreaterThanOrEqual(4.5)
    expect(maxX - minX).toBeLessThanOrEqual(6.5)
    expect(maxY - minY).toBeGreaterThanOrEqual(4.5)
    expect(maxY - minY).toBeLessThanOrEqual(6.5)
  })

  it('returns the largest contour when there are multiple components', () => {
    const foreground = filledRect(16, 16, 1, 1, 4, 4)
    for (let y = 8; y < 12; y++) {
      for (let x = 8; x < 15; x++) foreground.add(y * 16 + x)
    }
    const contour = traceMaskContourPixels(makeMask(16, 16, foreground))
    const xs = contour.map(([x]) => x)
    // Largest component spans to x ~14.
    expect(Math.max(...xs)).toBeGreaterThan(11)
  })
})

describe('simplifyRing', () => {
  it('keeps corner points of a square and drops collinear midpoints', () => {
    const ring: Array<[number, number]> = [
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 5],
      [10, 10],
      [5, 10],
      [0, 10],
      [0, 5],
    ]
    const simplified = simplifyRing(ring, 1)
    // Collinear midpoints [5,0],[10,5],[5,10],[0,5] collapse to the 4 corners.
    // A ring has no distinguished start point, so compare as an unordered set.
    const sortPoints = (points: Array<[number, number]>) =>
      [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
    expect(sortPoints(simplified)).toEqual(
      sortPoints([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ]),
    )
  })

  it('keeps a point that deviates beyond tolerance', () => {
    const ring: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [5, 6],
      [10, 10],
      [0, 10],
    ]
    const simplified = simplifyRing(ring, 1)
    expect(simplified).toContainEqual([5, 6])
  })
})

describe('maskToPathVertices', () => {
  it('normalizes traced vertices into the 0-1 range', () => {
    const source = makeMask(100, 100, filledRect(100, 100, 10, 10, 80, 80))
    const vertices = maskToPathVertices(source)
    expect(vertices.length).toBeGreaterThanOrEqual(4)
    for (const vertex of vertices) {
      expect(vertex.position[0]).toBeGreaterThanOrEqual(0)
      expect(vertex.position[0]).toBeLessThanOrEqual(1)
      expect(vertex.position[1]).toBeGreaterThanOrEqual(0)
      expect(vertex.position[1]).toBeLessThanOrEqual(1)
      expect(vertex.inHandle).toEqual([0, 0])
      expect(vertex.outHandle).toEqual([0, 0])
      expect(vertex.tangentMode).toBe('corner')
    }
  })

  it('caps the vertex count via progressive simplification', () => {
    // Jagged full-width mask yields a long contour.
    const foreground = new Set<number>()
    for (let x = 0; x < 200; x++) {
      for (let y = 0; y < 200; y++) {
        if ((x + y) % 3 === 0) foreground.add(y * 200 + x)
      }
    }
    const vertices = maskToPathVertices(makeMask(200, 200, foreground), { maxVertices: 50 })
    expect(vertices.length).toBeLessThanOrEqual(50)
  })

  it('returns an empty array for an empty mask', () => {
    expect(maskToPathVertices(makeMask(10, 10, new Set()))).toEqual([])
  })
})
