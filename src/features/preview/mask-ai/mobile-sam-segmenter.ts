/**
 * MobileSAM segmentation on onnxruntime-web (WASM CPU only).
 *
 * Models:
 *  - Encoder: https://huggingface.co/spaces/Akbartus/projects/resolve/main/mobilesam.encoder.onnx (28.2MB)
 *  - Decoder: https://raw.githubusercontent.com/akbartus/MobileSAM-in-the-Browser/main/models/mobilesam.decoder.onnx (16.5MB)
 *
 * The I/O contract below was measured against this exact model pair (see
 * `headless/assets/mobilesam-spike.mjs`):
 *
 * 1. The encoder's longest side is fixed at 1024. The source frame must be
 *    resized **aspect-preserving** so its longest side is 1024 (e.g. 1920x1080
 *    -> 1024x576) and fed as `[encH, encW, 3]` — NOT stretched into a square
 *    and NOT padded. Stretching or padding misplaces the mask vertically. The
 *    input is NHWC float32 in 0-255 — NOT channel-first and NOT normalized.
 *    Output is `image_embeddings` `[1,256,64,64]`.
 *
 * 2. The decoder's `point_coords` must be in the *resized-encoder space* (a
 *    click at source pixel `(x,y)` becomes `(x / sourceW * encW,
 *    y / sourceH * encH)`). `orig_im_size = [sourceH, sourceW]` maps the mask
 *    back to the original frame resolution, so the returned mask is at source
 *    size.
 *
 * Worker-safe: no DOM access. Reuses the repo's CDN-pinned onnxruntime-web via
 * `getOrt()`, but raises `numThreads` — MobileSAM is pure CPU and the default of
 * 1 makes the encoder ~2.5s on a 4-thread machine.
 */

import { createLogger } from '@/shared/logging/logger'
import { fetchOnnxModelBytes } from '@/shared/utils/onnx-model-cache'
import { getOrt, type OrtModule, type OrtSession } from '@/shared/utils/ort-runtime'

const logger = createLogger('MobileSamSegmenter')

type OrtTensor = InstanceType<OrtModule['Tensor']>

/**
 * Settings' model-cache inspector matches entries by URL path fragment; these
 * must stay in sync with `shared/utils/local-model-cache.ts`.
 */
const ENCODER_URL =
  'https://huggingface.co/spaces/Akbartus/projects/resolve/main/mobilesam.encoder.onnx'
const DECODER_URL =
  'https://raw.githubusercontent.com/akbartus/MobileSAM-in-the-Browser/main/models/mobilesam.decoder.onnx'

/** MobileSAM's encoder is fixed at this longest-side resolution. */
const ENCODER_SIZE = 1024
/** Decoder mask-input grid (SAM's low-res mask). */
const MASK_INPUT_SIZE = 256

export interface MobileSamPromptPoint {
  /** Source-frame pixel X. */
  x: number
  /** Source-frame pixel Y. */
  y: number
  /** 1 = include, -1 = exclude. */
  label: 1 | -1
}

export interface MobileSamLoadProgress {
  receivedBytes: number
  totalBytes: number
  fromCache: boolean
}

export interface MobileSamSegmentResult {
  width: number
  height: number
  /** Foreground alpha, 0-255, at source resolution. */
  alpha: Uint8Array
}

export interface MobileSamSegmenterOptions {
  onDownloadProgress?: (progress: MobileSamLoadProgress) => void
}

/**
 * Holds model bytes plus both compiled sessions. Construct once per worker and
 * keep it warm across clicks; terminating the worker frees it.
 */
export class MobileSamSegmenter {
  private ort: OrtModule | null = null
  private encoderBytes: Uint8Array | null = null
  private decoderBytes: Uint8Array | null = null
  private encoderSession: OrtSession | null = null
  private decoderSession: OrtSession | null = null
  private readyPromise: Promise<void> | null = null

  constructor(private readonly options: MobileSamSegmenterOptions = {}) {}

