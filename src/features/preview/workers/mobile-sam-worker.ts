/**
 * MobileSAM Mask Worker
 *
 * Hosts a shared `MobileSamSegmenter` so the expensive model download and
 * session compilation happen once and live across clicks. One message at a
 * time: MobileSAM's encoder saturates all CPU threads, so concurrent segments
 * would only serialize anyway.
 */

import { createLogger } from '@/shared/logging/logger'
import { MobileSamSegmenter, type MobileSamPromptPoint } from '../mask-ai/mobile-sam-segmenter'

const logger = createLogger('MobileSamWorker')

export interface MobileSamLoadRequest {
  type: 'load'
  requestId: string
}

export interface MobileSamSegmentRequest {
  type: 'segment'
  requestId: string
  rgba: Uint8ClampedArray
  width: number
  height: number
  points: MobileSamPromptPoint[]
}

export interface MobileSamDisposeRequest {
  type: 'dispose'
  requestId: string
}

export type MobileSamWorkerRequest =
  | MobileSamLoadRequest
  | MobileSamSegmentRequest
  | MobileSamDisposeRequest

export interface MobileSamProgressResponse {
  type: 'progress'
  requestId: string
  receivedBytes: number
  totalBytes: number
  fromCache: boolean
}

export interface MobileSamLoadCompleteResponse {
  type: 'load-complete'
  requestId: string
}

export interface MobileSamSegmentCompleteResponse {
  type: 'segment-complete'
  requestId: string
  width: number
  height: number
  /** Transferable: the caller must not mutate the source rgba afterwards. */
  alpha: Uint8Array
}

export interface MobileSamErrorResponse {
  type: 'error'
  requestId: string
  error: string
}

export type MobileSamWorkerResponse =
  | MobileSamProgressResponse
  | MobileSamLoadCompleteResponse
  | MobileSamSegmentCompleteResponse
  | MobileSamErrorResponse

let segmenter: MobileSamSegmenter | null = null

function post(message: MobileSamWorkerResponse, transfer?: Transferable[]): void {
  self.postMessage(message, transfer ? { transfer } : undefined)
}

async function ensureSegmenter(requestId: string): Promise<MobileSamSegmenter> {
  if (!segmenter) {
    segmenter = new MobileSamSegmenter({
      onDownloadProgress: ({ receivedBytes, totalBytes, fromCache }) =>
        post({ type: 'progress', requestId, receivedBytes, totalBytes, fromCache }),
    })
  }
  const model = segmenter
  await model.ready()
  return model
}

async function load(requestId: string): Promise<void> {
  await ensureSegmenter(requestId)
  post({ type: 'load-complete', requestId })
}

async function segment(request: MobileSamSegmentRequest): Promise<void> {
  const { requestId, rgba, width, height, points } = request
  const model = await ensureSegmenter(requestId)
  try {
    const result = await model.segment(rgba, width, height, points)
    post({ type: 'segment-complete', requestId, width, height, alpha: result.alpha }, [
      result.alpha.buffer,
    ])
  } catch (error) {
    post({
      type: 'error',
      requestId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

self.onmessage = async (event: MessageEvent<MobileSamWorkerRequest>) => {
  const message = event.data

  try {
    if (message.type === 'load') {
      await load(message.requestId)
    } else if (message.type === 'segment') {
      await segment(message)
    } else {
      // dispose: free the model so a later load/segment re-downloads.
      segmenter = null
    }
  } catch (error) {
    logger.error('MobileSAM worker failed', { requestId: message.requestId, error })
    post({
      type: 'error',
      requestId: message.requestId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
