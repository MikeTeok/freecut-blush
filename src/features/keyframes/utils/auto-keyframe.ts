import type {
  AnimatableProperty,
  TransformAnimatableProperty,
  ItemKeyframes,
  EasingType,
  Vector2,
  VectorAnimatableProperty,
} from '@/types/keyframe'
import type { TimelineItem } from '@/types/timeline'
import { isAutoKeyframeEnabled } from '../stores/auto-keyframe-store'
import { useTransitionsStore } from '../deps/timeline-contract'
import { isFrameInTransitionRegion } from './transition-region'
import type { MaskVertex } from '@/types/masks'
import {
  buildPathVertexAnimatableProperty,
  type PathVertexAnimatableComponent,
} from '@/types/keyframe'
import { getPathVertexPropertyValue } from './path-animatable-properties'

export interface AutoKeyframeAddOperation {
  type: 'add'
  itemId: string
  property: AnimatableProperty
  frame: number
  value: number
  easing?: EasingType
}

export interface AutoKeyframeUpdateOperation {
  type: 'update'
  itemId: string
  property: AnimatableProperty
  keyframeId: string
  updates: { value?: number }
}

export interface VectorAutoKeyframeAddOperation {
  type: 'vector-add'
  itemId: string
  property: VectorAnimatableProperty
  frame: number
  value: Vector2
  easing?: EasingType
}

export interface VectorAutoKeyframeUpdateOperation {
  type: 'vector-update'
  itemId: string
  property: VectorAnimatableProperty
  keyframeId: string
  updates: { value: Vector2 }
}

export type AutoKeyframeOperation =
  | AutoKeyframeAddOperation
  | AutoKeyframeUpdateOperation
  | VectorAutoKeyframeAddOperation
  | VectorAutoKeyframeUpdateOperation

/**
 * Result of auto-keyframing a property
 */
interface AutoKeyframeResult {
  /** Whether this property was auto-keyframed */
  handled: boolean
  /** Action to perform: 'add' new keyframe or 'update' existing */
  action?: 'add' | 'update'
  /** Existing keyframe ID if updating */
  existingKeyframeId?: string
}

/**
 * Check if a property should be auto-keyframed and get the action to perform.
 * Existing keyframes at the current frame are always updated.
 * Once a property has an animated lane, edits at another frame extend that lane.
 * The explicit dopesheet auto-key toggle is only needed to start a new lane.
 */
function shouldAutoKeyframe(
  item: TimelineItem,
  itemKeyframes: ItemKeyframes | undefined,
  property: AnimatableProperty,
  relativeFrame: number,
): AutoKeyframeResult {
  // Frame is outside item bounds
  if (relativeFrame < 0 || relativeFrame >= item.durationInFrames) {
    return { handled: false }
  }

  // Find keyframes for this property
  const propKeyframes = itemKeyframes?.properties.find((p) => p.property === property)

  const existingKeyframe = propKeyframes?.keyframes.find((k) => k.frame === relativeFrame)
  if (existingKeyframe) {
    return { handled: true, action: 'update', existingKeyframeId: existingKeyframe.id }
  }

  if (
    isFrameInTransitionRegion(
      relativeFrame,
      item.id,
      item,
      useTransitionsStore.getState().transitions,
    )
  ) {
    return { handled: false }
  }

  if (propKeyframes && propKeyframes.keyframes.length > 0) {
    return { handled: true, action: 'add' }
  }

  return isAutoKeyframeEnabled(item.id, property)
    ? { handled: true, action: 'add' }
    : { handled: false }
}

const VECTOR_AUTO_KEY_ALIASES: Record<
  VectorAnimatableProperty,
  readonly TransformAnimatableProperty[]
> = {
  position: ['x', 'y'],
  scale: ['width', 'height'],
  anchor: ['anchorX', 'anchorY'],
}