  /** Download weights and compile both sessions. Idempotent and concurrency-safe. */
  ready(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.load().catch((error) => {
        this.readyPromise = null
        throw error
      })
    }
    return this.readyPromise
  }

  private async load(): Promise<void> {
    const ort = await getOrt()
    this.ort = ort

    // getOrt() pins numThreads = 1 for the GPU-bound models. MobileSAM is pure
    // CPU, so raise it for the encoder. The wasm binary has not loaded yet, so
    // setting this before the first `InferenceSession.create` takes effect.
    if (typeof navigator !== 'undefined' && 'hardwareConcurrency' in navigator) {
      ort.env.wasm.numThreads = Math.max(1, Math.min(4, navigator.hardwareConcurrency))
    }

    const [encoderBytes, decoderBytes] = await Promise.all([
      fetchOnnxModelBytes(ENCODER_URL, (receivedBytes, totalBytes, fromCache) =>
        this.options.onDownloadProgress?.({ receivedBytes, totalBytes, fromCache }),
      ),
      fetchOnnxModelBytes(DECODER_URL, (receivedBytes, totalBytes, fromCache) =>
        this.options.onDownloadProgress?.({ receivedBytes, totalBytes, fromCache }),
      ),
    ])
    this.encoderBytes = new Uint8Array(encoderBytes)
    this.decoderBytes = new Uint8Array(decoderBytes)

    const [encoderSession, decoderSession] = await Promise.all([
      ort.InferenceSession.create(this.encoderBytes, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      }),
      ort.InferenceSession.create(this.decoderBytes, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      }),
    ])
    this.encoderSession = encoderSession
    this.decoderSession = decoderSession
    logger.info('MobileSAM ready', {
      encoderBytes: this.encoderBytes.byteLength,
      decoderBytes: this.decoderBytes.byteLength,
      threads: ort.env.wasm.numThreads,
    })
  }

  /**
   * Segment the given RGBA frame with the given prompt points. Returns a
   * foreground alpha at the frame's native resolution.
   */
  // fallow-ignore-next-line unused-class-member
  async segment(
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
    points: MobileSamPromptPoint[],
  ): Promise<MobileSamSegmentResult> {
    const ort = this.ort
    const encoder = this.encoderSession
    const decoder = this.decoderSession
    if (!ort || !encoder || !decoder) {
      throw new Error('MobileSamSegmenter.ready() must resolve before segment()')
    }
    if (points.length === 0) {
      throw new Error('MobileSamSegmenter.segment() needs at least one prompt point')
    }

    const enc = resizeToEncoderRgb(rgba, width, height)
    const encTensor = new ort.Tensor('float32', enc.rgb, [enc.height, enc.width, 3])
    let embeddingsTensor: OrtTensor | null = null
    let encResult: { image_embeddings?: OrtTensor } | null = null
    try {
      encResult = await encoder.run({ input_image: encTensor })
      embeddingsTensor = encResult.image_embeddings ?? null
      if (!embeddingsTensor) throw new Error('MobileSAM encoder returned no embeddings')
    } finally {
      encTensor.dispose?.()
    }

    try {
      const maskLogits = await runDecoder(
        ort,
        decoder,
        embeddingsTensor,
        points,
        width,
        height,
        enc.width,
        enc.height,
      )
      return {
        width,
        height,
        alpha: logitsToAlpha(maskLogits, width, height),
      }
    } finally {
      embeddingsTensor.dispose?.()
    }
  }
}

/** Aspect-preserving resize: longest side -> 1024, returns resized NHWC float32 [0,255]. */
function resizeToEncoderRgb(
  rgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
): { rgb: Float32Array; width: number; height: number } {
  const S = ENCODER_SIZE
  const scale = S / Math.max(srcW, srcH)
  const width = Math.max(1, Math.round(srcW * scale))
  const height = Math.max(1, Math.round(srcH * scale))
  const out = new Float32Array(width * height * 3)
  const xScale = srcW / width
  const yScale = srcH / height

  for (let y = 0; y < height; y++) {
    const srcY = y * yScale
    const y0 = Math.min(srcH - 1, Math.floor(srcY))
    const y1 = Math.min(srcH - 1, y0 + 1)
    const fy = srcY - y0
    for (let x = 0; x < width; x++) {
      const srcX = x * xScale
      const x0 = Math.min(srcW - 1, Math.floor(srcX))
      const x1 = Math.min(srcW - 1, x0 + 1)
      const fx = srcX - x0

      const i00 = (y0 * srcW + x0) * 4
      const i01 = (y0 * srcW + x1) * 4
      const i10 = (y1 * srcW + x0) * 4
      const i11 = (y1 * srcW + x1) * 4
      const o = (y * width + x) * 3
      const w00 = (1 - fx) * (1 - fy)
      const w01 = fx * (1 - fy)
      const w10 = (1 - fx) * fy
      const w11 = fx * fy

      out[o] = rgba[i00]! * w00 + rgba[i01]! * w01 + rgba[i10]! * w10 + rgba[i11]! * w11
      out[o + 1] =
        rgba[i00 + 1]! * w00 + rgba[i01 + 1]! * w01 + rgba[i10 + 1]! * w10 + rgba[i11 + 1]! * w11
      out[o + 2] =
        rgba[i00 + 2]! * w00 + rgba[i01 + 2]! * w01 + rgba[i10 + 2]! * w10 + rgba[i11 + 2]! * w11
    }
  }
  return { rgb: out, width, height }
}

