import { useSettingsStore } from '@/features/media-library/deps/settings-contract'
import { createLogger } from '@/shared/logging/logger'
import { parseSrt } from '@/shared/utils/subtitles'
import { TRANSCRIPTION_CANCELLED_MESSAGE } from '@/shared/utils/transcription-cancellation'
import type { MediaTranscriptModel } from '@/types/storage'
import type {
  MediaTranscriptionAdapter,
  MediaTranscriber,
  MediaTranscriptionStream,
} from './adapter-types'
import type { TranscriptSegment, TranscribeOptions } from './types'

const logger = createLogger('VibeTranscriptionAdapter')

export const VIBE_TRANSCRIPTION_ADAPTER_ID = 'vibe'
export const VIBE_TRANSCRIPTION_MODEL: MediaTranscriptModel = 'vibe'
export const DEFAULT_VIBE_BRIDGE_URL = 'http://127.0.0.1:8765'

const BRIDGE_UNREACHABLE_HINT =
  'Cannot reach the Vibe bridge. Make sure it is running (npm run vibe-bridge) and that the Vibe binary and model paths are set in Settings → AI.'

export const vibeTranscriptionAdapter: MediaTranscriptionAdapter = {
  id: VIBE_TRANSCRIPTION_ADAPTER_ID,
  label: 'Vibe (Local)',
  // The model select is hidden while the Vibe provider is active — the actual .bin file is
  // configured in Settings. This marker value only labels the stored transcript.
  defaultModel: VIBE_TRANSCRIPTION_MODEL,
  modelOptions: [],
  getModelLabel(_model: MediaTranscriptModel): string {
    return 'Vibe'
  },
  createTranscriber(options?: TranscribeOptions): MediaTranscriber {
    return new VibeTranscriber(options)
  },
}

export class VibeTranscriber implements MediaTranscriber {
  private readonly defaultOptions: TranscribeOptions

  constructor(options: TranscribeOptions = {}) {
    this.defaultOptions = options
  }

  transcribe(file: File, runtimeOptions: TranscribeOptions = {}): MediaTranscriptionStream {
    return new VibeStream(file, {
      ...this.defaultOptions,
      ...runtimeOptions,
    })
  }
}

class VibeStream implements MediaTranscriptionStream {
  private abortController: AbortController | null = null
  private cancelled = false
  private cancelMessage = TRANSCRIPTION_CANCELLED_MESSAGE

  constructor(
    private readonly file: File,
    private readonly options: TranscribeOptions,
  ) {}

  async collect(): Promise<TranscriptSegment[]> {
    const settings = useSettingsStore.getState()
    const bridgeUrl = (settings.vibeBridgeUrl ?? DEFAULT_VIBE_BRIDGE_URL).replace(/\/+$/, '')
    const vibePath = settings.vibeBinaryPath ?? ''
    const modelPath = settings.vibeModelPath ?? ''

    if (!vibePath) {
      throw new Error('Vibe executable path is not set. Configure it in Settings → AI.')
    }
    if (!modelPath) {
      throw new Error('Vibe model file path is not set. Configure it in Settings → AI.')
    }

    const controller = new AbortController()
    this.abortController = controller
    this.options.onProgress?.({ stage: 'preparing', progress: 0, indeterminate: true })

    let response: Response
    try {
      response = await fetch(`${bridgeUrl}/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': this.file.type || 'application/octet-stream',
          'X-Vibe-Path': vibePath,
          'X-Vibe-Model': modelPath,
          'X-Filename': this.file.name,
          'X-Language': this.options.language ?? '',
        },
        body: this.file,
        signal: controller.signal,
      })
    } catch (error) {
      if (this.cancelled) {
        throw new Error(this.cancelMessage)
      }
      logger.error('Failed to reach Vibe bridge', { bridgeUrl, error })
      throw new Error(BRIDGE_UNREACHABLE_HINT)
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      logger.error('Vibe bridge returned an error', { status: response.status, detail })
      const trimmed = detail.trim().slice(0, 300)
      throw new Error(
        trimmed
          ? `Vibe transcription failed (${response.status}): ${trimmed}`
          : `Vibe transcription failed (${response.status})`,
      )
    }

    const srtText = await response.text()
    const { cues, warnings } = parseSrt(srtText)
    if (cues.length === 0) {
      if (warnings.length > 0) {
        throw new Error(`Vibe produced no usable subtitles: ${warnings[0]}`)
      }
      throw new Error('Vibe produced no subtitles')
    }

    return cues.map((cue) => ({
      text: cue.text,
      start: cue.startSeconds,
      end: cue.endSeconds,
    }))
  }

  cancel(message: string = TRANSCRIPTION_CANCELLED_MESSAGE): void {
    this.cancelled = true
    this.cancelMessage = message
    this.abortController?.abort()
  }
}
