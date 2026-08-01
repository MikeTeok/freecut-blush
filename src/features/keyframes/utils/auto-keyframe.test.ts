// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vite-plus/test'
import type { ItemKeyframes } from '@/types/keyframe'
import type { ShapeItem, TimelineItem } from '@/types/timeline'
import { useAutoKeyframeStore } from '../stores/auto-keyframe-store'
import { useTransitionsStore } from '../deps/timeline-contract'
import {
  buildPathVertexKeyframeAllOperations,
  getAutoKeyframeOperation,
  getVectorAutoKeyframeOperation,
} from './auto-keyframe'

const item: TimelineItem = {
  id: 'item-1',
  type: 'video',
  trackId: 'track-1',
  from: 10,
  durationInFrames: 30,
  label: 'Clip',
  src: 'clip.mp4',
}

beforeEach(() => {
  useTransitionsStore.getState().setTransitions([])
  useAutoKeyframeStore.getState().reset()
})

describe('getAutoKeyframeOperation', () => {
  it('extends an already animated property at the edited frame', () => {
    const itemKeyframes: ItemKeyframes = {
      itemId: item.id,
      properties: [
        {
          property: 'x',
          keyframes: [{ id: 'kf-1', frame: 2, value: 100, easing: 'linear' }],
        },
      ],
    }

    expect(getAutoKeyframeOperation(item, itemKeyframes, 'x', 200, 15)).toEqual({
      type: 'add',
      itemId: item.id,
      property: 'x',
      frame: 5,
      value: 200,
      easing: 'linear',
    })
  })

  it('adds a keyframe when the dopesheet auto-key toggle is enabled', () => {
    useAutoKeyframeStore.getState().setAutoKeyframeEnabled(item.id, 'x', true)

    expect(getAutoKeyframeOperation(item, undefined, 'x', 200, 15)).toEqual({
      type: 'add',
      itemId: item.id,
      property: 'x',
      frame: 5,
      value: 200,
      easing: 'linear',
    })
  })

  it('still updates an existing keyframe at the current frame when auto-key is off', () => {
    const itemKeyframes: ItemKeyframes = {
      itemId: item.id,
      properties: [
        {
          property: 'x',
          keyframes: [{ id: 'kf-1', frame: 5, value: 100, easing: 'linear' }],
        },
      ],
    }

    expect(getAutoKeyframeOperation(item, itemKeyframes, 'x', 200, 15)).toEqual({
      type: 'update',
      itemId: item.id,
      property: 'x',
      keyframeId: 'kf-1',
      updates: { value: 200 },
    })
  })

  it('does not auto-key outside the clip bounds even when enabled', () => {
    useAutoKeyframeStore.getState().setAutoKeyframeEnabled(item.id, 'x', true)

    expect(getAutoKeyframeOperation(item, undefined, 'x', 200, 9)).toBeNull()
    expect(getAutoKeyframeOperation(item, undefined, 'x', 200, 40)).toBeNull()
  })
})

describe('getVectorAutoKeyframeOperation', () => {
  it('extends an existing coupled Position lane', () => {
    const itemKeyframes: ItemKeyframes = {
      itemId: item.id,
      properties: [],
      vectorProperties: [
        {
          property: 'position',
          keyframes: [{ id: 'position-1', frame: 0, value: { x: 10, y: 20 }, easing: 'linear' }],
        },
      ],
    }

    expect(
      getVectorAutoKeyframeOperation(item, itemKeyframes, 'position', { x: 100, y: 200 }, 15),
    ).toEqual({
      type: 'vector-add',
      itemId: item.id,
      property: 'position',
      frame: 5,
      value: { x: 100, y: 200 },
      easing: 'linear',
    })
  })

  it('updates the coupled keyframe already at the edited frame', () => {
    const itemKeyframes: ItemKeyframes = {
      itemId: item.id,
      properties: [],
      vectorProperties: [
        {
          property: 'scale',
          keyframes: [{ id: 'scale-1', frame: 5, value: { x: 100, y: 100 }, easing: 'linear' }],
        },
      ],
    }

    expect(
      getVectorAutoKeyframeOperation(item, itemKeyframes, 'scale', { x: 125, y: 80 }, 15),
    ).toEqual({
      type: 'vector-update',
      itemId: item.id,
      property: 'scale',
      keyframeId: 'scale-1',
      updates: { value: { x: 125, y: 80 } },
    })
  })
})

