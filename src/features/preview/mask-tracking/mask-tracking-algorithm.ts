/**
 * Mask tracking algorithm (pure).
 *
 * Traces a MobileSAM mask across a frame range: each frame is segmented with
 * the user's original prompt points translated by the previous frame's mask
 * centroid, the resulting alpha contour is traced, and the outline is resampled
 * to a fixed vertex count so every frame shares identical path topology.
 *
 * No store/DOM dependencies — the caller injects `segmentAtFrame`, which makes
 * this module directly unit-testable.
 */

import type { MaskVertex, PromptPoint } from '@/types/masks'
import type { ShapeItem } from '@/types/timeline'
import { traceMaskAlphaContourPixels } from '@/features/preview/utils/mask-bitmap-tracer'
import { DEFAULT_TRACKED_PATH_VERTICES, sampleClosedOutlineByArcLength } from './track-outline'

/** Pixels with alpha at or below this value are treated as background. */
const MASK_TRACE_ALPHA_THRESHOLD = 32

export interface MaskFrameData {
  alpha: Uint8Array
  width: number
  height: number
}

export interface MaskTrackingFrame {
  /** Absolute timeline frame this result corresponds to. */
  frame: number
  /** Path geometry in shape-local normalized space (identical count per frame). */
  vertices: MaskVertex[]
  /** Item transform position (canvas px, relative to canvas center). */
  transform: { x: number; y: number }
}

export interface MaskTrackingResult {
  /** One entry per tracked frame, in ascending frame order. */
  frames: MaskTrackingFrame[]
  /** Path geometry used as the new base (first successfully tracked frame). */
  baseVertices: MaskVertex[]
}

export interface TrackMaskFramesOptions {
  /** Absolute timeline frame of the first tracked frame. */
  startFrame: number
  /** Exclusive end of the tracked range (last tracked frame = endFrame - 1). */
  endFrame: number
  /** Number of vertices each frame's outline is resampled to. */
  vertexCount?: number
  /** Bounding box dimensions of the moving reference (item transform width/height, px). */
  boxWidth: number
  boxHeight: number
  /** Project canvas dimensions (px). */
  canvasWidth: number
  canvasHeight: number
  /** Original prompt points at the trace start frame, in canvas px. */
  promptPoints: PromptPoint[]
  /** Segment one frame. Returning null (or throwing) means "no result". */
  segmentAtFrame: (frame: number, points: PromptPoint[]) => Promise<MaskFrameData | null>
  /** When truthy, the loop stops after the current frame (partial result kept). */
  shouldCancel?: () => boolean
  onProgress?: (done: number, total: number, frame: number) => void
}

interface TrackedFrameState {
  vertices: MaskVertex[]
  centroid: { x: number; y: number }
  transform: { x: number; y: number }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Segment one frame and build a `TrackedFrameState` from its largest contour.
 * Returns null when the frame has no usable result (empty/degenerate mask or
 * a segmentation failure) so the caller can hold the previous frame.
 */
async function segmentTrackedFrame(
  options: TrackMaskFramesOptions,
  frame: number,
  prompt: PromptPoint[],
): Promise<TrackedFrameState | null> {
  let result: MaskFrameData | null = null
  try {
    result = await options.segmentAtFrame(frame, prompt)
  } catch {
    result = null
  }
  if (!result || result.alpha.length === 0) return null

  const centroid = computeMaskCentroid(result.alpha, result.width, result.height)
  if (!centroid) return null

  const contour = maskAlphaToCanvasContour(result.alpha, result.width, result.height)
  if (contour.length < 3) return null

  const vertexCount = options.vertexCount ?? DEFAULT_TRACKED_PATH_VERTICES
  const space = { boxWidth: options.boxWidth, boxHeight: options.boxHeight }
  return {
    vertices: maskContourToItemVertices(contour, centroid, space, vertexCount),
    centroid,
    transform: {
      x: centroid.x - options.canvasWidth / 2,
      y: centroid.y - options.canvasHeight / 2,
    },
  }
}

function propagatePromptPoints(
  promptPoints: PromptPoint[],
  offset: { x: number; y: number },
): PromptPoint[] {
  if (promptPoints.length === 0) return []
  return promptPoints.map((point) => ({
    x: point.x + offset.x,
    y: point.y + offset.y,
    label: point.label,
  }))
}

/** Area-weighted centroid of the foreground mask, or null when it is empty. */
export function computeMaskCentroid(
  alpha: Uint8Array,
  width: number,
  height: number,
): { x: number; y: number } | null {
  let sumX = 0
  let sumY = 0
  let weight = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = alpha[y * width + x] ?? 0
      if (value <= MASK_TRACE_ALPHA_THRESHOLD) continue
      sumX += x * value
      sumY += y * value
      weight += value
    }
  }
  if (weight <= 0) return null
  return { x: sumX / weight, y: sumY / weight }
}

