import { useCallback, useMemo, useRef, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Move, RotateCcw, Link2, Link2Off } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { TimelineItem, VideoItem, CompositionItem } from '@/types/timeline'
import type { TransformProperties, CanvasSettings } from '@/types/transform'
import type { ItemKeyframes, Vector2 } from '@/types/keyframe'
import { useGizmoStore, useThrottledFrame } from '@/features/editor/deps/preview'
import { useMediaLibraryStore } from '@/features/editor/deps/media-library'
import {
  useItemsStore,
  useKeyframesStore,
  useTimelineStore,
} from '@/features/editor/deps/timeline-store'
import { resolveTransform, getSourceDimensions } from '@/features/editor/deps/composition-runtime'
import {
  getAutoKeyframeOperation as getAutoKeyframeOp,
  getVectorAutoKeyframeOperation as getVectorAutoKeyframeOp,
  type AutoKeyframeOperation,
  resolveAnimatedTransform,
  KeyframeToggle,
} from '@/features/editor/deps/keyframes'
import { PropertySection, PropertyRow, NumberInput, SliderInput } from '../components'
import { applyAutoKeyframedTransformChange } from './auto-keyframe-transform'

interface LayoutSectionProps {
  items: TimelineItem[]
  mediaTransformItems?: Array<VideoItem | CompositionItem>
  canvas: CanvasSettings
  onTransformChange: (ids: string[], updates: Partial<TransformProperties>) => void
  aspectLocked: boolean
  onAspectLockToggle: () => void
}

type MixedValue = number | 'mixed'
type PositionAxis = 'x' | 'y'

/** Common transform properties that both gizmo and resolved transforms share */
type TransformValues = {
  x: number
  y: number
  width: number
  height: number
  anchorX: number
  anchorY: number
  rotation: number
}

const MemoizedKeyframeToggle = memo(KeyframeToggle)

function useStableItemIds(items: readonly TimelineItem[]): string[] {
  const nextItemIds = useMemo(() => items.map((item) => item.id), [items])
  const itemIdsRef = useRef(nextItemIds)
  if (
    itemIdsRef.current.length !== nextItemIds.length ||
    itemIdsRef.current.some((itemId, index) => itemId !== nextItemIds[index])
  ) {
    itemIdsRef.current = nextItemIds
  }
  return itemIdsRef.current
}

interface PositionAxisControlProps {
  axis: PositionAxis
  itemIds: string[]
  canvas: CanvasSettings
  onChange: (value: number) => void
  onLiveChange: (value: number) => void
  /** Resolve the coupled position value per item (used by the keyframe toggle). */
  getVectorValue: (itemId: string, relativeFrame: number) => Vector2 | null
}

function resolveMixedPositionValue({
  axis,
  itemIds,
  canvas,
  currentFrame,
  itemsById,
  keyframesByItemId,
}: {
  axis: PositionAxis
  itemIds: readonly string[]
  canvas: CanvasSettings
  currentFrame: number
  itemsById: Readonly<Record<string, TimelineItem | undefined>>
  keyframesByItemId: Readonly<Record<string, ItemKeyframes | undefined>>
}): MixedValue {
  const values = itemIds.flatMap((itemId) => {
    const item = itemsById[itemId]
    if (!item) return []
    const baseResolved = resolveTransform(item, canvas, getSourceDimensions(item))
    const resolved = resolveAnimatedTransform(
      baseResolved,
      keyframesByItemId[item.id],
      currentFrame - item.from,
      {
        globalFrame: currentFrame,
        canvas,
        getItem: (candidateId) => itemsById[candidateId],
        getKeyframes: (candidateId) => keyframesByItemId[candidateId],
      },
    )
    return [resolved[axis]]
  })
  if (values.length === 0) return 0

  const firstValue = values[0]!
  return values.every((value) => Math.abs(value - firstValue) < 0.1) ? firstValue : 'mixed'
}

const PositionAxisControl = memo(function PositionAxisControl({
  axis,
  itemIds,
  canvas,
  onChange,
  onLiveChange,
  getVectorValue,
}: PositionAxisControlProps) {
  const currentFrame = useThrottledFrame()
  const canonicalValueFromItems = useItemsStore(
    useCallback(
      (state) =>
        resolveMixedPositionValue({
          axis,
          itemIds,
          canvas,
          currentFrame,
          itemsById: state.itemById,
          keyframesByItemId: useKeyframesStore.getState().keyframesByItemId,
        }),
      [axis, canvas, currentFrame, itemIds],
    ),
  )
  const canonicalValueFromKeyframes = useKeyframesStore(
    useCallback(
      (state) =>
        resolveMixedPositionValue({
          axis,
          itemIds,
          canvas,
          currentFrame,
          itemsById: useItemsStore.getState().itemById,
          keyframesByItemId: state.keyframesByItemId,
        }),
      [axis, canvas, currentFrame, itemIds],
    ),
  )
  const selectedItemIdSet = useMemo(() => new Set(itemIds), [itemIds])
  const liveValue = useGizmoStore(
    useCallback(
      (state) => {
        if (
          !state.activeGizmo ||
          !state.previewTransform ||
          !selectedItemIdSet.has(state.activeGizmo.itemId)
        ) {
          return null
        }
        return state.previewTransform[axis]
      },
      [axis, selectedItemIdSet],
    ),
  )
  // Both selectors recompute against the other store's current snapshot. The
  // second subscription exists so a keyframe/link-only commit wakes this leaf;
  // by render time both values describe the same canonical state.
  const canonicalValue =
    canonicalValueFromItems === canonicalValueFromKeyframes
      ? canonicalValueFromItems
      : resolveMixedPositionValue({
          axis,
          itemIds,
          canvas,
          currentFrame,
          itemsById: useItemsStore.getState().itemById,
          keyframesByItemId: useKeyframesStore.getState().keyframesByItemId,
        })
  const currentValueRef = useRef(0)
  currentValueRef.current = canonicalValue === 'mixed' ? 0 : canonicalValue
  const getCurrentValue = useCallback(() => currentValueRef.current, [])
  const displayedValue = liveValue ?? canonicalValue
  const positionVector = useMemo(
    () => ({
      property: 'position' as const,
      axis,
      getValueByItemId: getVectorValue,
    }),
    [axis, getVectorValue],
  )

  return (
    <div className="flex items-center gap-0.5">
      <NumberInput
        value={displayedValue}
        onChange={onChange}
        onLiveChange={onLiveChange}
        label={axis.toUpperCase()}
        unit="px"
        step={1}
        className="flex-1"
      />
      <MemoizedKeyframeToggle
        itemIds={itemIds}
        property={axis}
        currentValue={0}
        getCurrentValue={getCurrentValue}
        vector={positionVector}
      />
    </div>
  )
})

