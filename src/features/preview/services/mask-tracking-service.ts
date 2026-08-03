/**
 * Mask tracking service.
 *
 * Runs a MobileSAM mask track over a shape item's full duration: temporarily
 * hides the mask, captures each composited frame from the preview renderer,
 * segments it with the original prompt points (propagated by the previous
 * frame's centroid), traces the alpha contour, and finally writes per-frame
 * path-vertex + position keyframes in one undoable command.
 *
 * The MobileSAM encoder saturates all CPU threads and runs one segment at a
 * time, so this is a long-running serial sequence. Progress is reported to
 * `useMaskTrackingStore` and cancellation is honored between frames.
 */

import { usePlaybackStore } from '@/shared/state/playback'
import { usePreviewBridgeStore } from '@/shared/state/preview-bridge'
import { useItemsStore, useTimelineStore } from '@/features/preview/deps/timeline-store'
import { applyMaskTrackingKeyframes } from '@/features/preview/deps/timeline-contract'
import type { MaskTrackingKeyframeData } from '@/features/preview/deps/timeline-contract'
import type { ShapeItem } from '@/types/timeline'
import type { PromptPoint } from '@/types/masks'
import { mobileSamService } from './mobile-sam-service'
import { useMaskTrackingStore } from '../stores/mask-tracking-store'
import {
  computeMaskPromptPointFromShape,
  trackMaskFrames,
  type MaskFrameData,
  type MaskTrackingResult,
} from '../mask-tracking/mask-tracking-algorithm'

/** The item being tracked right now (null when idle). */
let activeItemId: string | null = null

async function captureFrame(frame: number): Promise<OffscreenCanvas | HTMLCanvasElement | null> {
  const playback = usePlaybackStore.getState()
  playback.setCurrentFrame(frame)
  if (playback.previewFrame !== null) playback.setPreviewFrame(null)
  const capture = usePreviewBridgeStore.getState().captureCanvasSource
  return capture ? capture({ fresh: true }) : null
}

async function segmentFrameSource(
  source: OffscreenCanvas | HTMLCanvasElement,
  points: PromptPoint[],
): Promise<MaskFrameData | null> {
  const context = source.getContext('2d')
  if (!context) return null
  const imageData = context.getImageData(0, 0, source.width, source.height)
  try {
    const segmentation = await mobileSamService.segment({
      rgba: imageData.data,
      width: source.width,
      height: source.height,
      points,
    })
    return { alpha: segmentation.alpha, width: segmentation.width, height: segmentation.height }
  } catch {
    return null
  }
}

interface TrackingPassContext {
  shapeItem: ShapeItem
  boxWidth: number
  boxHeight: number
  cancelVersionAtStart: number
}

async function runTrackingPass(context: TrackingPassContext): Promise<MaskTrackingResult> {
  const { fps } = useTimelineStore.getState()
  if (!fps || fps <= 0) throw new Error('Timeline frame rate is not available')

  await mobileSamService.warm()

  const firstSource = await captureFrame(context.shapeItem.from)
  if (!firstSource) {
    throw new Error('Preview frame is not available — open the preview first')
  }
  const canvasWidth = firstSource.width
  const canvasHeight = firstSource.height

  const storedPrompts = context.shapeItem.aiPromptPoints ?? []
  const promptPoints: PromptPoint[] =
    storedPrompts.length > 0
      ? storedPrompts
      : [
          {
            ...computeMaskPromptPointFromShape(context.shapeItem, canvasWidth, canvasHeight),
            label: 1,
          },
        ]

  return trackMaskFrames({
    startFrame: context.shapeItem.from,
    endFrame: context.shapeItem.from + context.shapeItem.durationInFrames,
    boxWidth: context.boxWidth,
    boxHeight: context.boxHeight,
    canvasWidth,
    canvasHeight,
    promptPoints,
    shouldCancel: () =>
      useMaskTrackingStore.getState().cancelRequestVersion !== context.cancelVersionAtStart,
    onProgress: (done, total, currentFrame) =>
      useMaskTrackingStore.getState().setProgress({ done, total, currentFrame }),
    segmentAtFrame: async (frame, points) => {
      const source = await captureFrame(frame)
      return source ? segmentFrameSource(source, points) : null
    },
  })
}

export async function startMaskTracking(itemId: string): Promise<void> {
  if (activeItemId !== null) {
    throw new Error('Mask tracking is already running')
  }

  const store = useMaskTrackingStore.getState()
  const item = useItemsStore.getState().items.find((candidate) => candidate.id === itemId)
  if (!item || item.type !== 'shape' || item.shapeType !== 'path') {
    throw new Error('Select an AI-generated mask shape to track')
  }
  const shapeItem = item as ShapeItem
  if (!shapeItem.pathVertices || shapeItem.pathVertices.length < 3) {
    throw new Error('The mask path does not have enough vertices to track')
  }

  activeItemId = itemId
  const cancelVersionAtStart = store.cancelRequestVersion
  store.setRunning(true)
  store.setError(null)
  store.setProgress(null)

  const playback = usePlaybackStore.getState()
  const wasPlaying = playback.isPlaying
  const frameAtStart = playback.currentFrame
  if (wasPlaying) playback.pause()

  // Temporarily hide the mask so the captured composite shows the untouched
  // underlying video instead of the already-applied mask.
  const transform = shapeItem.transform ?? {}
  const boxWidth = Math.max(1, transform.width ?? 1)
  const boxHeight = Math.max(1, transform.height ?? 1)
  const originalIsMask = shapeItem.isMask ?? false
  const originalOpacity = transform.opacity ?? 1
  useItemsStore.getState()._updateItem(itemId, { isMask: false })
  useItemsStore.getState()._updateItemTransform(itemId, { opacity: 0 })

  try {
    const result = await runTrackingPass({
      shapeItem,
      boxWidth,
      boxHeight,
      cancelVersionAtStart,
    })

    if (result.frames.length > 0) {
      const trackingData: MaskTrackingKeyframeData = {
        frames: result.frames,
        baseVertices: result.baseVertices,
      }
      applyMaskTrackingKeyframes(itemId, trackingData)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    useMaskTrackingStore.getState().setError(message)
  } finally {
    useItemsStore.getState()._updateItem(itemId, { isMask: originalIsMask })
    useItemsStore.getState()._updateItemTransform(itemId, { opacity: originalOpacity })
    const playbackState = usePlaybackStore.getState()
    playbackState.setCurrentFrame(frameAtStart)
    playbackState.setPreviewFrame(null)
    useMaskTrackingStore.getState().setRunning(false)
    activeItemId = null
  }
}