/**
 * Run the decoder with iterative SAM-style refinement so arbitrary numbers of
 * prompt points are supported: points are fed two at a time, and from the
 * second call onward the previous mask is fed back as `mask_input`.
 */
async function runDecoder(
  ort: OrtModule,
  decoder: OrtSession,
  embeddingsTensor: OrtTensor,
  points: MobileSamPromptPoint[],
  width: number,
  height: number,
  encWidth: number,
  encHeight: number,
): Promise<Float32Array> {
  let maskInput: Float32Array = new Float32Array(MASK_INPUT_SIZE * MASK_INPUT_SIZE)
  let hasMaskInput = 0
  let finalMask: Float32Array | null = null

  for (let i = 0; i < points.length; i += 2) {
    const a = points[i]!
    const b = points[i + 1]

    const coords = new Float32Array(4)
    coords[0] = (a.x / width) * encWidth
    coords[1] = (a.y / height) * encHeight
    const labels = new Float32Array([a.label, b?.label ?? -1])
    if (b) {
      coords[2] = (b.x / width) * encWidth
      coords[3] = (b.y / height) * encHeight
    }

    const coordsTensor = new ort.Tensor('float32', coords, [1, 2, 2])
    const labelsTensor = new ort.Tensor('float32', labels, [1, 2])
    const maskInputTensor = new ort.Tensor('float32', maskInput, [
      1,
      1,
      MASK_INPUT_SIZE,
      MASK_INPUT_SIZE,
    ])
    const hasMaskTensor = new ort.Tensor('float32', new Float32Array([hasMaskInput]), [1])
    const origSizeTensor = new ort.Tensor('float32', new Float32Array([height, width]), [2])

    let result: { masks?: OrtTensor } | null = null
    try {
      result = await decoder.run({
        image_embeddings: embeddingsTensor,
        point_coords: coordsTensor,
        point_labels: labelsTensor,
        mask_input: maskInputTensor,
        has_mask_input: hasMaskTensor,
        orig_im_size: origSizeTensor,
      })
      const masks = result.masks
      if (!masks) throw new Error('MobileSAM decoder returned no masks')
      const data = masks.data as Float32Array
      finalMask = new Float32Array(data)
      if (i + 2 < points.length) {
        maskInput = downscaleMaskTo256(finalMask, width, height)
        hasMaskInput = 1
      }
      masks.dispose?.()
    } finally {
      coordsTensor.dispose?.()
      labelsTensor.dispose?.()
      maskInputTensor.dispose?.()
      hasMaskTensor.dispose?.()
      origSizeTensor.dispose?.()
    }
  }

  if (!finalMask) throw new Error('MobileSAM decoder produced no mask')
  return finalMask
}

/** Decoder logits -> 0-255 foreground alpha.
 *
 * The decoder emits raw logits (typically saturating at ±30), so a hard
 * `> 0` threshold snap-cuts every upscaled boundary pixel and produces a
 * jagged staircase on straight edges. Instead, push logits through a sigmoid
 * for an anti-aliased ramp, then apply a light separable blur so long straight
 * edges (rounded-rect corners, phone outlines) read as smooth lines rather
 * than steps.
 */
function logitsToAlpha(logits: Float32Array, width: number, height: number): Uint8Array {
  const alpha = new Uint8Array(width * height)
  for (let i = 0; i < alpha.length; i++) {
    const p = 1 / (1 + Math.exp(-logits[i]!))
    alpha[i] = Math.round(p * 255)
  }
  return blurAlpha(alpha, width, height)
}

/** Light separable box blur to smooth jagged mask edges (radius ~1 source px). */
function blurAlpha(alpha: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(alpha.length)
  const tmp = new Float32Array(alpha.length)
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const l = Math.max(0, x - 1)
      const r = Math.min(width - 1, x + 1)
      tmp[row + x] = (alpha[row + l]! + alpha[row + x]! * 2 + alpha[row + r]!) / 4
    }
  }
  for (let y = 0; y < height; y++) {
    const t = Math.max(0, y - 1)
    const b = Math.min(height - 1, y + 1)
    const row = y * width
    for (let x = 0; x < width; x++) {
      out[row + x] = Math.round((tmp[t * width + x]! + tmp[row + x]! * 2 + tmp[b * width + x]!) / 4)
    }
  }
  return out
}

/** Nearest-neighbor downscale of a source-resolution mask to the 256x256 mask_input grid. */
function downscaleMaskTo256(mask: Float32Array, width: number, height: number): Float32Array {
  const S = MASK_INPUT_SIZE
  const out = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    const sy = Math.min(height - 1, Math.floor((y * height) / S))
    for (let x = 0; x < S; x++) {
      const sx = Math.min(width - 1, Math.floor((x * width) / S))
      out[y * S + x] = mask[sy * width + sx]!
    }
  }
  return out
}
