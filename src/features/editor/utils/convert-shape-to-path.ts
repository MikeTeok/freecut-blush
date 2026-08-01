/**
 * Convert a parametric shape into an editable `path` shape.
 *
 * The parametric geometry is baked into normalized `pathVertices` (0-1 relative
 * to the item's own transform box) at the resolved transform of the playhead,
 * so re-rendering via `getShapePath` reproduces the exact same shape while
 * rotation/flips keep living in the transform.
 */
import type { ShapeItem } from '@/types/timeline'
import type { CanvasSettings, ResolvedTransform } from '@/types/transform'
import type { MaskVertex } from '@/types/masks'
import {
  getShapePath,
  hasCornerPin,
  resolveItemTransformAtFrame,
} from '@/features/editor/deps/composition-runtime'
import {
  normalizeMaskVertices,
  parseSvgPathToMaskVertices,
} from '@/shared/graphics/shapes/svg-path-to-vertices'
import { useProjectStore } from '@/features/editor/deps/projects'
import { useKeyframesStore } from '@/features/editor/deps/timeline-store'
import { usePlaybackStore } from '@/shared/state/playback'
import { DEFAULT_PROJECT_HEIGHT, DEFAULT_PROJECT_WIDTH } from '@/shared/projects/defaults'

export interface ShapeToPathUpdate {
  shapeType: 'path'
  pathVertices: MaskVertex[]
  pathClosed: boolean
}

/**
 * Pure core: bake a shape's geometry at a resolved transform into normalized
 * path vertices. Returns null for degenerate shapes (fewer than two anchors).
 */
export function shapeToPathUpdate(
  shape: ShapeItem,
  resolved: Pick<ResolvedTransform, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'opacity'> &
    Partial<Pick<ResolvedTransform, 'cornerRadius'>>,
  canvas: CanvasSettings,
): ShapeToPathUpdate | null {
  const path = getShapePath(shape, resolved, {
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
  })
  const parsed = parseSvgPathToMaskVertices(path)
  if (parsed.vertices.length < 2) return null

  // getShapePath emits coordinates in canvas pixel space anchored at the item's
  // top-left corner (boxLeft/boxTop). Translate back to item-local pixel space
  // before normalizing relative to the item's transform box.
  const boxLeft = canvas.width / 2 + resolved.x - resolved.width / 2
  const boxTop = canvas.height / 2 + resolved.y - resolved.height / 2
  const localVertices = parsed.vertices.map((vertex) => ({
    ...vertex,
    position: [vertex.position[0] - boxLeft, vertex.position[1] - boxTop] as [number, number],
  }))

  return {
    shapeType: 'path',
    pathVertices: normalizeMaskVertices(localVertices, resolved.width, resolved.height),
    pathClosed: parsed.closed ? true : (shape.pathClosed ?? true),
  }
}

/**
 * Convert a shape item to an editable path at the playhead, reading editor
 * state from stores. Corner-pinned shapes cannot be baked through `getShapePath`
 * (their warp lives outside path geometry) so they return null.
 */
export function convertShapeToPath(shape: ShapeItem): ShapeToPathUpdate | null {
  if (hasCornerPin(shape.cornerPin)) return null

  if (shape.shapeType === 'path') {
    return {
      shapeType: 'path',
      pathVertices: shape.pathVertices ?? [],
      pathClosed: shape.pathClosed ?? true,
    }
  }

  const project = useProjectStore.getState().currentProject
  const canvas: CanvasSettings = {
    width: project?.metadata?.width ?? DEFAULT_PROJECT_WIDTH,
    height: project?.metadata?.height ?? DEFAULT_PROJECT_HEIGHT,
    fps: project?.metadata?.fps ?? 30,
  }
  const keyframes = useKeyframesStore.getState().keyframesByItemId[shape.id]
  const resolved = resolveItemTransformAtFrame(shape, {
    canvas,
    frame: usePlaybackStore.getState().currentFrame,
    keyframes,
  })
  return shapeToPathUpdate(shape, resolved, canvas)
}
