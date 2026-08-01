// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import { buildBezierPathData } from '@/shared/graphics/shapes/bezier-path'
import { shapeToPathUpdate, convertShapeToPath } from './convert-shape-to-path'
import type { ShapeItem } from '@/types/timeline'
import { usePlaybackStore } from '@/shared/state/playback'
import { useProjectStore } from '@/features/editor/deps/projects'

const CANVAS = { width: 1920, height: 1080, fps: 30 }

function makeShape(overrides: Partial<ShapeItem> = {}): ShapeItem {
  return {
    id: 'shape-1',
    trackId: 'track-1',
    from: 0,
    durationInFrames: 30,
    label: 'Shape',
    type: 'shape',
    shapeType: 'rectangle',
    fillColor: '#3b82f6',
    transform: { x: 0, y: 0, width: 200, height: 100, rotation: 0, opacity: 1 },
    ...overrides,
  }
}

function makeResolved(width = 200, height = 100) {
  return { x: 0, y: 0, width, height, rotation: 0, opacity: 1, cornerRadius: 0 }
}

describe('shapeToPathUpdate', () => {
  it('bakes a rectangle into normalized corners', () => {
    const update = shapeToPathUpdate(makeShape(), makeResolved(), CANVAS)
    expect(update).not.toBeNull()
    expect(update!.shapeType).toBe('path')
    expect(update!.pathClosed).toBe(true)
    expect(update!.pathVertices).toHaveLength(4)
    expect(update!.pathVertices.map((vertex) => vertex.position)).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ])
  })

  it('round-trips a rectangle back to the same path via buildBezierPathData', () => {
    const update = shapeToPathUpdate(makeShape(), makeResolved(), CANVAS)!
    // buildBezierPathData emits an explicit closing line before Z.
    const path = buildBezierPathData(update.pathVertices, 200, 100, true)
    expect(path).toBe('M 0 0 L 200 0 L 200 100 L 0 100 L 0 0 Z')
  })

  it('normalizes handles along with positions for curved shapes', () => {
    const update = shapeToPathUpdate(
      makeShape({
        shapeType: 'ellipse',
        transform: { x: 0, y: 0, width: 200, height: 100, rotation: 0, opacity: 1 },
      }),
      makeResolved(200, 100),
      CANVAS,
    )
    expect(update).not.toBeNull()
    const positions = update!.pathVertices.map((vertex) => vertex.position)
    for (const [x, y] of positions) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(1)
    }
    // Handles stay proportional: for an ellipse spanning the box, an extreme
    // anchor handle should not exceed a reasonable fraction of the box.
    for (const vertex of update!.pathVertices) {
      expect(Math.abs(vertex.outHandle[0])).toBeLessThanOrEqual(0.7)
      expect(Math.abs(vertex.outHandle[1])).toBeLessThanOrEqual(0.7)
    }
  })

  it('aspect-locked shapes keep a centered sub-region within the box', () => {
    // Circle with aspectLocked centers a baseSize (100) square inside the
    // 200x100 box, so it spans x in [0.25, 0.75] but the full y range.
    const update = shapeToPathUpdate(
      makeShape({
        shapeType: 'circle',
        transform: { x: 0, y: 0, width: 200, height: 100, rotation: 0, opacity: 1 },
      }),
      makeResolved(200, 100),
      CANVAS,
    )
    expect(update).not.toBeNull()
    const xs = update!.pathVertices.map((vertex) => vertex.position[0])
    const ys = update!.pathVertices.map((vertex) => vertex.position[1])
    expect(Math.min(...xs)).toBeCloseTo(0.25, 3)
    expect(Math.max(...xs)).toBeCloseTo(0.75, 3)
    expect(Math.min(...ys)).toBeCloseTo(0, 3)
    expect(Math.max(...ys)).toBeCloseTo(1, 3)
  })

  it('marks a rounded rectangle closed with arc-derived handles', () => {
    const update = shapeToPathUpdate(
      makeShape({ cornerRadius: 10 }),
      makeResolved(200, 100),
      CANVAS,
    )
    expect(update).not.toBeNull()
    expect(update!.pathClosed).toBe(true)
    expect(update!.pathVertices.length).toBeGreaterThanOrEqual(8)
    expect(update!.pathVertices.some((vertex) => vertex.outHandle[0] !== 0)).toBe(true)
  })
})

describe('convertShapeToPath', () => {
  it('passes through existing path shapes unchanged', () => {
    const pathShape = makeShape({
      shapeType: 'path',
      pathVertices: [
        { position: [0, 0], inHandle: [0, 0], outHandle: [0, 0] },
        { position: [1, 1], inHandle: [0, 0], outHandle: [0, 0] },
      ],
      pathClosed: false,
    })
    const update = convertShapeToPath(pathShape)
    expect(update).toEqual({
      shapeType: 'path',
      pathVertices: pathShape.pathVertices,
      pathClosed: false,
    })
  })

  it('converts a parametric shape using store state', () => {
    usePlaybackStore.setState({ currentFrame: 0 })
    useProjectStore.setState({
      currentProject: {
        id: 'project-1',
        name: 'Test',
        description: '',
        createdAt: 0,
        updatedAt: 0,
        duration: 1,
        metadata: { width: 1920, height: 1080, fps: 30 },
      },
    })
    const update = convertShapeToPath(makeShape())
    expect(update).not.toBeNull()
    expect(update!.shapeType).toBe('path')
    expect(update!.pathVertices.map((vertex) => vertex.position)).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ])
  })

  it('refuses corner-pinned shapes', () => {
    const cornerPinned = makeShape({
      cornerPin: {
        topLeft: [0, 0],
        topRight: [10, 0],
        bottomRight: [10, 10],
        bottomLeft: [0, 10],
      },
    })
    expect(convertShapeToPath(cornerPinned)).toBeNull()
  })
})
