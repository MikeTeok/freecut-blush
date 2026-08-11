import type { TransformProperties } from '@/types/transform'
import type { AutoKeyframeOperation } from '@/features/editor/deps/keyframes'

interface ApplyAutoKeyframedTransformChangeOptions {
  itemIds: readonly string[]
  updates: Partial<TransformProperties>
  getOperation: (itemId: string) => AutoKeyframeOperation | null
  applyAutoKeyframeOperations: (operations: AutoKeyframeOperation[]) => void
  onTransformChange: (ids: string[], updates: Partial<TransformProperties>) => void
  /**
   * When set, items with a coupled vector lane for the edited property are
   * committed through a vector keyframe instead of the scalar/base fallback.
   */
  hasVectorLane?: (itemId: string) => boolean
  getVectorOperation?: (itemId: string) => AutoKeyframeOperation | null
}

export function applyAutoKeyframedTransformChange({
  itemIds,
  updates,
  getOperation,
  hasVectorLane,
  getVectorOperation,
  applyAutoKeyframeOperations,
  onTransformChange,
}: ApplyAutoKeyframedTransformChangeOptions): void {
  const autoOps: AutoKeyframeOperation[] = []
  const fallbackItemIds: string[] = []

  for (const itemId of itemIds) {
    if (hasVectorLane?.(itemId)) {
      const operation = getVectorOperation?.(itemId) ?? null
      if (operation) autoOps.push(operation)
      continue
    }
    const operation = getOperation(itemId)
    if (operation) {
      autoOps.push(operation)
    } else {
      fallbackItemIds.push(itemId)
    }
  }

  if (autoOps.length > 0) {
    applyAutoKeyframeOperations(autoOps)
  }
  if (fallbackItemIds.length > 0) {
    onTransformChange(fallbackItemIds, updates)
  }
}