/** Trace the largest foreground contour from a raw alpha channel. */
export function maskAlphaToCanvasContour(
  alpha: Uint8Array,
  width: number,
  height: number,
): Array<[number, number]> {
  return traceMaskAlphaContourPixels({ alpha, width, height }, MASK_TRACE_ALPHA_THRESHOLD)
}

/**
 * Convert a traced contour into shape-local normalized `MaskVertex[]` centered
 * on the moving mask centroid within a fixed-size bounding box. Every call with
 * the same `count` yields the same topology, satisfying the animated-path
 * constraint of an unchanging vertex count.
 */
export function maskContourToItemVertices(
  contour: ReadonlyArray<[number, number]>,
  centroid: { x: number; y: number },
  space: { boxWidth: number; boxHeight: number },
  count: number,
): MaskVertex[] {
  const resampled = sampleClosedOutlineByArcLength(contour, count)
  const left = centroid.x - space.boxWidth / 2
  const top = centroid.y - space.boxHeight / 2
  return resampled.map(([pointX, pointY]) => ({
    position: [
      clamp01((pointX - left) / space.boxWidth),
      clamp01((pointY - top) / space.boxHeight),
    ] as [number, number],
    inHandle: [0, 0] as [number, number],
    outHandle: [0, 0] as [number, number],
    tangentMode: 'corner',
  }))
}

/**
 * Derive a single positive prompt point (canvas px) from the shape's current
 * geometry. Used as a fallback when the item has no persisted prompt points —
 * e.g. masks drawn by hand or committed before prompts were stored.
 */
export function computeMaskPromptPointFromShape(
  item: ShapeItem,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  const transform = item.transform ?? {}
  const { x = 0, y = 0, width = 1, height = 1 } = transform
  const boxWidth = Math.max(1, width)
  const boxHeight = Math.max(1, height)
  const centerX = x + canvasWidth / 2
  const centerY = y + canvasHeight / 2
  const vertices = item.pathVertices
  if (!vertices || vertices.length === 0) {
    return { x: Math.round(centerX), y: Math.round(centerY) }
  }
  let sumX = 0
  let sumY = 0
  for (const vertex of vertices) {
    sumX += centerX + (vertex.position[0] - 0.5) * boxWidth
    sumY += centerY + (vertex.position[1] - 0.5) * boxHeight
  }
  return { x: Math.round(sumX / vertices.length), y: Math.round(sumY / vertices.length) }
}

/**
 * Track the mask across `[startFrame, endFrame)`. Segments every frame,
 * propagates the prompt group by the previous centroid's displacement, and
 * holds the last good result on any frame whose segmentation is empty or
 * degenerate. Throws if the first frame yields no result.
 */
export async function trackMaskFrames(
  options: TrackMaskFramesOptions,
): Promise<MaskTrackingResult> {
  const total = options.endFrame - options.startFrame
  if (total <= 0) throw new Error('No frames to track')

  const frames: MaskTrackingFrame[] = []
  let referenceCentroid: { x: number; y: number } | null = null
  let lastGood: TrackedFrameState | null = null

  for (let index = 0; index < total; index++) {
    if (options.shouldCancel?.()) break
    const frame = options.startFrame + index

    const offset =
      lastGood && referenceCentroid
        ? {
            x: lastGood.centroid.x - referenceCentroid.x,
            y: lastGood.centroid.y - referenceCentroid.y,
          }
        : { x: 0, y: 0 }
    const prompt = propagatePromptPoints(options.promptPoints, offset)

    const tracked: TrackedFrameState | null =
      (await segmentTrackedFrame(options, frame, prompt)) ?? lastGood
    if (!tracked) {
      throw new Error(`Mask tracking failed on frame ${frame}: no segmentation result`)
    }
    if (lastGood !== tracked) {
      referenceCentroid ??= tracked.centroid
      lastGood = tracked
    }

    frames.push({ frame, vertices: tracked.vertices, transform: tracked.transform })
    options.onProgress?.(index + 1, total, frame)
  }

  if (frames.length === 0) throw new Error('Mask tracking produced no frames')
  return { frames, baseVertices: (lastGood ?? frames[0]!).vertices }
}
