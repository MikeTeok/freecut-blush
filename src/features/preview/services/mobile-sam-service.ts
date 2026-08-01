/**
 * MobileSAM mask service.
 *
 * Wraps the MobileSAM worker behind request/response correlation. Segments are
 * one at a time — the encoder saturates all CPU threads — so concurrent callers
 * queue and run in order.
 *
 * Model warm-up is explicit via `warm()`, but `segment()` also warms lazily, so
 * the first click works without a separate warm step; `warm()` just lets the UI
 * start the ~1.4s weight download before the user clicks.
 */

import { createLogger } from '@/shared/logging/logger'
import { createManagedWorker } from '@/shared/utils/managed-worker'
import type { MobileSamPromptPoint } from '../mask-ai/mobile-sam-segmenter'
import type { MobileSamWorkerRequest, MobileSamWorkerResponse } from '../workers/mobile-sam-worker'

const logger = createLogger('MobileSamService')

interface MobileSamSegmentInput {
  rgba: Uint8ClampedArray
  width: number
  height: number
  points: MobileSamPromptPoint[]
}

interface MobileSamSegmentOutput {
  width: number
  height: number
  alpha: Uint8Array
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  type: 'load' | 'segment'
}

class MobileSamService {
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private readonly queue: Array<() => Promise<void>> = []
  private draining = false
  private warmPromise: Promise<void> | null = null

  private readonly workerManager = createManagedWorker({
    createWorker: () =>
      new Worker(new URL('../workers/mobile-sam-worker.ts', import.meta.url), {
        type: 'module',
      }),
    setupWorker: (worker) => {
      worker.onerror = (error) => logger.error('MobileSAM worker error', { error })
      return () => {
        worker.onerror = null
      }
    },
  })

  /**
   * Warm the model (download + compile). Idempotent and concurrency-safe;
   * progress is reported to the caller that triggered the download. Resolves
   * once ready even if another caller already started warming.
   */
  warm(onProgress?: (received: number, total: number, fromCache: boolean) => void): Promise<void> {
    if (!this.warmPromise) {
      this.warmPromise = new Promise<void>((resolve, reject) => {
        const requestId = `warm-${crypto.randomUUID()}`
        this.pendingRequests.set(requestId, {
          resolve: () => resolve(),
          reject: (error) => reject(error),
          type: 'load',
        })
        this.enqueue(() => this.sendAndWait(requestId, { type: 'load', requestId }))
      }).catch((error) => {
        // Let a later warm()/segment() retry rather than caching the rejection.
        this.warmPromise = null
        throw error
      })
    }
    if (onProgress) {
      this.progressListeners.add(onProgress)
      return this.warmPromise.finally(() => this.progressListeners.delete(onProgress))
    }
    return this.warmPromise
  }

  /** True while the model is downloading or compiling. */
  isWarming(): boolean {
    return this.warmPromise !== null
  }

  /** True while a segmentation is in flight or queued. */
  isBusy(): boolean {
    return this.queue.length > 0 || this.draining
  }

  /**
   * Segment a frame. Queues behind any in-flight segment. Returns a foreground
   * alpha at the frame's native resolution.
   */
  segment(input: MobileSamSegmentInput): Promise<MobileSamSegmentOutput> {
    const { rgba, width, height, points } = input
    return new Promise<MobileSamSegmentOutput>((resolve, reject) => {
      const requestId = `segment-${crypto.randomUUID()}`
      this.pendingRequests.set(requestId, {
        resolve: (value) => resolve(value as MobileSamSegmentOutput),
        reject: (error) => reject(error),
        type: 'segment',
      })
      this.enqueue(() =>
        this.sendAndWait(requestId, {
          type: 'segment',
          requestId,
          rgba,
          width,
          height,
          points,
        }),
      )
    })
  }

  dispose(): void {
    this.workerManager.terminate()
    this.pendingRequests.clear()
    this.warmPromise = null
  }

  private readonly progressListeners = new Set<
    (received: number, total: number, fromCache: boolean) => void
  >()

  private enqueue(job: () => Promise<void>): void {
    this.queue.push(job)
    void this.drain()
  }

  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift()!
        try {
          await job()
        } catch (error) {
          // The per-request rejection is handled by sendAndWait's caller.
          logger.error('MobileSAM queued job failed', { error })
        }
      }
    } finally {
      this.draining = false
    }
  }

  private sendAndWait(requestId: string, message: MobileSamWorkerRequest): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const worker = this.workerManager.getWorker()
      const onMessage = (event: MessageEvent<MobileSamWorkerResponse>) => {
        const response = event.data
        if (response.requestId !== requestId) return
        if (response.type === 'progress') {
          for (const listener of this.progressListeners) {
            listener(response.receivedBytes, response.totalBytes, response.fromCache)
          }
          return
        }
        worker.removeEventListener('message', onMessage)
        const pending = this.pendingRequests.get(requestId)
        if (response.type === 'error') {
          this.pendingRequests.delete(requestId)
          pending?.reject(new Error(response.error))
          reject(new Error(response.error))
          return
        }
        this.pendingRequests.delete(requestId)
        if (response.type === 'segment-complete') {
          pending?.resolve({
            width: response.width,
            height: response.height,
            alpha: response.alpha,
          })
        } else {
          pending?.resolve(undefined)
        }
        resolve()
      }
      worker.addEventListener('message', onMessage)
      worker.postMessage(message)
    })
  }
}

export const mobileSamService = new MobileSamService()
