import { describe, expect, it } from 'vite-plus/test'
import type { ItemKeyframes } from '@/types/keyframe'
import { computeKeyedVertexIndicesAtFrame } from './mask-editor-overlay-utils'

function keyframe(value: number, frame: number) {
  return { id: `k-${frame}-${value}`, frame, value, easing: 'linear' as const }
}

describe('computeKeyedVertexIndicesAtFrame', () => {
  it('returns an empty set when there are no keyframes', () => {
    expect(computeKeyedVertexIndicesAtFrame(undefined, 0, 10)).toEqual(new Set())
  })

  it('returns vertices that have a path-vertex keyframe at the current relative frame', () => {
    const keyframes: ItemKeyframes = {
      itemId: 'mask',
      properties: [
        {
          property: 'pathVertex:0:positionX',
          keyframes: [keyframe(0.1, 0), keyframe(0.5, 10)],
        },
        {
          property: 'pathVertex:2:outY',
          keyframes: [keyframe(-0.2, 10)],
        },
        {
          property: 'x',
          keyframes: [keyframe(0, 10)],
        },
      ],
    }
    const keyed = computeKeyedVertexIndicesAtFrame(keyframes, 20, 30)
    expect([...keyed].sort()).toEqual([0, 2])
  })

  it('omits vertices whose keyframes do not sit at the current relative frame', () => {
    const keyframes: ItemKeyframes = {
      itemId: 'mask',
      properties: [
        {
          property: 'pathVertex:1:positionY',
          keyframes: [keyframe(0.2, 0)],
        },
      ],
    }
    expect(computeKeyedVertexIndicesAtFrame(keyframes, 0, 10)).toEqual(new Set())
  })

  it('accounts for the item start when converting to relative frames', () => {
    const keyframes: ItemKeyframes = {
      itemId: 'mask',
      properties: [
        {
          property: 'pathVertex:4:inX',
          keyframes: [keyframe(0.1, 5)],
        },
      ],
    }
    expect(computeKeyedVertexIndicesAtFrame(keyframes, 40, 45)).toEqual(new Set([4]))
    expect(computeKeyedVertexIndicesAtFrame(keyframes, 40, 46)).toEqual(new Set())
  })
})
