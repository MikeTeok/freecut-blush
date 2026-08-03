/**
 * Mask tracking actions.
 *
 * Applies a generated per-frame mask track to a shape item: rewrites the base
 * path geometry (identical vertex count across every frame) and bulk-upserts
 * path-vertex + position keyframes, all inside a single undoable command.
 */

import type { MaskVertex } from '@/types/masks'
import type { PropertyKeyframeUpsertEntry } from '@/types/keyframe'
import { buildPathVertexAnimatableProperty } from '@/types/keyframe'
import { execute } from './shared'
import { useItemsStore } from '../items-store'
import { useKeyframesStore } from '../keyframes-store'
import { useTimelineSettingsStore } from '../timeline-settings-store'

export interface MaskTrackingKeyframeData {
  /** Absolute timeline frames with their per-frame path geometry + position. */
  frames: Array<{
    frame: number
    vertices: MaskVertex[]
    transform: { x: number; y: number }
  }>
  /** Base path geometry written to the item (same vertex count as every frame). */
  baseVertices: MaskVertex[]
}

export function applyMaskTrackingKeyframes(itemId: string, data: MaskTrackingKeyframeData): void {
  if (data.frames.length === 0 || data.baseVertices.length === 0) return

  execute(
    'APPLY_MASK_TRACKING',
    () => {
      const item = useItemsStore.getState().items.find((candidate) => candidate.id === itemId)
      if (!item || item.type !== 'shape' || item.shapeType !== 'path') return

      const vertexCount = data.baseVertices.length
      const relativeFrames = data.frames.map((frameData) => frameData.frame - item.from)

      useItemsStore.getState()._updateItem(itemId, { pathVertices: data.baseVertices })

      const entries: PropertyKeyframeUpsertEntry[] = []
      for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
        entries.push(
          {
            property: buildPathVertexAnimatableProperty(vertexIndex, 'positionX'),
            keyframes: data.frames.map((frameData, frameIndex) => ({
              frame: relativeFrames[frameIndex]!,
              value: frameData.vertices[vertexIndex]!.position[0],
            })),
          },
          {
            property: buildPathVertexAnimatableProperty(vertexIndex, 'positionY'),
            keyframes: data.frames.map((frameData, frameIndex) => ({
              frame: relativeFrames[frameIndex]!,
              value: frameData.vertices[vertexIndex]!.position[1],
            })),
          },
        )
      }
      entries.push(
        {
          property: 'x',
          keyframes: data.frames.map((frameData, frameIndex) => ({
            frame: relativeFrames[frameIndex]!,
            value: frameData.transform.x,
          })),
        },
        {
          property: 'y',
          keyframes: data.frames.map((frameData, frameIndex) => ({
            frame: relativeFrames[frameIndex]!,
            value: frameData.transform.y,
          })),
        },
      )

      useKeyframesStore.getState()._upsertPropertiesKeyframes(itemId, entries)
      useTimelineSettingsStore.getState().markDirty()
    },
    { itemId, frameCount: data.frames.length, vertexCount: data.baseVertices.length },
  )
}