describe('buildPathVertexKeyframeAllOperations', () => {
  const pathItem: ShapeItem = {
    id: 'path-1',
    type: 'shape',
    trackId: 'track-1',
    from: 10,
    durationInFrames: 40,
    label: 'Path',
    shapeType: 'path',
    fillColor: '#00000000',
    strokeColor: '#ffffff',
    strokeWidth: 4,
    pathVertices: [
      {
        position: [0.1, 0.2],
        inHandle: [0.05, 0.15],
        outHandle: [0.15, 0.25],
        tangentMode: 'corner',
      },
      {
        position: [0.8, 0.9],
        inHandle: [0.7, 0.9],
        outHandle: [0.9, 0.9],
        tangentMode: 'broken',
      },
    ],
  }
  const shapeVertices = pathItem.pathVertices ?? []

  it('writes an add operation for every component of every vertex at the playhead', () => {
    const operations = buildPathVertexKeyframeAllOperations({
      item: pathItem,
      itemKeyframes: undefined,
      vertices: shapeVertices,
      currentFrame: 15,
    })

    expect(operations).toHaveLength(12)
    expect(operations[0]).toEqual({
      type: 'add',
      itemId: pathItem.id,
      property: 'pathVertex:0:positionX',
      frame: 5,
      value: 0.1,
      easing: 'linear',
    })
    expect(operations[1]).toEqual({
      type: 'add',
      itemId: pathItem.id,
      property: 'pathVertex:0:positionY',
      frame: 5,
      value: 0.2,
      easing: 'linear',
    })
    expect(operations[6]).toEqual({
      type: 'add',
      itemId: pathItem.id,
      property: 'pathVertex:1:positionX',
      frame: 5,
      value: 0.8,
      easing: 'linear',
    })
    expect(operations[11]).toEqual({
      type: 'add',
      itemId: pathItem.id,
      property: 'pathVertex:1:outY',
      frame: 5,
      value: 0.9,
      easing: 'linear',
    })
    expect(operations.every((operation) => operation.type === 'add')).toBe(true)
  })

  it('updates existing keyframes at the same frame instead of adding', () => {
    const itemKeyframes: ItemKeyframes = {
      itemId: pathItem.id,
      properties: [
        {
          property: 'pathVertex:0:positionX',
          keyframes: [{ id: 'kf-pos-x', frame: 5, value: 0.9, easing: 'linear' }],
        },
      ],
    }

    const operations = buildPathVertexKeyframeAllOperations({
      item: pathItem,
      itemKeyframes,
      vertices: shapeVertices,
      currentFrame: 15,
    })

    expect(operations).toHaveLength(12)
    const update = operations.find((operation) => operation.property === 'pathVertex:0:positionX')
    expect(update).toEqual({
      type: 'update',
      itemId: pathItem.id,
      property: 'pathVertex:0:positionX',
      keyframeId: 'kf-pos-x',
      updates: { value: 0.1 },
    })
    expect(operations.filter((operation) => operation.type === 'update')).toHaveLength(1)
  })

  it('returns no operations when the playhead is outside the clip', () => {
    expect(
      buildPathVertexKeyframeAllOperations({
        item: pathItem,
        itemKeyframes: undefined,
        vertices: shapeVertices,
        currentFrame: 0,
      }),
    ).toEqual([])
    expect(
      buildPathVertexKeyframeAllOperations({
        item: pathItem,
        itemKeyframes: undefined,
        vertices: shapeVertices,
        currentFrame: 50,
      }),
    ).toEqual([])
  })

  it('returns no operations when the frame sits inside a transition region', () => {
    useTransitionsStore.getState().setTransitions([
      {
        id: 'transition-1',
        type: 'crossfade',
        leftClipId: pathItem.id,
        rightClipId: 'other-clip',
        trackId: 'track-1',
        durationInFrames: 10,
        presentation: 'fade',
        timing: 'linear',
        alignment: 1,
      },
    ])

    expect(
      buildPathVertexKeyframeAllOperations({
        item: pathItem,
        itemKeyframes: undefined,
        vertices: shapeVertices,
        currentFrame: 45,
      }),
    ).toEqual([])
  })
})