/** Coupled equivalent of getAutoKeyframeOperation for Position/Scale/Anchor. */
export function getVectorAutoKeyframeOperation(
  item: TimelineItem,
  itemKeyframes: ItemKeyframes | undefined,
  property: VectorAnimatableProperty,
  value: Vector2,
  currentFrame: number,
): AutoKeyframeOperation | null {
  const relativeFrame = currentFrame - item.from
  if (relativeFrame < 0 || relativeFrame >= item.durationInFrames) return null

  const lane = itemKeyframes?.vectorProperties?.find((candidate) => candidate.property === property)
  const existing = lane?.keyframes.find((keyframe) => keyframe.frame === relativeFrame)
  if (existing) {
    return {
      type: 'vector-update',
      itemId: item.id,
      property,
      keyframeId: existing.id,
      updates: { value },
    }
  }

  if (
    isFrameInTransitionRegion(
      relativeFrame,
      item.id,
      item,
      useTransitionsStore.getState().transitions,
    )
  ) {
    return null
  }

  const shouldAdd =
    Boolean(lane?.keyframes.length) ||
    VECTOR_AUTO_KEY_ALIASES[property].some((alias) => isAutoKeyframeEnabled(item.id, alias))
  if (!shouldAdd) return null

  return {
    type: 'vector-add',
    itemId: item.id,
    property,
    frame: relativeFrame,
    value,
    easing: 'linear',
  }
}

/**
 * Determines the auto-keyframe operation for a single property.
 * Returns null when the current edit should fall back to the base property value.
 */
export function getAutoKeyframeOperation(
  item: TimelineItem,
  itemKeyframes: ItemKeyframes | undefined,
  property: AnimatableProperty,
  value: number,
  currentFrame: number,
): AutoKeyframeOperation | null {
  const relativeFrame = currentFrame - item.from
  const result = shouldAutoKeyframe(item, itemKeyframes, property, relativeFrame)

  if (!result.handled) {
    return null
  }

  if (result.action === 'update' && result.existingKeyframeId) {
    return {
      type: 'update',
      itemId: item.id,
      property,
      keyframeId: result.existingKeyframeId,
      updates: { value },
    }
  }

  return {
    type: 'add',
    itemId: item.id,
    property,
    frame: relativeFrame,
    value,
    easing: 'linear',
  }
}

const PATH_VERTEX_COMPONENTS: readonly PathVertexAnimatableComponent[] = [
  'positionX',
  'positionY',
  'inX',
  'inY',
  'outX',
  'outY',
]

/**
 * Build one keyframe operation per component of every path vertex at the
 * current frame. Unlike auto-keyframing this always writes keyframes — no
 * dependency on the dopesheet auto-key toggle — so a single button press can
 * pin the whole path (position + bezier handles) at the playhead.
 *
 * Skips lanes whose playhead frame sits outside the clip or inside a
 * transition region.
 */
export function buildPathVertexKeyframeAllOperations(params: {
  item: TimelineItem
  itemKeyframes: ItemKeyframes | undefined
  vertices: MaskVertex[]
  currentFrame: number
}): AutoKeyframeOperation[] {
  const { item, itemKeyframes, vertices, currentFrame } = params
  const relativeFrame = currentFrame - item.from
  if (relativeFrame < 0 || relativeFrame >= item.durationInFrames) return []

  if (
    isFrameInTransitionRegion(
      relativeFrame,
      item.id,
      item,
      useTransitionsStore.getState().transitions,
    )
  ) {
    return []
  }

  const operations: AutoKeyframeOperation[] = []
  for (let vertexIndex = 0; vertexIndex < vertices.length; vertexIndex += 1) {
    for (const component of PATH_VERTEX_COMPONENTS) {
      const property = buildPathVertexAnimatableProperty(vertexIndex, component)
      const value = getPathVertexPropertyValue(vertices, property)

      const existing = itemKeyframes?.properties
        .find((entry) => entry.property === property)
        ?.keyframes.find((keyframe) => keyframe.frame === relativeFrame)

      operations.push(
        existing
          ? {
              type: 'update',
              itemId: item.id,
              property,
              keyframeId: existing.id,
              updates: { value },
            }
          : {
              type: 'add',
              itemId: item.id,
              property,
              frame: relativeFrame,
              value,
              easing: 'linear',
            },
      )
    }
  }
  return operations
}
