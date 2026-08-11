import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { resolveAnimatedTransform, buildVectorPromotionPlan } from '../deps/keyframe-editors'
import type { ResolvedTransform } from '@/types/transform'
import { makeTimelineVideoItem } from '../test-helpers'
import { useItemsStore } from './items-store'
import { useKeyframesStore } from './keyframes-store'
import { promoteTransformToVector, upsertVectorKeyframe } from './timeline-actions'

// Regression for: copying a vector keyframe emits both axes, and pasting them
// as sequential payloads (x then y) must merge into ONE coupled keyframe with
// both values preserved. The second payload resolves the coupled value from
// FRESH store state so it sees the keyframe the first payload just wrote.
describe('vector keyframe paste merge', () => {
  beforeEach(() => {
    useItemsStore.getState().setItems([makeTimelineVideoItem({ id: 'item-1' })])
    useKeyframesStore.getState().setKeyframes([])
  })

  const baseScale: ResolvedTransform = {
    x: 0,
    y: 0,
    width: 400,
    height: 200,
    anchorX: 200,
    anchorY: 100,
    rotation: 0,
    opacity: 1,
    cornerRadius: 0,
  }

  const toScalePercent = (value: number, baseValue: number) =>
    Math.abs(baseValue) <= Number.EPSILON ? 100 : (value / baseValue) * 100

  it('preserves both scale axes when pasting x then y payloads', () => {
    const frame = 5
    const copied = { x: 150, y: 80 }

    // First payload (x): no lane yet, so the promotion path seeds one.
    const plan = buildVectorPromotionPlan({
      property: 'scale',
      itemKeyframes: useKeyframesStore.getState().keyframesByItemId['item-1'],
      baseTransform: baseScale,
      includeFrame: frame,
      createId: () => 'scale-seeded',
    })
    const target = plan.vectorProperty.keyframes.find((keyframe) => keyframe.frame === frame)!
    target.value = { ...target.value, x: copied.x }
    promoteTransformToVector('item-1', plan.vectorProperty, plan.removeScalarProperties)

    // Second payload (y): lane exists, so the resolved path merges the axis.
    const fresh = useKeyframesStore.getState().keyframesByItemId['item-1']
    const resolved = resolveAnimatedTransform(baseScale, fresh, frame)
    const resolvedValue = {
      x: toScalePercent(resolved.width, baseScale.width),
      y: toScalePercent(resolved.height, baseScale.height),
    }
    upsertVectorKeyframe('item-1', 'scale', {
      frame,
      value: { ...resolvedValue, y: copied.y },
      easing: 'linear',
    })

    expect(
      useKeyframesStore.getState().getVectorKeyframesForProperty('item-1', 'scale')[0]?.value,
    ).toEqual(copied)
  })

  it('preserves both position axes when pasting x then y payloads', () => {
    const frame = 3
    const copied = { x: 40, y: 72 }

    const plan = buildVectorPromotionPlan({
      property: 'position',
      itemKeyframes: useKeyframesStore.getState().keyframesByItemId['item-1'],
      baseTransform: baseScale,
      includeFrame: frame,
      createId: () => 'position-seeded',
    })
    const target = plan.vectorProperty.keyframes.find((keyframe) => keyframe.frame === frame)!
    target.value = { ...target.value, x: copied.x }
    promoteTransformToVector('item-1', plan.vectorProperty, plan.removeScalarProperties)

    const fresh = useKeyframesStore.getState().keyframesByItemId['item-1']
    const resolved = resolveAnimatedTransform(baseScale, fresh, frame)
    upsertVectorKeyframe('item-1', 'position', {
      frame,
      value: { ...{ x: resolved.x, y: resolved.y }, y: copied.y },
      easing: 'linear',
    })

    expect(
      useKeyframesStore.getState().getVectorKeyframesForProperty('item-1', 'position')[0]?.value,
    ).toEqual(copied)
  })
})
