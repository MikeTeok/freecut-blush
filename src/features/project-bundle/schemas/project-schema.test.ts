import { describe, expect, it } from 'vite-plus/test'
import { validateProject } from './project-schema'

function makeProjectWithMaskShape() {
  return {
    id: 'project-1',
    name: 'Tracking test',
    description: '',
    createdAt: 0,
    updatedAt: 0,
    duration: 120,
    metadata: { width: 1920, height: 1080, fps: 30 },
    timeline: {
      tracks: [
        {
          id: 'track-1',
          name: 'V1',
          height: 80,
          locked: false,
          visible: true,
          muted: false,
          solo: false,
          order: 1,
        },
      ],
      items: [
        {
          id: 'mask-1',
          trackId: 'track-1',
          from: 10,
          durationInFrames: 30,
          label: 'AI Mask',
          type: 'shape',
          shapeType: 'path',
          pathClosed: true,
          pathVertices: [
            {
              position: [0.25, 0.25],
              inHandle: [0, 0],
              outHandle: [0, 0],
              tangentMode: 'corner',
            },
            {
              position: [0.75, 0.25],
              inHandle: [0, 0],
              outHandle: [0, 0],
              tangentMode: 'corner',
            },
            {
              position: [0.5, 0.75],
              inHandle: [0, 0],
              outHandle: [0, 0],
              tangentMode: 'corner',
            },
          ],
          aiPromptPoints: [
            { x: 960, y: 540, label: 1 },
            { x: 480, y: 200, label: -1 },
          ],
          isMask: true,
          maskType: 'alpha',
          fillColor: '#ffffff',
        },
      ],
    },
  }
}

describe('project schema aiPromptPoints round-trip', () => {
  it('persists aiPromptPoints through a serialize/parse cycle', () => {
    const payload = makeProjectWithMaskShape()
    // simulate export/import: JSON round-trip then schema validation
    const roundTripped = JSON.parse(JSON.stringify(payload))
    const result = validateProject(roundTripped)

    expect(result.success).toBe(true)
    const items = result.data!.timeline!.items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      shapeType: 'path',
      aiPromptPoints: [
        { x: 960, y: 540, label: 1 },
        { x: 480, y: 200, label: -1 },
      ],
      pathVertices: items[0]!.pathVertices,
    })
    expect(items[0]!.aiPromptPoints).toEqual([
      { x: 960, y: 540, label: 1 },
      { x: 480, y: 200, label: -1 },
    ])
  })

  it('rejects prompt points with an invalid label', () => {
    const payload = makeProjectWithMaskShape()
    payload.timeline.items[0]!.aiPromptPoints = [{ x: 1, y: 2, label: 0 }]
    const result = validateProject(payload)
    expect(result.success).toBe(false)
  })
})
