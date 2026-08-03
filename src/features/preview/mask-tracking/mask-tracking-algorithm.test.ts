import { describe, expect, it } from 'vite-plus/test'
import type { PromptPoint } from '@/types/masks'
import type { ShapeItem } from '@/types/timeline'
import {
  computeMaskCentroid,
  computeMaskPromptPointFromShape,
  maskAlphaToCanvasContour,
  maskContourToItemVertices,
  trackMaskFrames,
  type MaskFrameData,
} from './mask-tracking-algorithm'

function filledCircleAlpha(width: number, height: number, cx: number, cy: number, radius: number) {
  const alpha = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const distance = Math.hypot(x - cx, y - cy)
      if (distance <= radius) alpha[y * width + x] = 255
    }
  }
  return alpha
}

function makeShape(overrides: Partial<ShapeItem> = {}): ShapeItem {
  return {
    id: 'mask-1',
    trackId: 'track-1',
    label: 'Mask',
    type: 'shape',
    from: 10,
    durationInFrames: 3,
    shapeType: 'path',
    pathVertices: [
      { position: [0.25, 0.25], inHandle: [0, 0], outHandle: [0, 0], tangentMode: 'corner' },
      { position: [0.75, 0.25], inHandle: [0, 0], outHandle: [0, 0], tangentMode: 'corner' },
      { position: [0.5, 0.75], inHandle: [0, 0], outHandle: [0, 0], tangentMode: 'corner' },
    ],
    fillColor: '#ffffff',
    transform: { x: 0, y: 0, width: 100, height: 100, opacity: 1 },
    ...overrides,
  }
}

describe('computeMaskCentroid', () => {
  it('returns null for an empty mask', () => {
    expect(computeMaskCentroid(new Uint8Array(64), 8, 8)).toBeNull()
  })

  it('computes the area-weighted centroid of a filled circle', () => {
    const alpha = filledCircleAlpha(20, 20, 10, 10, 5)
    const centroid = computeMaskCentroid(alpha, 20, 20)!
    expect(centroid.x).toBeGreaterThan(8.5)
    expect(centroid.x).toBeLessThan(11.5)
    expect(centroid.y).toBeGreaterThan(8.5)
    expect(centroid.y).toBeLessThan(11.5)
  })
})

describe('maskAlphaToCanvasContour', () => {
  it('traces a filled circle into a closed contour', () => {
    const alpha = filledCircleAlpha(20, 20, 10, 10, 5)
    const contour = maskAlphaToCanvasContour(alpha, 20, 20)
    expect(contour.length).toBeGreaterThanOrEqual(3)
    for (const [x, y] of contour) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(20)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(20)
    }
  })
})

describe('maskContourToItemVertices', () => {
  it('resamples to a fixed count with normalized positions inside the box', () => {
    const alpha = filledCircleAlpha(40, 40, 20, 20, 10)
    const centroid = computeMaskCentroid(alpha, 40, 40)!
    const contour = maskAlphaToCanvasContour(alpha, 40, 40)
    const vertices = maskContourToItemVertices(
      contour,
      centroid,
      { boxWidth: 30, boxHeight: 30 },
      24,
    )

    expect(vertices).toHaveLength(24)
    for (const vertex of vertices) {
      expect(vertex.position[0]).toBeGreaterThanOrEqual(0)
      expect(vertex.position[0]).toBeLessThanOrEqual(1)
      expect(vertex.position[1]).toBeGreaterThanOrEqual(0)
      expect(vertex.position[1]).toBeLessThanOrEqual(1)
      expect(vertex.tangentMode).toBe('corner')
    }
  })
})

describe('computeMaskPromptPointFromShape', () => {
  it('derives a canvas-space prompt point from the shape geometry', () => {
    const point = computeMaskPromptPointFromShape(
      makeShape({ transform: { x: 10, y: 20, width: 100, height: 100, opacity: 1 } }),
      400,
      300,
    )
    // shape center maps to canvas center + transform offset, then the mean of
    // the vertex offsets (0.25/0.75/0.5 x, 0.25/0.25/0.75 y) is added
    expect(point.x).toBe(210)
    expect(point.y).toBe(162)
  })

  it('defaults to the canvas center when there is no path geometry', () => {
    const point = computeMaskPromptPointFromShape(makeShape({ pathVertices: [] }), 400, 300)
    expect(point).toEqual({ x: 200, y: 150 })
  })
})