/**
 * Transform section - position, dimensions, and rotation.
 * Memoized to prevent re-renders when props haven't changed.
 */
export const LayoutSection = memo(function LayoutSection({
  items,
  mediaTransformItems = [],
  canvas,
  onTransformChange,
  aspectLocked,
  onAspectLockToggle,
}: LayoutSectionProps) {
  const { t } = useTranslation()
  const itemIds = useStableItemIds(items)
  const mediaTransformItemIds = useMemo(
    () => mediaTransformItems.map((item) => item.id),
    [mediaTransformItems],
  )
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  // Get current playhead frame for keyframe animation (throttled to reduce re-renders)
  const currentFrame = useThrottledFrame()

  const itemKeyframes = useKeyframesStore(
    useShallow(
      useCallback((s) => itemIds.map((itemId) => s.keyframesByItemId[itemId] ?? null), [itemIds]),
    ),
  )
  const keyframesByItemId = useMemo(() => {
    const map = new Map<string, (typeof itemKeyframes)[number]>()
    for (const [index, itemId] of itemIds.entries()) {
      map.set(itemId, itemKeyframes[index] ?? null)
    }
    return map
  }, [itemIds, itemKeyframes])

  // Gizmo store for live preview (both for properties panel and gizmo drag sync)
  const setTransformPreview = useGizmoStore((s) => s.setTransformPreview)
  const clearPreview = useGizmoStore((s) => s.clearPreview)
  const clearInteraction = useGizmoStore((s) => s.clearInteraction)

  const clearTransformUiState = useCallback(() => {
    clearPreview()
    clearInteraction()
  }, [clearInteraction, clearPreview])

  // Resolve committed transforms once for all items. Live gizmo position is
  // subscribed at the two tiny axis controls below so the full section and its
  // keyframe controls stay out of the canvas pointer hot path.
  const resolvedTransformsByItem = useMemo(() => {
    const resolved = new Map<string, TransformValues>()
    for (const item of items) {
      const sourceDimensions = getSourceDimensions(item)
      const baseResolved = resolveTransform(item, canvas, sourceDimensions)
      const itemKeyframes = keyframesByItemId.get(item.id) ?? undefined
      const transform = itemKeyframes
        ? resolveAnimatedTransform(baseResolved, itemKeyframes, currentFrame - item.from)
        : baseResolved

      resolved.set(item.id, {
        x: transform.x,
        y: transform.y,
        width: transform.width,
        height: transform.height,
        anchorX: transform.anchorX ?? transform.width / 2,
        anchorY: transform.anchorY ?? transform.height / 2,
        rotation: transform.rotation,
      })
    }
    return resolved
  }, [items, canvas, keyframesByItemId, currentFrame])

  // Memoize all transform values at once to avoid repeated iterations.
  const { width, height, rotation } = useMemo(() => {
    if (items.length === 0) {
      return { width: 0, height: 0, rotation: 0 }
    }

    const resolvedValues = items
      .map((item) => resolvedTransformsByItem.get(item.id))
      .filter((value): value is TransformValues => value !== undefined)

    if (resolvedValues.length === 0) {
      return { width: 0, height: 0, rotation: 0 }
    }

    const getValue = (getter: (resolved: TransformValues) => number): MixedValue => {
      const values = resolvedValues.map(getter)
      const firstValue = values[0]!
      return values.every((v) => Math.abs(v - firstValue) < 0.1) ? firstValue : 'mixed'
    }

    return {
      width: getValue((r) => r.width),
      height: getValue((r) => r.height),
      rotation: getValue((r) => r.rotation),
    }
  }, [items, resolvedTransformsByItem])

  const flipHorizontal = useMemo(() => {
    if (mediaTransformItems.length === 0) return false as boolean | 'mixed'
    const firstValue = mediaTransformItems[0]?.transform?.flipHorizontal ?? false
    return mediaTransformItems.every(
      (item) => (item.transform?.flipHorizontal ?? false) === firstValue,
    )
      ? firstValue
      : 'mixed'
  }, [mediaTransformItems])

  const flipVertical = useMemo(() => {
    if (mediaTransformItems.length === 0) return false as boolean | 'mixed'
    const firstValue = mediaTransformItems[0]?.transform?.flipVertical ?? false
    return mediaTransformItems.every(
      (item) => (item.transform?.flipVertical ?? false) === firstValue,
    )
      ? firstValue
      : 'mixed'
  }, [mediaTransformItems])

  const { mediaAnchorX, mediaAnchorY } = useMemo(() => {
    if (mediaTransformItems.length === 0) {
      return { mediaAnchorX: 0 as MixedValue, mediaAnchorY: 0 as MixedValue }
    }

    const resolvedValues = mediaTransformItems
      .map((item) => resolvedTransformsByItem.get(item.id))
      .filter((value): value is TransformValues => value !== undefined)

    if (resolvedValues.length === 0) {
      return { mediaAnchorX: 0 as MixedValue, mediaAnchorY: 0 as MixedValue }
    }

    const getValue = (getter: (resolved: TransformValues) => number): MixedValue => {
      const values = resolvedValues.map(getter)
      const firstValue = values[0]!
      return values.every((v) => Math.abs(v - firstValue) < 0.1) ? firstValue : 'mixed'
    }

    return {
      mediaAnchorX: getValue((r) => r.anchorX),
      mediaAnchorY: getValue((r) => r.anchorY),
    }
  }, [mediaTransformItems, resolvedTransformsByItem])

  // Store current aspect ratio for linked dimensions
  const currentAspectRatio = useMemo(() => {
    if (width === 'mixed' || height === 'mixed') return 1
    return height > 0 ? width / height : 1
  }, [width, height])

  // Get batched keyframe action for auto-keyframing
  const applyAutoKeyframeOperations = useTimelineStore((s) => s.applyAutoKeyframeOperations)
  const updateItemsTransformMap = useTimelineStore((s) => s.updateItemsTransformMap)

  // Helper: Build auto-keyframe operations for properties that are already animated.
  const getAutoKeyframeOperation = useCallback(
    (
      itemId: string,
      property: 'x' | 'y' | 'width' | 'height' | 'anchorX' | 'anchorY' | 'rotation' | 'opacity',
      value: number,
    ): AutoKeyframeOperation | null => {
      const item = itemsById.get(itemId)
      if (!item) return null

      const itemKeyframes = keyframesByItemId.get(itemId) ?? undefined
      return getAutoKeyframeOp(item, itemKeyframes, property, value, currentFrame)
    },
    [currentFrame, itemsById, keyframesByItemId],
  )

  // When the item is animated through a coupled scale lane, reset must write a
  // vector keyframe (the scalar W/H keys no longer drive the resolved size).
  const getVectorScaleResetOperation = useCallback(
    (
      item: TimelineItem,
      targetWidth: number,
      targetHeight: number,
    ): AutoKeyframeOperation | null => {
      const itemKeyframes = keyframesByItemId.get(item.id) ?? undefined
      const hasVectorScaleLane = itemKeyframes?.vectorProperties?.some(
        (candidate) => candidate.property === 'scale' && candidate.keyframes.length > 0,
      )
      if (!hasVectorScaleLane) return null

      const base = resolveTransform(item, canvas, getSourceDimensions(item))
      const value = {
        x: base.width === 0 ? 100 : (targetWidth / base.width) * 100,
        y: base.height === 0 ? 100 : (targetHeight / base.height) * 100,
      }
      return getVectorAutoKeyframeOp(item, itemKeyframes, 'scale', value, currentFrame)
    },
    [canvas, currentFrame, keyframesByItemId],
  )

  const hasCoupledVectorLane = useCallback(
    (itemId: string, property: 'position' | 'scale' | 'anchor'): boolean => {
      const itemKeyframes = keyframesByItemId.get(itemId) ?? undefined
      return (
        itemKeyframes?.vectorProperties?.some(
          (candidate) => candidate.property === property && candidate.keyframes.length > 0,
        ) ?? false
      )
    },
    [keyframesByItemId],
  )

  // Build a vector auto-keyframe op for an edit to one coupled lane. Scale is
  // expressed as a percentage of the item's base size, so edits typed in
  // resolved pixels must be converted before being pinned to the lane.
  const getVectorEditOperation = useCallback(
    (
      itemId: string,
      property: 'position' | 'scale' | 'anchor',
      valueX: number,
      valueY: number,
    ): AutoKeyframeOperation | null => {
      const item = itemsById.get(itemId)
      if (!item) return null
      const itemKeyframes = keyframesByItemId.get(itemId) ?? undefined
      if (property === 'scale') {
        const base = resolveTransform(item, canvas, getSourceDimensions(item))
        return getVectorAutoKeyframeOp(
          item,
          itemKeyframes,
          'scale',
          {
            x: base.width === 0 ? 100 : (valueX / base.width) * 100,
            y: base.height === 0 ? 100 : (valueY / base.height) * 100,
          },
          currentFrame,
        )
      }
      return getVectorAutoKeyframeOp(
        item,
        itemKeyframes,
        property,
        { x: valueX, y: valueY },
        currentFrame,
      )
    },
    [canvas, currentFrame, itemsById, keyframesByItemId],
  )

  // Lazily resolve the current coupled-vector value at click time (reads the
  // stores directly) so the memoized keyframe toggles stay out of the frame
  // hot path while still pinning the exact state shown by the panel.
  const getScaleVectorValue = useCallback(
    (itemId: string, relativeFrame: number): Vector2 | null => {
      const item = useItemsStore.getState().itemById[itemId]
      if (!item) return null
      const itemKeyframes = useKeyframesStore.getState().keyframesByItemId[itemId]
      const base = resolveTransform(item, canvas, getSourceDimensions(item))
      const resolved = itemKeyframes
        ? resolveAnimatedTransform(base, itemKeyframes, relativeFrame)
        : base
      return {
        x: base.width === 0 ? 100 : (resolved.width / base.width) * 100,
        y: base.height === 0 ? 100 : (resolved.height / base.height) * 100,
      }
    },
    [canvas],
  )

  const getPositionVectorValue = useCallback(
    (itemId: string, relativeFrame: number): Vector2 | null => {
      const item = useItemsStore.getState().itemById[itemId]
      if (!item) return null
      const itemKeyframes = useKeyframesStore.getState().keyframesByItemId[itemId]
      const base = resolveTransform(item, canvas, getSourceDimensions(item))
      const resolved = itemKeyframes
        ? resolveAnimatedTransform(base, itemKeyframes, relativeFrame)
        : base
      return { x: resolved.x, y: resolved.y }
    },
    [canvas],
  )

  const getAnchorVectorValue = useCallback(
    (itemId: string, relativeFrame: number): Vector2 | null => {
      const item = useItemsStore.getState().itemById[itemId]
      if (!item) return null
      const itemKeyframes = useKeyframesStore.getState().keyframesByItemId[itemId]
      const base = resolveTransform(item, canvas, getSourceDimensions(item))
      const resolved = itemKeyframes
        ? resolveAnimatedTransform(base, itemKeyframes, relativeFrame)
        : base
      return { x: resolved.anchorX, y: resolved.anchorY }
    },
    [canvas],
  )

  const widthVector = useMemo(
    () => ({
      property: 'scale' as const,
      axis: 'x' as const,
      getValueByItemId: getScaleVectorValue,
    }),
    [getScaleVectorValue],
  )
  const heightVector = useMemo(
    () => ({
      property: 'scale' as const,
      axis: 'y' as const,
      getValueByItemId: getScaleVectorValue,
    }),
    [getScaleVectorValue],
  )
  const anchorXVector = useMemo(
    () => ({
      property: 'anchor' as const,
      axis: 'x' as const,
      getValueByItemId: getAnchorVectorValue,
    }),
    [getAnchorVectorValue],
  )
  const anchorYVector = useMemo(
    () => ({
      property: 'anchor' as const,
      axis: 'y' as const,
      getValueByItemId: getAnchorVectorValue,
    }),
    [getAnchorVectorValue],
  )

  // Live preview for X position (during scrub)
  const handleXLiveChange = useCallback(
    (value: number) => {
      const previews: Record<string, { x: number }> = {}
      items.forEach((item) => {
        previews[item.id] = { x: value }
      })
      setTransformPreview(previews)
    },
    [items, setTransformPreview],
  )

  // Commit X position (with auto-keyframe support)
  const handleXChange = useCallback(
    (value: number) => {
      applyAutoKeyframedTransformChange({
        itemIds,
        updates: { x: value },
        hasVectorLane: (itemId) => hasCoupledVectorLane(itemId, 'position'),
        getVectorOperation: (itemId) =>
          getVectorEditOperation(
            itemId,
            'position',
            value,
            resolvedTransformsByItem.get(itemId)?.y ?? 0,
          ),
        getOperation: (itemId) => getAutoKeyframeOperation(itemId, 'x', value),
        applyAutoKeyframeOperations,
        onTransformChange,
      })
      queueMicrotask(() => clearPreview())
    },
    [
      itemIds,
      onTransformChange,
      clearPreview,
      getAutoKeyframeOperation,
      applyAutoKeyframeOperations,
      hasCoupledVectorLane,
      getVectorEditOperation,
      resolvedTransformsByItem,
    ],
  )

  // Live preview for Y position (during scrub)
  const handleYLiveChange = useCallback(
    (value: number) => {
      const previews: Record<string, { y: number }> = {}
      items.forEach((item) => {
        previews[item.id] = { y: value }
      })
      setTransformPreview(previews)
    },
    [items, setTransformPreview],
  )

  // Commit Y position (with auto-keyframe support)
  const handleYChange = useCallback(
    (value: number) => {
      applyAutoKeyframedTransformChange({
        itemIds,
        updates: { y: value },
        hasVectorLane: (itemId) => hasCoupledVectorLane(itemId, 'position'),
        getVectorOperation: (itemId) =>
          getVectorEditOperation(
            itemId,
            'position',
            resolvedTransformsByItem.get(itemId)?.x ?? 0,
            value,
          ),
        getOperation: (itemId) => getAutoKeyframeOperation(itemId, 'y', value),
        applyAutoKeyframeOperations,
        onTransformChange,
      })
      queueMicrotask(() => clearPreview())
    },
    [
      itemIds,
      onTransformChange,
      clearPreview,
      getAutoKeyframeOperation,
      applyAutoKeyframeOperations,
      hasCoupledVectorLane,
      getVectorEditOperation,
      resolvedTransformsByItem,
    ],
  )

  // Live preview for width (during scrub)
  const handleWidthLiveChange = useCallback(
    (value: number) => {
      const previews: Record<string, { width: number; height?: number }> = {}
      items.forEach((item) => {
        if (aspectLocked && height !== 'mixed') {
          const newHeight = Math.round(value / currentAspectRatio)
          previews[item.id] = { width: value, height: newHeight }
        } else {
          previews[item.id] = { width: value }
        }
      })
      setTransformPreview(previews)
    },
    [items, setTransformPreview, aspectLocked, height, currentAspectRatio],
  )

  // Commit width (with auto-keyframe support)
  const handleWidthChange = useCallback(
    (value: number) => {
      const newHeight =
        aspectLocked && height !== 'mixed' ? Math.round(value / currentAspectRatio) : null
      const autoOps: AutoKeyframeOperation[] = []
      const fallbackUpdates = new Map<string, Partial<TransformProperties>>()
      for (const itemId of itemIds) {
        if (hasCoupledVectorLane(itemId, 'scale')) {
          const resolvedHeight = newHeight ?? resolvedTransformsByItem.get(itemId)?.height ?? 0
          const operation = getVectorEditOperation(itemId, 'scale', value, resolvedHeight)
          if (operation) autoOps.push(operation)
          continue
        }
        const widthOperation = getAutoKeyframeOperation(itemId, 'width', value)
        const heightOperation =
          newHeight !== null ? getAutoKeyframeOperation(itemId, 'height', newHeight) : null
        if (widthOperation) autoOps.push(widthOperation)
        if (heightOperation) autoOps.push(heightOperation)
        const updates: Partial<TransformProperties> = {}
        if (!widthOperation) {
          updates.width = value
        }
        if (newHeight !== null && !heightOperation) {
          updates.height = newHeight
        }
        if (Object.keys(updates).length > 0) {
          fallbackUpdates.set(itemId, updates)
        }
      }
      if (autoOps.length > 0) {
        applyAutoKeyframeOperations(autoOps)
      }
      if (fallbackUpdates.size > 0) {
        updateItemsTransformMap(fallbackUpdates, { operation: 'resize' })
      }
      queueMicrotask(() => clearPreview())
    },
    [
      itemIds,
      clearPreview,
      aspectLocked,
      height,
      currentAspectRatio,
      getAutoKeyframeOperation,
      applyAutoKeyframeOperations,
      updateItemsTransformMap,
      hasCoupledVectorLane,
      getVectorEditOperation,
      resolvedTransformsByItem,
    ],
  )

  // Live preview for height (during scrub)
  const handleHeightLiveChange = useCallback(
    (value: number) => {
      const previews: Record<string, { width?: number; height: number }> = {}
      items.forEach((item) => {
        if (aspectLocked && width !== 'mixed') {
          const newWidth = Math.round(value * currentAspectRatio)
          previews[item.id] = { width: newWidth, height: value }
        } else {
          previews[item.id] = { height: value }
        }
      })
      setTransformPreview(previews)
    },
    [items, setTransformPreview, aspectLocked, width, currentAspectRatio],
  )

  // Commit height (with auto-keyframe support)
  const handleHeightChange = useCallback(
    (value: number) => {
      const newWidth =
        aspectLocked && width !== 'mixed' ? Math.round(value * currentAspectRatio) : null
      const autoOps: AutoKeyframeOperation[] = []
      const fallbackUpdates = new Map<string, Partial<TransformProperties>>()
      for (const itemId of itemIds) {
        if (hasCoupledVectorLane(itemId, 'scale')) {
          const resolvedWidth = newWidth ?? resolvedTransformsByItem.get(itemId)?.width ?? 0
          const operation = getVectorEditOperation(itemId, 'scale', resolvedWidth, value)
          if (operation) autoOps.push(operation)
          continue
        }
        const heightOperation = getAutoKeyframeOperation(itemId, 'height', value)
        const widthOperation =
          newWidth !== null ? getAutoKeyframeOperation(itemId, 'width', newWidth) : null
        if (heightOperation) autoOps.push(heightOperation)
        if (widthOperation) autoOps.push(widthOperation)
        const updates: Partial<TransformProperties> = {}
        if (!heightOperation) {
          updates.height = value
        }
        if (newWidth !== null && !widthOperation) {
          updates.width = newWidth
        }
        if (Object.keys(updates).length > 0) {
          fallbackUpdates.set(itemId, updates)
        }
      }
      if (autoOps.length > 0) {
        applyAutoKeyframeOperations(autoOps)
      }
      if (fallbackUpdates.size > 0) {
        updateItemsTransformMap(fallbackUpdates, { operation: 'resize' })
      }
      queueMicrotask(() => clearPreview())
    },
    [
      itemIds,
      clearPreview,
      aspectLocked,
      width,
      currentAspectRatio,
      getAutoKeyframeOperation,
      applyAutoKeyframeOperations,
      updateItemsTransformMap,
      hasCoupledVectorLane,
      getVectorEditOperation,
      resolvedTransformsByItem,
    ],
  )

  // Live preview for rotation (during drag)
  const handleRotationLiveChange = useCallback(
    (value: number) => {
      const previews: Record<string, { rotation: number }> = {}
      items.forEach((item) => {
        previews[item.id] = { rotation: value }
      })
      setTransformPreview(previews)
    },
    [items, setTransformPreview],
  )

  // Commit rotation (on mouse up, with auto-keyframe support)
  const handleRotationChange = useCallback(
    (value: number) => {
      applyAutoKeyframedTransformChange({
        itemIds,
        updates: { rotation: value },
        getOperation: (itemId) => getAutoKeyframeOperation(itemId, 'rotation', value),
        applyAutoKeyframeOperations,
        onTransformChange,
      })
      queueMicrotask(() => clearPreview())
    },
    [
      itemIds,
      onTransformChange,
      clearPreview,
      getAutoKeyframeOperation,
      applyAutoKeyframeOperations,
    ],
  )

  const handleAnchorXLiveChange = useCallback(
    (value: number) => {
      if (mediaTransformItems.length === 0) return
      const previews: Record<string, { anchorX: number }> = {}
      mediaTransformItems.forEach((item) => {
        previews[item.id] = { anchorX: value }
      })
      setTransformPreview(previews)
    },
    [mediaTransformItems, setTransformPreview],
  )

  const handleAnchorXChange = useCallback(
    (value: number) => {
      if (mediaTransformItemIds.length === 0) return
      applyAutoKeyframedTransformChange({
        itemIds: mediaTransformItemIds,
        updates: { anchorX: value },
        hasVectorLane: (itemId) => hasCoupledVectorLane(itemId, 'anchor'),
        getVectorOperation: (itemId) =>
          getVectorEditOperation(
            itemId,
            'anchor',
            value,
            resolvedTransformsByItem.get(itemId)?.anchorY ?? 0,
          ),
        getOperation: (itemId) => getAutoKeyframeOperation(itemId, 'anchorX', value),
        applyAutoKeyframeOperations,
        onTransformChange,
      })
      queueMicrotask(() => clearPreview())
    },
    [
      mediaTransformItemIds,
      applyAutoKeyframeOperations,
      clearPreview,
      getAutoKeyframeOperation,
      onTransformChange,
      hasCoupledVectorLane,
      getVectorEditOperation,
      resolvedTransformsByItem,
    ],
  )

  const handleAnchorYLiveChange = useCallback(
    (value: number) => {
      if (mediaTransformItems.length === 0) return
      const previews: Record<string, { anchorY: number }> = {}
      mediaTransformItems.forEach((item) => {
        previews[item.id] = { anchorY: value }
      })
      setTransformPreview(previews)
    },
    [mediaTransformItems, setTransformPreview],
  )

  const handleAnchorYChange = useCallback(
    (value: number) => {
      if (mediaTransformItemIds.length === 0) return
      applyAutoKeyframedTransformChange({
        itemIds: mediaTransformItemIds,
        updates: { anchorY: value },
        hasVectorLane: (itemId) => hasCoupledVectorLane(itemId, 'anchor'),
        getVectorOperation: (itemId) =>
          getVectorEditOperation(
            itemId,
            'anchor',
            resolvedTransformsByItem.get(itemId)?.anchorX ?? 0,
            value,
          ),
        getOperation: (itemId) => getAutoKeyframeOperation(itemId, 'anchorY', value),
        applyAutoKeyframeOperations,
        onTransformChange,
      })
      queueMicrotask(() => clearPreview())
    },
    [
      mediaTransformItemIds,
      applyAutoKeyframeOperations,
      clearPreview,
      getAutoKeyframeOperation,
      onTransformChange,
      hasCoupledVectorLane,
      getVectorEditOperation,
      resolvedTransformsByItem,
    ],
  )

  // Get media items for fallback source dimensions lookup
  const mediaById = useMediaLibraryStore((s) => s.mediaById)

  // Reset scale to source dimensions (1:1 scale)
  // For shapes: reset to 1:1 aspect ratio (square based on smaller dimension)
  const handleResetScale = useCallback(() => {
    const tolerance = 0.5
    const autoOps: AutoKeyframeOperation[] = []
    const fallbackUpdates = new Map<string, Partial<TransformProperties>>()

    // For each item, reset to fit-to-canvas dimensions
    for (const item of items) {
      // Get current (keyframe-resolved) transform
      const resolved = resolvedTransformsByItem.get(item.id)
      if (!resolved) continue

      // For shapes: reset to 1:1 aspect ratio
      let targetWidth: number
      let targetHeight: number
      if (item.type === 'shape' || item.type === 'text') {
        const size = Math.min(resolved.width, resolved.height)
        targetWidth = size
        targetHeight = size
      } else {
        // First try to get source dimensions from the item itself
        let source = getSourceDimensions(item)

        // Fallback: look up dimensions from media library if item has mediaId
        if (!source && item.mediaId) {
          const media = mediaById[item.mediaId]
          if (media && media.width && media.height) {
            source = { width: media.width, height: media.height }
          }
        }

        if (!source) continue

        // Compute fit-to-canvas dimensions (the size the item had when first dragged in)
        const fitScale = Math.min(canvas.width / source.width, canvas.height / source.height)
        targetWidth = Math.round(source.width * fitScale)
        targetHeight = Math.round(source.height * fitScale)
      }

      // Item is animated through a coupled scale lane: write a vector keyframe
      // so the resolved size actually reaches the target.
      const vectorOp = getVectorScaleResetOperation(item, targetWidth, targetHeight)
      if (vectorOp) {
        autoOps.push(vectorOp)
        continue
      }

      // Only update if dimensions actually changed
      const updates: Partial<TransformProperties> = {}
      if (Math.abs(resolved.width - targetWidth) > tolerance) {
        const op = getAutoKeyframeOperation(item.id, 'width', targetWidth)
        if (op) autoOps.push(op)
        else updates.width = targetWidth
      }
      if (Math.abs(resolved.height - targetHeight) > tolerance) {
        const op = getAutoKeyframeOperation(item.id, 'height', targetHeight)
        if (op) autoOps.push(op)
        else updates.height = targetHeight
      }

      if (Object.keys(updates).length > 0) {
        fallbackUpdates.set(item.id, updates)
      }
    }

    if (autoOps.length > 0) {
      applyAutoKeyframeOperations(autoOps)
    }
    if (fallbackUpdates.size > 0) {
      updateItemsTransformMap(fallbackUpdates, { operation: 'resize' })
    }
    queueMicrotask(clearTransformUiState)
  }, [
    items,
    getAutoKeyframeOperation,
    getVectorScaleResetOperation,
    applyAutoKeyframeOperations,
    updateItemsTransformMap,
    mediaById,
    canvas,
    resolvedTransformsByItem,
    clearTransformUiState,
  ])

  // Reset position to center (x=0, y=0)
  const handleResetPosition = useCallback(() => {
    const tolerance = 0.5
    const autoOps: AutoKeyframeOperation[] = []
    const fallbackUpdates = new Map<string, Partial<TransformProperties>>()

    for (const item of items) {
      const resolved = resolvedTransformsByItem.get(item.id)
      if (!resolved) continue

      // Item animated through a coupled position lane: write a vector keyframe.
      const itemKeyframes = keyframesByItemId.get(item.id) ?? undefined
      const hasVectorPositionLane = itemKeyframes?.vectorProperties?.some(
        (candidate) => candidate.property === 'position' && candidate.keyframes.length > 0,
      )
      if (hasVectorPositionLane) {
        const op = getVectorAutoKeyframeOp(
          item,
          itemKeyframes,
          'position',
          { x: 0, y: 0 },
          currentFrame,
        )
        if (op) autoOps.push(op)
        continue
      }

      const updates: Partial<TransformProperties> = {}
      if (Math.abs(resolved.x) > tolerance) {
        const op = getAutoKeyframeOperation(item.id, 'x', 0)
        if (op) autoOps.push(op)
        else updates.x = 0
      }
      if (Math.abs(resolved.y) > tolerance) {
        const op = getAutoKeyframeOperation(item.id, 'y', 0)
        if (op) autoOps.push(op)
        else updates.y = 0
      }

      if (Object.keys(updates).length > 0) {
        fallbackUpdates.set(item.id, updates)
      }
    }

    if (autoOps.length > 0) {
      applyAutoKeyframeOperations(autoOps)
    }
    if (fallbackUpdates.size > 0) {
      updateItemsTransformMap(fallbackUpdates)
    }
    queueMicrotask(clearTransformUiState)
  }, [
    items,
    getAutoKeyframeOperation,
    applyAutoKeyframeOperations,
    updateItemsTransformMap,
    resolvedTransformsByItem,
    currentFrame,
    keyframesByItemId,
    clearTransformUiState,
  ])

  // Reset rotation to 0°
  const handleResetRotation = useCallback(() => {
    const tolerance = 0.5
    const autoOps: AutoKeyframeOperation[] = []
    const fallbackUpdates = new Map<string, Partial<TransformProperties>>()

    for (const item of items) {
      const resolved = resolvedTransformsByItem.get(item.id)
      if (!resolved) continue

      if (Math.abs(resolved.rotation) <= tolerance) continue
      const op = getAutoKeyframeOperation(item.id, 'rotation', 0)
      if (op) autoOps.push(op)
      else fallbackUpdates.set(item.id, { rotation: 0 })
    }

    if (autoOps.length > 0) {
      applyAutoKeyframeOperations(autoOps)
    }
    if (fallbackUpdates.size > 0) {
      updateItemsTransformMap(fallbackUpdates)
    }
    queueMicrotask(clearTransformUiState)
  }, [
    items,
    getAutoKeyframeOperation,
    applyAutoKeyframeOperations,
    updateItemsTransformMap,
    resolvedTransformsByItem,
    clearTransformUiState,
  ])

  const handleFlipHorizontalChange = useCallback(
    (checked: boolean) => {
      if (mediaTransformItemIds.length === 0) return
      onTransformChange(mediaTransformItemIds, { flipHorizontal: checked })
    },
    [mediaTransformItemIds, onTransformChange],
  )

  const handleFlipVerticalChange = useCallback(
    (checked: boolean) => {
      if (mediaTransformItemIds.length === 0) return
      onTransformChange(mediaTransformItemIds, { flipVertical: checked })
    },
    [mediaTransformItemIds, onTransformChange],
  )

  const handleResetAnchor = useCallback(() => {
    if (mediaTransformItems.length === 0) return
    const needsReset = mediaTransformItems.some(
      (item) => item.transform?.anchorX !== undefined || item.transform?.anchorY !== undefined,
    )
    if (needsReset) {
      onTransformChange(mediaTransformItemIds, {
        anchorX: undefined,
        anchorY: undefined,
      })
    }
    queueMicrotask(clearTransformUiState)
  }, [clearTransformUiState, mediaTransformItemIds, mediaTransformItems, onTransformChange])

  return (
    <PropertySection title={t('editor.layoutSection.transform')} icon={Move} defaultOpen={true}>
      {/* Position */}
      <PropertyRow label={t('editor.layoutSection.position')}>
        <div className="flex items-start gap-1 w-full">
          <div className="grid grid-cols-2 gap-1 flex-1">
            <PositionAxisControl
              axis="x"
              itemIds={itemIds}
              canvas={canvas}
              onChange={handleXChange}
              onLiveChange={handleXLiveChange}
              getVectorValue={getPositionVectorValue}
            />
            <PositionAxisControl
              axis="y"
              itemIds={itemIds}
              canvas={canvas}
              onChange={handleYChange}
              onLiveChange={handleYLiveChange}
              getVectorValue={getPositionVectorValue}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0"
            onClick={handleResetPosition}
            title={t('editor.layoutSection.resetPosition')}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </PropertyRow>

      {/* Dimensions */}
      <PropertyRow label={t('editor.layoutSection.size')}>
        <div className="flex items-center gap-1 w-full">
          <NumberInput
            value={width}
            onChange={handleWidthChange}
            onLiveChange={handleWidthLiveChange}
            label="W"
            unit="px"
            min={1}
            max={7680}
            step={1}
            className="flex-1 min-w-0"
          />
          <KeyframeToggle
            itemIds={itemIds}
            property="width"
            currentValue={width === 'mixed' ? 100 : width}
            vector={widthVector}
          />
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 flex-shrink-0 ${aspectLocked ? 'text-primary' : ''}`}
            onClick={onAspectLockToggle}
            title={
              aspectLocked
                ? t('editor.layoutSection.unlockAspect')
                : t('editor.layoutSection.lockAspect')
            }
          >
            {aspectLocked ? (
              <Link2 className="w-3.5 h-3.5" />
            ) : (
              <Link2Off className="w-3.5 h-3.5" />
            )}
          </Button>
          <NumberInput
            value={height}
            onChange={handleHeightChange}
            onLiveChange={handleHeightLiveChange}
            label="H"
            unit="px"
            min={1}
            max={7680}
            step={1}
            className="flex-1 min-w-0"
          />
          <KeyframeToggle
            itemIds={itemIds}
            property="height"
            currentValue={height === 'mixed' ? 100 : height}
            vector={heightVector}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0"
            onClick={handleResetScale}
            title={t('editor.layoutSection.resetSize')}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </PropertyRow>

      {/* Rotation */}
      <PropertyRow label={t('editor.layoutSection.rotation')}>
        <div className="flex items-center gap-1 w-full">
          <SliderInput
            value={rotation}
            onChange={handleRotationChange}
            onLiveChange={handleRotationLiveChange}
            min={-180}
            max={180}
            step={1}
            unit="°"
            className="flex-1 min-w-0"
          />
          <KeyframeToggle
            itemIds={itemIds}
            property="rotation"
            currentValue={rotation === 'mixed' ? 0 : rotation}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0"
            onClick={handleResetRotation}
            title={t('editor.layoutSection.resetRotation')}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </PropertyRow>

      {mediaTransformItems.length > 0 && (
        <PropertyRow label={t('editor.layoutSection.anchor')}>
          <div className="flex items-center gap-1 w-full">
            <div className="flex items-center gap-0.5 flex-1 min-w-0">
              <NumberInput
                value={mediaAnchorX}
                onChange={handleAnchorXChange}
                onLiveChange={handleAnchorXLiveChange}
                label="X"
                unit="px"
                step={1}
                className="flex-1 min-w-0"
              />
              <KeyframeToggle
                itemIds={mediaTransformItemIds}
                property="anchorX"
                currentValue={mediaAnchorX === 'mixed' ? 0 : mediaAnchorX}
                vector={anchorXVector}
              />
            </div>
            <div className="flex items-center gap-0.5 flex-1 min-w-0">
              <NumberInput
                value={mediaAnchorY}
                onChange={handleAnchorYChange}
                onLiveChange={handleAnchorYLiveChange}
                label="Y"
                unit="px"
                step={1}
                className="flex-1 min-w-0"
              />
              <KeyframeToggle
                itemIds={mediaTransformItemIds}
                property="anchorY"
                currentValue={mediaAnchorY === 'mixed' ? 0 : mediaAnchorY}
                vector={anchorYVector}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={handleResetAnchor}
              title={t('editor.layoutSection.resetAnchor')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </PropertyRow>
      )}

      {mediaTransformItems.length > 0 && (
        <PropertyRow label={t('editor.layoutSection.flip')}>
          <div className="flex items-center justify-between gap-3 w-full">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={flipHorizontal === 'mixed' ? false : flipHorizontal}
                onCheckedChange={handleFlipHorizontalChange}
                aria-label={t('editor.layoutSection.flipHorizontalAria')}
              />
              <span>
                {flipHorizontal === 'mixed'
                  ? t('editor.layoutSection.horizontalMixed')
                  : t('editor.layoutSection.horizontal')}
              </span>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={flipVertical === 'mixed' ? false : flipVertical}
                onCheckedChange={handleFlipVerticalChange}
                aria-label={t('editor.layoutSection.flipVerticalAria')}
              />
              <span>
                {flipVertical === 'mixed'
                  ? t('editor.layoutSection.verticalMixed')
                  : t('editor.layoutSection.vertical')}
              </span>
            </label>
          </div>
        </PropertyRow>
      )}
    </PropertySection>
  )
})