describe('trackMaskFrames', () => {
  it('tracks every frame and holds a constant vertex count', async () => {
    const frames: number[] = [10, 11, 12]
    const seenPoints: PromptPoint[][] = []
    const segmentAtFrame = (
      frame: number,
      points: PromptPoint[],
    ): Promise<MaskFrameData | null> => {
      seenPoints.push(points)
      const alpha = filledCircleAlpha(40, 40, 10 + (frame - 10) * 4, 20, 8)
      return Promise.resolve({ alpha, width: 40, height: 40 })
    }

    const result = await trackMaskFrames({
      startFrame: 10,
      endFrame: 13,
      boxWidth: 30,
      boxHeight: 30,
      canvasWidth: 40,
      canvasHeight: 40,
      promptPoints: [{ x: 10, y: 20, label: 1 }],
      segmentAtFrame,
    })

    expect(result.frames.map((entry) => entry.frame)).toEqual(frames)
    expect(result.baseVertices).toHaveLength(48)
    for (const entry of result.frames) {
      expect(entry.vertices).toHaveLength(48)
    }
    // prompt points are propagated by the previous centroid displacement:
    // frame 2 still uses the reference offset (0), frame 3 is shifted by the
    // frame-2 centroid delta
    expect(seenPoints).toHaveLength(3)
    expect(seenPoints[0]![0]!.x).toBe(10)
    expect(seenPoints[1]![0]!.x).toBe(10)
    expect(seenPoints[2]![0]!.x).toBeGreaterThan(seenPoints[1]![0]!.x)
  })

  it('propagates the last good frame when segmentation temporarily fails', async () => {
    const segmentAtFrame = (frame: number): Promise<MaskFrameData | null> => {
      if (frame === 11) return Promise.resolve(null)
      const alpha = filledCircleAlpha(40, 40, 20, 20, 8)
      return Promise.resolve({ alpha, width: 40, height: 40 })
    }

    const result = await trackMaskFrames({
      startFrame: 10,
      endFrame: 12,
      boxWidth: 30,
      boxHeight: 30,
      canvasWidth: 40,
      canvasHeight: 40,
      promptPoints: [{ x: 20, y: 20, label: 1 }],
      segmentAtFrame,
    })

    expect(result.frames).toHaveLength(2)
    expect(result.frames[1]!.transform).toEqual(result.frames[0]!.transform)
  })

  it('throws when the first frame produces no result', async () => {
    const segmentAtFrame = (): Promise<MaskFrameData | null> => Promise.resolve(null)
    await expect(
      trackMaskFrames({
        startFrame: 10,
        endFrame: 12,
        boxWidth: 30,
        boxHeight: 30,
        canvasWidth: 40,
        canvasHeight: 40,
        promptPoints: [{ x: 20, y: 20, label: 1 }],
        segmentAtFrame,
      }),
    ).rejects.toThrow('no segmentation result')
  })

  it('stops early when cancelled, keeping partial results', async () => {
    let calls = 0
    const segmentAtFrame = (): Promise<MaskFrameData | null> => {
      calls++
      const alpha = filledCircleAlpha(40, 40, 20, 20, 8)
      return Promise.resolve({ alpha, width: 40, height: 40 })
    }

    const result = await trackMaskFrames({
      startFrame: 10,
      endFrame: 15,
      boxWidth: 30,
      boxHeight: 30,
      canvasWidth: 40,
      canvasHeight: 40,
      promptPoints: [{ x: 20, y: 20, label: 1 }],
      segmentAtFrame,
      shouldCancel: () => calls >= 2,
    })

    expect(result.frames).toHaveLength(2)
  })

  it('reports progress for every tracked frame', async () => {
    const progress: Array<[number, number, number]> = []
    const segmentAtFrame = (): Promise<MaskFrameData | null> => {
      const alpha = filledCircleAlpha(40, 40, 20, 20, 8)
      return Promise.resolve({ alpha, width: 40, height: 40 })
    }

    await trackMaskFrames({
      startFrame: 10,
      endFrame: 13,
      boxWidth: 30,
      boxHeight: 30,
      canvasWidth: 40,
      canvasHeight: 40,
      promptPoints: [{ x: 20, y: 20, label: 1 }],
      segmentAtFrame,
      onProgress: (done, total, frame) => progress.push([done, total, frame]),
    })

    expect(progress).toEqual([
      [1, 3, 10],
      [2, 3, 11],
      [3, 3, 12],
    ])
  })
})
